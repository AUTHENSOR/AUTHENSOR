import { AgentTracker } from './agent-tracker.js';
import { AlertEngine } from './alert-engine.js';
import { ChainTracker } from './chain-tracker.js';
import {
  ReceiptEvent,
  Alert,
  AgentStats,
  AnomalyResult,
  AlertRule,
} from './types.js';

export interface SentinelOptions {
  alertRules?: AlertRule[];
  onAlert?: (alert: Alert) => void;
  onAnomaly?: (anomaly: AnomalyResult) => void;
}

/**
 * Sentinel — Real-time monitoring for AI agent behavior.
 *
 * Processes receipt events, tracks per-agent baselines,
 * detects anomalies, and fires alert rules.
 */
export class Sentinel {
  private trackers: Map<string, AgentTracker> = new Map();
  private alertEngine: AlertEngine;
  private chainTracker: ChainTracker;
  private onAlert?: (alert: Alert) => void;
  private onAnomaly?: (anomaly: AnomalyResult) => void;

  // Global counters
  private totalEvents = 0;
  private startedAt = Date.now();

  constructor(options?: SentinelOptions) {
    this.alertEngine = new AlertEngine(options?.alertRules);
    this.chainTracker = new ChainTracker();
    this.onAlert = options?.onAlert;
    this.onAnomaly = options?.onAnomaly;
  }

  /**
   * Process a receipt event. O(1) amortized.
   * Returns any anomalies and alerts triggered.
   */
  processEvent(
    event: ReceiptEvent,
  ): { anomalies: AnomalyResult[]; alerts: Alert[] } {
    this.totalEvents++;

    // Get or create agent tracker
    let tracker = this.trackers.get(event.agentId);
    if (!tracker) {
      tracker = new AgentTracker(event.agentId);
      this.trackers.set(event.agentId, tracker);
    }

    // Process event through tracker (updates EWMA/CUSUM)
    const anomalies = tracker.processEvent(event);

    // Notify anomaly callback
    for (const a of anomalies) {
      this.onAnomaly?.(a);
    }

    // Check alert rules
    const stats = tracker.getStats();
    const alerts: Alert[] = [];

    const denyAlerts = this.alertEngine.check(
      'deny_rate',
      stats.denyRate,
      event.agentId,
    );
    const latencyAlerts =
      event.latencyMs !== undefined
        ? this.alertEngine.check('latency', event.latencyMs, event.agentId)
        : [];
    const costAlerts =
      event.cost !== undefined
        ? this.alertEngine.check('cost_rate', event.cost, event.agentId)
        : [];

    // Chain tracking
    this.chainTracker.processEvent(event);
    const depth = this.chainTracker.getDepth(event.receiptId);
    const fanout = event.parentReceiptId
      ? this.chainTracker.getFanout(event.parentReceiptId)
      : 0;
    const chainDepthAlerts = this.alertEngine.check('chain_depth', depth, event.agentId);
    const chainFanoutAlerts = fanout > 0
      ? this.alertEngine.check('chain_fanout', fanout, event.agentId)
      : [];

    alerts.push(...denyAlerts, ...latencyAlerts, ...costAlerts, ...chainDepthAlerts, ...chainFanoutAlerts);

    // Notify alert callback
    for (const a of alerts) {
      this.onAlert?.(a);
    }

    return { anomalies, alerts };
  }

  getAgentStats(agentId: string): AgentStats | undefined {
    return this.trackers.get(agentId)?.getStats();
  }

  getAllAgentStats(): AgentStats[] {
    return [...this.trackers.values()].map((t) => t.getStats());
  }

  getActiveAlerts(): Alert[] {
    return this.alertEngine.getActiveAlerts();
  }

  getAllAlerts(): Alert[] {
    return this.alertEngine.getAllAlerts();
  }

  acknowledgeAlert(alertId: string): boolean {
    return this.alertEngine.acknowledge(alertId);
  }

  getChainStats() {
    return this.chainTracker.getStats();
  }

  getChainDepth(receiptId: string): number {
    return this.chainTracker.getDepth(receiptId);
  }

  getChainFanout(receiptId: string): number {
    return this.chainTracker.getFanout(receiptId);
  }

  getStatus(): {
    totalEvents: number;
    activeAgents: number;
    activeAlerts: number;
    uptimeMs: number;
    chainStats: ReturnType<ChainTracker['getStats']>;
  } {
    return {
      totalEvents: this.totalEvents,
      activeAgents: this.trackers.size,
      activeAlerts: this.alertEngine.getActiveAlerts().length,
      uptimeMs: Date.now() - this.startedAt,
      chainStats: this.chainTracker.getStats(),
    };
  }

  getAlertRules(): AlertRule[] {
    return this.alertEngine.getRules();
  }

  addAlertRule(rule: AlertRule): void {
    this.alertEngine.addRule(rule);
  }

  removeAlertRule(ruleId: string): boolean {
    return this.alertEngine.removeRule(ruleId);
  }
}
