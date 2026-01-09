/**
 * @authensor/sdk
 *
 * TypeScript SDK for integrating Authensor into your agents and applications.
 *
 * @example
 * ```typescript
 * import { Authensor } from '@authensor/sdk';
 *
 * const authensor = new Authensor({
 *   controlPlaneUrl: 'http://localhost:3000',
 *   principalId: 'my-agent',
 * });
 *
 * // Wrap an action with policy enforcement
 * const result = await authensor.execute(
 *   'stripe.charges.create',
 *   'stripe://customers/cus_123/charges',
 *   async () => {
 *     return await stripe.charges.create({ amount: 1000, currency: 'usd' });
 *   },
 *   { constraints: { maxAmount: 1000, currency: 'USD' } }
 * );
 * ```
 */

export { Authensor, AuthensorDeniedError, type AuthensorConfig } from './client.js';
export { createEnvelope } from './envelope.js';
export type {
  ActionEnvelope,
  ActionReceipt,
  Decision,
  Policy,
  ExecuteOptions,
  ExecuteResult,
  EvaluateResponse,
} from './types.js';
