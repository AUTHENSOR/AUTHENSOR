<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.svg">
    <img src=".github/assets/banner-light.svg" alt="Authensor" width="780">
  </picture>
</p>

<p align="center">
  <strong>Open-source safety stack for AI agents.</strong><br>
  <em>Gate every tool call. Scan every input. Monitor every session. Audit everything.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-722F37?style=flat-square&labelColor=1a1a1a" alt="License: MIT"></a>
  <a href="https://github.com/authensor/authensor/actions"><img src="https://img.shields.io/badge/tests-1%2C148%2B%20passing-3D7A4E?style=flat-square&labelColor=1a1a1a" alt="Tests: 1,148+ passing"></a>
  <a href="https://www.npmjs.com/org/authensor"><img src="https://img.shields.io/badge/npm-%40authensor-C9A227?style=flat-square&labelColor=1a1a1a" alt="npm: @authensor"></a>
  <a href="docs/owasp-agentic-alignment.md"><img src="https://img.shields.io/badge/OWASP_Agentic_Top_10-10%2F10-3D7A4E?style=flat-square&labelColor=1a1a1a" alt="OWASP: 10/10 coverage"></a>
  <a href="docs/eu-ai-act-compliance.md"><img src="https://img.shields.io/badge/EU_AI_Act-aligned-722F37?style=flat-square&labelColor=1a1a1a" alt="EU AI Act aligned"></a>
  <img src="https://img.shields.io/badge/zero_deps-core_packages-C9A227?style=flat-square&labelColor=1a1a1a" alt="Zero dependencies">
</p>

<br>

```bash
npx @authensor/create-authensor my-agent
cd my-agent && npm install && npm run demo
```

<p align="center">
  <a href="docs/quickstart.md">Quickstart</a> &middot;
  <a href="docs/packages.md">Packages</a> &middot;
  <a href="docs/architecture.md">Architecture</a> &middot;
  <a href="docs/why.md">Why Authensor</a> &middot;
  <a href="docs/red-teaming.md">Red Teaming</a> &middot;
  <a href="#research">Research</a> &middot;
  <a href="#work-with-us">Work With Us</a>
</p>

---

## Research

Authensor audits the infrastructure the AI safety field uses to measure itself, and files every finding upstream in public.

- **99 defect reports** across **46 organizations** in evaluation, guardrail, and training infrastructure
- **16 landed fixes**, including **7 in UK AI Security Institute repos** (`inspect_ai`, `inspect_evals`, `inspect_cyber`, `control-arena`), plus Meridian Labs, Databricks, NVIDIA and Presidio
- **76 of those defects are a single class**: the evaluator trusts an artifact the evaluated system controls

The stack is hardened against what that audit found.

## Work With Us

Red-team engagements, evaluator and scorer audits, and adversarial testing for teams shipping AI agents.

[authensor.com](https://www.authensor.com) &middot; john@authensor.com

---

## Documentation

| | |
|---|---|
| [Architecture](docs/architecture.md) | How the pieces fit: engine, control plane, scanners, receipts |
| [Packages](docs/packages.md) | All 18 packages, framework adapters, companion tools |
| [Quickstart](docs/quickstart.md) | Self-hosted setup, TypeScript and Python integration, framework adapters, CLI |
| [Why Authensor](docs/why.md) | The problem, the five layers, why the stack is free |
| [Features](docs/features.md) | Aegis content safety, session rules, budgets, Sentinel monitoring, shadow policies |
| [Red teaming](docs/red-teaming.md) | The adversarial harness, what gets tested, how it runs |
| [API reference](docs/api.md) | Control-plane endpoints |
| [Deployment](docs/deployment.md) | Self-hosted vs hosted, production deployment |
| [Development](docs/development.md) | Building and testing the monorepo |
| [OWASP Agentic Top 10](docs/owasp-agentic-alignment.md) | Coverage mapping, 10/10 |
| [EU AI Act](docs/eu-ai-act-compliance.md) | Article-by-article alignment |


## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Authensor is built on the belief that **safety tooling should not have a paywall**. We open-source every line of safety code because the more people who use these tools, the safer agents get for everyone.

## License

MIT. Use it however you want.
