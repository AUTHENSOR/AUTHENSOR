# Alpha Partner Success Criteria

## Partner Information

| Field | Value |
|-------|-------|
| **Company** | |
| **Primary Contact** | |
| **Contact Email** | |
| **Start Date** | |
| **Weekly Sync** | (day/time) |
| **Slack/Comm Channel** | |

---

## Success Criteria

### 1. Workflow Deployment

**Target:** Deploy one AI workflow through Authensor by Week 2

| Milestone | Target Date | Status | Notes |
|-----------|-------------|--------|-------|
| Credentials delivered | | [ ] | |
| Smoke test passed | | [ ] | |
| Sandbox workflow running | | [ ] | |
| First real execution | | [ ] | |
| Production-ready workflow | | [ ] | |

**Workflow description:**
> [What does this workflow do? What AI agent? What external APIs?]

---

### 2. Policy Pack

**Target:** Create at least one custom policy by Week 3

| Policy | Purpose | Status |
|--------|---------|--------|
| | | [ ] |
| | | [ ] |

**Example policies to consider:**
- Deny HTTP to non-allowlisted domains
- Require approval for charges over $X
- Allow GitHub only for specific repos
- Rate limit certain action types

---

### 3. Quotable Feedback

**Target:** Provide one anonymized quote by Week 4

**Quote template:**
> "Before Authensor, we [problem]. Now, [benefit]. The [specific feature] was particularly valuable because [reason]."

**Draft quote:**
>

**Approval to use:** [ ] Yes, anonymized | [ ] Yes, with company name | [ ] Not yet

---

### 4. Weekly Metrics Snapshot

Captured each week from `/metrics/summary`:

| Week | Receipts | Allow % | Deny % | Approval % | Claim Conflicts | Notes |
|------|----------|---------|--------|------------|-----------------|-------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |

---

## Feature Requests

Track requests from this partner:

| Request | Priority | Status | Notes |
|---------|----------|--------|-------|
| | | | |
| | | | |

---

## Issues Log

| Date | Issue | Resolution | Time to Resolve |
|------|-------|------------|-----------------|
| | | | |
| | | | |

---

## Weekly Sync Notes

### Week 1: Onboarding
**Date:**
**Attendees:**

**Topics:**
- [ ] Credentials delivered
- [ ] Smoke test
- [ ] Sandbox mode demo
- [ ] Workflow planning

**Action items:**
-

**Blockers:**
-

---

### Week 2: First Workflow
**Date:**
**Attendees:**

**Topics:**
- [ ] Workflow progress
- [ ] Policy discussion
- [ ] Any issues?

**Action items:**
-

**Blockers:**
-

---

### Week 3: Policy Pack
**Date:**
**Attendees:**

**Topics:**
- [ ] Policies created
- [ ] Metrics review
- [ ] Quote discussion

**Action items:**
-

**Blockers:**
-

---

### Week 4: Review & Next Steps
**Date:**
**Attendees:**

**Topics:**
- [ ] Success criteria review
- [ ] Quote finalization
- [ ] Constrained real mode readiness
- [ ] Future plans

**Action items:**
-

**Outcome:**
- [ ] Continuing in alpha
- [ ] Ready for GA pricing discussion
- [ ] Churned (reason: )

---

## Graduation Checklist

Before moving from sandbox to constrained real mode:

- [ ] Workflow documented
- [ ] Policies tested in sandbox
- [ ] Kill switch tested
- [ ] Partner understands rate limits
- [ ] Support escalation path confirmed
- [ ] Data retention discussed

**Constrained real mode settings:**
```bash
# Approved constraints for this partner
AUTHENSOR_GITHUB_ALLOWED_REPOS=
AUTHENSOR_GITHUB_ALLOWED_ORGS=
STRIPE_TEST_KEY=  # (test mode only initially)
AUTHENSOR_STRIPE_ALLOW_LIVE=false
```

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Partner Lead | | |
| Authensor Lead | | |
