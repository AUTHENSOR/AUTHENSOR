/**
 * Session Service Tests
 *
 * Tests for the in-memory session tracking service used by the control plane
 * to build SessionContext for the engine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSessionContext,
  recordSessionAction,
  cleanupExpiredSessions,
  clearAllSessions,
  getSessionCount,
  startSessionCleanup,
  stopSessionCleanup,
} from '../services/session-service.js';

describe('Session Service', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    stopSessionCleanup();
    clearAllSessions();
  });

  describe('getSessionContext', () => {
    it('returns undefined for undefined sessionId', () => {
      const result = getSessionContext(undefined);
      expect(result).toBeUndefined();
    });

    it('returns empty actions for a new session', () => {
      const ctx = getSessionContext('new-session');
      expect(ctx).toBeDefined();
      expect(ctx!.sessionId).toBe('new-session');
      expect(ctx!.actions).toHaveLength(0);
    });

    it('returns recorded actions for an existing session', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      recordSessionAction('session-1', 'shell.exec', 'deny');

      const ctx = getSessionContext('session-1');
      expect(ctx).toBeDefined();
      expect(ctx!.actions).toHaveLength(2);
      expect(ctx!.actions[0].actionType).toBe('file.read');
      expect(ctx!.actions[1].actionType).toBe('shell.exec');
    });

    it('returns a copy of actions (not a reference)', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      const ctx1 = getSessionContext('session-1');
      const ctx2 = getSessionContext('session-1');
      expect(ctx1!.actions).not.toBe(ctx2!.actions);
    });
  });

  describe('recordSessionAction', () => {
    it('does nothing for undefined sessionId', () => {
      recordSessionAction(undefined, 'file.read', 'allow');
      expect(getSessionCount()).toBe(0);
    });

    it('creates a new session entry on first action', () => {
      expect(getSessionCount()).toBe(0);
      recordSessionAction('session-1', 'file.read', 'allow');
      expect(getSessionCount()).toBe(1);
    });

    it('appends to existing session', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      recordSessionAction('session-1', 'shell.exec', 'deny');

      const ctx = getSessionContext('session-1');
      expect(ctx!.actions).toHaveLength(2);
    });

    it('tracks multiple sessions independently', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      recordSessionAction('session-2', 'shell.exec', 'deny');

      expect(getSessionCount()).toBe(2);

      const ctx1 = getSessionContext('session-1');
      expect(ctx1!.actions).toHaveLength(1);
      expect(ctx1!.actions[0].actionType).toBe('file.read');

      const ctx2 = getSessionContext('session-2');
      expect(ctx2!.actions).toHaveLength(1);
      expect(ctx2!.actions[0].actionType).toBe('shell.exec');
    });

    it('records timestamps', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      const ctx = getSessionContext('session-1');
      expect(ctx!.actions[0].timestamp).toBeDefined();
      // Verify it's a valid ISO date string
      expect(() => new Date(ctx!.actions[0].timestamp)).not.toThrow();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('removes no sessions when none are expired', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      const removed = cleanupExpiredSessions();
      expect(removed).toBe(0);
      expect(getSessionCount()).toBe(1);
    });
  });

  describe('clearAllSessions', () => {
    it('removes all sessions', () => {
      recordSessionAction('session-1', 'file.read', 'allow');
      recordSessionAction('session-2', 'shell.exec', 'deny');
      expect(getSessionCount()).toBe(2);

      clearAllSessions();
      expect(getSessionCount()).toBe(0);
    });
  });

  describe('startSessionCleanup / stopSessionCleanup', () => {
    it('starts and stops without error', () => {
      expect(() => startSessionCleanup(10_000)).not.toThrow();
      expect(() => stopSessionCleanup()).not.toThrow();
    });

    it('is idempotent on start', () => {
      startSessionCleanup(10_000);
      startSessionCleanup(10_000); // second call is a no-op
      stopSessionCleanup();
    });
  });
});
