import { AlertRule, Alert, MetricName } from './types.js';
import { randomUUID } from 'crypto';

const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'deny-rate-high',
    name: 'High deny rate',
    metric: 'deny_rate',
    operator: 'gt',
    threshold: 0.3,
    windowMs: 5 * 60 * 1000,
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'cost-spike',
    name: 'Cost spike',
    metric: 'cost_rate',
    operator: 'gt',
    threshold: 10,
    windowMs: 15 * 60 * 1000,
    severity: 'warning',
    enabled: true,
  },
  {
    id: 'high-latency',
    name: 'High latency',
    metric: 'latency',
    operator: 'gt',
    threshold: 5000,
    windowMs: 60 * 1000,
    severity: 'warning',
    enabled: true,
  },
  {
    id: 'error-rate-high',
    name: 'High error rate',
    metric: 'error_rate',
    operator: 'gt',
    threshold: 0.1,
    windowMs: 5 * 60 * 1000,
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'budget-80pct',
    name: 'Budget 80% threshold',
    metric: 'budget_utilization',
    operator: 'gte',
    threshold: 0.8,
    windowMs: 60 * 60 * 1000,
    severity: 'info',
    enabled: true,
  },
  {
    id: 'budget-90pct',
    name: 'Budget 90% threshold',
    metric: 'budget_utilization',
    operator: 'gte',
    threshold: 0.9,
    windowMs: 60 * 60 * 1000,
    severity: 'warning',
    enabled: true,
  },
  {
    id: 'budget-exhausted',
    name: 'Budget exhausted',
    metric: 'budget_utilization',
    operator: 'gte',
    threshold: 1.0,
    windowMs: 60 * 60 * 1000,
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'deep-action-chain',
    name: 'Deep action chain',
    metric: 'chain_depth',
    operator: 'gt',
    threshold: 10,
    windowMs: 60 * 60 * 1000,
    severity: 'warning',
    enabled: true,
  },
  {
    id: 'high-chain-fanout',
    name: 'High chain fan-out',
    metric: 'chain_fanout',
    operator: 'gt',
    threshold: 20,
    windowMs: 60 * 60 * 1000,
    severity: 'warning',
    enabled: true,
  },
];

export class AlertEngine {
  private rules: AlertRule[];
  private activeAlerts: Map<string, Alert> = new Map(); // key = ruleId:agentId

  constructor(customRules?: AlertRule[]) {
    this.rules = customRules ?? DEFAULT_RULES;
  }

  /**
   * Check a metric value against all rules.
   * Returns any new alerts triggered.
   */
  check(metric: MetricName, value: number, agentId?: string): Alert[] {
    const newAlerts: Alert[] = [];
    const now = Date.now();

    for (const rule of this.rules) {
      if (!rule.enabled || rule.metric !== metric) continue;

      const triggered = this.evaluateRule(rule, value);
      const alertKey = `${rule.id}:${agentId ?? 'global'}`;

      if (triggered) {
        const existing = this.activeAlerts.get(alertKey);
        if (!existing || existing.status !== 'active') {
          const alert: Alert = {
            id: randomUUID(),
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            status: 'active',
            metric: rule.metric,
            currentValue: Math.round(value * 1000) / 1000,
            threshold: rule.threshold,
            agentId,
            message: `${rule.name}: ${metric} = ${Math.round(value * 1000) / 1000} (threshold: ${rule.threshold})`,
            triggeredAt: now,
          };
          this.activeAlerts.set(alertKey, alert);
          newAlerts.push(alert);
        }
      } else {
        // Auto-resolve if value drops below threshold
        const existing = this.activeAlerts.get(alertKey);
        if (existing && existing.status === 'active') {
          existing.status = 'resolved';
          existing.resolvedAt = now;
        }
      }
    }

    return newAlerts;
  }

  private evaluateRule(rule: AlertRule, value: number): boolean {
    switch (rule.operator) {
      case 'gt':
        return value > rule.threshold;
      case 'lt':
        return value < rule.threshold;
      case 'gte':
        return value >= rule.threshold;
      case 'lte':
        return value <= rule.threshold;
    }
  }

  acknowledge(alertId: string): boolean {
    for (const alert of this.activeAlerts.values()) {
      if (alert.id === alertId && alert.status === 'active') {
        alert.status = 'acknowledged';
        alert.acknowledgedAt = Date.now();
        return true;
      }
    }
    return false;
  }

  getActiveAlerts(): Alert[] {
    return [...this.activeAlerts.values()].filter(
      (a) => a.status === 'active',
    );
  }

  getAllAlerts(): Alert[] {
    return [...this.activeAlerts.values()];
  }

  getRules(): AlertRule[] {
    return [...this.rules];
  }

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }
}
