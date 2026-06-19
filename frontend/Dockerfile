# syntax=docker/dockerfile:1
# Sigma PMO frontend (Next.js 16, standalone output) — production image.

# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Force devDependencies (TypeScript, Tailwind, etc. needed by `next build`) even
# when the build host injects NODE_ENV=production — otherwise `npm ci` omits them.
RUN npm ci --include=dev
COPY . .
# NEXT_PUBLIC_* are inlined at BUILD time — the browser uses this to reach the
# API, so it must be the PUBLIC backend URL (override per environment).
ARG NEXT_PUBLIC_API_BASE=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
# One-click demo user-picker on the login page (set to "false" to hide it).
ARG NEXT_PUBLIC_DEMO_LOGIN=true
ENV NEXT_PUBLIC_DEMO_LOGIN=$NEXT_PUBLIC_DEMO_LOGIN
# Shared password for the sample picker accounts — rotate per deploy to match
# the backend DEMO_SEED_PASSWORD (demo only; not a real secret).
ARG NEXT_PUBLIC_DEMO_PASSWORD=Sigma$Demo2026
ENV NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime stage (standalone) ---
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# UTC on the SSR server too, so server-rendered timestamps match the UTC store;
# the browser localises to each user's own timezone on display.
ENV TZ=UTC
ENV PORT=3000
# Bind to all interfaces — without this, Next's standalone server binds to the
# Docker-assigned HOSTNAME (the container id) and the reverse proxy can't reach
# it (502 Bad Gateway).
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
