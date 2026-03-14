/**
 * ChainTracker — Cross-agent receipt chain correlation
 *
 * Tracks parent-child relationships between receipts to detect:
 * - Deep action chains (chain depth > N) indicating runaway delegation
 * - High fan-out (single receipt spawning many children) indicating uncontrolled spawning
 *
 * Zero dependencies, O(1) per event for tracking.
 */

import { ReceiptEvent, Alert } from './types.js';

export interface ChainStats {
  /** Maximum chain depth observed */
  maxDepth: number;
  /** Maximum fan-out observed (most children from a single receipt) */
  maxFanout: number;
  /** Total number of chains tracked */
  totalChains: number;
  /** Number of receipts with parents (i.e., part of a chain) */
  linkedReceipts: number;
}

export class ChainTracker {
  // Maps receiptId -> depth in its chain (0 = root)
  private depths: Map<string, number> = new Map();

  // Maps parentReceiptId -> count of direct children
  private childCounts: Map<string, number> = new Map();

  // Global stats
  private _maxDepth = 0;
  private _maxFanout = 0;
  private _totalChains = 0;
  private _linkedReceipts = 0;

  /**
   * Process a receipt event and update chain tracking.
   * Returns the computed chain depth and fan-out for this event.
   */
  processEvent(event: ReceiptEvent): { depth: number; fanout: number } {
    let depth = 0;

    if (event.parentReceiptId) {
      this._linkedReceipts++;

      // Compute depth: parent depth + 1
      const parentDepth = this.depths.get(event.parentReceiptId) ?? 0;
      depth = parentDepth + 1;

      // Update fan-out for parent
      const currentChildren = (this.childCounts.get(event.parentReceiptId) ?? 0) + 1;
      this.childCounts.set(event.parentReceiptId, currentChildren);

      if (currentChildren > this._maxFanout) {
        this._maxFanout = currentChildren;
      }
    } else {
      // Root receipt (no parent) - new chain
      this._totalChains++;
    }

    this.depths.set(event.receiptId, depth);

    if (depth > this._maxDepth) {
      this._maxDepth = depth;
    }

    const fanout = this.childCounts.get(event.receiptId) ?? 0;

    return { depth, fanout: this.childCounts.get(event.parentReceiptId ?? '') ?? 0 };
  }

  /**
   * Get the chain depth for a specific receipt.
   */
  getDepth(receiptId: string): number {
    return this.depths.get(receiptId) ?? 0;
  }

  /**
   * Get the fan-out (number of children) for a specific receipt.
   */
  getFanout(receiptId: string): number {
    return this.childCounts.get(receiptId) ?? 0;
  }

  /**
   * Get global chain statistics.
   */
  getStats(): ChainStats {
    return {
      maxDepth: this._maxDepth,
      maxFanout: this._maxFanout,
      totalChains: this._totalChains,
      linkedReceipts: this._linkedReceipts,
    };
  }
}
