# ADR-0002 — Unified TypeScript stack: NestJS · Next.js · MySQL on Hostinger

- **Status:** Accepted (Client written confirmation, 2026-05-20)
- **Date:** 2026-05-20
- **Layer / Cycle:** All layers / full build path
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance), Syed Moinuddin (architecture)

## Context

Deployment target is **Hostinger** (a Condition Precedent provides Hostinger
credentials). An earlier proposal used Python (FastAPI) + PostgreSQL, but
Hostinger gives first-class support to Node.js and MySQL (across both shared
hosting and VPS) and only limited support to Python/PostgreSQL on shared plans.
A single language across backend and frontend also reduces context-switching
for a solo build and a small review group.

## Decision

Adopt one **TypeScript** stack for Cycle 1 and the full build path:

| Concern   | Choice                          |
| --------- | ------------------------------- |
| Backend   | Node.js + **NestJS**            |
| Frontend  | **Next.js** (React)             |
| Database  | **MySQL** (via TypeORM)         |
| Hosting   | Hostinger-compatible            |
| Engine    | **Deterministic-first**         |
| LLM use   | Narrative **summaries only**, grounded in platform data — never decision logic |

The architecture stays modular (ingestion / rules / reporting as separate
services), with a versioned API. Stack stays consistent across phases unless a
clear technical reason (raised as a new ADR) justifies a change.

## Reason

- Native, well-documented Hostinger deployment for Node + MySQL.
- One language (TypeScript) end-to-end → shared types, less duplication, simpler review.
- NestJS gives a disciplined, modular, dependency-injected structure that suits a
  governance engine and makes the deterministic/AI boundary explicit.
- Mature, mainstream, widely-supported tools → no exotic lock-in.

## Risk & mitigation

- **MySQL is less rich than PostgreSQL for JSON / analytical queries.** Mitigation:
  MySQL 8 has adequate JSON support for `raw_source` traceability payloads; heavy
  analytics are computed in the deterministic engine layer, not pushed into SQL.
- **Node single-threaded CPU work during large file parsing.** Mitigation: stream
  parsing and, if needed, worker threads / a job queue (revisited at scale, Cycle 7–8).
- **ORM lock-in (TypeORM).** Mitigation: repository pattern isolates persistence;
  entities are plain classes; SQL is standard.

## Replacement path

- **Backend framework:** NestJS modules are framework-light; business logic lives in
  injectable services independent of HTTP. Could be re-hosted on another Node
  framework or runtime with controllers rewritten only.
- **Database:** TypeORM supports PostgreSQL; migrating means changing the driver +
  connection config and re-running migrations — no application rewrite, because we
  avoid MySQL-only SQL.
- **Frontend:** Next.js consumes the versioned API only; replaceable without backend change.

## Consequences

- Supersedes the chat-stage Python/FastAPI/PostgreSQL proposal.
- Establishes the baseline all subsequent ADRs build on.
