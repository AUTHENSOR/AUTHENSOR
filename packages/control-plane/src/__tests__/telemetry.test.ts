/**
 * Telemetry Service Tests
 *
 * Tests for the optional OpenTelemetry integration.
 * Uses vitest mocks to simulate the @opentelemetry/api module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock span that records all calls for assertions
function createMockSpan() {
  return {
    setAttribute: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
    end: vi.fn(),
    recordException: vi.fn(),
  };
}

// Mock counter / histogram / gauge
function createMockCounter() {
  return { add: vi.fn() };
}
function createMockHistogram() {
  return { record: vi.fn() };
}
function createMockGauge() {
  return { record: vi.fn() };
}

// Shared mock instances so tests can inspect calls
const mockSpan = createMockSpan();
const mockCounter = createMockCounter();
const mockHistogram = createMockHistogram();
const mockGauge = createMockGauge();

const mockTracer = {
  startSpan: vi.fn().mockReturnValue(mockSpan),
};

const mockMeter = {
  createCounter: vi.fn().mockReturnValue(mockCounter),
  createHistogram: vi.fn().mockReturnValue(mockHistogram),
  createObservableGauge: vi.fn().mockReturnValue(mockGauge),
};

// We register the mock BEFORE importing the service
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn().mockReturnValue(mockTracer),
  },
  metrics: {
    getMeter: vi.fn().mockReturnValue(mockMeter),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

describe('TelemetryService', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSpan.setAttribute.mockClear();
    mockSpan.setStatus.mockClear();
    mockSpan.end.mockClear();
    mockSpan.recordException.mockClear();
    mockTracer.startSpan.mockClear();
    mockCounter.add.mockClear();
    mockHistogram.record.mockClear();
    mockGauge.record.mockClear();
  });

  describe('when AUTHENSOR_OTEL_ENABLED is not set', () => {
    it('startEvaluationSpan returns null', async () => {
      delete process.env.AUTHENSOR_OTEL_ENABLED;

      const { startEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();
      expect(span).toBeNull();
      expect(mockTracer.startSpan).not.toHaveBeenCalled();
    });

    it('endEvaluationSpan is a no-op with null span', async () => {
      delete process.env.AUTHENSOR_OTEL_ENABLED;

      const { endEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      // Should not throw
      endEvaluationSpan(null, {
        outcome: 'allow',
        principalId: 'agent-1',
        principalType: 'agent',
        actionType: 'file.read',
        actionResource: 'file:///tmp/test',
        receiptId: 'r-1',
      }, 5);

      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
      expect(mockSpan.end).not.toHaveBeenCalled();
    });
  });

  describe('when AUTHENSOR_OTEL_ENABLED is true', () => {
    it('startEvaluationSpan returns a span', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      const { startEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();
      expect(span).toBe(mockSpan);
      expect(mockTracer.startSpan).toHaveBeenCalledWith('authensor.evaluate');
    });

    it('endEvaluationSpan sets attributes and ends the span', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      const { startEvaluationSpan, endEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();

      endEvaluationSpan(span, {
        policyId: 'policy-1',
        policyVersion: 'v1.0',
        outcome: 'allow',
        principalId: 'agent-1',
        principalType: 'agent',
        actionType: 'file.read',
        actionResource: 'file:///tmp/test',
        receiptId: 'r-1',
        budgetUtilization: 0.42,
        aegisFlagged: false,
        sessionActionCount: 7,
      }, 12.5);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.policy.id', 'policy-1');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.policy.version', 'v1.0');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.decision.outcome', 'allow');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.principal.id', 'agent-1');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.principal.type', 'agent');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.action.type', 'file.read');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.action.resource', 'file:///tmp/test');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.receipt.id', 'r-1');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.budget.utilization', 0.42);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.aegis.flagged', false);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('authensor.session.action_count', 7);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('records counter and histogram metrics', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      const { startEvaluationSpan, endEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();

      endEvaluationSpan(span, {
        outcome: 'deny',
        principalId: 'agent-2',
        principalType: 'agent',
        actionType: 'db.delete',
        actionResource: 'pg://users',
        receiptId: 'r-2',
      }, 3.14);

      expect(mockCounter.add).toHaveBeenCalledWith(1, { outcome: 'deny' });
      expect(mockHistogram.record).toHaveBeenCalledWith(3.14, { outcome: 'deny' });
    });

    it('records budget utilization gauge when present', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      const { startEvaluationSpan, endEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();

      endEvaluationSpan(span, {
        outcome: 'allow',
        principalId: 'agent-3',
        principalType: 'agent',
        actionType: 'api.call',
        actionResource: 'https://api.example.com',
        receiptId: 'r-3',
        budgetUtilization: 0.85,
      }, 1.0);

      expect(mockGauge.record).toHaveBeenCalledWith(0.85, { principal: 'agent-3' });
    });

    it('records error on span when error is provided', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      const { startEvaluationSpan, endEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();
      const testError = new Error('db connection failed');

      endEvaluationSpan(
        span,
        {
          outcome: 'error',
          principalId: 'agent-1',
          principalType: 'agent',
          actionType: 'file.read',
          actionResource: 'file:///tmp/test',
          receiptId: 'none',
        },
        100,
        testError
      );

      expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Error: db connection failed',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('omits optional attributes when not provided', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      const { startEvaluationSpan, endEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();

      endEvaluationSpan(span, {
        outcome: 'allow',
        principalId: 'agent-1',
        principalType: 'agent',
        actionType: 'file.read',
        actionResource: 'file:///tmp/test',
        receiptId: 'r-4',
        // No policyId, policyVersion, budgetUtilization, aegisFlagged, sessionActionCount
      }, 2.0);

      // Should NOT have been called with optional attributes
      const calls = mockSpan.setAttribute.mock.calls.map(
        (c: [string, unknown]) => c[0]
      );
      expect(calls).not.toContain('authensor.policy.id');
      expect(calls).not.toContain('authensor.policy.version');
      expect(calls).not.toContain('authensor.budget.utilization');
      expect(calls).not.toContain('authensor.aegis.flagged');
      expect(calls).not.toContain('authensor.session.action_count');

      // Budget gauge should not be called
      expect(mockGauge.record).not.toHaveBeenCalled();
    });
  });

  describe('buildEvalAttributes', () => {
    it('maps envelope and result to telemetry attributes', async () => {
      const { buildEvalAttributes } = await import('../services/telemetry-service.js');

      const envelope = {
        id: 'e-1',
        timestamp: new Date().toISOString(),
        action: { type: 'file.read', resource: 'file:///tmp/test' },
        principal: { type: 'agent' as const, id: 'agent-1' },
        context: {},
      };

      const result = {
        decision: {
          outcome: 'allow' as const,
          evaluatedAt: new Date().toISOString(),
          policyId: 'policy-1',
          policyVersion: 'v2.0',
        },
        evaluationTimeMs: 1.5,
      };

      const attrs = buildEvalAttributes(envelope, result, 'receipt-123');

      expect(attrs).toEqual({
        policyId: 'policy-1',
        policyVersion: 'v2.0',
        outcome: 'allow',
        principalId: 'agent-1',
        principalType: 'agent',
        actionType: 'file.read',
        actionResource: 'file:///tmp/test',
        receiptId: 'receipt-123',
      });
    });
  });

  describe('when @opentelemetry/api import fails', () => {
    it('gracefully returns null from startEvaluationSpan', async () => {
      process.env.AUTHENSOR_OTEL_ENABLED = 'true';

      // Re-mock to simulate missing module
      vi.doMock('@opentelemetry/api', () => {
        throw new Error('Cannot find module');
      });

      const { startEvaluationSpan, _resetTelemetry } = await import(
        '../services/telemetry-service.js'
      );
      _resetTelemetry();

      const span = await startEvaluationSpan();
      expect(span).toBeNull();

      // Restore the working mock for subsequent tests
      vi.doMock('@opentelemetry/api', () => ({
        trace: {
          getTracer: vi.fn().mockReturnValue(mockTracer),
        },
        metrics: {
          getMeter: vi.fn().mockReturnValue(mockMeter),
        },
        SpanStatusCode: {
          OK: 1,
          ERROR: 2,
        },
      }));
    });
  });
});
