# Research: Session Management and Queue Worker Analysis

**Date**: 2026-01-08
**Scope**: Redis/BullMQ → Cloudflare KV/Queues migration research

---

## Part 1: Session Management

### Current Authentication Architecture

Twenty uses **stateless JWT-based authentication** - NOT server-side sessions. This is excellent news for the Cloudflare migration.

#### Token Types and TTLs

| Token Type | Default TTL | Storage | Purpose |
|------------|-------------|---------|---------|
| Access Token | 30 minutes | Stateless (JWT) | API authentication |
| Refresh Token | 60 days | PostgreSQL (`appToken` table) | Token renewal |
| Login Token | 15 minutes | Stateless (JWT) | Magic link authentication |
| Workspace Agnostic Token | 30 minutes | Stateless (JWT) | Cross-workspace operations |
| Email Verification Token | 1 hour | PostgreSQL | Email confirmation |
| Password Reset Token | 5 minutes | PostgreSQL | Password recovery |
| File Token | Configurable | Stateless (JWT) | Presigned file URLs |

**Source**: [config-variables.ts#L240-280](packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts)

#### JWT Implementation

```typescript
// Access token payload structure (AccessTokenJwtPayload)
{
  type: JwtTokenTypeEnum.ACCESS,
  sub: userId,
  userId: string,
  workspaceId: string,
  workspaceMemberId: string,
  userWorkspaceId: string,
  authProvider: string,
  isImpersonating?: boolean,
  impersonatorUserWorkspaceId?: string,
  impersonatedUserWorkspaceId?: string,
}

// Refresh token payload structure (RefreshTokenJwtPayload)
{
  type: JwtTokenTypeEnum.REFRESH,
  sub: userId,
  jti: tokenId,  // References appToken table
  userId: string,
  workspaceId?: string,
  authProvider: string,
  targetedTokenType?: string,
}
```

**Key Files**:
- [access-token.service.ts](packages/twenty-server/src/engine/core-modules/auth/token/services/access-token.service.ts)
- [refresh-token.service.ts](packages/twenty-server/src/engine/core-modules/auth/token/services/refresh-token.service.ts)
- [jwt.auth.strategy.ts](packages/twenty-server/src/engine/core-modules/auth/strategies/jwt.auth.strategy.ts)

#### Refresh Token Storage (Database)

Refresh tokens are stored in the `appToken` entity:

```typescript
// AppTokenEntity (PostgreSQL, 'core' schema)
{
  id: UUID,
  userId: string | null,
  workspaceId: UUID | null,
  type: AppTokenType,  // RefreshToken, CodeChallenge, AuthorizationCode, etc.
  value: string | null,
  expiresAt: Date,
  deletedAt: Date | null,
  revokedAt: Date | null,
  createdAt: Date,
  updatedAt: Date,
}
```

**Source**: [app-token.entity.ts](packages/twenty-server/src/engine/core-modules/app-token/app-token.entity.ts)

### Redis Usage (NOT for Sessions)

Redis is used for:

1. **Cache Storage** - Module-level caching (messaging, calendar, workflow)
2. **Message Queues** - BullMQ job processing
3. **PubSub** - GraphQL subscriptions (real-time updates)

**Redis Client Service**:
```typescript
// Three Redis client types
getClient()        // General cache operations
getQueueClient()   // BullMQ queue operations
getPubSubClient()  // GraphQL subscriptions (RedisPubSub)
```

**Source**: [redis-client.service.ts](packages/twenty-server/src/engine/core-modules/redis-client/redis-client.service.ts)

### Cache Storage Layer

```typescript
// Cache namespaces
enum CacheStorageNamespace {
  ModuleMessaging = 'module:messaging',
  ModuleCalendar = 'module:calendar',
  ModuleWorkflow = 'module:workflow',
  EngineWorkspace = 'engine:workspace',
  EngineLock = 'engine:lock',
  EngineHealth = 'engine:health',
}

// Default TTL: 7 days (604800 seconds)
CACHE_STORAGE_TTL: number = 3600 * 24 * 7;
```

**Source**:
- [cache-storage-namespace.enum.ts](packages/twenty-server/src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum.ts)
- [cache-storage.module-factory.ts](packages/twenty-server/src/engine/core-modules/cache-storage/cache-storage.module-factory.ts)

### Migration Implications for Sessions

✅ **No Redis session migration needed** - JWT is stateless
✅ **Refresh tokens already in PostgreSQL** - Will migrate to D1
⚠️ **Cache layer needs KV adapter** - For module-level caching
⚠️ **PubSub needs replacement** - Cloudflare doesn't have native PubSub (consider Durable Objects or external service)

---

## Part 2: Queue Worker Analysis

### Message Queue Architecture

Twenty uses **BullMQ** with a custom abstraction layer for job processing.

#### Queue Types (16 Total)

```typescript
enum MessageQueue {
  taskAssignedQueue = 'task-assigned-queue',
  messagingQueue = 'messaging-queue',
  webhookQueue = 'webhook-queue',
  cronQueue = 'cron-queue',
  emailQueue = 'email-queue',
  calendarQueue = 'calendar-queue',
  contactCreationQueue = 'contact-creation-queue',
  billingQueue = 'billing-queue',
  workspaceQueue = 'workspace-queue',
  entityEventsToDbQueue = 'entity-events-to-db-queue',
  workflowQueue = 'workflow-queue',
  delayedJobsQueue = 'delayed-jobs-queue',
  deleteCascadeQueue = 'delete-cascade-queue',
  serverlessFunctionQueue = 'serverless-function-queue',
  triggerQueue = 'trigger-queue',
  aiQueue = 'ai-queue',
}
```

**Source**: [message-queue.constants.ts](packages/twenty-server/src/engine/core-modules/message-queue/message-queue.constants.ts)

#### Queue Priority Configuration

```typescript
const MESSAGE_QUEUE_PRIORITY = {
  billingQueue: 1,           // Highest priority
  entityEventsToDbQueue: 1,
  emailQueue: 1,
  workflowQueue: 2,
  webhookQueue: 2,
  messagingQueue: 2,
  delayedJobsQueue: 3,
  calendarQueue: 4,
  contactCreationQueue: 4,
  taskAssignedQueue: 4,
  serverlessFunctionQueue: 4,
  workspaceQueue: 5,
  triggerQueue: 5,
  aiQueue: 5,
  deleteCascadeQueue: 6,
  cronQueue: 7,              // Lowest priority
};
```

**Source**: [message-queue-priority.constant.ts](packages/twenty-server/src/engine/core-modules/message-queue/message-queue-priority.constant.ts)

### Job Processors (65+ Total)

#### Categorized Job List

**Email & Messaging (13 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `EmailSenderJob` | emailQueue | Send transactional emails |
| `MessagingMessageListFetchJob` | messagingQueue | Fetch email list from providers |
| `MessagingMessagesImportJob` | messagingQueue | Import email content |
| `MessagingBlocklistItemDeleteMessagesJob` | messagingQueue | Delete blocked emails |
| `MessagingBlocklistReimportMessagesJob` | messagingQueue | Reimport after blocklist change |
| `MessagingOngoingStaleJob` | messagingQueue | Handle stale sync states |
| `MessagingRelaunchFailedMessageChannelJob` | messagingQueue | Retry failed channels |
| `MessagingAddSingleMessageToCacheForImportJob` | messagingQueue | Cache messages for import |
| `MessagingCleanCacheJob` | messagingQueue | Clear message cache |
| `MessageParticipantMatchParticipantJob` | messagingQueue | Match participants to contacts |
| `MessagingConnectedAccountDeletionCleanupJob` | messagingQueue | Cleanup on account deletion |

**Calendar (8 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `CalendarEventListFetchJob` | calendarQueue | Fetch calendar events |
| `CalendarEventsImportJob` | calendarQueue | Import event details |
| `CalendarOngoingStaleJob` | calendarQueue | Handle stale calendar sync |
| `CalendarRelaunchFailedCalendarChannelJob` | calendarQueue | Retry failed calendars |
| `BlocklistItemDeleteCalendarEventsJob` | calendarQueue | Delete blocked events |
| `BlocklistReimportCalendarEventsJob` | calendarQueue | Reimport after blocklist |
| `CalendarEventParticipantMatchParticipantJob` | calendarQueue | Match participants |
| `DeleteConnectedAccountAssociatedCalendarDataJob` | calendarQueue | Cleanup calendar data |

**Workflow (9 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `RunWorkflowJob` | workflowQueue | Execute workflow steps |
| `WorkflowTriggerJob` | workflowQueue | Handle workflow triggers |
| `WorkflowStatusesUpdateJob` | workflowQueue | Update workflow run status |
| `WorkflowRunEnqueueJob` | workflowQueue | Queue workflow runs |
| `ResumeDelayedWorkflowJob` | delayedJobsQueue | Resume after delay action |
| `WorkflowCronTriggerCronJob` | cronQueue | Trigger cron-based workflows |
| `WorkflowRunEnqueueCronJob` | cronQueue | Periodic workflow queue processing |
| `WorkflowHandleStaledRunsCronJob` | cronQueue | Clean stale workflow runs |
| `WorkflowCleanWorkflowRunsCronJob` | cronQueue | Archive old workflow runs |

**Webhooks (2 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `CallWebhookJob` | webhookQueue | Execute webhook HTTP calls |
| `CallWebhookJobsJob` | webhookQueue | Batch webhook processing |

**Billing & Workspace (6 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `UpdateSubscriptionQuantityJob` | billingQueue | Sync seat counts with Stripe |
| `HandleWorkspaceMemberDeletedJob` | workspaceQueue | Cleanup on member deletion |
| `CleanSuspendedWorkspacesJob` | cronQueue | Delete suspended workspaces |
| `CleanOnboardingWorkspacesJob` | cronQueue | Clean abandoned onboarding |
| `CleanWorkspaceDeletionWarningUserVarsJob` | workspaceQueue | Clear deletion warnings |
| `TrashCleanupJob` | workspaceQueue | Empty trash periodically |

**Entity Events & Audit (3 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `UpsertTimelineActivityFromInternalEventJob` | entityEventsToDbQueue | Record timeline activities |
| `CreateAuditLogFromInternalEvent` | entityEventsToDbQueue | Create audit log entries |
| `CallDatabaseEventTriggerJobsJob` | triggerQueue | Trigger database event handlers |

**AI & Serverless (3 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `EvaluateAgentTurnJob` | aiQueue | Evaluate AI agent responses |
| `RunEvaluationInputJob` | aiQueue | Run AI evaluation inputs |
| `ServerlessFunctionTriggerJob` | serverlessFunctionQueue | Execute serverless functions |

**Files & Contacts (4 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `FileDeletionJob` | deleteCascadeQueue | Delete file attachments |
| `FileWorkspaceFolderDeletionJob` | deleteCascadeQueue | Delete workspace folders |
| `CreateCompanyAndContactJob` | contactCreationQueue | Auto-create from emails |
| `FavoriteDeletionJob` | deleteCascadeQueue | Remove favorite references |

**User & Domain (3 jobs)**
| Job Name | Queue | Purpose |
|----------|-------|---------|
| `UpdateWorkspaceMemberEmailJob` | workspaceQueue | Sync member email changes |
| `CheckCustomDomainValidRecordsCronJob` | cronQueue | Validate custom domains |
| `CheckPublicDomainsValidRecordsCronJob` | cronQueue | Validate public domains |

### Cron Job Patterns

```typescript
// Messaging & Calendar (frequent sync)
'*/1 * * * *'    // Every minute - Message imports, Calendar imports
'*/5 * * * *'    // Every 5 min - Message list fetch, Calendar list fetch
'2-59/5 * * * *' // Every 5 min offset - Message list fetch (staggered)
'0 * * * *'      // Every hour - Stale sync detection

// Workflow & Maintenance
'* * * * *'      // Every minute - Workflow cron triggers
'0 */6 * * *'    // Every 6 hours - Failed channel relaunch

// Domain validation (daily patterns likely, not shown in code)
```

**Source**: Various cron job files in `crons/jobs/` directories

### Job Options Interface

```typescript
interface QueueJobOptions {
  id?: string;           // Deduplication key
  priority?: number;     // 1-7 (lower = higher priority)
  retryLimit?: number;   // Max retry attempts
  delay?: number;        // Delay in ms before processing
}

interface QueueCronJobOptions extends QueueJobOptions {
  repeat: {
    every?: number;      // Repeat interval in ms
    pattern?: string;    // Cron pattern
    limit?: number;      // Max executions
  };
}
```

**Source**: [job-options.interface.ts](packages/twenty-server/src/engine/core-modules/message-queue/drivers/interfaces/job-options.interface.ts)

### BullMQ Driver Configuration

```typescript
// Retry behavior
attempts: 1 + (options?.retryLimit || 0)  // Total attempts = 1 + retryLimit

// Job retention
QUEUE_RETENTION = {
  completedMaxAge: 14400,    // 4 hours
  completedMaxCount: 1000,
  failedMaxAge: 604800,      // 7 days
  failedMaxCount: 1000,
}

// Default retry limits by usage:
// - Entity events: retryLimit: 3
// - Workflow triggers: retryLimit: 3
// - Email sending: retryLimit: 3
// - User email updates: retryLimit: 2
```

**Source**:
- [bullmq.driver.ts](packages/twenty-server/src/engine/core-modules/message-queue/drivers/bullmq.driver.ts)
- [queue-retention.constants.ts](packages/twenty-server/src/engine/core-modules/message-queue/constants/queue-retention.constants.ts)

### Worker Module Architecture

```typescript
// Queue worker is a separate NestJS application context
@Module({
  imports: [
    CoreEngineModule,
    MessageQueueModule.registerExplorer(),
    WorkspaceEventEmitterModule,
    JobsModule,                    // All job processors
    TwentyORMModule,
    GlobalWorkspaceDataSourceModule,
  ],
})
export class QueueWorkerModule {}
```

**Source**: [queue-worker.module.ts](packages/twenty-server/src/queue-worker/queue-worker.module.ts)

---

## Part 3: Migration Considerations

### Session Migration (Minimal Impact)

| Current | Cloudflare Target | Effort |
|---------|------------------|--------|
| JWT (stateless) | JWT (unchanged) | ✅ None |
| Refresh tokens in PostgreSQL | Refresh tokens in D1 | ✅ Automatic with D1 |
| Redis cache | KV cache | 🔶 Adapter needed |
| Redis PubSub | Durable Objects / External | 🔴 Architecture decision |

### Queue Migration (Significant Refactoring)

| Current | Cloudflare Target | Key Differences |
|---------|------------------|-----------------|
| BullMQ queues (16) | Cloudflare Queues | Max 100 msg/batch, FIFO only |
| Priority queues | Separate queues | No native priority, use multiple queues |
| Cron jobs | Cron Triggers | Native support via wrangler.jsonc |
| Delayed jobs | Queue delays | Native `delaySeconds` support |
| Retry logic | Message retry | Native retry with backoff |
| Job deduplication | Idempotency tokens | Manual implementation |

### Queue Consolidation Strategy

**Proposed Queue Mapping** (16 BullMQ → 6 CF Queues):

| CF Queue Name | BullMQ Sources | Rationale |
|---------------|----------------|-----------|
| `twenty-critical` | billing, entityEvents, email | Priority 1 - business critical |
| `twenty-workflow` | workflow, webhook | Priority 2 - user-facing automation |
| `twenty-messaging` | messaging, calendar | Priority 2 - sync operations |
| `twenty-background` | workspace, trigger, deleteCascade, contact | Priority 4-6 - background tasks |
| `twenty-delayed` | delayedJobs | Special handling for delays |
| `twenty-cron` | cronQueue | Scheduled tasks (may use Cron Triggers instead) |

### Cron Migration

Replace BullMQ cron with **Cloudflare Cron Triggers**:

```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": [
      "*/1 * * * *",   // Message/Calendar imports
      "*/5 * * * *",   // List fetching
      "0 * * * *",     // Hourly stale detection
      "0 */6 * * *"    // Failed channel relaunch
    ]
  }
}
```

### Key Differences to Handle

1. **No Priority Queues** - Use separate queues and consumer prioritization
2. **FIFO Only** - No job reordering, design for sequential processing
3. **Batch Processing** - Max 100 messages per batch (leverage for efficiency)
4. **Visibility Timeout** - Messages reappear if not acknowledged (default 30s)
5. **Max Retries** - Configure per-queue, with dead-letter queue support
6. **No Job Schedulers** - Use Cron Triggers for recurring jobs

### PubSub Replacement Options

For GraphQL subscriptions (real-time updates):

1. **Durable Objects** - Stateful WebSocket handling at edge
2. **Ably/Pusher** - External real-time service
3. **Cloudflare Pub/Sub** (if available) - Native solution
4. **Polling fallback** - Simpler but less real-time

---

## Summary

### ✅ Good News
- Authentication is JWT-based (stateless) - minimal migration effort
- Refresh tokens already in database - automatic D1 migration
- Queue abstraction layer exists - can swap BullMQ driver for Queues driver

### ⚠️ Challenges
1. **16 queues → 6 queues** - Need queue consolidation strategy
2. **Priority handling** - Implement via multiple queues or consumer logic
3. **Cron jobs** - Convert to Cron Triggers (straightforward)
4. **GraphQL PubSub** - Needs architecture decision for real-time

### 🔴 Critical Decisions Needed
1. Queue consolidation mapping (finalize 6-queue structure)
2. PubSub replacement strategy
3. Cache TTL alignment with KV limits (max 1 year)
4. Batch processing optimization for Cloudflare Queues
