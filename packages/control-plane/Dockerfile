# Dockerfile for Control Plane
# Multi-stage build for smaller production image

FROM node:20-alpine AS base
RUN corepack enable

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/engine/package.json ./packages/engine/
COPY packages/control-plane/package.json ./packages/control-plane/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /app/packages/engine/node_modules ./packages/engine/node_modules
COPY --from=deps /app/packages/control-plane/node_modules ./packages/control-plane/node_modules
COPY . .
RUN pnpm build --filter=@authensor/control-plane

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/packages/schemas/src ./packages/schemas/src
COPY --from=builder /app/packages/engine/dist ./packages/engine/dist
COPY --from=builder /app/packages/engine/package.json ./packages/engine/
COPY --from=builder /app/packages/control-plane/dist ./packages/control-plane/dist
COPY --from=builder /app/packages/control-plane/package.json ./packages/control-plane/

# Copy workspace config for internal deps
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Install production deps only
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3000
CMD ["node", "packages/control-plane/dist/server.js"]
