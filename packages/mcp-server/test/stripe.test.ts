import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthensorClient } from '../src/authensor-client.js';
import { executeStripeTool } from '../src/tools/stripe.js';

const stripeCtor = vi.fn();
const customersCreate = vi.fn();
const customersList = vi.fn();
const chargesCreate = vi.fn();
const chargesList = vi.fn();

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation((key: string) => {
      stripeCtor(key);
      return {
        customers: {
          create: customersCreate,
          list: customersList,
        },
        charges: {
          create: chargesCreate,
          list: chargesList,
        },
      };
    }),
  };
});

type MockAuthensor = AuthensorClient & {
  evaluate: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  updateReceipt: ReturnType<typeof vi.fn>;
  evaluateAndExecute: ReturnType<typeof vi.fn>;
};

const mockAuthensor = (): MockAuthensor => {
  const mock = {
    createEnvelope: vi.fn().mockImplementation((actionType, resource, options) => ({
      id: 'env',
      timestamp: new Date().toISOString(),
      action: { type: actionType, resource, operation: options.operation, parameters: options.parameters },
      principal: { type: 'agent', id: 'tester' },
      context: { environment: options.context?.environment ?? 'development' },
    })),
    evaluate: vi.fn().mockResolvedValue({
      receiptId: 'rec_123',
      decision: { outcome: 'allow', policyId: 'p', policyVersion: 'v1' },
      evaluationTimeMs: 1,
    }),
    claim: vi.fn().mockResolvedValue({ claimId: 'claim_1' }),
    updateReceipt: vi.fn().mockResolvedValue(undefined),
    evaluateAndExecute: vi.fn(),
  };

  // Implement evaluateAndExecute to chain through internal methods
  mock.evaluateAndExecute.mockImplementation(async (actionType, resource, executor, options = {}) => {
    const envelope = mock.createEnvelope(actionType, resource, options);
    const evaluation = await mock.evaluate(envelope);

    if (evaluation.decision.outcome !== 'allow') {
      throw new Error(`Action denied: ${evaluation.decision.reason || evaluation.decision.outcome}`);
    }

    const claim = await mock.claim(evaluation.receiptId);
    if (!claim.claimId) {
      throw new Error('Unable to claim receipt for execution');
    }

    const startTime = Date.now();
    let attemptCount = 0;

    try {
      attemptCount++;
      const result = await executor(evaluation.receiptId);
      const durationMs = Date.now() - startTime;

      await mock.updateReceipt(
        evaluation.receiptId,
        'executed',
        { durationMs, result, attemptCount },
        claim.claimId
      );

      return { result, receiptId: evaluation.receiptId };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorInfo = error instanceof Error
        ? { message: error.message, code: (error as any).code, retryAt: (error as any).retryAt }
        : { message: 'Unknown error' };

      await mock.updateReceipt(
        evaluation.receiptId,
        'failed',
        { durationMs, error: errorInfo, attemptCount },
        claim.claimId
      );

      throw error;
    }
  });

  return mock as unknown as MockAuthensor;
};

const resetMocks = () => {
  stripeCtor.mockReset();
  customersCreate.mockReset();
  customersList.mockReset();
  chargesCreate.mockReset();
  chargesList.mockReset();
};

const setStripeEnv = (overrides: Record<string, string | undefined> = {}) => {
  process.env.STRIPE_TEST_KEY = overrides.STRIPE_TEST_KEY ?? 'sk_test_123';
  process.env.STRIPE_LIVE_KEY = overrides.STRIPE_LIVE_KEY;
  process.env.AUTHENSOR_STRIPE_ALLOW_LIVE = overrides.AUTHENSOR_STRIPE_ALLOW_LIVE;
  process.env.AUTHENSOR_STRIPE_ALLOWED_CURRENCIES =
    overrides.AUTHENSOR_STRIPE_ALLOWED_CURRENCIES ?? 'usd';
  process.env.AUTHENSOR_STRIPE_MIN_AMOUNT = overrides.AUTHENSOR_STRIPE_MIN_AMOUNT ?? '50';
  process.env.AUTHENSOR_STRIPE_MAX_AMOUNT = overrides.AUTHENSOR_STRIPE_MAX_AMOUNT ?? '500000';
  process.env.STRIPE_API_VERSION = overrides.STRIPE_API_VERSION;
};

