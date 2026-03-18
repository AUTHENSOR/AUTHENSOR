/**
 * @authensor/connector-anthropic
 *
 * Safety connector for the Anthropic API. Wraps the official @anthropic-ai/sdk
 * so every Claude API call goes through Authensor policy evaluation and
 * optional Aegis content scanning.
 *
 * @example
 * ```typescript
 * import { createSafeAnthropicClient } from '@authensor/connector-anthropic';
 *
 * const client = await createSafeAnthropicClient({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   policy: myPolicy,
 * });
 *
 * const response = await client.messages.create({ ... });
 * ```
 */

export { createSafeAnthropicClient } from './client.js';
export type { SafeAnthropicClientConfig } from './client.js';

export {
  interceptClient,
  interceptMessages,
  AuthensorDeniedError,
  AuthensorEscalationError,
  AuthensorContentThreatError,
} from './interceptor.js';
export type {
  InterceptorConfig,
  AegisScanSummary,
} from './interceptor.js';
