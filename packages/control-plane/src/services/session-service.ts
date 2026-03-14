/**
 * Session Service
 *
 * Manages in-memory session state for session-level policy evaluation.
 * The engine is pure — it receives session context as input.
 * This service is responsible for building that context from the action history.
 *
 * Sessions are keyed by sessionId from the envelope's context.
 * Sessions expire after a configurable TTL (default: 1 hour).
 */

import type { SessionContext, SessionAction } from '@authensor/engine';

interface SessionEntry {
  sessionId: string;
  actions: SessionAction[];
  /** Timestamp when this session was last accessed */
  lastAccessedAt: number;
}

const SESSION_TTL_MS = parseInt(
  process.env.AUTHENSOR_SESSION_TTL_MS ?? '3600000',
  10
); // default: 1 hour

const MAX_ACTIONS_PER_SESSION_HISTORY = parseInt(
  process.env.AUTHENSOR_SESSION_MAX_HISTORY ?? '1000',
  10
); // safety cap to prevent unbounded memory growth

/** In-memory session store, keyed by sessionId */
const sessions = new Map<string, SessionEntry>();

/** Interval handle for cleanup */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Get the session context for a given sessionId.
 * Returns undefined if there is no session or the sessionId is missing.
 */
export function getSessionContext(
  sessionId: string | undefined
): SessionContext | undefined {
  if (!sessionId) return undefined;

  const entry = sessions.get(sessionId);
  if (!entry) {
    return {
      sessionId,
      actions: [],
      totalRiskScore: 0,
    };
  }

  // Update last accessed time
  entry.lastAccessedAt = Date.now();

  const actions = [...entry.actions];
  return {
    sessionId: entry.sessionId,
    actions,
    totalRiskScore: actions.reduce((sum, a) => sum + (a.riskScore ?? 0), 0),
  };
}

/**
 * Record an action in the session after evaluation.
 * Called after the engine produces a decision so the next evaluation
 * has the updated history.
 */
export function recordSessionAction(
  sessionId: string | undefined,
  actionType: string,
  _outcome?: string
): void {
  if (!sessionId) return;

  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = {
      sessionId,
      actions: [],
      lastAccessedAt: Date.now(),
    };
    sessions.set(sessionId, entry);
  }

  entry.lastAccessedAt = Date.now();

  // Safety cap: prevent unbounded growth
  if (entry.actions.length >= MAX_ACTIONS_PER_SESSION_HISTORY) {
    // Drop oldest actions to stay within the cap
    entry.actions = entry.actions.slice(
      entry.actions.length - MAX_ACTIONS_PER_SESSION_HISTORY + 1
    );
  }

  entry.actions.push({
    actionType,
    timestamp: Date.now(),
  });
}

/**
 * Remove expired sessions from memory.
 * Called periodically to prevent memory leaks.
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let removed = 0;

  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      removed++;
    }
  }

  return removed;
}

/**
 * Start periodic session cleanup.
 * Called once at server startup.
 */
export function startSessionCleanup(intervalMs = 60_000): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    cleanupExpiredSessions();
  }, intervalMs);
  // Don't prevent process exit
  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Stop periodic session cleanup. Used in tests.
 */
export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Clear all sessions. Used in tests.
 */
export function clearAllSessions(): void {
  sessions.clear();
}

/**
 * Get the current number of active sessions. Used for metrics/monitoring.
 */
export function getSessionCount(): number {
  return sessions.size;
}
