export type ExecutionError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAt?: string;
  httpStatus?: number;
  details?: Record<string, unknown>;
};

function safeMessage(msg: string): string {
  return msg.slice(0, 500);
}

export const configBlocked = (msg: string): ExecutionError => ({
  code: 'CONFIG_BLOCKED',
  message: safeMessage(msg),
  retryable: false,
});

export const invalidInput = (msg: string): ExecutionError => ({
  code: 'INVALID_INPUT',
  message: safeMessage(msg),
  retryable: false,
});

export const rateLimited = (retryAt?: string, msg = 'Rate limited'): ExecutionError => ({
  code: 'RATE_LIMITED',
  message: safeMessage(msg),
  retryable: true,
  retryAt,
});

export const upstream4xx = (status: number, msg = 'Upstream 4xx'): ExecutionError => ({
  code: 'UPSTREAM_4XX',
  message: safeMessage(msg),
  retryable: false,
  httpStatus: status,
});

export const upstream5xx = (status: number, msg = 'Upstream 5xx'): ExecutionError => ({
  code: 'UPSTREAM_5XX',
  message: safeMessage(msg),
  retryable: true,
  httpStatus: status,
});

export const securityBlocked = (
  code: string,
  msg: string,
  details?: Record<string, unknown>
): ExecutionError => ({
  code,
  message: safeMessage(msg),
  retryable: false,
  details,
});

export const timeoutError = (msg = 'Request timed out'): ExecutionError => ({
  code: 'TIMEOUT',
  message: safeMessage(msg),
  retryable: true,
});
