# Tasks: Migrate Twenty CRM to Cloudflare Workers Stack

**Input**: Design documents from `/specs/001-cloudflare-workers-migration/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅
**Total Tasks**: 137 | **Parallel Tasks**: 62 (45%) | **Duration**: 10-12 weeks

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Exact file paths included in descriptions

## User Stories Reference

| ID | Story | Priority |
|----|-------|----------|
| US1 | CRM Users Access Application via Edge Network | P1 🎯 MVP |
| US2 | Users Authenticate and Maintain Sessions | P1 |
| US3 | Users Upload and Access Files | P2 |
| US4 | Background Workflows Execute Automatically | P2 |
| US5 | Administrators Deploy and Manage the CRM | P3 |
| US6 | Data Recovery After Incidents | P3 |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and Cloudflare resources

- [x] T001 Create wrangler.jsonc configuration in packages/twenty-server/wrangler.jsonc per contracts/api-contracts.md
- [x] T002 [P] Add Cloudflare Workers TypeScript types to packages/twenty-server/package.json
- [x] T003 [P] Create worker entry point stub in packages/twenty-server/src/worker.ts
- [x] T004 [P] Create .dev.vars template for local secrets in packages/twenty-server/.dev.vars.example
- [x] T005 Create D1 database via `wrangler d1 create twenty-crm-core`
- [x] T006 [P] Create KV namespaces for CACHE_STORE and SESSION_STORE via wrangler CLI
- [x] T007 [P] Create R2 bucket `twenty-crm-files` via wrangler CLI
- [x] T008 [P] Create Cloudflare Queues (twenty-critical, twenty-workflow, twenty-messaging, twenty-background, twenty-dlq) via wrangler CLI
- [x] T009 Configure Nx build target for Worker bundle in packages/twenty-server/project.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Foundation

- [x] T010 Create D1 value transformers directory in packages/twenty-server/src/database/typeorm/d1/transformers/
- [x] T011 [P] Implement JSON transformer in packages/twenty-server/src/database/typeorm/d1/transformers/json.transformer.ts per data-model.md
- [x] T012 [P] Implement Array transformer in packages/twenty-server/src/database/typeorm/d1/transformers/array.transformer.ts per data-model.md
- [x] T013 [P] Implement Timestamp transformer in packages/twenty-server/src/database/typeorm/d1/transformers/timestamp.transformer.ts per data-model.md
- [x] T014 [P] Implement Boolean transformer in packages/twenty-server/src/database/typeorm/d1/transformers/boolean.transformer.ts per data-model.md
- [x] T015 Create transformer barrel export in packages/twenty-server/src/database/typeorm/d1/transformers/index.ts
- [x] T016 Create D1 datasource configuration in packages/twenty-server/src/database/typeorm/d1/d1.datasource.ts
- [x] T017 Implement D1 connection adapter in packages/twenty-server/src/database/typeorm/d1/d1-driver.adapter.ts

### Query Compatibility Layer

- [x] T018 Create query helpers directory in packages/twenty-server/src/database/typeorm/d1/query-helpers/
- [x] T019 [P] Implement JSONB query helper (json_extract) in packages/twenty-server/src/database/typeorm/d1/query-helpers/jsonb.helper.ts
- [x] T020 [P] Implement Array query helper in packages/twenty-server/src/database/typeorm/d1/query-helpers/array.helper.ts
- [x] T021 [P] Implement case-insensitive LIKE helper in packages/twenty-server/src/database/typeorm/d1/query-helpers/like.helper.ts
- [x] T022 Create query helper barrel export in packages/twenty-server/src/database/typeorm/d1/query-helpers/index.ts

### Worker Framework

- [x] T023 Install Hono framework in packages/twenty-server/package.json
- [x] T024 Create Hono router setup in packages/twenty-server/src/router/index.ts
- [x] T025 [P] Create middleware for CORS handling in packages/twenty-server/src/router/middleware/cors.middleware.ts
- [x] T026 [P] Create middleware for request logging in packages/twenty-server/src/router/middleware/logging.middleware.ts
- [x] T027 [P] Create middleware for error handling in packages/twenty-server/src/router/middleware/error.middleware.ts
- [x] T028 Create WorkerEnv types in packages/twenty-server/src/types/worker-env.ts per contracts/api-contracts.md
- [x] T029 Create context factory for Worker bindings in packages/twenty-server/src/core/context-factory.ts

### GraphQL Setup

- [x] T030 Extract GraphQL Yoga configuration from NestJS driver to packages/twenty-server/src/graphql/yoga-config.ts
- [x] T031 Create GraphQL handler for Worker in packages/twenty-server/src/graphql/yoga-worker.ts per contracts/api-contracts.md
- [x] T032 Integrate GraphQL route with Hono router in packages/twenty-server/src/router/index.ts

### Health & Utilities

- [x] T033 [P] Create health check endpoint in packages/twenty-server/src/router/routes/health.route.ts
- [x] T034 [P] Create structured JSON logger utility in packages/twenty-server/src/core/logger.ts per contracts/api-contracts.md
- [x] T035 Complete worker.ts entry point with all bindings in packages/twenty-server/src/worker.ts

**Checkpoint**: Foundation ready - Worker builds and serves /health endpoint

---

## Phase 3: User Story 1 - CRM Users Access Application via Edge Network (P1) 🎯 MVP

**Goal**: Users can perform CRUD operations on CRM records via D1 database with <200ms latency

**Independent Test**: Create a contact, search for it, update it, delete it - all operations complete successfully

### Core Entity Migration

- [x] T036 [P] [US1] Migrate User entity to D1-compatible format in packages/twenty-server/src/engine/core-modules/user/user.entity.ts
- [x] T037 [P] [US1] Migrate Workspace entity to D1-compatible format in packages/twenty-server/src/engine/core-modules/workspace/workspace.entity.ts
- [x] T038 [P] [US1] Migrate WorkspaceMember entity in packages/twenty-server/src/modules/workspace-member/standard-objects/workspace-member.workspace-entity.ts
- [x] T039 [US1] Create initial D1 migration for core tables in packages/twenty-server/migrations/0001_core_schema.sql

### Object Metadata System

- [x] T040 [P] [US1] Migrate ObjectMetadata entity in packages/twenty-server/src/engine/metadata-modules/object-metadata/object-metadata.entity.ts
- [x] T041 [P] [US1] Migrate FieldMetadata entity in packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts
- [x] T042 [P] [US1] ~~Migrate RelationMetadata entity~~ N/A - RelationMetadata was deprecated; relations are now inline in FieldMetadata via relationTargetFieldMetadataId/relationTargetObjectMetadataId
- [x] T043 [US1] Create D1 migration for metadata tables in packages/twenty-server/migrations/0002_metadata_schema.sql

### CRM Core Entities

- [x] T044 [P] [US1] Migrate Contact/Person standard object in packages/twenty-server/src/engine/workspace-manager/standard-objects/person.workspace-entity.ts
- [x] T045 [P] [US1] Migrate Company standard object in packages/twenty-server/src/engine/workspace-manager/standard-objects/company.workspace-entity.ts
- [x] T046 [P] [US1] Migrate Opportunity standard object in packages/twenty-server/src/engine/workspace-manager/standard-objects/opportunity.workspace-entity.ts
- [x] T047 [P] [US1] Migrate Activity standard object in packages/twenty-server/src/engine/workspace-manager/standard-objects/activity.workspace-entity.ts
- [x] T048 [P] [US1] Migrate Note standard object in packages/twenty-server/src/engine/workspace-manager/standard-objects/note.workspace-entity.ts
- [x] T049 [US1] Create D1 migration for CRM tables in packages/twenty-server/migrations/0003_crm_entities.sql

### GraphQL Resolvers

- [ ] T050 [US1] Port object record resolver to use D1 in packages/twenty-server/src/engine/api/graphql/workspace-resolver-builder/
- [ ] T051 [US1] Port search resolver to use LIKE with COLLATE NOCASE in packages/twenty-server/src/engine/api/graphql/workspace-query-runner/
- [ ] T052 [US1] Port create/update/delete mutations to D1 in packages/twenty-server/src/engine/api/graphql/workspace-resolver-builder/

### Integration

- [ ] T053 [US1] Wire up GraphQL schema with D1-connected resolvers in packages/twenty-server/src/graphql/yoga-worker.ts
- [ ] T054 [US1] Add workspace context middleware (extract workspace from token) in packages/twenty-server/src/router/middleware/workspace.middleware.ts
- [ ] T055 [US1] Verify CRUD operations work end-to-end via local Wrangler dev

**Checkpoint**: US1 complete - CRM CRUD operations work on D1

---

## Phase 4: User Story 2 - Users Authenticate and Maintain Sessions (P1)

**Goal**: Users can log in, maintain sessions, and access protected resources

**Independent Test**: Log in with valid credentials, navigate between pages, verify session persists for 24 hours

### Auth Entity Migration

- [ ] T056 [P] [US2] Migrate AppToken entity in packages/twenty-server/src/engine/core-modules/app-token/app-token.entity.ts
- [ ] T057 [P] [US2] Migrate RefreshToken entity in packages/twenty-server/src/engine/core-modules/auth/refresh-token.entity.ts
- [ ] T058 [US2] Create D1 migration for auth tables in packages/twenty-server/migrations/0004_auth_tables.sql

### Auth Service Adaptation

- [ ] T059 [US2] Port TokenService to use Web Crypto API in packages/twenty-server/src/engine/core-modules/auth/token/services/token.service.ts
- [ ] T060 [US2] Replace bcrypt with bcryptjs in packages/twenty-server/src/engine/core-modules/auth/services/auth.service.ts
- [ ] T061 [US2] Create JWT verification middleware for Hono in packages/twenty-server/src/router/middleware/auth.middleware.ts

### KV Cache Layer

- [ ] T062 [P] [US2] Create KV cache service interface in packages/twenty-server/src/engine/core-modules/cache/interfaces/cache.service.interface.ts
- [ ] T063 [US2] Implement KV cache service in packages/twenty-server/src/engine/core-modules/cache/services/kv-cache.service.ts
- [ ] T064 [US2] Add workspace metadata caching in packages/twenty-server/src/engine/core-modules/workspace/services/workspace-cache.service.ts

### Auth Routes

- [ ] T065 [US2] Create login endpoint in packages/twenty-server/src/router/routes/auth.route.ts
- [ ] T066 [US2] Create token refresh endpoint in packages/twenty-server/src/router/routes/auth.route.ts
- [ ] T067 [US2] Create logout endpoint in packages/twenty-server/src/router/routes/auth.route.ts
- [ ] T068 [US2] Integrate auth routes with Hono router in packages/twenty-server/src/router/index.ts
- [ ] T069 [US2] Verify auth flow works end-to-end via local Wrangler dev

**Checkpoint**: US2 complete - Authentication works with JWT and KV caching

---

## Phase 5: User Story 3 - Users Upload and Access Files (P2)

**Goal**: Users can upload files up to 100MB and access them from records

**Independent Test**: Upload a file to a contact record, then download/preview it

### R2 Storage Driver

- [ ] T070 [P] [US3] Create R2 storage driver interface in packages/twenty-server/src/engine/core-modules/file-storage/drivers/interfaces/r2.driver.interface.ts
- [ ] T071 [US3] Implement R2 storage driver in packages/twenty-server/src/engine/core-modules/file-storage/drivers/r2.driver.ts
- [ ] T072 [US3] Create presigned URL generator for R2 in packages/twenty-server/src/engine/core-modules/file-storage/services/r2-presigned-url.service.ts

### File Entities

- [ ] T073 [P] [US3] Migrate Attachment entity in packages/twenty-server/src/engine/core-modules/file/attachment.entity.ts
- [ ] T074 [US3] Create D1 migration for file tables in packages/twenty-server/migrations/0005_file_tables.sql

### File Routes

- [ ] T075 [US3] Create file upload URL endpoint in packages/twenty-server/src/router/routes/files.route.ts
- [ ] T076 [US3] Create file download/proxy endpoint in packages/twenty-server/src/router/routes/files.route.ts
- [ ] T077 [US3] Handle file metadata storage on upload completion in packages/twenty-server/src/engine/core-modules/file/services/file.service.ts
- [ ] T078 [US3] Integrate file routes with Hono router in packages/twenty-server/src/router/index.ts
- [ ] T079 [US3] Verify file upload/download works end-to-end via local Wrangler dev

**Checkpoint**: US3 complete - File uploads and downloads work with R2

---

## Phase 6: User Story 4 - Background Workflows Execute Automatically (P2)

**Goal**: Email sync, workflows, and notifications run reliably in background queues

**Independent Test**: Trigger an email sync, verify emails appear in CRM within 5 minutes

### Queue Infrastructure

- [ ] T080 [P] [US4] Create queue message types in packages/twenty-shared/src/types/queue-messages.ts per contracts/api-contracts.md
- [ ] T081 [P] [US4] Create queue producer service in packages/twenty-server/src/engine/core-modules/queue/services/queue-producer.service.ts
- [ ] T082 Create twenty-worker package structure in packages/twenty-worker/

### Queue Consumer Worker

- [ ] T083 [US4] Create consumer worker entry in packages/twenty-worker/src/consumer.ts
- [ ] T084 [US4] Create wrangler.jsonc for consumer in packages/twenty-worker/wrangler.jsonc per contracts/api-contracts.md
- [ ] T085 [P] [US4] Implement critical queue handler in packages/twenty-worker/src/handlers/critical.handler.ts
- [ ] T086 [P] [US4] Implement workflow queue handler in packages/twenty-worker/src/handlers/workflow.handler.ts
- [ ] T087 [P] [US4] Implement messaging queue handler in packages/twenty-worker/src/handlers/messaging.handler.ts
- [ ] T088 [P] [US4] Implement background queue handler in packages/twenty-worker/src/handlers/background.handler.ts

### Workflow Entities

- [ ] T089 [P] [US4] Migrate Workflow entity in packages/twenty-server/src/engine/core-modules/workflow/workflow.entity.ts
- [ ] T090 [P] [US4] Migrate WorkflowVersion entity in packages/twenty-server/src/engine/core-modules/workflow/workflow-version.entity.ts
- [ ] T091 [P] [US4] Migrate WorkflowRun entity in packages/twenty-server/src/engine/core-modules/workflow/workflow-run.entity.ts
- [ ] T092 [US4] Create D1 migration for workflow tables in packages/twenty-server/migrations/0006_workflow_tables.sql

### Messaging Entities

- [ ] T093 [P] [US4] Migrate ConnectedAccount entity in packages/twenty-server/src/engine/core-modules/connected-account/connected-account.entity.ts
- [ ] T094 [P] [US4] Migrate MessageChannel entity in packages/twenty-server/src/engine/core-modules/messaging/message-channel.entity.ts
- [ ] T095 [P] [US4] Migrate Message entity in packages/twenty-server/src/engine/core-modules/messaging/message.entity.ts
- [ ] T096 [US4] Create D1 migration for messaging tables in packages/twenty-server/migrations/0007_messaging_tables.sql

### Cron Triggers

- [ ] T097 [US4] Implement scheduled event handler in packages/twenty-server/src/worker.ts for cron triggers
- [ ] T098 [US4] Port message sync polling job in packages/twenty-server/src/engine/core-modules/messaging/jobs/message-sync.job.ts
- [ ] T099 [US4] Verify queue processing works end-to-end via local Wrangler dev

**Checkpoint**: US4 complete - Background jobs process via Cloudflare Queues

---

## Phase 7: User Story 5 - Administrators Deploy and Manage the CRM (P3)

**Goal**: Single-command deployment with logs and rollback capability

**Independent Test**: Run deployment command, verify CRM is live within 2 minutes

### Deployment Configuration

- [ ] T100 [P] [US5] Create production environment config in packages/twenty-server/wrangler.jsonc
- [ ] T101 [P] [US5] Create staging environment config in packages/twenty-server/wrangler.jsonc
- [ ] T102 [P] [US5] Create deployment script in packages/twenty-server/scripts/deploy.sh
- [ ] T103 [P] [US5] Create rollback script in packages/twenty-server/scripts/rollback.sh

### Observability

- [ ] T104 [US5] Enhance logging middleware with structured JSON format and request correlation IDs in packages/twenty-server/src/router/middleware/logging.middleware.ts (extends T026)
- [ ] T105 [US5] Add request timing metrics in packages/twenty-server/src/router/middleware/metrics.middleware.ts
- [ ] T106 [US5] Create error rate monitoring in packages/twenty-server/src/utils/metrics.ts

### Documentation

- [ ] T107 [P] [US5] Update quickstart.md with final deployment commands in specs/001-cloudflare-workers-migration/quickstart.md
- [ ] T108 [P] [US5] Create DEPLOYMENT.md runbook in packages/twenty-server/DEPLOYMENT.md
- [ ] T109 [US5] Verify deployment works end-to-end to Cloudflare

**Checkpoint**: US5 complete - Single-command deployment works

---

## Phase 8: User Story 6 - Data Recovery After Incidents (P3)

**Goal**: Point-in-time database restoration capability

**Independent Test**: Create data, trigger backup point, delete data, restore, verify recovery

### Backup Infrastructure

- [ ] T110 [P] [US6] Document D1 Time Travel feature usage in packages/twenty-server/DEPLOYMENT.md
- [ ] T111 [US6] Create backup listing CLI command in packages/twenty-server/scripts/list-backups.sh
- [ ] T112 [US6] Create point-in-time restore script in packages/twenty-server/scripts/restore.sh
- [ ] T113 [US6] Create data integrity verification script in packages/twenty-server/scripts/verify-integrity.sh
- [ ] T114 [US6] Verify backup and restore works end-to-end via wrangler CLI

**Checkpoint**: US6 complete - Data recovery works

---

## Phase 9: Real-Time (Durable Objects)

**Goal**: GraphQL subscriptions work via WebSocket connections

**Independent Test**: Subscribe to record updates, modify a record in another tab, verify real-time update

### Durable Objects

- [ ] T115 [P] Create Durable Object types in packages/twenty-server/src/types/realtime.ts per contracts/api-contracts.md
- [ ] T116 Implement WorkspaceRealtimeHub Durable Object in packages/twenty-server/src/durable-objects/workspace-realtime.ts per research.md
- [ ] T117 Add Durable Object binding to wrangler.jsonc in packages/twenty-server/wrangler.jsonc
- [ ] T118 Create WebSocket upgrade route in packages/twenty-server/src/router/routes/ws.route.ts
- [ ] T119 Implement broadcast trigger after mutations in packages/twenty-server/src/graphql/yoga-worker.ts
- [ ] T120 Verify WebSocket subscriptions work end-to-end via local Wrangler dev

**Checkpoint**: Real-time subscriptions work via Durable Objects

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, cleanup, and validation

### Remaining Entity Migrations

- [ ] T121 [P] Migrate remaining billing entities (BillingSubscription, BillingSubscriptionItem, etc.) in packages/twenty-server/src/engine/core-modules/billing/
- [ ] T122 [P] Migrate remaining webhook entities in packages/twenty-server/src/engine/core-modules/webhook/
- [ ] T123 [P] Migrate KeyValuePair entity in packages/twenty-server/src/engine/core-modules/key-value-pair/
- [ ] T124 Create D1 migration for remaining tables in packages/twenty-server/migrations/0008_remaining_tables.sql

### Data Migration

- [ ] T125 Create PostgreSQL to D1 data export script in packages/twenty-server/scripts/export-pg-data.ts
- [ ] T126 Create D1 data import script in packages/twenty-server/scripts/import-d1-data.ts
- [ ] T127 Create data validation script (row counts, checksums) in packages/twenty-server/scripts/validate-migration.ts

### Final Validation

- [ ] T128 Run all unit tests against D1 in packages/twenty-server/
- [ ] T129 Run E2E tests with Wrangler local dev in packages/twenty-e2e-testing/
- [ ] T130 Performance test: verify <200ms p99 latency globally
- [ ] T131 Run quickstart.md validation end-to-end
- [ ] T132 Update AGENTS.md with Cloudflare Workers stack documentation

### Coverage Gap Fixes (FR-016, FR-017, SC-005, SC-006)

- [ ] T133 Verify PRAGMA foreign_keys = ON in all D1 migrations in packages/twenty-server/migrations/*.sql (FR-016)
- [ ] T134 [P] Create load testing script for 10,000 concurrent users in packages/twenty-server/scripts/load-test.ts (FR-017, SC-010)
- [ ] T135 [P] Create cost comparison analysis document in specs/001-cloudflare-workers-migration/cost-analysis.md (SC-005)
- [ ] T136 [P] Configure Cloudflare Analytics for uptime monitoring and alerting (SC-006)
- [ ] T137 Add explicit backpressure logic to queue producer in packages/twenty-server/src/engine/core-modules/queue/services/queue-producer.service.ts (FR-019)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ──────────────────┐
                                 │
Phase 2: Foundational ◄──────────┘
         │
         ├──► Phase 3: US1 (CRM CRUD) ──────┐
         │                                   │
         ├──► Phase 4: US2 (Auth) ──────────┤
         │                                   │
         └──► (US1 + US2 = MVP) ◄───────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
Phase 5: US3 (Files)    Phase 6: US4 (Queues)
         │                     │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
Phase 7: US5 (Deploy)   Phase 8: US6 (Backup)
                    │
                    ▼
         Phase 9: Real-Time (DO)
                    │
                    ▼
         Phase 10: Polish
```

