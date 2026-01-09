/**
 * Stripe Tools
 *
 * Stripe API tools with Authensor policy enforcement.
 * Uses evaluateAndExecute() for consistent sandbox/claim handling.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AuthensorClient } from '../authensor-client.js';
import Stripe from 'stripe';
import {
  configBlocked,
  invalidInput,
  rateLimited,
  upstream4xx,
  upstream5xx,
  timeoutError,
  type ExecutionError,
} from '../hardening/errors.js';

export const stripeTools: Tool[] = [
  {
    name: 'stripe_list_customers',
    description: 'List Stripe customers. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of customers to return (default: 10, max: 100)',
        },
        email: {
          type: 'string',
          description: 'Filter by email address',
        },
      },
    },
  },
  {
    name: 'stripe_create_customer',
    description: 'Create a new Stripe customer. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Customer email address',
        },
        name: {
          type: 'string',
          description: 'Customer name',
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'stripe_create_charge',
    description: 'Create a charge (use Payment Intents for production). Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Amount in cents (e.g., 1000 = $10.00)',
        },
        currency: {
          type: 'string',
          description: 'Three-letter ISO currency code (default: usd)',
        },
        customer: {
          type: 'string',
          description: 'Customer ID to charge',
        },
        description: {
          type: 'string',
          description: 'Description of the charge',
        },
      },
      required: ['amount', 'customer'],
    },
  },
  {
    name: 'stripe_list_charges',
    description: 'List recent charges. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of charges to return (default: 10, max: 100)',
        },
        customer: {
          type: 'string',
          description: 'Filter by customer ID',
        },
      },
    },
  },
];

const STRIPE_API_VERSION = (process.env.STRIPE_API_VERSION || '2023-10-16') as Stripe.LatestApiVersion;
const ALLOWED_CURRENCIES = (process.env.AUTHENSOR_STRIPE_ALLOWED_CURRENCIES || 'usd')
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);
const MIN_AMOUNT = parseInt(process.env.AUTHENSOR_STRIPE_MIN_AMOUNT || '50', 10);
const MAX_AMOUNT = parseInt(process.env.AUTHENSOR_STRIPE_MAX_AMOUNT || '500000', 10);
const defaultRetryAt = () => new Date(Date.now() + 60_000).toISOString();

function selectStripeKey(env: string): string | ExecutionError {
  const testKey = process.env.STRIPE_TEST_KEY || process.env.STRIPE_SECRET_KEY;
  const liveKey = process.env.STRIPE_LIVE_KEY;
  const allowLive = process.env.AUTHENSOR_STRIPE_ALLOW_LIVE === 'true';

  const isProd = env === 'prod' || env === 'production';
  if (!isProd) {
    if (!testKey) return configBlocked('Stripe test key missing');
    return testKey;
  }
  if (isProd) {
    if (!allowLive || !liveKey) {
      return configBlocked('Live Stripe disabled or missing key');
    }
    return liveKey;
  }
  return configBlocked('Invalid environment');
}

function validateAmountCurrency(amount: unknown, currency: unknown): ExecutionError | null {
  if (typeof amount !== 'number' || !Number.isInteger(amount)) {
    return invalidInput('Amount must be integer cents');
  }
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    return invalidInput('Amount outside allowed bounds');
  }
  const cur = (currency as string | undefined)?.toLowerCase() || 'usd';
  if (!ALLOWED_CURRENCIES.includes(cur)) {
    return invalidInput('Currency not allowed');
  }
  return null;
}

/**
 * Custom error class for Stripe errors with retry info
 */
class StripeExecutionError extends Error {
  code: string;
  retryable: boolean;
  retryAt?: string;

  constructor(err: ExecutionError) {
    super(err.message);
    this.code = err.code;
    this.retryable = err.retryable ?? false;
    this.retryAt = err.retryAt;
  }
}

/**
 * Execute with retries and error mapping
 */
async function withRetries<T>(
  fn: () => Promise<T>,
  onError: (err: any) => ExecutionError
): Promise<T> {
  const backoff = [250, 500, 1000];
  let lastError: ExecutionError | null = null;

  for (let attempt = 0; attempt < backoff.length; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = onError(err);
      if (!lastError.retryable || attempt === backoff.length - 1) {
        throw new StripeExecutionError(lastError);
      }
      await new Promise((resolve) => setTimeout(resolve, backoff[attempt]));
    }
  }

  throw new StripeExecutionError(lastError || timeoutError());
}

