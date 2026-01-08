# Implementation Plan: Migrate Twenty CRM to Cloudflare Workers Stack

**Branch**: `001-cloudflare-workers-migration` | **Date**: 2026-01-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-cloudflare-workers-migration/spec.md`

## Summary

Migrate the Twenty CRM backend from NestJS/TypeORM/PostgreSQL running on Docker/VPS to Cloudflare's serverless edge platform. Replace PostgreSQL with D1 (SQLite-compatible), Redis with KV, S3 with R2, and BullMQ with Cloudflare Queues. The result is a globally distributed, zero-infrastructure deployment with sub-200ms latency.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20.x (via `nodejs_compat` flag)
**Primary Dependencies**: NestJS 11.x, TypeORM 0.3.x (SQLite driver), GraphQL Yoga, Wrangler CLI 3.91+
**Storage**: Cloudflare D1 (SQLite-compatible), Cloudflare KV (sessions/cache), Cloudflare R2 (files)
**Real-Time**: Cloudflare Durable Objects (WebSocket connections, GraphQL subscriptions)
**Testing**: Jest (unit), Playwright (E2E), Wrangler local dev mode
**Target Platform**: Cloudflare Workers (workerd runtime) with global edge distribution
**Project Type**: Monorepo (Nx workspace) with multiple packages
**Performance Goals**: <200ms p99 latency globally, <1s cold start, 10,000 concurrent users
**Constraints**: 300ms CPU per invocation (Workers Standard), D1 SQLite compatibility, eventually consistent KV
**Scale/Scope**: 63 TypeORM entities, 6-phase migration over 12 weeks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file contains template placeholders and no project-specific rules. Given Twenty's existing development principles from AGENTS.md:

| Principle | Compliance | Notes |
|-----------|------------|-------|
| Functional components only | ✅ Pass | Backend migration, frontend unchanged |
| Named exports only | ✅ Pass | Will maintain existing convention |
| Types over interfaces | ✅ Pass | Will use existing type definitions |
| No 'any' type | ✅ Pass | TypeScript strict mode maintained |
| Test-first approach | ✅ Pass | Integration tests for D1/KV/R2/Queues |

**Gate Status**: PASS - No constitution violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-cloudflare-workers-migration/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
│   ├── api-contracts.md # Wrangler config, types, interfaces
│   └── env-mapping.md   # Environment variable mapping
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/
├── twenty-server/                    # Backend - PRIMARY MIGRATION TARGET
│   ├── src/
│   │   ├── worker.ts                 # NEW: Cloudflare Worker entry point
│   │   ├── durable-objects/          # NEW: Durable Objects for real-time
│   │   │   └── workspace-realtime.ts # NEW: WebSocket hub per workspace
│   │   ├── database/
│   │   │   └── typeorm/
│   │   │       ├── core/
│   │   │       │   ├── core.datasource.ts      # MODIFY: D1 adapter
│   │   │       │   └── migrations/             # MIGRATE: PostgreSQL → SQLite
│   │   │       └── d1/                         # NEW: D1-specific utilities
│   │   ├── engine/
│   │   │   └── core-modules/
│   │   │       ├── auth/                       # MODIFY: KV session storage
│   │   │       ├── cache/                      # MODIFY: KV caching layer
│   │   │       └── file/                       # MODIFY: R2 storage
│   │   ├── queue-worker/                       # MODIFY: Cloudflare Queues consumer
│   │   └── modules/                            # VERIFY: Query compatibility
│   └── wrangler.jsonc                          # NEW: Cloudflare configuration
├── twenty-front/                     # Frontend - MINIMAL CHANGES
│   └── src/
│       └── generated/                # REGENERATE: GraphQL types (if schema changes)
├── twenty-worker/                    # NEW PACKAGE: Queue consumer Worker
│   ├── src/
│   │   └── consumer.ts
│   └── wrangler.jsonc
└── twenty-shared/                    # VERIFY: Compatibility
```

**Structure Decision**: The existing monorepo structure is preserved. A new `twenty-worker` package may be created for the queue consumer if separation is needed, though it can also be integrated into `twenty-server` with multiple entry points. Durable Objects are co-located with the main worker in `twenty-server`.

## Complexity Tracking

No constitution violations requiring justification.

## Phase 0: Research Tasks

The following unknowns need resolution before proceeding to design:

### Research Task 1: TypeORM D1/SQLite Compatibility
- **Unknown**: Which PostgreSQL-specific features in existing TypeORM entities need adaptation?
- **Scope**: Analyze all `.entity.ts` files for JSONB, arrays, enums, UUID columns
- **Output**: List of incompatible patterns with migration strategies

### Research Task 2: NestJS Worker Adapter Pattern
- **Unknown**: How to wrap NestJS HTTP handling in Cloudflare Worker fetch handler?
- **Scope**: Investigate existing NestJS-Worker adapters or Hono bridge patterns
- **Output**: Recommended adapter implementation approach

### Research Task 3: TypeORM Query Compatibility
- **Unknown**: Do existing TypeORM queries use PostgreSQL-specific syntax?
- **Scope**: Analyze QueryBuilder usage, raw queries, and complex joins
- **Output**: Query migration matrix with SQLite equivalents

