FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY app/ ./
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 LAB_CONTAINER=1 LAB_PORT=18761
COPY --from=build --chown=node:node /app/ ./
RUN mkdir -p /app/.data /app/.next/cache && chown node:node /app/.data /app/.next/cache
USER node
EXPOSE 18761
CMD ["node", "server.mjs"]

FROM node:22-bookworm-slim AS ingress
WORKDIR /ingress
COPY --chown=node:node ingress.mjs ./
USER node
EXPOSE 18761
CMD ["node", "ingress.mjs"]
