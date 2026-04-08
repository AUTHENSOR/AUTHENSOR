# Dockerfile for Authensor Control Plane
# Multi-stage build for smaller production image
#
# Includes optional Aegis (content safety) and Sentinel (real-time monitoring)
# as workspace dependencies. They are lazy-loaded at runtime via env vars:
#   AUTHENSOR_AEGIS_ENABLED=true
#   AUTHENSOR_SENTINEL_ENABLED=true

FROM node:25-alpine AS base
RUN corepack enable && apk add --no-cache curl

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/engine/package.json ./packages/engine/
COPY packages/aegis/package.json ./packages/aegis/
COPY packages/sentinel/package.json ./packages/sentinel/
COPY packages/control-plane/package.json ./packages/control-plane/
RUN pnpm install --frozen-lockfile

# Build all required packages
FROM base AS builder
WORKDIR /app
COPY --from=deps /app .
COPY . .
RUN pnpm build --filter=@authensor/control-plane...

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built packages
COPY --from=builder /app/packages/schemas/src ./packages/schemas/src
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/
COPY --from=builder /app/packages/engine/dist ./packages/engine/dist
COPY --from=builder /app/packages/engine/package.json ./packages/engine/
COPY --from=builder /app/packages/aegis/dist ./packages/aegis/dist
COPY --from=builder /app/packages/aegis/package.json ./packages/aegis/
COPY --from=builder /app/packages/sentinel/dist ./packages/sentinel/dist
COPY --from=builder /app/packages/sentinel/package.json ./packages/sentinel/
COPY --from=builder /app/packages/control-plane/dist ./packages/control-plane/dist
COPY --from=builder /app/packages/control-plane/package.json ./packages/control-plane/

# Copy workspace config for internal deps resolution
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production deps only
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -sf http://localhost:3000/health || exit 1
CMD ["node", "packages/control-plane/dist/server.js"]
