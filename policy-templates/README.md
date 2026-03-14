# Authensor Policy Templates

Ready-to-use policy templates for common AI agent use cases. Each template follows deny-by-default and addresses specific OWASP Agentic risks.

## Usage

```bash
# Upload a policy template to your control plane
curl -X POST http://localhost:3000/policies \
  -H "Authorization: Bearer ask_..." \
  -H "Content-Type: application/json" \
  -d @policy-templates/payment-agent.json
```

Or via the TypeScript SDK:

```typescript
import { readFileSync } from 'fs';
const policy = JSON.parse(readFileSync('policy-templates/payment-agent.json', 'utf-8'));
await fetch('http://localhost:3000/policies', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ask_...', 'Content-Type': 'application/json' },
  body: JSON.stringify(policy),
});
```

## Templates

| Template | Use Case | Key Controls |
|----------|----------|-------------|
| [payment-agent](payment-agent.json) | Stripe/payment processing | Amount caps, refund approval, PCI compliance |
| [code-agent](code-agent.json) | Code execution & file ops | Destructive command blocking, install approval |
| [mcp-gateway](mcp-gateway.json) | MCP tool governance | Per-tool authorization, read/write separation |
| [database-agent](database-agent.json) | SQL/NoSQL operations | DDL blocking, row limit, write approval |
| [customer-support](customer-support.json) | CRM & ticketing | PII protection, escalation rules |
| [infrastructure](infrastructure.json) | Cloud ops (AWS/GCP/Azure) | Deletion approval, cost caps |
| [email-comms](email-comms.json) | Email, Slack, SMS | Recipient limits, bulk send approval |
| [research-browsing](research-browsing.json) | Web browsing & API calls | Domain allowlisting, SSRF protection |
| [github-agent](github-agent.json) | GitHub operations | Repo scoping, force-push denial |
| [data-pipeline](data-pipeline.json) | ETL & data processing | Export approval, volume limits |
| [healthcare-agent](healthcare-agent.json) | HIPAA-compliant agents | PHI protection, audit requirements |
| [financial-compliance](financial-compliance.json) | SOX/PCI regulated agents | Segregation of duties, dual approval |
| [eu-ai-act-high-risk](eu-ai-act-high-risk.json) | EU AI Act compliance | Article 12/14 requirements |
| [minimal-starter](minimal-starter.json) | Getting started template | Simple allow reads, approve writes |
| [production-lockdown](production-lockdown.json) | Production hardening | Strict deny, explicit allowlist only |

## Customizing Templates

All templates use `"defaultEffect": "deny"` — only explicitly allowed actions execute. To customize:

1. Start with the closest template
2. Add rules for your specific action types
3. Adjust `constraints` values (amounts, domains, etc.)
4. Upload to your control plane

## Contributing

Have a policy template for a use case we don't cover? See [CONTRIBUTING.md](../CONTRIBUTING.md).
