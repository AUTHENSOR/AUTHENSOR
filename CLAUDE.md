# Authensor — Claude Code Project Context

## What Is This Project

Authensor is the open-source safety stack for AI agents. It provides action authorization, approval workflows, content safety scanning, real-time monitoring, and cryptographic audit trails.

## Repository Structure

```
packages/
  schemas/          # JSON Schema definitions (source of truth for all types)
  engine/           # Pure policy evaluation logic (zero side effects)
  control-plane/    # HTTP API server (Hono + PostgreSQL)
  mcp-server/       # MCP tools with policy enforcement
  sdk/              # TypeScript SDK for agent builders
  sdk-py/           # Python SDK
  cli/              # CLI tool (npx authensor)
  aegis/            # Content safety scanner (zero dependencies)
  sentinel/         # Real-time monitoring engine (zero dependencies)
adapters/
  langchain/        # LangChain/LangGraph adapter
  openai/           # OpenAI Agents SDK adapter
  crewai/           # CrewAI adapter
docs/               # Documentation, compliance guides, standards
```

## Key Technical Conventions

- **TypeScript**: Strict mode, ES2022 target, NodeNext module resolution
- **Build**: pnpm workspaces + Turborepo
- **Testing**: Vitest for all packages
- **API Framework**: Hono (lightweight, edge-compatible)
- **Database**: PostgreSQL via `pg` (not an ORM — raw SQL with Drizzle for migrations)
- **Module format**: ESM only (type: "module" in all package.json files)
- **Imports**: Always use `.js` extension in TypeScript imports (NodeNext resolution)

## Development Commands

```bash
corepack enable       # Enable pnpm
pnpm install          # Install all dependencies
pnpm build            # Build all packages (Turborepo)
pnpm test             # Run all tests (400+ tests)
pnpm dev              # Dev servers with hot reload
pnpm gen:check        # Verify generated types match schemas
```

## Architecture Principles

1. **Schemas are the source of truth** — Types are generated from JSON Schema, not written by hand
2. **Engine is pure** — No I/O, no side effects, synchronous evaluation only
3. **Control plane is the HTTP wrapper** — All I/O happens here (DB, webhooks, auth)
4. **Fail-closed by default** — No policy = deny. Unreachable = deny.
5. **Receipts are immutable** — Hash-chained, tamper-evident audit trail
6. **Zero-dependency core** — Engine, Aegis, and Sentinel have zero runtime dependencies

## Important Patterns

- **Optional dependencies**: Aegis and Sentinel are `optionalDependencies` in the control plane. They are lazy-loaded with dynamic `import()` in try/catch blocks.
- **Environment-based config**: Features like Aegis scanning are controlled by environment variables (`AUTHENSOR_AEGIS_ENABLED`, `AUTHENSOR_SENTINEL_ENABLED`).
- **Role-based auth**: API keys have roles (admin, ingest, executor). Routes use `requireRole()` middleware.
- **Policy evaluation flow**: Envelope → getActivePolicy() → Aegis scan → PolicyEngine.evaluate() → createReceipt() → Sentinel monitoring

## What NOT to Do

- Don't add runtime dependencies to engine, aegis, or sentinel packages
- Don't make the policy engine async — it must remain synchronous
- Don't store secrets in code — use environment variables
- Don't skip the `.js` extension in imports
- Don't use CommonJS — this is ESM only
