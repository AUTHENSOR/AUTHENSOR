# OpenTelemetry Integration

Authensor's control plane ships with optional OpenTelemetry (OTel) support.
When enabled, every policy evaluation emits a trace span and metrics that flow
to whatever OTel-compatible backend you have configured (Jaeger, Grafana Tempo,
Datadog, Honeycomb, etc.).

## Enabling

Set the environment variable:

```
AUTHENSOR_OTEL_ENABLED=true
```

Install the optional peer dependency:

```bash
pnpm add @opentelemetry/api            # required
pnpm add @opentelemetry/sdk-node       # typical collector bootstrap
```

If `@opentelemetry/api` is not installed or the env var is absent, the
integration silently no-ops with zero overhead.

## What is instrumented

### Trace spans

Each `POST /evaluate` request creates an `authensor.evaluate` span with these
attributes:

| Attribute                         | Type    | Description                                   |
|-----------------------------------|---------|-----------------------------------------------|
| `authensor.policy.id`             | string  | ID of the matched policy                      |
| `authensor.policy.version`        | string  | Version of the matched policy                 |
| `authensor.decision.outcome`      | string  | `allow`, `deny`, `require_approval`, etc.     |
| `authensor.principal.id`          | string  | ID of the requesting principal                |
| `authensor.principal.type`        | string  | `user`, `agent`, `service`, or `system`       |
| `authensor.action.type`           | string  | Action type from the envelope                 |
| `authensor.action.resource`       | string  | Target resource URI                           |
| `authensor.receipt.id`            | string  | ID of the created receipt                     |
| `authensor.budget.utilization`    | number  | 0-1 budget usage (when budget constraints exist)|
| `authensor.aegis.flagged`         | boolean | Whether Aegis flagged the content             |
| `authensor.session.action_count`  | number  | Number of actions in the current session      |

### Metrics

| Metric                             | Type      | Labels    | Description                          |
|------------------------------------|-----------|-----------|--------------------------------------|
| `authensor.evaluations.total`      | Counter   | `outcome` | Total evaluations by decision        |
| `authensor.evaluation.duration_ms` | Histogram | `outcome` | Evaluation latency distribution      |
| `authensor.budget.utilization`     | Gauge     | `principal`| Current budget utilization          |

## Architecture

The integration follows the same optional-dependency pattern used by Aegis and
Sentinel:

1. `@opentelemetry/api` is listed in `optionalDependencies` in `package.json`.
2. The telemetry service lazy-loads it with a dynamic `import()` inside a
   `try/catch` block.
3. If the import fails (package not installed) or the env var is not set, every
   exported function returns `null` or is a no-op.
4. The evaluate route calls `startEvaluationSpan()` before evaluation and
   `endEvaluationSpan()` after, passing the result attributes.

## Typical collector setup

Authensor only depends on `@opentelemetry/api` (the thin API surface). You
bring your own SDK and exporter. A minimal Node.js setup:

```ts
// tracing.ts  (run before the app starts, e.g. --require or --import)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
  }),
});

sdk.start();
```

Then start the control plane:

```bash
AUTHENSOR_OTEL_ENABLED=true node --import ./tracing.js dist/server.js
```
