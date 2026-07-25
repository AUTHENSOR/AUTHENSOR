<!-- Moved out of the top-level README so it stays readable.     The README renders as the AUTHENSOR account profile. -->## Development

```bash
# Prerequisites: Node.js 20+, Docker, pnpm
corepack enable
pnpm install

# Start the stack
docker compose up -d    # Postgres + control plane
pnpm dev                # Dev servers with hot reload

# Test (1,148+ tests across all packages)
pnpm test

# Build all packages
pnpm build

# Verify generated types match schemas
pnpm gen:check
```
