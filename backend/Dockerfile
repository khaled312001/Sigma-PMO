# syntax=docker/dockerfile:1
# Sigma PMO backend (NestJS) — multi-stage, production image.

# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Drop dev dependencies for a lean runtime node_modules.
RUN npm prune --omit=dev

# --- runtime stage ---
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
# mysql-client is only needed by the DB backup/restore scripts (not the app);
# add it here if you run those inside this image.
# RUN apk add --no-cache mysql-client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3001
# Config comes from environment variables (DB_*, ANTHROPIC_API_KEY, STRIPE_*,
# S3_*, CORS_ORIGINS, …) — see .env.example. DB_SYNCHRONIZE must stay false;
# run migrations (npm run migration:run) on first deploy.
CMD ["node", "dist/src/main.js"]
