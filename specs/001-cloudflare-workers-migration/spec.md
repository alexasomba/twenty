# Feature Specification: Migrate Twenty CRM to Cloudflare Workers Stack

**Feature Branch**: `001-cloudflare-workers-migration`
**Created**: 2026-01-08
**Status**: Draft
**Input**: User description: "Migrate Twenty CRM to Cloudflare Workers Stack - Port the Twenty CRM core from NestJS/TypeORM/PostgreSQL to run natively on Cloudflare workerd runtime, replacing PostgreSQL with D1, Redis with KV, S3 with R2, and BullMQ with Cloudflare Queues for a serverless zero-infrastructure deployment"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CRM Users Access Application via Edge Network (Priority: P1)

As a CRM user, I want to access Twenty CRM through a globally distributed edge network so that I experience fast response times regardless of my geographic location, with the same functionality I currently have.

**Why this priority**: This is the core value proposition - users must be able to perform all existing CRM operations (create/read/update/delete records, search, filtering) with improved latency. Without this, the migration has no value.

**Independent Test**: Can be fully tested by performing standard CRM operations (creating contacts, companies, opportunities, notes) and verifying data persistence and sub-200ms response times globally.

**Acceptance Scenarios**:

1. **Given** a user is logged into Twenty CRM, **When** they create a new contact record, **Then** the record is saved and retrievable within 200ms (p99) from any global location
2. **Given** a user is viewing their CRM dashboard, **When** they search for records, **Then** search results appear within 200ms (p99) with accurate filtering
3. **Given** a user updates an existing opportunity, **When** they save changes, **Then** all modifications persist correctly and are immediately visible
4. **Given** a user is accessing the CRM from different geographic regions (US, EU, Asia), **When** they perform any operation, **Then** response times remain consistent (within 200ms p99)

---

### User Story 2 - Users Authenticate and Maintain Sessions (Priority: P1)

As a CRM user, I want to securely log in and maintain my session so that I can access my workspace data without re-authenticating frequently while ensuring security.

**Why this priority**: Authentication is foundational - no other CRM functionality works without secure user sessions. Session management must work reliably before any other features can be validated.

**Independent Test**: Can be tested by logging in with valid credentials, performing actions across multiple page loads, and verifying session persistence for 24 hours.

**Acceptance Scenarios**:

1. **Given** a user has valid credentials, **When** they log in, **Then** a secure session is created and the user accesses their workspace
2. **Given** a user has an active session, **When** they navigate between pages or close/reopen their browser within 24 hours, **Then** they remain logged in
3. **Given** a user's session has expired (after 24 hours of inactivity), **When** they try to access the CRM, **Then** they are redirected to login
4. **Given** a user logs out, **When** they try to access protected resources, **Then** they are denied access and redirected to login

---

### User Story 3 - Users Upload and Access Files (Priority: P2)

As a CRM user, I want to upload files (documents, images, attachments) to records and access them later so that I can store relevant materials alongside my CRM data.

**Why this priority**: File attachments are essential for CRM workflows (contracts, proposals, images) but can be implemented after core data operations work correctly.

**Independent Test**: Can be tested by uploading various file types to a contact record and subsequently downloading/viewing them.

**Acceptance Scenarios**:

1. **Given** a user is editing a contact record, **When** they upload a file (up to 100MB), **Then** the file is stored and associated with that record
2. **Given** a user has previously uploaded a file, **When** they view the record, **Then** they can download or preview the file
3. **Given** multiple users in the same workspace, **When** one user uploads a file, **Then** other authorized users can access it according to their permissions
4. **Given** a user tries to upload a file exceeding size limits, **When** the upload completes, **Then** they receive a clear error message

---

### User Story 4 - Background Workflows Execute Automatically (Priority: P2)

As a CRM user, I want automated workflows (email sync, notifications, scheduled tasks) to run reliably in the background so that my CRM stays current without manual intervention.

**Why this priority**: Background processing enables key CRM automation features. It can be implemented after core user-facing operations are stable.

**Independent Test**: Can be tested by triggering an email sync task and verifying emails appear in the CRM within the expected timeframe.

**Acceptance Scenarios**:

