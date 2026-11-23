FROM oven/bun:1 AS bun
FROM node:22-bookworm-slim

WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY server ./server
COPY tsconfig.json ./

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]
