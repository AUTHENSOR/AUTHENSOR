import { describe, it, expect, vi } from 'vitest';
import { Sentinel } from '../src/sentinel.js';
import { ReceiptEvent, Alert, AlertRule } from '../src/types.js';

function makeEvent(overrides: Partial<ReceiptEvent> = {}): ReceiptEvent {
  return {
    receiptId: `r-${Math.random().toString(36).slice(2, 8)}`,
    envelopeId: `e-${Math.random().toString(36).slice(2, 8)}`,
    agentId: 'agent-1',
    actionType: 'tool_call',
    outcome: 'allow',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('Sentinel cross-agent correlation', () => {
  it('tracks chain depth through processEvent', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ receiptId: 'r-1', agentId: 'agent-a' }));
    sentinel.processEvent(
      makeEvent({ receiptId: 'r-2', agentId: 'agent-b', parentReceiptId: 'r-1' }),
    );
    sentinel.processEvent(
      makeEvent({ receiptId: 'r-3', agentId: 'agent-c', parentReceiptId: 'r-2' }),
    );

    expect(sentinel.getChainDepth('r-1')).toBe(0);
    expect(sentinel.getChainDepth('r-2')).toBe(1);
    expect(sentinel.getChainDepth('r-3')).toBe(2);
  });

  it('tracks fan-out through processEvent', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ receiptId: 'r-parent', agentId: 'agent-a' }));
    sentinel.processEvent(
      makeEvent({ receiptId: 'r-c1', agentId: 'agent-b', parentReceiptId: 'r-parent' }),
    );
    sentinel.processEvent(
      makeEvent({ receiptId: 'r-c2', agentId: 'agent-c', parentReceiptId: 'r-parent' }),
    );

    expect(sentinel.getChainFanout('r-parent')).toBe(2);
  });

  it('exposes chain stats via getChainStats', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ receiptId: 'r-1' }));
    sentinel.processEvent(makeEvent({ receiptId: 'r-2', parentReceiptId: 'r-1' }));
    sentinel.processEvent(makeEvent({ receiptId: 'r-3', parentReceiptId: 'r-2' }));

    const stats = sentinel.getChainStats();
    expect(stats.maxDepth).toBe(2);
    expect(stats.totalChains).toBe(1);
    expect(stats.linkedReceipts).toBe(2);
  });

  it('includes chain stats in getStatus', () => {
    const sentinel = new Sentinel();

    sentinel.processEvent(makeEvent({ receiptId: 'r-1' }));
    sentinel.processEvent(makeEvent({ receiptId: 'r-2', parentReceiptId: 'r-1' }));

    const status = sentinel.getStatus();
    expect(status.chainStats).toBeDefined();
    expect(status.chainStats.maxDepth).toBe(1);
    expect(status.chainStats.totalChains).toBe(1);
  });

  it('fires deep-action-chain alert when depth exceeds threshold', () => {
    const alertCb = vi.fn();
    const sentinel = new Sentinel({ onAlert: alertCb });

    // Default threshold for chain_depth is 10
    // Build a chain of depth 11
    let parentId = 'r-root';
    sentinel.processEvent(makeEvent({ receiptId: parentId }));
    for (let i = 1; i <= 11; i++) {
      const id = `r-${i}`;
      sentinel.processEvent(
        makeEvent({ receiptId: id, parentReceiptId: parentId }),
      );
      parentId = id;
    }

    // Should have fired a chain_depth alert
    const chainAlerts = alertCb.mock.calls
      .map((c: [Alert]) => c[0])
      .filter((a: Alert) => a.ruleId === 'deep-action-chain');
    expect(chainAlerts.length).toBeGreaterThan(0);
    expect(chainAlerts[0].severity).toBe('warning');
    expect(chainAlerts[0].metric).toBe('chain_depth');
  });

  it('fires high-chain-fanout alert when fan-out exceeds threshold', () => {
    const alertCb = vi.fn();
    const sentinel = new Sentinel({ onAlert: alertCb });

    // Default threshold for chain_fanout is 20
    sentinel.processEvent(makeEvent({ receiptId: 'r-parent' }));
    for (let i = 0; i < 21; i++) {
      sentinel.processEvent(
        makeEvent({ receiptId: `r-child-${i}`, parentReceiptId: 'r-parent' }),
      );
    }

    // Should have fired a chain_fanout alert
    const fanoutAlerts = alertCb.mock.calls
      .map((c: [Alert]) => c[0])
      .filter((a: Alert) => a.ruleId === 'high-chain-fanout');
    expect(fanoutAlerts.length).toBeGreaterThan(0);
    expect(fanoutAlerts[0].severity).toBe('warning');
    expect(fanoutAlerts[0].metric).toBe('chain_fanout');
  });

  it('does not fire chain alerts when within thresholds', () => {
    const alertCb = vi.fn();
    const sentinel = new Sentinel({ onAlert: alertCb });

    sentinel.processEvent(makeEvent({ receiptId: 'r-1' }));
    sentinel.processEvent(
      makeEvent({ receiptId: 'r-2', parentReceiptId: 'r-1' }),
    );
    sentinel.processEvent(
      makeEvent({ receiptId: 'r-3', parentReceiptId: 'r-2' }),
    );

    const chainAlerts = alertCb.mock.calls
      .map((c: [Alert]) => c[0])
      .filter((a: Alert) => a.ruleId === 'deep-action-chain' || a.ruleId === 'high-chain-fanout');
    expect(chainAlerts.length).toBe(0);
  });

  it('works with custom chain alert rules', () => {
    const customRules: AlertRule[] = [
      {
        id: 'custom-depth',
        name: 'Custom depth alert',
        metric: 'chain_depth',
        operator: 'gt',
        threshold: 2,
        windowMs: 60_000,
        severity: 'critical',
        enabled: true,
      },
      {
        id: 'custom-fanout',
        name: 'Custom fanout alert',
        metric: 'chain_fanout',
        operator: 'gt',
        threshold: 1,
        windowMs: 60_000,
        severity: 'critical',
        enabled: true,
      },
    ];

    const sentinel = new Sentinel({ alertRules: customRules });

    sentinel.processEvent(makeEvent({ receiptId: 'r-1' }));
    sentinel.processEvent(makeEvent({ receiptId: 'r-2', parentReceiptId: 'r-1' }));
    sentinel.processEvent(makeEvent({ receiptId: 'r-3', parentReceiptId: 'r-2' }));

    // Depth is 2, threshold is 2, operator is 'gt' so no alert yet
    let active = sentinel.getActiveAlerts();
    let depthAlerts = active.filter((a) => a.ruleId === 'custom-depth');
    expect(depthAlerts.length).toBe(0);

    // Depth 3 should trigger
    const result = sentinel.processEvent(
      makeEvent({ receiptId: 'r-4', parentReceiptId: 'r-3' }),
    );
    const customDepthAlerts = result.alerts.filter((a) => a.ruleId === 'custom-depth');
    expect(customDepthAlerts.length).toBe(1);
    expect(customDepthAlerts[0].severity).toBe('critical');

    // Fan-out: r-1 has 1 child (r-2), add another
    sentinel.processEvent(makeEvent({ receiptId: 'r-1b', parentReceiptId: 'r-1' }));

    active = sentinel.getActiveAlerts();
    const fanoutAlerts = active.filter((a) => a.ruleId === 'custom-fanout');
    expect(fanoutAlerts.length).toBe(1);
  });

  it('tracks multi-agent delegation chains', () => {
    const sentinel = new Sentinel();

    // Agent A submits action, gets receipt r-1
    sentinel.processEvent(makeEvent({
      receiptId: 'r-1',
      agentId: 'orchestrator',
      actionType: 'plan.create',
    }));

    // Agent A delegates to Agent B, referencing r-1
    sentinel.processEvent(makeEvent({
      receiptId: 'r-2',
      agentId: 'researcher',
      actionType: 'web.search',
      parentReceiptId: 'r-1',
    }));

    // Agent B delegates to Agent C
    sentinel.processEvent(makeEvent({
      receiptId: 'r-3',
      agentId: 'summarizer',
      actionType: 'text.summarize',
      parentReceiptId: 'r-2',
    }));

    // Verify the chain is tracked across different agents
    expect(sentinel.getChainDepth('r-1')).toBe(0);
    expect(sentinel.getChainDepth('r-2')).toBe(1);
    expect(sentinel.getChainDepth('r-3')).toBe(2);

    const stats = sentinel.getChainStats();
    expect(stats.maxDepth).toBe(2);
    expect(stats.totalChains).toBe(1);
    expect(stats.linkedReceipts).toBe(2);
  });
});
