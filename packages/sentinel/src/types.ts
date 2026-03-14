export type MetricName = 'deny_rate' | 'action_rate' | 'cost_rate' | 'budget_utilization' | 'latency' | 'error_rate' | 'approval_rate' | 'chain_depth' | 'chain_fanout';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface MetricPoint {
  name: MetricName;
  value: number;
  timestamp: number;  // epoch ms
  labels: {
    agentId?: string;
    actionType?: string;
    outcome?: string;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  metric: MetricName;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  windowMs: number;        // time window in ms
  severity: AlertSeverity;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  metric: MetricName;
  currentValue: number;
  threshold: number;
  agentId?: string;
  message: string;
  triggeredAt: number;     // epoch ms
  acknowledgedAt?: number;
  resolvedAt?: number;
}

export interface AgentStats {
  agentId: string;
  totalActions: number;
  allowCount: number;
  denyCount: number;
  approvalCount: number;
  errorCount: number;
  totalCost: number;
  avgLatencyMs: number;
  denyRate: number;
  riskScore: number;        // 0-100
  lastSeenAt: number;
  topActions: Map<string, number>;
  topDenied: Map<string, number>;
}

export interface ReceiptEvent {
  receiptId: string;
  envelopeId: string;
  agentId: string;
  actionType: string;
  outcome: 'allow' | 'deny' | 'require_approval' | 'rate_limited' | 'budget_exceeded';
  timestamp: number;
  latencyMs?: number;
  cost?: number;
  error?: boolean;
  parentReceiptId?: string;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  metric: MetricName;
  agentId: string;
  currentValue: number;
  expectedMean: number;
  deviation: number;       // number of standard deviations
  method: 'ewma' | 'cusum';
}
