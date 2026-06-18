# Option A monolith: API + static UI in one container. For option B use Dockerfile.api + fly.toml.
FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p data logs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV SERVE_STATIC=1
ENV STATIC_ROOT=/app/dist
ENV DATABASE_PATH=/app/data/etflimit.sqlite

EXPOSE 8787

CMD ["npx", "tsx", "src/api/server.ts"]