const clearEnvKeys = () => {
  delete process.env.STRIPE_TEST_KEY;
  delete process.env.STRIPE_LIVE_KEY;
  delete process.env.AUTHENSOR_STRIPE_ALLOW_LIVE;
  delete process.env.AUTHENSOR_STRIPE_ALLOWED_CURRENCIES;
  delete process.env.AUTHENSOR_STRIPE_MIN_AMOUNT;
  delete process.env.AUTHENSOR_STRIPE_MAX_AMOUNT;
  delete process.env.STRIPE_API_VERSION;
};

describe('stripe tool hardening', () => {
  beforeEach(() => {
    resetMocks();
    clearEnvKeys();
  });

  afterEach(() => {
    resetMocks();
    clearEnvKeys();
  });

  it('blocks live mode without allow flag', async () => {
    setStripeEnv({ STRIPE_LIVE_KEY: 'sk_test_EXAMPLE_LIVE_MODE_KEY' });
    const authensor = mockAuthensor();

    const res = await executeStripeTool(
      'stripe_create_charge',
      { amount: 1000, currency: 'usd', customer: 'cus_123', environment: 'prod' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain('CONFIG_BLOCKED');
    expect(stripeCtor).not.toHaveBeenCalled();
    expect(authensor.evaluate).not.toHaveBeenCalled();
  });

  it('sets idempotency key to receipt id on create operations', async () => {
    setStripeEnv();
    const authensor = mockAuthensor();
    customersCreate.mockResolvedValue({ id: 'cus_1', object: 'customer', email: 'a@example.com' });
    chargesCreate.mockResolvedValue({
      id: 'ch_1',
      object: 'charge',
      status: 'succeeded',
      amount: 1000,
      currency: 'usd',
    });

    const res = await executeStripeTool(
      'stripe_create_customer',
      { email: 'a@example.com' },
      authensor
    );

    expect(res.isError).toBeUndefined();
    expect(customersCreate).toHaveBeenCalledTimes(1);
    const call = customersCreate.mock.calls[0];
    expect(call?.[1]?.idempotencyKey).toEqual('rec_123');

    await executeStripeTool(
      'stripe_create_charge',
      { amount: 1000, currency: 'usd', customer: 'cus_123' },
      authensor
    );
    expect(chargesCreate).toHaveBeenCalledTimes(1);
    const chargeCall = chargesCreate.mock.calls[0];
    expect(chargeCall?.[1]?.idempotencyKey).toEqual('rec_123');
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'executed',
      expect.objectContaining({
        result: expect.objectContaining({ stripeId: 'cus_1' }),
      }),
      'claim_1'
    );
  });

  it('rejects invalid amount/currency without calling Stripe', async () => {
    setStripeEnv({ AUTHENSOR_STRIPE_ALLOWED_CURRENCIES: 'usd' });
    const authensor = mockAuthensor();

    const res = await executeStripeTool(
      'stripe_create_charge',
      { amount: 10.5, currency: 'eur', customer: 'cus_123' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(chargesCreate).not.toHaveBeenCalled();
    expect(authensor.evaluate).not.toHaveBeenCalled();
  });

  it('retries on 500/429 and succeeds after retries', async () => {
    setStripeEnv();
    const authensor = mockAuthensor();
    chargesCreate
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce({
        id: 'ch_1',
        object: 'charge',
        status: 'succeeded',
        amount: 1000,
        currency: 'usd',
      });

    const res = await executeStripeTool(
      'stripe_create_charge',
      { amount: 1000, currency: 'usd', customer: 'cus_123' },
      authensor
    );

    expect(res.isError).toBeUndefined();
    expect(chargesCreate).toHaveBeenCalledTimes(3);
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'executed',
      expect.objectContaining({
        result: expect.objectContaining({ stripeId: 'ch_1', amount: 1000 }),
      }),
      'claim_1'
    );
  });

  it('does not retry on 400 and records error without leaking keys', async () => {
    setStripeEnv();
    const authensor = mockAuthensor();
    chargesCreate.mockRejectedValue({ statusCode: 400, message: 'Bad request sk_test_123' });

    const res = await executeStripeTool(
      'stripe_create_charge',
      { amount: 1000, currency: 'usd', customer: 'cus_123' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(chargesCreate).toHaveBeenCalledTimes(1);
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'failed',
      expect.objectContaining({
        error: expect.objectContaining({ code: 'UPSTREAM_4XX' }),
      }),
      'claim_1'
    );
    const payload = JSON.stringify(authensor.updateReceipt.mock.calls[0]);
    expect(payload).not.toContain('sk_test_123');
  });
});
