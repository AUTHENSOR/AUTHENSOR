import { describe, it, expect, vi } from 'vitest';
import { Sentinel } from '../src/sentinel.js';
import { ReceiptEvent, Alert, AnomalyResult, AlertRule } from '../src/types.js';

function makeEvent(overrides: Partial<ReceiptEvent> = {}): ReceiptEvent {
  return {
    receiptId: `r-${Math.random().toString(36).slice(2, 8)}`,
    envelopeId: `e-${Math.random().toString(36).slice(2, 8)}`,
    agentId: 'agent-1',
    actionType: 'tool_call',
    outcome: 'allow',
    timestamp: Date.now(),
    latencyMs: 50,
    cost: 0.01,
    ...overrides,
  };
}

describe('Sentinel', () => {
  it('processes receipt events and tracks stats', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ outcome: 'allow' }));
    sentinel.processEvent(makeEvent({ outcome: 'allow' }));
    sentinel.processEvent(makeEvent({ outcome: 'deny' }));

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats).toBeDefined();
    expect(stats!.totalActions).toBe(3);
    expect(stats!.allowCount).toBe(2);
    expect(stats!.denyCount).toBe(1);
  });

  it('tracks per-agent stats independently', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ agentId: 'agent-a', outcome: 'allow' }));
    sentinel.processEvent(makeEvent({ agentId: 'agent-a', outcome: 'allow' }));
    sentinel.processEvent(makeEvent({ agentId: 'agent-b', outcome: 'deny' }));
    sentinel.processEvent(makeEvent({ agentId: 'agent-b', outcome: 'deny' }));

    const statsA = sentinel.getAgentStats('agent-a');
    const statsB = sentinel.getAgentStats('agent-b');

    expect(statsA!.allowCount).toBe(2);
    expect(statsA!.denyCount).toBe(0);
    expect(statsB!.allowCount).toBe(0);
    expect(statsB!.denyCount).toBe(2);
  });

  it('getAllAgentStats returns stats for all agents', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ agentId: 'agent-x' }));
    sentinel.processEvent(makeEvent({ agentId: 'agent-y' }));
    sentinel.processEvent(makeEvent({ agentId: 'agent-z' }));

    const allStats = sentinel.getAllAgentStats();
    expect(allStats.length).toBe(3);
    const agentIds = allStats.map((s) => s.agentId).sort();
    expect(agentIds).toEqual(['agent-x', 'agent-y', 'agent-z']);
  });

  it('returns undefined for unknown agent', () => {
    const sentinel = new Sentinel();
    expect(sentinel.getAgentStats('nonexistent')).toBeUndefined();
  });

  it('detects anomalies when behavior changes dramatically', () => {
    const sentinel = new Sentinel();

    // Build baseline with normal latency
    for (let i = 0; i < 30; i++) {
      sentinel.processEvent(
        makeEvent({ latencyMs: 50 + Math.random() * 5, timestamp: Date.now() + i }),
      );
    }

    // Inject a dramatic spike
    const result = sentinel.processEvent(
      makeEvent({ latencyMs: 5000, timestamp: Date.now() + 100 }),
    );

    // Should detect latency anomaly via EWMA
    const latencyAnomalies = result.anomalies.filter(
      (a) => a.metric === 'latency' && a.method === 'ewma',
    );
    expect(latencyAnomalies.length).toBeGreaterThan(0);
    expect(latencyAnomalies[0].currentValue).toBe(5000);
    expect(latencyAnomalies[0].isAnomaly).toBe(true);
  });

  it('fires alert rules when thresholds are crossed', () => {
    const sentinel = new Sentinel();

    // Feed events that are all denied to push deny rate above 0.3 threshold
    for (let i = 0; i < 5; i++) {
      sentinel.processEvent(makeEvent({ outcome: 'deny', timestamp: Date.now() + i }));
    }

    const alerts = sentinel.getActiveAlerts();
    // Deny rate is 1.0, threshold is 0.3, so alert should fire
    expect(alerts.length).toBeGreaterThan(0);
    const denyAlert = alerts.find((a) => a.ruleId === 'deny-rate-high');
    expect(denyAlert).toBeDefined();
    expect(denyAlert!.severity).toBe('critical');
  });

  it('fires latency alerts when threshold is exceeded', () => {
    const sentinel = new Sentinel();

    const result = sentinel.processEvent(
      makeEvent({ latencyMs: 6000, timestamp: Date.now() }),
    );

    // Default threshold is 5000ms
    const latencyAlerts = result.alerts.filter(
      (a) => a.ruleId === 'high-latency',
    );
    expect(latencyAlerts.length).toBe(1);
    expect(latencyAlerts[0].severity).toBe('warning');
  });

  it('fires cost alerts when threshold is exceeded', () => {
    const sentinel = new Sentinel();

    const result = sentinel.processEvent(
      makeEvent({ cost: 15, timestamp: Date.now() }),
    );

    // Default threshold is 10
    const costAlerts = result.alerts.filter((a) => a.ruleId === 'cost-spike');
    expect(costAlerts.length).toBe(1);
    expect(costAlerts[0].severity).toBe('warning');
  });

  it('auto-resolves alerts when values return to normal', () => {
    const sentinel = new Sentinel();

    // Trigger a latency alert
    sentinel.processEvent(makeEvent({ latencyMs: 6000 }));

    let active = sentinel.getActiveAlerts();
    expect(active.some((a) => a.ruleId === 'high-latency')).toBe(true);

    // Send normal latency — should auto-resolve
    sentinel.processEvent(makeEvent({ agentId: 'agent-1', latencyMs: 100 }));

    active = sentinel.getActiveAlerts();
    const latencyAlerts = active.filter((a) => a.ruleId === 'high-latency');
    expect(latencyAlerts.length).toBe(0);

    // But the alert should still exist in all alerts as resolved
    const all = sentinel.getAllAlerts();
    const resolved = all.find(
      (a) => a.ruleId === 'high-latency' && a.status === 'resolved',
    );
    expect(resolved).toBeDefined();
    expect(resolved!.resolvedAt).toBeDefined();
  });

  it('acknowledges alerts', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ latencyMs: 6000 }));

    const active = sentinel.getActiveAlerts();
    expect(active.length).toBeGreaterThan(0);

    const alertId = active[0].id;
    const result = sentinel.acknowledgeAlert(alertId);
    expect(result).toBe(true);

    // Should no longer be in active alerts
    expect(sentinel.getActiveAlerts().length).toBe(0);

    // Acknowledging a non-existent alert returns false
    expect(sentinel.acknowledgeAlert('fake-id')).toBe(false);
  });

  it('fires onAlert callback', () => {
    const alertCb = vi.fn();
    const sentinel = new Sentinel({ onAlert: alertCb });

    sentinel.processEvent(makeEvent({ latencyMs: 6000 }));

    expect(alertCb).toHaveBeenCalled();
    const alert: Alert = alertCb.mock.calls[0][0];
    expect(alert.ruleId).toBe('high-latency');
    expect(alert.status).toBe('active');
  });

  it('fires onAnomaly callback', () => {
    const anomalyCb = vi.fn();
    const sentinel = new Sentinel({ onAnomaly: anomalyCb });

    // Build baseline
    for (let i = 0; i < 30; i++) {
      sentinel.processEvent(
        makeEvent({ latencyMs: 50, timestamp: Date.now() + i }),
      );
    }

    // Spike
    sentinel.processEvent(
      makeEvent({ latencyMs: 5000, timestamp: Date.now() + 100 }),
    );

    expect(anomalyCb).toHaveBeenCalled();
    const anomaly: AnomalyResult = anomalyCb.mock.calls[anomalyCb.mock.calls.length - 1][0];
    expect(anomaly.isAnomaly).toBe(true);
    expect(anomaly.agentId).toBe('agent-1');
  });

  it('tracks cost correctly', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ cost: 0.05 }));
    sentinel.processEvent(makeEvent({ cost: 0.10 }));
    sentinel.processEvent(makeEvent({ cost: 0.15 }));

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats!.totalCost).toBeCloseTo(0.30, 2);
  });

  it('tracks latency average', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ latencyMs: 100 }));
    sentinel.processEvent(makeEvent({ latencyMs: 200 }));
    sentinel.processEvent(makeEvent({ latencyMs: 300 }));

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats!.avgLatencyMs).toBeCloseTo(200, 0);
  });

  it('tracks approval and error counts', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ outcome: 'require_approval' }));
    sentinel.processEvent(makeEvent({ outcome: 'require_approval' }));
    sentinel.processEvent(makeEvent({ error: true }));

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats!.approvalCount).toBe(2);
    expect(stats!.errorCount).toBe(1);
  });

  it('tracks action distribution', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ actionType: 'read_file' }));
    sentinel.processEvent(makeEvent({ actionType: 'read_file' }));
    sentinel.processEvent(makeEvent({ actionType: 'write_file' }));
    sentinel.processEvent(
      makeEvent({ actionType: 'delete_file', outcome: 'deny' }),
    );

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats!.topActions.get('read_file')).toBe(2);
    expect(stats!.topActions.get('write_file')).toBe(1);
    expect(stats!.topActions.get('delete_file')).toBe(1);
    expect(stats!.topDenied.get('delete_file')).toBe(1);
  });

  it('risk score calculation works', () => {
    const sentinel = new Sentinel();

    // All allowed — should be healthy (high score)
    for (let i = 0; i < 10; i++) {
      sentinel.processEvent(makeEvent({ outcome: 'allow' }));
    }
    const healthyStats = sentinel.getAgentStats('agent-1');
    expect(healthyStats!.riskScore).toBeGreaterThanOrEqual(80);

    // New agent with all denied — should be risky (low score)
    for (let i = 0; i < 10; i++) {
      sentinel.processEvent(
        makeEvent({ agentId: 'risky-agent', outcome: 'deny' }),
      );
    }
    const riskyStats = sentinel.getAgentStats('risky-agent');
    expect(riskyStats!.riskScore).toBeLessThanOrEqual(20);
  });

  it('status reporting works', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ agentId: 'a1' }));
    sentinel.processEvent(makeEvent({ agentId: 'a2' }));
    sentinel.processEvent(makeEvent({ agentId: 'a1' }));

    const status = sentinel.getStatus();
    expect(status.totalEvents).toBe(3);
    expect(status.activeAgents).toBe(2);
    expect(status.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof status.activeAlerts).toBe('number');
  });

  it('custom alert rules work', () => {
    const customRules: AlertRule[] = [
      {
        id: 'custom-latency',
        name: 'Custom low latency threshold',
        metric: 'latency',
        operator: 'gt',
        threshold: 100,
        windowMs: 60_000,
        severity: 'info',
        enabled: true,
      },
    ];

    const sentinel = new Sentinel({ alertRules: customRules });

    // Default rules should not be present
    const rules = sentinel.getAlertRules();
    expect(rules.length).toBe(1);
    expect(rules[0].id).toBe('custom-latency');

    // 150ms should trigger our custom rule (threshold 100)
    const result = sentinel.processEvent(makeEvent({ latencyMs: 150 }));
    const customAlerts = result.alerts.filter(
      (a) => a.ruleId === 'custom-latency',
    );
    expect(customAlerts.length).toBe(1);
    expect(customAlerts[0].severity).toBe('info');
  });

  it('addAlertRule and removeAlertRule work', () => {
    const sentinel = new Sentinel();

    const initialCount = sentinel.getAlertRules().length;

    const newRule: AlertRule = {
      id: 'test-rule',
      name: 'Test rule',
      metric: 'deny_rate',
      operator: 'gte',
      threshold: 0.5,
      windowMs: 60_000,
      severity: 'info',
      enabled: true,
    };

    sentinel.addAlertRule(newRule);
    expect(sentinel.getAlertRules().length).toBe(initialCount + 1);

    const removed = sentinel.removeAlertRule('test-rule');
    expect(removed).toBe(true);
    expect(sentinel.getAlertRules().length).toBe(initialCount);

    // Removing non-existent rule returns false
    expect(sentinel.removeAlertRule('nonexistent')).toBe(false);
  });

  it('does not create duplicate active alerts for same rule+agent', () => {
    const sentinel = new Sentinel();

    // Multiple events that all trigger the same alert
    sentinel.processEvent(makeEvent({ latencyMs: 6000 }));
    sentinel.processEvent(makeEvent({ latencyMs: 7000 }));
    sentinel.processEvent(makeEvent({ latencyMs: 8000 }));

    const active = sentinel.getActiveAlerts();
    const latencyAlerts = active.filter((a) => a.ruleId === 'high-latency');
    // Should only have one active alert, not three
    expect(latencyAlerts.length).toBe(1);
  });

  it('handles events without optional fields', () => {
    const sentinel = new Sentinel();

    // Event with no latencyMs, cost, or error
    const event: ReceiptEvent = {
      receiptId: 'r-1',
      envelopeId: 'e-1',
      agentId: 'agent-minimal',
      actionType: 'read',
      outcome: 'allow',
      timestamp: Date.now(),
    };

    const result = sentinel.processEvent(event);
    expect(result.anomalies).toBeDefined();
    expect(result.alerts).toBeDefined();

    const stats = sentinel.getAgentStats('agent-minimal');
    expect(stats!.totalActions).toBe(1);
    expect(stats!.totalCost).toBe(0);
    expect(stats!.avgLatencyMs).toBe(0);
  });

  it('handles rate_limited outcome', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ outcome: 'rate_limited' }));

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats!.totalActions).toBe(1);
    // rate_limited doesn't increment allow, deny, or approval
    expect(stats!.allowCount).toBe(0);
    expect(stats!.denyCount).toBe(0);
    expect(stats!.approvalCount).toBe(0);
  });

  it('deny rate calculation is correct', () => {
    const sentinel = new Sentinel();

    // 3 denies out of 10
    for (let i = 0; i < 7; i++) {
      sentinel.processEvent(makeEvent({ outcome: 'allow' }));
    }
    for (let i = 0; i < 3; i++) {
      sentinel.processEvent(makeEvent({ outcome: 'deny' }));
    }

    const stats = sentinel.getAgentStats('agent-1');
    expect(stats!.denyRate).toBeCloseTo(0.3, 2);
  });

  it('lastSeenAt is updated with each event', () => {
    const sentinel = new Sentinel();

    const t1 = 1000000;
    const t2 = 2000000;

    sentinel.processEvent(makeEvent({ timestamp: t1 }));
    expect(sentinel.getAgentStats('agent-1')!.lastSeenAt).toBe(t1);

    sentinel.processEvent(makeEvent({ timestamp: t2 }));
    expect(sentinel.getAgentStats('agent-1')!.lastSeenAt).toBe(t2);
  });
});