1. **Given** email sync is configured for a workspace, **When** new emails arrive, **Then** they are synced to the CRM within 5 minutes
2. **Given** a workflow is triggered (e.g., deal closed), **When** the triggering event occurs, **Then** associated actions execute (e.g., notification sent) within 30 seconds
3. **Given** a background task fails, **When** retries are exhausted (up to 5 attempts), **Then** the task is moved to a dead-letter queue for manual review
4. **Given** high volume of background tasks, **When** many tasks are queued simultaneously, **Then** tasks process in order without data loss

---

### User Story 5 - Administrators Deploy and Manage the CRM (Priority: P3)

As a system administrator, I want to deploy Twenty CRM with a single command and manage it without maintaining servers so that operational overhead is minimal.

**Why this priority**: Deployment simplicity is a key benefit but only matters once the application functions correctly on the new infrastructure.

**Independent Test**: Can be tested by running a deployment command and verifying the CRM is accessible and functional within 2 minutes.

**Acceptance Scenarios**:

1. **Given** the codebase is configured, **When** an administrator runs the deployment command, **Then** the CRM is deployed globally within 2 minutes
2. **Given** the CRM is deployed, **When** an administrator needs to view logs, **Then** they can tail logs in real-time
3. **Given** a configuration change is needed, **When** environment variables are updated and redeployed, **Then** changes take effect without downtime
4. **Given** a need to rollback, **When** an administrator initiates rollback, **Then** the previous version is restored within 2 minutes

---

### User Story 6 - Data Recovery After Incidents (Priority: P3)

As a system administrator, I want to restore the database to a specific point in time so that I can recover from data corruption or accidental deletions.

**Why this priority**: Disaster recovery is critical for production systems but is a safety net rather than a day-to-day feature.

**Independent Test**: Can be tested by creating test data, triggering a backup point, deleting the data, and restoring to the backup.

**Acceptance Scenarios**:

1. **Given** the CRM has been running, **When** an administrator lists available backups, **Then** they see restore points from the last 30 days (one per minute)
2. **Given** data was accidentally deleted, **When** an administrator restores to a backup from before the deletion, **Then** the deleted data is recovered
3. **Given** a restore is in progress, **When** the restore completes, **Then** all data integrity is preserved, verified by: (a) record counts match pre-deletion counts, (b) all foreign key relationships resolve correctly, (c) JSON fields parse without errors, (d) no orphaned records exist

---

### Data Preservation Verification

Migration success (SC-002: 100% data preserved) is verified through:
1. **Record count validation**: Row counts for all 63 entities match between PostgreSQL and D1
2. **Checksum validation**: SHA-256 checksums computed on serialized records match between systems
3. **Referential integrity**: All foreign key relationships resolve correctly in D1
4. **Sample verification**: Random sample of 1,000 records per entity compared field-by-field
5. **Edge case validation**: Records with NULL values, empty arrays, and complex JSON verified

---

### Edge Cases

