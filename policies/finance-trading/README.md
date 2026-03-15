# Finance / Trading Policy Template

Policy for AI agents operating in financial trading environments. Enforces
hard position limits, blocks restricted securities, and provides tiered
human-in-the-loop approval for high-value operations.

## What It Does

| Action | Decision |
|---|---|
| Trade > $10,000 | deny (hard limit) |
| Trade in restricted securities | deny |
| Counterparty onboarding from sanctioned jurisdiction | deny |
| Trade $1,000–$10,000 | require approval (trading desk supervisor) |
| New counterparty onboarding | require approval (compliance + head of trading) |
| Market data reads | allow (rate-limited 1,000/min) |
| Portfolio queries and position reads | allow |
| Trade < $1,000 | allow (within $100,000/day budget) |
| Rapid buy → sell sequence (potential wash trade) | require approval |
| Trade after loss limit check violation | deny |
| Everything else | deny |

## Budget Configuration

```
Daily cumulative limit:   $100,000
Per-trade hard cap:       $10,000
Alert thresholds:         50%, 75%, 90%, 100% of daily limit
```

## Regulatory Context

| Framework | Control | Policy Rule |
|---|---|---|
| SEC Rule 15c3-5 | Market access controls / kill switch | Rule 1 (hard $10k limit) |
| MiFID II | Systematic risk controls | Session risk threshold |
| FINRA | Supervisory controls for algos | Rules 4 & 5 (approval workflows) |
| OFAC/Sanctions | Restricted counterparty blocking | Rule 3 |

## Key Design Decisions

### Two-tier trade limits

Trades are split into three bands:
- **< $1,000**: Allowed immediately, subject to daily budget
- **$1,000–$10,000**: Require one supervisor approval (5-minute expiry)
- **> $10,000**: Hard denied, no approval path

Adjust thresholds to match your firm's risk policy:

```yaml
# Change the hard limit
- id: deny-large-trades
  condition:
    ...
    - field: constraints.maxAmount
      operator: gt
      value: 25000   # change from 10000 to 25000

# Change the approval threshold
- id: require-approval-medium-trades
  condition:
    ...
    - field: constraints.maxAmount
      operator: gte
      value: 5000    # change from 1000 to 5000
```

### Restricted securities list

The `deny-restricted-securities` rule uses a static list in the policy.
For production, drive this from your compliance system:

```yaml
# Option A: static list in policy (update on policy version bump)
- field: action.parameters.ticker
  operator: in
  value: ["TICKER1", "TICKER2"]

# Option B: use a context field your SDK populates from a live feed
- field: context.isRestrictedSecurity
  operator: eq
  value: true
```

### Session risk scoring

The `sessionRiskThreshold` accumulates risk across a session. Once the
score exceeds 100, further actions require approval. This catches
high-frequency pattern anomalies without blocking individual trades.

Tune the `riskWeights` to reflect your firm's risk model:

```yaml
sessionRiskThreshold:
  maxScore: 200          # raise for high-frequency strategies
  riskWeights:
    "*.trade": 10        # increase weight for larger average sizes
    "counterparty.*": 50 # higher weight = earlier approval trigger
```

## How to Add an Asset Class

To extend for options or futures, add conditions that check
`action.parameters.instrumentType`:

```yaml
- id: deny-options-without-approval
  name: "Require approval for options trades"
  effect: require_approval
  condition:
    all:
      - field: action.type
        operator: contains
        value: "trade"
      - field: action.parameters.instrumentType
        operator: eq
        value: "option"
  approvalConfig:
    expiresIn: "5m"
    requiredApprovals: 1
    approvers:
      - type: role
        id: "derivatives-desk-supervisor"
```

Place this rule before `allow-small-trades` so it takes precedence.

## Important Disclaimer

This template is not a substitute for a proper market risk framework,
pre-trade compliance system, or regulatory risk management infrastructure.
Financial regulations vary by jurisdiction, asset class, and firm type.
All production deployments must be reviewed by qualified legal, compliance,
and risk management professionals.
