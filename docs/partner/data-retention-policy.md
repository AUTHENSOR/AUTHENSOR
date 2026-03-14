# Authensor Alpha Data Retention Policy

*Effective Date: [DATE]*
*Version: 1.0 (Alpha)*

---

## What We Store

Authensor stores the following data for each tenant:

| Data Type | Description | Contains PII? |
|-----------|-------------|---------------|
| **Receipts** | Action envelopes, decisions, execution results | Possibly (agent IDs, parameters) |
| **Policies** | Your policy definitions | No |
| **API Keys** | Hashed tokens, names, roles | No (tokens are hashed) |
| **Controls** | Kill switch and tool disable state | No |
| **Metrics** | Aggregated counts by status/outcome | No |

---

## Retention Periods

### Default Retention (Alpha)

| Data Type | Retention Period |
|-----------|-----------------|
| Receipts | **30 days** |
| Policies | Until deleted |
| API Keys | Until revoked + 7 days |
| Controls | Current state only |
| Metrics | Derived from receipts (30 days) |

### Notes

- Receipt retention starts from `created_at` timestamp
- Expired receipts are soft-deleted (marked, not physically removed)
- Hard deletion occurs 7 days after soft-delete

---

## Data Deletion

### Automatic Deletion

Receipts older than 30 days are automatically purged in the nightly cleanup job.

### On-Request Deletion

Partners may request deletion of their tenant data at any time.

**What we delete:**
- All receipts
- All policies
- All API keys
- Controls state
- Any derived metrics

**Timeline:**
- Request acknowledged: < 24 hours
- Deletion complete: < 7 days
- Confirmation provided: Upon completion

**How to request:**
1. Email [support email] with subject: "Data Deletion Request - [Company Name]"
2. Include your tenant identifier
3. Specify if you want partial (specific receipts) or full deletion

---

## Data Location

| Environment | Location |
|-------------|----------|
| Alpha (hosted) | [Cloud provider, region] |
| Self-hosted | Your infrastructure |

---

## Data Export

Partners may request an export of their data:

**Available formats:**
- Receipts: JSON (one file per receipt) or NDJSON (bulk)
- Policies: JSON
- API Keys: JSON (metadata only, not tokens)

**How to request:**
1. Email [support email] with subject: "Data Export Request - [Company Name]"
2. Specify data types and date range
3. Export provided within 7 days

---

## Security Measures

| Measure | Description |
|---------|-------------|
| Encryption at rest | AES-256 (database encryption) |
| Encryption in transit | TLS 1.2+ required |
| API Key storage | SHA-256 hashed (one-way) |
| Access logging | All admin actions logged |
| Tenant isolation | Single-tenant deployment per partner |

---

## What We Don't Store

- Raw API keys (only hashes)
- Third-party API credentials (Stripe, GitHub tokens stay in your environment)
- Request/response bodies from external APIs (only metadata in receipts)
- Personally identifiable information beyond what you include in action parameters

---

## Your Responsibilities

As a partner, you are responsible for:

1. **Minimizing PII** in action parameters where possible
2. **Revoking** compromised API keys promptly
3. **Notifying** us if you believe data has been accessed improperly
4. **Reviewing** receipts for sensitive data before sharing with us for support

---

## Changes to This Policy

We will notify partners via email at least 7 days before any material changes to this policy.

---

## Contact

For data-related requests or questions:

- **Email:** [support email]
- **Subject prefix:** "Data Request - [Company Name]"

---

## Acknowledgment

By participating in the Authensor Alpha program, you acknowledge that you have read and understood this data retention policy.

| Partner Company | |
|-----------------|---|
| Authorized Representative | |
| Date | |

---

*This is an alpha-stage policy and may be updated as the product matures. Partners will be notified of any changes.*
