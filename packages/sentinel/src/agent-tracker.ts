import { EWMA } from './ewma.js';
import { CUSUM } from './cusum.js';
import {
  AgentStats,
  ReceiptEvent,
  AnomalyResult,
  MetricName,
} from './types.js';

/**
 * Tracks behavioral metrics for a single agent.
 * Uses EWMA for spike detection and CUSUM for drift detection.
 */
export class AgentTracker {
  readonly agentId: string;

  // Counters
  private totalActions = 0;
  private allowCount = 0;
  private denyCount = 0;
  private approvalCount = 0;
  private errorCount = 0;
  private totalCost = 0;
  private totalLatency = 0;
  private lastSeenAt = 0;

  // Action distribution
  private actionCounts = new Map<string, number>();
  private deniedActions = new Map<string, number>();

  // Anomaly detectors (per metric)
  private ewma: Map<MetricName, EWMA> = new Map();
  private cusum: Map<MetricName, CUSUM> = new Map();

  // Rolling windows for rate calculations
  private recentOutcomes: Array<{ outcome: string; timestamp: number }> = [];
  private windowMs = 5 * 60 * 1000; // 5-minute window

  constructor(agentId: string) {
    this.agentId = agentId;

    // Initialize detectors for each metric
    const metrics: MetricName[] = [
      'deny_rate',
      'action_rate',
      'cost_rate',
      'latency',
      'error_rate',
    ];
    for (const m of metrics) {
      this.ewma.set(m, new EWMA(0.3));
      this.cusum.set(m, new CUSUM());
    }
  }

  /**
   * Process a receipt event and update all metrics.
   * O(1) amortized — only cleans window occasionally.
   */
  processEvent(event: ReceiptEvent): AnomalyResult[] {
    this.totalActions++;
    this.lastSeenAt = event.timestamp;

    // Update counters
    switch (event.outcome) {
      case 'allow':
        this.allowCount++;
        break;
      case 'deny':
        this.denyCount++;
        break;
      case 'require_approval':
        this.approvalCount++;
        break;
    }
    if (event.error) this.errorCount++;
    if (event.cost) this.totalCost += event.cost;
    if (event.latencyMs) this.totalLatency += event.latencyMs;

    // Track action distribution
    this.actionCounts.set(
      event.actionType,
      (this.actionCounts.get(event.actionType) ?? 0) + 1,
    );
    if (event.outcome === 'deny') {
      this.deniedActions.set(
        event.actionType,
        (this.deniedActions.get(event.actionType) ?? 0) + 1,
      );
    }

    // Update rolling window
    this.recentOutcomes.push({
      outcome: event.outcome,
      timestamp: event.timestamp,
    });
    this.pruneWindow(event.timestamp);

    // Calculate current rates
    const windowCount = this.recentOutcomes.length;
    const windowDenies = this.recentOutcomes.filter(
      (o) => o.outcome === 'deny',
    ).length;
    const denyRate = windowCount > 0 ? windowDenies / windowCount : 0;

    // Update EWMA and CUSUM, check for anomalies
    const anomalies: AnomalyResult[] = [];

    // Deny rate
    this.updateAndCheck('deny_rate', denyRate, anomalies);

    // Latency
    if (event.latencyMs !== undefined) {
      this.updateAndCheck('latency', event.latencyMs, anomalies);
    }

    // Cost rate
    if (event.cost !== undefined) {
      this.updateAndCheck('cost_rate', event.cost, anomalies);
    }

    return anomalies;
  }

  private updateAndCheck(
    metric: MetricName,
    value: number,
    anomalies: AnomalyResult[],
  ): void {
    const ewma = this.ewma.get(metric)!;
    const cusum = this.cusum.get(metric)!;

    // Check EWMA anomaly before updating
    const ewmaResult = ewma.isAnomaly(value);
    if (ewmaResult.isAnomaly) {
      anomalies.push({
        isAnomaly: true,
        metric,
        agentId: this.agentId,
        currentValue: value,
        expectedMean: ewma.getMean(),
        deviation: ewmaResult.deviation,
        method: 'ewma',
      });
    }

    // Update both
    ewma.update(value);
    cusum.update(value);

    // Check CUSUM
    const cusumResult = cusum.isAnomaly();
    if (cusumResult.isAnomaly) {
      anomalies.push({
        isAnomaly: true,
        metric,
        agentId: this.agentId,
        currentValue: value,
        expectedMean: ewma.getMean(),
        deviation:
          cusumResult.sHigh > cusumResult.sLow
            ? cusumResult.sHigh
            : cusumResult.sLow,
        method: 'cusum',
      });
    }
  }

  private pruneWindow(now: number): void {
    const cutoff = now - this.windowMs;
    // Only prune if window is getting large
    if (this.recentOutcomes.length > 1000) {
      this.recentOutcomes = this.recentOutcomes.filter(
        (o) => o.timestamp > cutoff,
      );
    }
  }

  getStats(): AgentStats {
    const avgLatency =
      this.totalActions > 0 ? this.totalLatency / this.totalActions : 0;
    const denyRate =
      this.totalActions > 0 ? this.denyCount / this.totalActions : 0;

    return {
      agentId: this.agentId,
      totalActions: this.totalActions,
      allowCount: this.allowCount,
      denyCount: this.denyCount,
      approvalCount: this.approvalCount,
      errorCount: this.errorCount,
      totalCost: Math.round(this.totalCost * 100) / 100,
      avgLatencyMs: Math.round(avgLatency * 10) / 10,
      denyRate: Math.round(denyRate * 1000) / 1000,
      riskScore: this.calculateRiskScore(),
      lastSeenAt: this.lastSeenAt,
      topActions: new Map(
        [...this.actionCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
      ),
      topDenied: new Map(
        [...this.deniedActions.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
      ),
    };
  }

  private calculateRiskScore(): number {
    let score = 100; // Start healthy

    const denyRate =
      this.totalActions > 0 ? this.denyCount / this.totalActions : 0;
    score -= denyRate * 100; // High deny rate = risky

    const errorRate =
      this.totalActions > 0 ? this.errorCount / this.totalActions : 0;
    score -= errorRate * 50;

    // Check for anomalies across metrics
    for (const [, ewma] of this.ewma) {
      if (ewma.getCount() > 10 && ewma.getStdDev() > ewma.getMean() * 0.5) {
        score -= 10; // High variance = unstable
      }
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
