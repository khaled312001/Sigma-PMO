# syntax=docker/dockerfile:1
# Sigma PMO frontend (Next.js 16, standalone output) — production image.

# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* are inlined at BUILD time — the browser uses this to reach the
# API, so it must be the PUBLIC backend URL (override per environment).
ARG NEXT_PUBLIC_API_BASE=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
# One-click demo user-picker on the login page (set to "false" to hide it).
ARG NEXT_PUBLIC_DEMO_LOGIN=true
ENV NEXT_PUBLIC_DEMO_LOGIN=$NEXT_PUBLIC_DEMO_LOGIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime stage (standalone) ---
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
