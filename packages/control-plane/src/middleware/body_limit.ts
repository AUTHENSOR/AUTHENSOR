/**
 * Body Size Limiting Middleware
 *
 * Enforces hard caps on request body sizes.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';

/**
 * Get max request body size in bytes
 */
function getMaxRequestBytes(): number {
  return parseInt(process.env.AUTHENSOR_MAX_REQUEST_BYTES || '256000', 10);
}

/**
 * Body size limit middleware
 * Rejects requests with bodies exceeding the configured limit
 */
export const bodyLimitMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  const contentLength = c.req.header('Content-Length');

  if (contentLength) {
    const size = parseInt(contentLength, 10);
    const maxSize = getMaxRequestBytes();

    if (size > maxSize) {
      return c.json(
        {
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request body exceeds maximum size of ${maxSize} bytes`,
            maxBytes: maxSize,
            requestedBytes: size,
          },
        },
        413
      );
    }
  }

  return next();
};

/**
 * Get max result size in bytes
 */
export function getMaxResultBytes(): number {
  return parseInt(process.env.AUTHENSOR_MAX_RESULT_BYTES || '128000', 10);
}

/**
 * Truncate a result object if it exceeds the size limit
 * Returns a truncated version that is always valid JSON
 */
export function truncateResult(
  result: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!result) return result;

  const maxBytes = getMaxResultBytes();
  const jsonString = JSON.stringify(result);

  if (jsonString.length <= maxBytes) {
    return result;
  }

  // Create a truncated preview
  const previewLength = Math.min(1000, Math.floor(maxBytes / 4));
  const preview = jsonString.substring(0, previewLength);

  return {
    _truncated: true,
    _originalBytesEstimate: jsonString.length,
    _preview: preview + '...',
  };
}

/**
 * Truncate an error object if it exceeds the size limit
 */
export function truncateError(
  error: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!error) return error;

  const maxBytes = getMaxResultBytes();
  const jsonString = JSON.stringify(error);

  if (jsonString.length <= maxBytes) {
    return error;
  }

  // Keep essential error fields and truncate details
  const truncated: Record<string, unknown> = {
    _truncated: true,
    _originalBytesEstimate: jsonString.length,
  };

  // Preserve error code and message if present
  if (error.code) truncated.code = error.code;
  if (error.message) truncated.message = String(error.message).substring(0, 500);

  return truncated;
}
