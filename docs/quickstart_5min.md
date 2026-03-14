# OpenClaw + Authensor Quickstart

Authensor keeps OpenClaw marketplace skills safe without forcing you to approve every single action.

## 3-Step Setup (Stupid Simple)
1. Install the **Authensor Gateway** skill: https://www.clawhub.ai/AUTHENSOR/authensor-gateway
2. Start Authensor locally (`docker compose up -d`) or request a hosted demo key: https://forms.gle/QdfeWAr2G4pc8GxQA
3. Paste the key once, start a new session, and run any marketplace skill. Low-risk actions run; high-risk actions ask for approval; known-dangerous actions are blocked.

## Add Your Control Plane URL
Edit `~/.openclaw/openclaw.json` (JSON5) and add:

### Self-hosted (recommended)

```json5
{
  skills: {
    entries: {
      "authensor-gateway": {
        enabled: true,
        env: {
          CONTROL_PLANE_URL: "http://localhost:3000",
          AUTHENSOR_API_KEY: "authensor_your_key_here"
        }
      }
    }
  }
}
```

If you use sandboxed OpenClaw sessions, also add:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          env: {
            CONTROL_PLANE_URL: "http://localhost:3000",
            AUTHENSOR_API_KEY: "authensor_your_key_here"
          }
        }
      }
    }
  }
}
```

### Hosted tier (alternative)

If using the managed hosted tier, replace the URL with your hosted endpoint:

```json5
{
  skills: {
    entries: {
      "authensor-gateway": {
        enabled: true,
        env: {
          CONTROL_PLANE_URL: "https://<your-tenant>.up.railway.app",
          AUTHENSOR_API_KEY: "authensor_demo_..."
        }
      }
    }
  }
}
```

## How Approvals Work (No Pain)
- **Low-risk actions run automatically.**
- **High-risk actions require owner confirmation** (approval) before execution.
- **Known-dangerous actions are blocked.**

That means you’re not approving every single step — only the risky ones.

## Approvals by Email
Approvals can be handled by email with signed links (no UI required). Setup lives here:
`https://github.com/AUTHENSOR/Authensor-for-OpenClaw` → `apps-script/README.md`

## Demo Tier Limits
- Sandbox mode only (no real API calls)
- Tight rate limits
- Short receipt retention
- Custom policies unlocked on paid tiers
- Demo keys auto-expire after 7 days (upgrade email sent)
 - Optional email domain allowlist for demo keys (set in Apps Script)

## Request Demo Key
Form: https://forms.gle/QdfeWAr2G4pc8GxQA  
Keys are emailed automatically with a ready-to-paste config snippet.

## Public Repo
`https://github.com/AUTHENSOR/Authensor-for-OpenClaw`

## OpenClaw References
- Skills config: `https://docs.openclaw.ai/tools/skills-config`
- Onboarding wizard: `https://docs.openclaw.ai/start/wizard`
