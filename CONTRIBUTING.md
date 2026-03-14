# Contributing to Authensor

Thank you for your interest in contributing to Authensor! We believe safety tooling should not have a paywall, and community contributions are essential to making AI agents safer for everyone.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/authensor.git`
3. Install dependencies: `corepack enable && pnpm install`
4. Start development: `docker compose up -d postgres && pnpm dev`
5. Run tests: `pnpm test`

## Development Setup

**Prerequisites**:
- Node.js 20+
- Docker Desktop (for PostgreSQL)
- pnpm via corepack (`corepack enable`)

**Project structure**:
```
packages/
  schemas/        # JSON Schema definitions (source of truth)
  engine/         # Pure policy evaluation logic
  control-plane/  # HTTP API (Hono + PostgreSQL)
  mcp-server/     # MCP tools with policy enforcement
  sdk/            # TypeScript SDK
  python/         # Python SDK
examples/
  node-quickstart/
  python-quickstart/
```

**Key commands**:
```bash
pnpm dev          # Start all services with hot reload
pnpm build        # Production build
pnpm test         # Run all tests
pnpm gen          # Regenerate types from schemas
pnpm gen:check    # CI check for stale generated code
pnpm format       # Format with Prettier
```

## How to Contribute

### Reporting Bugs

- Use GitHub Issues with the `bug` label
- Include: steps to reproduce, expected vs actual behavior, environment details
- For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead

### Suggesting Features

- Open a GitHub Issue with the `enhancement` label
- Describe the use case and why it matters for agent safety
- Reference relevant standards (OWASP, NIST, EU AI Act) when applicable

### Submitting Pull Requests

1. Create a feature branch from `main`: `git checkout -b feat/your-feature`
2. Make your changes following the code style (Prettier + TypeScript strict mode)
3. Add tests for new functionality
4. Ensure all tests pass: `pnpm test`
5. Ensure types are generated: `pnpm gen:check`
6. Submit a PR with a clear description of what and why

### Code Style

- TypeScript with strict mode
- Prettier for formatting (run `pnpm format`)
- JSON Schema as the single source of truth for types
- Pure functions in the engine package (no side effects)
- All new API endpoints require tests

### Commit Messages

Use conventional commits:
- `feat: add multi-party approval support`
- `fix: prevent race condition in receipt claims`
- `docs: add OWASP alignment document`
- `test: add regression tests for controls`

## Developer Certificate of Origin (DCO)

By contributing to this project, you agree that your contributions are your own work (or you have the right to submit them) and that you grant the project the right to use them under the MIT license.

We use the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). Sign off your commits with `git commit -s` to certify your contribution.

## Areas Where We Need Help

- **Framework adapters**: LangChain, CrewAI, AutoGen, OpenAI Agents SDK integrations
- **Policy templates**: Pre-built policies for common agent use cases
- **MCP server tools**: Additional tool implementations with policy enforcement
- **Documentation**: Tutorials, guides, translations
- **Security testing**: Red team scenarios, vulnerability reports
- **Standards alignment**: NIST AI RMF, ISO 42001, industry-specific compliance

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

All contributions are licensed under the MIT License.