### Research Task 4: Session Management Migration
- **Unknown**: Current Redis session implementation details for KV migration
- **Scope**: Analyze auth module, session serialization, TTL handling
- **Output**: KV session storage implementation design

### Research Task 5: BullMQ to Queues Migration
- **Unknown**: Current job types, scheduling patterns, and retry logic
- **Scope**: Analyze queue-worker module, job processors, event handlers
- **Output**: Queues consumer architecture with message format mapping

### Research Task 6: File Storage Migration
- **Unknown**: Current S3 SDK usage patterns for R2 migration
- **Scope**: Analyze file upload/download flows, presigned URL generation
- **Output**: R2 integration design with S3 SDK compatibility layer

## Phase 1: Design Artifacts

*To be generated after Phase 0 research completes*

### Data Model Changes (→ data-model.md)
- PostgreSQL → SQLite type mappings for all entities
- UUID handling strategy (application-generated)
- JSONB → TEXT with json_extract() function usage
- Enum → TEXT CHECK constraint mappings
- Foreign key preservation strategy

### API Contracts (→ contracts/)
- GraphQL schema compatibility verification
- REST endpoint changes (if any)
- Wrangler configuration schema
- Environment variable / secrets mapping

### Quickstart Guide (→ quickstart.md)
- Local development setup with Wrangler
- D1 database initialization
- KV namespace creation
- R2 bucket setup
- Queues configuration
- Deployment commands

## Constitution Re-Check (Post Phase 1 Design)

*GATE: Re-evaluated after Phase 1 design artifacts completed.*

Based on research.md findings and design decisions:

| Principle | Pre-Design | Post-Design | Notes |
|-----------|------------|-------------|-------|
| **I. Strict TypeScript** | ✅ Pass | ✅ Pass | All Cloudflare bindings have strong types (D1Database, KVNamespace, R2Bucket) |
| **II. Functional Components** | ✅ Pass | ✅ Pass | Backend-only migration, React components unchanged |
| **III. Monorepo Architecture** | ✅ Pass | ✅ Pass | New `twenty-worker` package follows Nx conventions |
| **IV. Code Quality Gates** | ✅ Pass | ✅ Pass | ESLint/TypeCheck/Prettier unchanged |
| **V. Testing Standards** | ✅ Pass | ✅ Pass | Wrangler local dev + Vitest for Worker tests |

### Technology Constraints Assessment

| Layer | Constitution Requires | Migration Decision | Status |
|-------|----------------------|-------------------|--------|
| Backend Framework | NestJS | Hono + GraphQL Yoga (justified) | ⚠️ Deviation |
| Database | PostgreSQL | D1/SQLite (justified) | ⚠️ Deviation |
| Cache | Redis | KV (justified) | ⚠️ Deviation |
| Jobs | BullMQ | Cloudflare Queues (justified) | ⚠️ Deviation |
| API | GraphQL | GraphQL Yoga (already in use) | ✅ Compliant |
| Monorepo | Nx with Yarn 4 | Unchanged | ✅ Compliant |

### Deviation Justifications

1. **NestJS → Hono**: NestJS is not Workers-compatible. Hono provides similar routing patterns with native Workers support. GraphQL Yoga (already in codebase) handles GraphQL layer.

2. **PostgreSQL → D1**: Core migration requirement. All entities analyzed, migration patterns documented in data-model.md. Type transformers maintain data integrity.

3. **Redis → KV**: Core migration requirement. JWT auth is stateless (no session migration needed). KV provides metadata caching with acceptable eventual consistency.

4. **BullMQ → Cloudflare Queues**: Core migration requirement. Queue consolidation (16→6) improves maintainability. Message format mapping documented.

**Gate Status**: ⚠️ CONDITIONAL PASS - All deviations are justified and required for migration. Amendment to constitution recommended post-migration to reflect new technology constraints.

## Implementation Phases (High-Level)

| Phase | Duration | Focus | Key Deliverables |
|-------|----------|-------|------------------|
| 1: Foundation | Weeks 1-2 | D1 database, Worker entry point | Worker adapter, D1 schema validated |
| 2: Data Layer | Weeks 3-4 | TypeORM migration, query compatibility | All queries passing D1 |
| 3: Session & Cache | Weeks 5-6 | KV session store, metadata caching | Auth working, cache hit monitoring |
| 4: Storage & Queues | Weeks 7-8 | R2 file uploads, Queues background tasks | Files working, email sync operational |
| 5: Real-Time | Weeks 9-10 | Durable Objects, WebSocket subscriptions | GraphQL subscriptions working |
| 6: Deployment | Weeks 11-12 | Pages frontend, global deployment | Production-ready, latency validated |

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| TypeORM query incompatibilities | High | Early testing, query profiling, fallback patterns |
| Cold start exceeding 1s | Medium | Lazy module loading, tree-shaking, pre-warming |
| D1 write throughput limits | Medium | Batch operations, connection pooling patterns |
| NestJS adaptation complexity | High | Prototype adapter early, consider Hono alternative |
| Migration data loss | Critical | Parallel PostgreSQL (read-only) for 30 days |
| Durable Objects complexity | Medium | Start with single hub per workspace, scale later |
| WebSocket connection limits | Low | 32K connections per DO, shard by workspace |

---

*Phase 0 research.md and Phase 1 artifacts to follow*
