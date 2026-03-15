# Authensor Aegis Scan Action

Add agent safety scanning to your CI pipeline. Detects prompt injection, PII exposure, credential leaks, and memory poisoning in your agent code and prompts.

## Usage

```yaml
- uses: authensor/authensor/.github/actions/aegis-scan@main
  with:
    path: './prompts'
    fail-on-detection: 'true'
```

## What It Scans For
- Prompt injection patterns (15+ heuristic rules)
- PII (emails, SSNs, phone numbers, credit cards)
- Credential exposure (API keys, tokens, passwords)
- Memory poisoning (22 MINJA-informed rules)
- Code safety (deserialization, SSRF, command injection)

Free and open source. Part of [Authensor](https://authensor.com).
