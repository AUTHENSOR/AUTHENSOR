# AAR (Agent Action Receipts) Interoperability Mapping

This document maps Authensor's Action Receipt schema to the emerging AAR standard
for agent action logging, enabling interoperability with the broader ecosystem
(including the Mastercard Verifiable Intent framework).

---

## Overview

The **Agent Action Receipts (AAR)** specification defines a standard format for
recording autonomous agent actions for auditability and compliance. Authensor's
receipt schema was designed independently but shares the same goals.

This mapping enables:
- **Export**: Convert Authensor receipts to AAR format for external audit systems
- **Import**: Ingest AAR-format receipts from other systems into Authensor
- **Federation**: Share receipts across organizations using a common format

---

## Field Mapping: Authensor → AAR

| Authensor Field | AAR Field | Notes |
|---|---|---|
| `id` | `receiptId` | UUID format (identical) |
| `envelopeId` | `actionRequestId` | Links to the original action request |
| `timestamp` | `issuedAt` | ISO 8601 (identical format) |
| `decision.outcome` | `authorization.decision` | `allow` → `PERMIT`, `deny` → `DENY`, `require_approval` → `PENDING_APPROVAL`, `rate_limited` → `DENY` |
| `decision.policyId` | `authorization.policyRef` | Policy identifier |
| `decision.policyVersion` | `authorization.policyVersion` | Semantic version |
| `decision.reason` | `authorization.reason` | Human-readable explanation |
| `decision.matchedRules` | `authorization.appliedRules` | Array of rule references |
| `status` | `executionStatus` | `pending` → `PENDING`, `executed` → `COMPLETED`, `failed` → `FAILED`, `skipped` → `SKIPPED`, `cancelled` → `CANCELLED` |
| `envelope.action.type` | `action.type` | Action type identifier |
| `envelope.action.resource` | `action.target` | Target resource URI |
| `envelope.action.operation` | `action.operation` | CRUD operation |
| `envelope.action.parameters` | `action.parameters` | Action parameters (redacted for export) |
| `envelope.principal.type` | `actor.type` | `user`/`agent`/`service`/`system` |
| `envelope.principal.id` | `actor.id` | Actor identifier |
| `envelope.principal.name` | `actor.displayName` | Human-readable name |
| `envelope.context.environment` | `context.environment` | Deployment environment |
| `envelope.context.sessionId` | `context.sessionId` | Session correlation |
| `envelope.context.traceId` | `context.traceId` | Distributed trace ID |
| `approval.status` | `humanOversight.status` | Approval status |
| `approval.respondedBy` | `humanOversight.reviewer` | Approver identity |
| `approval.respondedAt` | `humanOversight.reviewedAt` | Review timestamp |
| `approval.requiredApprovals` | `humanOversight.quorum` | Multi-party quorum |
| `approval.responses` | `humanOversight.reviews` | Individual reviewer decisions |
| `execution.startedAt` | `execution.startedAt` | Identical |
| `execution.completedAt` | `execution.completedAt` | Identical |
| `execution.durationMs` | `execution.durationMs` | Identical |
| `execution.error` | `execution.error` | Error details |
| `receiptHash` | `integrity.hash` | SHA-256 content hash |
| `prevReceiptHash` | `integrity.previousHash` | Hash chain link |

---

## Conversion Functions

### Authensor → AAR

```typescript
function toAAR(receipt: ActionReceipt): AARReceipt {
  const decisionMap: Record<string, string> = {
    allow: 'PERMIT',
    deny: 'DENY',
    require_approval: 'PENDING_APPROVAL',
    rate_limited: 'DENY',
  };

  const statusMap: Record<string, string> = {
    pending: 'PENDING',
    executed: 'COMPLETED',
    failed: 'FAILED',
    skipped: 'SKIPPED',
    cancelled: 'CANCELLED',
  };

  return {
    receiptId: receipt.id,
    actionRequestId: receipt.envelopeId,
    issuedAt: receipt.timestamp,
    authorization: {
      decision: decisionMap[receipt.decision.outcome] ?? 'DENY',
      policyRef: receipt.decision.policyId,
      policyVersion: receipt.decision.policyVersion,
      reason: receipt.decision.reason,
      appliedRules: receipt.decision.matchedRules?.map((r) => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        effect: r.effect,
      })),
    },
    executionStatus: statusMap[receipt.status] ?? 'PENDING',
    action: {
      type: receipt.envelope?.action?.type,
      target: receipt.envelope?.action?.resource,
      operation: receipt.envelope?.action?.operation,
    },
    actor: {
      type: receipt.envelope?.principal?.type,
      id: receipt.envelope?.principal?.id,
      displayName: receipt.envelope?.principal?.name,
    },
    context: {
      environment: receipt.envelope?.context?.environment,
      sessionId: receipt.envelope?.context?.sessionId,
      traceId: receipt.envelope?.context?.traceId,
    },
    humanOversight: receipt.approval
      ? {
          status: receipt.approval.status,
          reviewer: receipt.approval.respondedBy,
          reviewedAt: receipt.approval.respondedAt,
          quorum: (receipt.approval as any).requiredApprovals,
          reviews: (receipt.approval as any).responses,
        }
      : undefined,
    execution: receipt.execution
      ? {
          startedAt: receipt.execution.startedAt,
          completedAt: receipt.execution.completedAt,
          durationMs: receipt.execution.durationMs,
          error: receipt.execution.error,
        }
      : undefined,
    integrity: {
      hash: receipt.receiptHash,
      previousHash: receipt.prevReceiptHash,
      algorithm: 'SHA-256',
    },
  };
}
```

### AAR → Authensor

```typescript
function fromAAR(aar: AARReceipt): Partial<ActionReceipt> {
  const decisionMap: Record<string, string> = {
    PERMIT: 'allow',
    DENY: 'deny',
    PENDING_APPROVAL: 'require_approval',
  };

  const statusMap: Record<string, string> = {
    PENDING: 'pending',
    COMPLETED: 'executed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    CANCELLED: 'cancelled',
  };

  return {
    id: aar.receiptId,
    envelopeId: aar.actionRequestId,
    timestamp: aar.issuedAt,
    decision: {
      outcome: decisionMap[aar.authorization.decision] ?? 'deny',
      evaluatedAt: aar.issuedAt,
      policyId: aar.authorization.policyRef,
      policyVersion: aar.authorization.policyVersion,
      reason: aar.authorization.reason,
    },
    status: statusMap[aar.executionStatus] ?? 'pending',
    receiptHash: aar.integrity?.hash,
    prevReceiptHash: aar.integrity?.previousHash,
  };
}
```

---

## Authensor Advantages Over Base AAR

| Feature | AAR Base | Authensor |
|---|---|---|
| Hash chain | Optional | Built-in (SHA-256 chain) |
| Multi-party approval | Not specified | Native (quorum-based) |
| Rate limiting | Not specified | Policy-driven with windowed limits |
| Real-time verification | Not specified | `GET /receipts/verify` endpoint |
| Claim/idempotency | Not specified | Atomic claim with TTL |
| Kill switches | Not specified | Global + per-tool controls |
| NDJSON export | Not specified | `GET /receipts/export` |

---

## Integration Patterns

### Pattern 1: Export to External Audit System
```
Authensor → GET /receipts/export → Transform to AAR → Push to audit system
```

### Pattern 2: Federated Receipt Exchange
```
Org A (Authensor) ←→ AAR format ←→ Org B (any AAR-compatible system)
```

### Pattern 3: Compliance Reporting
```
Authensor receipts → AAR transform → EU AI Act Article 12 report generator
```
