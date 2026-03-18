/**
 * @authensor/connector-openai
 *
 * Safety connector for the OpenAI API. Wraps the official openai SDK
 * so every chat completion call goes through Authensor policy evaluation
 * and optional Aegis content scanning.
 *
 * @example
 * ```typescript
 * import { createSafeOpenAIClient } from '@authensor/connector-openai';
 *
 * const client = await createSafeOpenAIClient({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   policy: myPolicy,
 * });
 *
 * const response = await client.chat.completions.create({ ... });
 * ```
 */

export { createSafeOpenAIClient } from './client.js';
export type { SafeOpenAIClientConfig } from './client.js';

export {
  interceptClient,
  interceptChat,
  interceptCompletions,
  AuthensorDeniedError,
  AuthensorEscalationError,
  AuthensorContentThreatError,
} from './interceptor.js';
export type {
  InterceptorConfig,
  AegisScanSummary,
} from './interceptor.js';
