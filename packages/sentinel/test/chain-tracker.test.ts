import { describe, it, expect } from 'vitest';
import { ChainTracker } from '../src/chain-tracker.js';
import { ReceiptEvent } from '../src/types.js';

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

describe('ChainTracker', () => {
  it('tracks root receipts with depth 0', () => {
    const tracker = new ChainTracker();
    const event = makeEvent({ receiptId: 'r-root' });
    const { depth } = tracker.processEvent(event);

    expect(depth).toBe(0);
    expect(tracker.getDepth('r-root')).toBe(0);
  });

  it('tracks chain depth correctly for linear chains', () => {
    const tracker = new ChainTracker();

    tracker.processEvent(makeEvent({ receiptId: 'r-1' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-2', parentReceiptId: 'r-1' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-3', parentReceiptId: 'r-2' }));
    const { depth } = tracker.processEvent(
      makeEvent({ receiptId: 'r-4', parentReceiptId: 'r-3' }),
    );

    expect(depth).toBe(3);
    expect(tracker.getDepth('r-1')).toBe(0);
    expect(tracker.getDepth('r-2')).toBe(1);
    expect(tracker.getDepth('r-3')).toBe(2);
    expect(tracker.getDepth('r-4')).toBe(3);
  });

  it('tracks fan-out correctly', () => {
    const tracker = new ChainTracker();

    tracker.processEvent(makeEvent({ receiptId: 'r-parent' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-child-1', parentReceiptId: 'r-parent' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-child-2', parentReceiptId: 'r-parent' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-child-3', parentReceiptId: 'r-parent' }));

    expect(tracker.getFanout('r-parent')).toBe(3);
  });

  it('returns correct fan-out from processEvent', () => {
    const tracker = new ChainTracker();

    tracker.processEvent(makeEvent({ receiptId: 'r-parent' }));
    const { fanout: f1 } = tracker.processEvent(
      makeEvent({ receiptId: 'r-c1', parentReceiptId: 'r-parent' }),
    );
    expect(f1).toBe(1);

    const { fanout: f2 } = tracker.processEvent(
      makeEvent({ receiptId: 'r-c2', parentReceiptId: 'r-parent' }),
    );
    expect(f2).toBe(2);

    const { fanout: f3 } = tracker.processEvent(
      makeEvent({ receiptId: 'r-c3', parentReceiptId: 'r-parent' }),
    );
    expect(f3).toBe(3);
  });

  it('tracks global stats correctly', () => {
    const tracker = new ChainTracker();

    // Chain 1: root -> child
    tracker.processEvent(makeEvent({ receiptId: 'r-a1' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-a2', parentReceiptId: 'r-a1' }));

    // Chain 2: root -> child -> grandchild
    tracker.processEvent(makeEvent({ receiptId: 'r-b1' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-b2', parentReceiptId: 'r-b1' }));
    tracker.processEvent(makeEvent({ receiptId: 'r-b3', parentReceiptId: 'r-b2' }));

    const stats = tracker.getStats();
    expect(stats.maxDepth).toBe(2);
    expect(stats.totalChains).toBe(2);
    expect(stats.linkedReceipts).toBe(3);
  });

  it('tracks max fan-out across all receipts', () => {
    const tracker = new ChainTracker();

    tracker.processEvent(makeEvent({ receiptId: 'r-root' }));

    // 5 children from root
    for (let i = 0; i < 5; i++) {
      tracker.processEvent(
        makeEvent({ receiptId: `r-child-${i}`, parentReceiptId: 'r-root' }),
      );
    }

    const stats = tracker.getStats();
    expect(stats.maxFanout).toBe(5);
  });

  it('handles unknown parent gracefully', () => {
    const tracker = new ChainTracker();

    // Parent not previously registered - should still work
    const { depth } = tracker.processEvent(
      makeEvent({ receiptId: 'r-orphan', parentReceiptId: 'r-unknown' }),
    );

    // Unknown parent defaults to depth 0, so child is depth 1
    expect(depth).toBe(1);
  });

  it('handles receipts with no parent', () => {
    const tracker = new ChainTracker();

    const { depth, fanout } = tracker.processEvent(
      makeEvent({ receiptId: 'r-standalone' }),
    );

    expect(depth).toBe(0);
    expect(fanout).toBe(0);
  });

  it('returns 0 for unknown receipt depth and fan-out', () => {
    const tracker = new ChainTracker();

    expect(tracker.getDepth('nonexistent')).toBe(0);
    expect(tracker.getFanout('nonexistent')).toBe(0);
  });
});
