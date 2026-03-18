# Authensor Aegis Scan

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Aegis%20Scan-orange?logo=github)](https://github.com/marketplace/actions/authensor-aegis-scan)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/authensor/authensor/blob/main/LICENSE)

Scan AI agent code and prompts for safety threats in your CI pipeline. Catches prompt injection, PII exposure, credential leaks, memory poisoning, and code safety issues before they ship.

Zero config. Zero dependencies. Drop it into any workflow.

## Quick Start

```yaml
- uses: authensor/authensor/.github/actions/aegis-scan@main
  with:
    path: './src'
```

## Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `path` | File or directory to scan | No | `.` |
| `fail-on-detection` | Fail the workflow when threats are found | No | `true` |
| `config` | Path to `.aegisrc.json` config file | No | |
| `severity-threshold` | Minimum severity to report: `low`, `medium`, `high`, `critical` | No | `low` |

## Outputs

| Output | Description | Example |
|---|---|---|
| `findings-count` | Total number of findings detected | `3` |
| `safe` | `"true"` when zero findings, `"false"` otherwise | `true` |
| `report-path` | Absolute path to the JSON report file | `/tmp/aegis-report.json` |

## Example: Scan PRs

```yaml
name: Agent Safety
on:
  pull_request:
    branches: [main]

jobs:
  aegis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Aegis Scan
        id: aegis
        uses: authensor/authensor/.github/actions/aegis-scan@main
        with:
          path: './src'
          severity-threshold: 'medium'

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: aegis-report
          path: ${{ steps.aegis.outputs.report-path }}
```

## Example: Gate deployments

```yaml
- name: Aegis Scan
  id: aegis
  uses: authensor/authensor/.github/actions/aegis-scan@main
  with:
    path: './prompts'
    fail-on-detection: 'false'

- name: Block deploy if unsafe
  if: steps.aegis.outputs.safe == 'false'
  run: |
    echo "Blocked: ${{ steps.aegis.outputs.findings-count }} findings detected"
    exit 1
```

## What It Scans For

- **Prompt injection** -- 15+ heuristic rules detecting role hijacking, instruction override, delimiter abuse
- **PII exposure** -- emails, SSNs, phone numbers, credit card numbers
- **Credential leaks** -- API keys, tokens, passwords, connection strings
- **Memory poisoning** -- 22 MINJA-informed rules for RAG and context manipulation
- **Code safety** -- deserialization, SSRF, command injection patterns

## Links

- [Authensor](https://authensor.com) -- the open-source safety stack for AI agents
- [Documentation](https://github.com/authensor/authensor)
- [Report an issue](https://github.com/authensor/authensor/issues)
