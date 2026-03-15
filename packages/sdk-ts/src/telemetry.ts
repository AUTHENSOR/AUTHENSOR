/**
 * Telemetry Reporter
 *
 * Opt-in anonymous counter reporting. Accumulates counter deltas in memory
 * and periodically flushes them to the central Authensor stats endpoint.
 *
 * No identifying data is sent — just aggregate counter increments.
 */

const VALID_METRICS = [
  'actions_evaluated',
  'threats_detected',
  'receipts_created',
  'approvals_requested',
] as const;

type MetricName = (typeof VALID_METRICS)[number];

export class TelemetryReporter {
  private counters: Record<MetricName, number> = {
    actions_evaluated: 0,
    threats_detected: 0,
    receipts_created: 0,
    approvals_requested: 0,
  };
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private endpoint: string = 'https://authensor-control-plane-production.up.railway.app',
    private intervalMs: number = 300_000 // 5 minutes
  ) {}

  increment(metric: MetricName, amount = 1): void {
    this.counters[metric] += amount;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.intervalMs);
    // Ensure flush on process exit
    if (typeof process !== 'undefined' && process.on) {
      process.on('beforeExit', () => this.flush());
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    const snapshot = { ...this.counters };

    // Reset counters
    for (const key of VALID_METRICS) {
      this.counters[key] = 0;
    }

    // Skip if nothing to report
    if (Object.values(snapshot).every((v) => v === 0)) return;

    try {
      await fetch(`${this.endpoint}/stats/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // Silent — telemetry must never break the app
    }
  }
}
