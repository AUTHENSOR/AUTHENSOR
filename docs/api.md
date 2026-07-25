<!-- Moved out of the top-level README so it stays readable.     The README renders as the AUTHENSOR account profile. -->## API Reference

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/evaluate` | Evaluate an action envelope | ingest, admin |
| POST | `/evaluate?shadow=id` | Evaluate with shadow policy | ingest, admin |
| GET | `/receipts` | List receipts | admin |
| GET | `/receipts/:id` | Get a receipt | admin |
| GET | `/receipts/:id/view` | Human-readable receipt viewer | admin |
| GET | `/receipts/:id/chain` | Get cross-agent receipt chain | admin |
| GET | `/receipts/:id/transparency` | Get Sigstore transparency proof | admin |
| POST | `/receipts/:id/claim` | Claim a receipt for execution | executor, admin |
| PATCH | `/receipts/:id` | Finalize execution (body: `{ claimId }`) | executor, admin |
| GET | `/policies` | List policies | admin |
| POST | `/policies` | Create a policy | admin |
| POST | `/policies/active` | Activate a policy version (body: `{ policy_id, version }`) | admin |
| POST | `/approvals/:id/approve` | Approve a pending action | admin |
| POST | `/approvals/:id/reject` | Reject a pending action | admin |
| GET | `/budgets` | List budgets with utilization | admin |
| POST | `/budgets` | Create/update a budget | admin |
| GET | `/shadow/report` | Shadow evaluation divergence report | admin |
| GET | `/controls` | Get kill switch / tool controls | executor, admin |
| POST | `/controls` | Update controls | admin |
| POST | `/keys` | Create API key | admin |
| GET | `/keys` | List API keys | admin |
| POST | `/keys/:id/principal` | Bind principal to key | admin |
| GET | `/metrics/summary` | Usage metrics | admin |
| GET | `/health` | Health check | public |
