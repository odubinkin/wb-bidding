# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bidder/package.json apps/bidder/package.json
COPY apps/wb-mock/package.json apps/wb-mock/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/data-sync/package.json packages/data-sync/package.json
COPY packages/decision-engine/package.json packages/decision-engine/package.json
COPY packages/write-pipeline/package.json packages/write-pipeline/package.json
COPY packages/wb-api/package.json packages/wb-api/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm run prisma:generate
RUN pnpm --filter @wb-bidder/config build \
    && pnpm --filter @wb-bidder/contracts build \
    && pnpm --filter @wb-bidder/database build \
    && pnpm --filter @wb-bidder/wb-api build \
    && pnpm --filter @wb-bidder/data-sync build \
    && pnpm --filter @wb-bidder/decision-engine build \
    && pnpm --filter @wb-bidder/write-pipeline build \
    && pnpm --filter @wb-bidder/bidder build
RUN pnpm deploy --legacy --filter @wb-bidder/bidder --prod /runtime

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/bidder/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