### Parallel Opportunities

**Phase 1** (all can run in parallel):
- T002, T003, T004, T006, T007, T008

**Phase 2** (transformers can run in parallel):
- T011, T012, T013, T014 (transformers)
- T019, T020, T021 (query helpers)
- T025, T026, T027 (middleware)

**Phase 3** (entity migrations can run in parallel):
- T036, T037, T038 (core entities)
- T040, T041, T042 (metadata entities)
- T044, T045, T046, T047, T048 (CRM entities)

**User Stories 3 & 4** can be worked in parallel after US1/US2 complete

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (1-2 days)
2. Complete Phase 2: Foundational (3-5 days)
3. Complete Phase 3: US1 CRM CRUD (5-7 days)
4. Complete Phase 4: US2 Auth (3-5 days)
5. **STOP and VALIDATE**: Full CRM operations with auth
6. Deploy MVP to staging

**Estimated MVP Duration**: 2-3 weeks

### Full Migration

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Setup | 1-2 days | Week 1 |
| Foundational | 3-5 days | Week 1-2 |
| US1 (CRM) | 5-7 days | Week 2-3 |
| US2 (Auth) | 3-5 days | Week 3-4 |
| US3 (Files) | 3-4 days | Week 5 |
| US4 (Queues) | 5-7 days | Week 6-7 |
| US5 (Deploy) | 2-3 days | Week 8 |
| US6 (Backup) | 1-2 days | Week 8-9 |
| Real-Time | 5-7 days | Week 9-10 |
| Polish | 3-5 days | Week 11-12 |

**Total Estimated Duration**: 10-12 weeks

---

## Notes

- [P] tasks = different files, no dependencies
- [USn] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `wrangler dev` frequently to validate changes work locally