- **D1 query limits**: Result sets are limited to 10,000 rows per query; complex queries exceeding 300ms CPU time are automatically terminated. Mitigation: pagination required for large datasets, query complexity monitored during development.
- **Concurrent writes**: System uses last-write-wins strategy; the most recent write overwrites previous, matching current PostgreSQL behavior
- **File upload interruption**: If upload is interrupted mid-stream, the incomplete object is not persisted to R2. Client receives timeout error and must retry the full upload. Partial uploads do not consume storage.
- **R2 upload failure after presigned URL**: If R2 write fails after presigned URL generation (network error, R2 outage), the metadata record is marked as "upload_pending" and cleaned up after 24 hours. Client receives 502 error with retry guidance.
- **Queue overwhelm**: System applies backpressure by rate-limiting producers when queue depth exceeds 10,000 messages; operators are alerted via webhook within 60 seconds
- **KV unavailability**: System falls back to D1 database for metadata lookup when KV is temporarily unavailable, maintaining availability with slightly increased latency (JWT tokens are self-contained and don't require KV lookup)
- **Deployment rollout**: Cloudflare Workers uses instant global deployment with zero-downtime rollout. In-flight requests complete on the previous version; new requests route to the new version immediately.
- **Partial Cloudflare outage**: If specific services degrade (e.g., KV, Queues), system continues with degraded functionality: KV→D1 fallback, Queues→synchronous processing with warning. System returns 503 only if D1 is unavailable.
- **JWT token expiration during session**: When JWT expires during active use, system returns 401 with "token_expired" code. Frontend handles refresh automatically; user sees brief loading state, not logout.
- **Durable Objects hibernation**: After 10 seconds of WebSocket inactivity, DO may hibernate. On wake, cached state is rehydrated from storage (< 100ms). Clients receive a brief reconnection if hibernation occurs during idle period.
- **Workspace quotas**: Workspaces are limited to 10GB file storage, 1M records, and 100 users. Quota exceeded returns 402 with upgrade prompt. Quotas are soft-enforced (warnings at 80%).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST serve all HTTP requests through edge network with global distribution
- **FR-002**: System MUST persist all CRM data (contacts, companies, opportunities, activities, custom objects) in a serverless SQL database
- **FR-003**: System MUST preserve all existing CRM functionality (CRUD operations, search, filtering, relationships between records)
- **FR-004**: System MUST authenticate users and maintain secure sessions with 24-hour expiration using stateless JWT tokens
- **FR-005**: System MUST cache workspace metadata in a globally distributed key-value store for fast access (JWT tokens are self-contained and stateless)
- **FR-006**: System MUST cache frequently accessed metadata (workspace settings, custom fields, permissions) to reduce database queries
- **FR-007**: System MUST support file uploads up to 100MB per file with metadata tracking
- **FR-008**: System MUST store uploaded files in S3-compatible object storage with zero egress fees
- **FR-009**: System MUST generate pre-signed URLs for direct file uploads from frontend
- **FR-010**: System MUST process background tasks (email sync, workflows, notifications) asynchronously via message queues
- **FR-011**: System MUST retry failed background tasks up to 5 times before moving to dead-letter queue
- **FR-012**: System MUST maintain database backup history for 30 days with minute-level granularity
- **FR-013**: System MUST support point-in-time database restoration
- **FR-014**: System MUST deploy via single command with under 2-minute deployment time
- **FR-015**: System MUST preserve 100% of existing data during migration (zero data loss)
- **FR-016**: System MUST enforce foreign key constraints on all database relationships
- **FR-017**: System MUST support concurrent users (target: 10,000 simultaneous connections)
- **FR-018**: System MUST emit structured JSON logs and basic metrics (latency, error rates, queue depth) for operational visibility

### Non-Functional Requirements

- **NFR-001**: All data MUST be encrypted at rest (D1, KV, R2 use Cloudflare's AES-256 encryption) and in transit (TLS 1.3 minimum)
- **NFR-002**: System MUST comply with GDPR requirements; data stored in EU-region D1 database for EU workspaces when configured; data export and deletion APIs available
- **NFR-003**: Disaster recovery: RTO (Recovery Time Objective) is 15 minutes for D1 point-in-time restore; RPO (Recovery Point Objective) is 1 minute (backup granularity)
- **NFR-004**: Accessibility: Frontend accessibility requirements inherited from existing Twenty CRM (WCAG 2.1 AA compliance); no accessibility changes in this migration
- **NFR-005**: Security: JWT tokens signed with RS256, secrets stored in Cloudflare Workers Secrets (encrypted), no sensitive data logged
- **FR-019**: System MUST apply backpressure to task producers when queue depth exceeds 10,000 messages and alert operators via webhook within 60 seconds
- **FR-020**: System MUST handle D1 errors gracefully: return 503 with retry-after header on connection timeout, return 400 on query syntax errors, return 413 when result exceeds 10,000 rows
- **FR-021**: System MUST enforce rate limits: 1,000 requests/minute per workspace, 100 requests/minute per unauthenticated IP, returning 429 with retry-after header when exceeded
- **FR-022**: System MUST preserve existing entity validation constraints from TypeORM decorators during migration (nullable, length, format validators)
- **FR-023**: System MUST maintain API backward compatibility; breaking changes require versioned endpoints (e.g., /v2/graphql)

### Key Entities

- **Workspace**: Tenant container holding all CRM data for an organization; contains users, settings, custom objects
- **User**: Individual account with credentials, roles, permissions within a workspace
- **Session**: Authentication state linking a user to an active login; includes token, expiration, workspace context
- **Contact/Company/Opportunity**: Core CRM entities representing people, organizations, and sales deals
- **Custom Object**: User-defined entity types extending the CRM schema
- **File Attachment**: Binary files associated with CRM records; includes metadata (size, type, owner)
- **Background Task**: Asynchronous job (email sync, workflow action) with status, retry count, error details
- **Workspace Metadata**: Cached configuration (custom fields, permissions, settings) for quick access

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Global response time (p99) is under 200 milliseconds for standard CRM operations, measured as time-to-first-byte from edge to client across 5 geographic regions (US-East, US-West, EU-West, Asia-Pacific, South America)
- **SC-002**: 100% of existing data is preserved during migration with zero data loss, verified by record count comparison and checksum validation across all 63 entities
- **SC-003**: Query performance is within 20% of current PostgreSQL performance for equivalent operations, measured using a standard benchmark suite of 50 representative queries (10 simple reads, 20 filtered queries, 10 joins, 10 writes)
- **SC-004**: Deployment time is under 2 minutes from command execution to live availability
- **SC-005**: Operational costs are reduced by 60-70% compared to current VPS/Docker hosting
- **SC-006**: System maintains 99.99% uptime (less than 52 minutes downtime per year), measured on rolling 30-day windows, excluding scheduled maintenance windows announced 72 hours in advance
- **SC-007**: Cold start time is under 1 second for first request to a new edge location, measured after 10+ minutes of inactivity at that location
- **SC-008**: File uploads complete successfully for files up to 100MB
- **SC-009**: Background tasks process within 5 minutes of being queued under normal load
- **SC-010**: System supports 10,000 concurrent users (80% read, 20% write operations, distributed globally) without performance degradation, defined as p99 latency remaining under 300ms

## Assumptions

- The current Twenty CRM schema can be adapted to SQLite/D1 compatibility (PostgreSQL-specific features like JSONB will be converted to TEXT with JSON functions)
- Cloudflare Workers Standard plan limits are sufficient: 300ms CPU per invocation, 128MB memory, 1,000 subrequests per request, 25 million requests/month included
- GraphQL API functionality will be preserved through Hono + GraphQL Yoga (NestJS is not Workers-compatible; hybrid adapter pattern used as documented in research.md)
- Existing frontend React application requires minimal changes: (1) API endpoint URL configuration, (2) environment variable updates, (3) no architectural or component changes
- UUID generation will be handled in application code rather than database since D1 does not support native UUID type
- Eventually consistent caching (KV) is acceptable with maximum staleness of 60 seconds for workspace metadata; session tokens use stateless JWT (no KV dependency)
- PostgreSQL will be maintained in read-only mode for 30 days post-migration to enable rollback if critical issues arise
- TypeORM 0.3.x with better-sqlite3 driver is compatible with D1; entity patterns validated in research.md

## Dependencies

- Cloudflare Workers account with D1, KV, R2, Queues, and Durable Objects access
- Wrangler CLI v3.91.0 or later for deployment
- Hono framework for HTTP routing (Workers-native)
- GraphQL Yoga for GraphQL handling (already in codebase)
- TypeORM 0.3.x with better-sqlite3 driver for D1 compatibility

## Out of Scope

- Changes to the Twenty frontend React application architecture
- Multi-region active-active database replication (D1 handles this automatically)
- Custom domain SSL certificate management (handled by Cloudflare)
- CDN configuration for static assets (handled by Cloudflare Pages)
- Modifications to the Twenty email templates or notification content

## Clarifications

### Session 2026-01-08

- Q: How should the system handle concurrent writes to the same record from different geographic regions? → A: Last-write-wins - accept the most recent write automatically, matching current PostgreSQL behavior
- Q: What level of observability should the migrated system provide? → A: Standard - structured JSON logs plus basic metrics (latency, error rates, queue depth)
- Q: When KV becomes temporarily unavailable, how should the system handle authentication? → A: Fallback to database - validate sessions against D1 when KV is unavailable
- Q: What is the rollback strategy if critical issues are discovered after migrating to D1? → A: Parallel operation - keep PostgreSQL read-only for 30 days post-migration as fallback
- Q: When background queue consumers are overwhelmed, how should the system behave? → A: Backpressure - rate-limit producers when queue depth exceeds threshold and alert operators