function mapStripeError(err: any): ExecutionError {
  if (err?.statusCode === 429) return rateLimited(defaultRetryAt(), 'Stripe rate limited');
  if (err?.statusCode >= 500) return upstream5xx(err.statusCode);
  if (err?.statusCode >= 400) return upstream4xx(err.statusCode);
  return timeoutError();
}

export async function executeStripeTool(
  toolName: string,
  args: unknown,
  authensor: AuthensorClient
) {
  const params = args as Record<string, unknown>;
  const env = (params.environment as string) || process.env.AUTHENSOR_ENV || process.env.NODE_ENV || 'development';
  const key = selectStripeKey(env);
  if (typeof key !== 'string') {
    return {
      content: [{ type: 'text' as const, text: `${key.code}: ${key.message}` }],
      isError: true,
    };
  }

  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });

  try {
    switch (toolName) {
      case 'stripe_list_customers': {
        const { result, receiptId } = await authensor.evaluateAndExecute(
          'stripe.customers.list',
          'stripe://customers',
          async (_receiptId: string) => {
            const response = await withRetries(
              () =>
                stripe.customers.list({
                  limit: Math.min((params.limit as number) || 10, 100),
                  email: params.email as string | undefined,
                }),
              mapStripeError
            );
            return {
              customers: response.data?.map((c: any) => ({ id: c.id, email: c.email })) ?? [],
              apiVersion: STRIPE_API_VERSION,
            };
          },
          {
            operation: 'read',
            parameters: params,
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'stripe_list_customers',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      case 'stripe_create_customer': {
        const { result, receiptId } = await authensor.evaluateAndExecute(
          'stripe.customers.create',
          'stripe://customers',
          async (idempotencyKey: string) => {
            const response = await withRetries(
              () =>
                stripe.customers.create(
                  {
                    email: params.email as string,
                    name: params.name as string | undefined,
                    metadata: params.metadata as Record<string, string> | undefined,
                  },
                  { idempotencyKey }
                ),
              mapStripeError
            );
            return {
              stripeId: response.id,
              objectType: response.object,
              email: response.email,
              apiVersion: STRIPE_API_VERSION,
            };
          },
          {
            operation: 'create',
            parameters: params,
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'stripe_create_customer',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      case 'stripe_create_charge': {
        const amountErr = validateAmountCurrency(params.amount, params.currency);
        if (amountErr) {
          return { content: [{ type: 'text' as const, text: `${amountErr.code}: ${amountErr.message}` }], isError: true };
        }

        const { result, receiptId } = await authensor.evaluateAndExecute(
          'stripe.charges.create',
          `stripe://customers/${params.customer}/charges`,
          async (idempotencyKey: string) => {
            const response = await withRetries(
              () =>
                stripe.charges.create(
                  {
                    amount: params.amount as number,
                    currency: ((params.currency as string) || 'usd').toLowerCase(),
                    customer: params.customer as string,
                    description: params.description as string | undefined,
                  },
                  { idempotencyKey }
                ),
              mapStripeError
            );
            return {
              stripeId: response.id,
              objectType: response.object,
              status: response.status,
              amount: response.amount,
              currency: response.currency,
              apiVersion: STRIPE_API_VERSION,
            };
          },
          {
            operation: 'create',
            parameters: params,
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'stripe_create_charge',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      case 'stripe_list_charges': {
        const { result, receiptId } = await authensor.evaluateAndExecute(
          'stripe.charges.list',
          'stripe://charges',
          async (_receiptId: string) => {
            const response = await withRetries(
              () =>
                stripe.charges.list({
                  limit: Math.min((params.limit as number) || 10, 100),
                  customer: params.customer as string | undefined,
                }),
              mapStripeError
            );
            return {
              charges: response.data?.map((c: any) => ({ id: c.id, amount: c.amount, currency: c.currency })) ?? [],
              apiVersion: STRIPE_API_VERSION,
            };
          },
          {
            operation: 'read',
            parameters: params,
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'stripe_list_charges',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown Stripe tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof StripeExecutionError) {
      return {
        content: [{ type: 'text' as const, text: `${error.code}: ${error.message}` }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text' as const, text: `Stripe operation failed: ${message}` }],
      isError: true,
    };
  }
}
