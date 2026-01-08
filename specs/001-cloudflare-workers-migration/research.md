# Research Document: Migrate Twenty CRM to Cloudflare Workers Stack

**Branch**: `001-cloudflare-workers-migration`
**Date**: 2026-01-08
**Status**: Complete

## Executive Summary

This document consolidates research findings for migrating Twenty CRM from the current NestJS/TypeORM/PostgreSQL/Redis/BullMQ stack to Cloudflare's serverless platform (Workers/D1/KV/R2/Queues).

**Key Findings**:
1. **TypeORM Migration**: 63 entities with 97% requiring PostgreSQL → SQLite adaptations (mainly UUID, JSONB, timestamps)
2. **NestJS Adaptation**: Hybrid Hono + GraphQL Yoga approach recommended; GraphQL Yoga already in use
3. **Authentication**: Stateless JWT-based - no session migration needed (major simplification!)
4. **Queue Workers**: 16 BullMQ queues with 65+ processors need consolidation to 6 Cloudflare Queues
5. **File Storage**: Clean S3Driver abstraction enables straightforward R2 migration
6. **Image Processing**: `sharp` dependency requires replacement (Cloudflare Images or client-side)

---

## Research Task 1: TypeORM D1/SQLite Compatibility

### Summary

| Metric | Value |
|--------|-------|
| Total entity files | 63 |
| Files with PostgreSQL features | 61 (97%) |
| Estimated migration effort | Medium-High |

### PostgreSQL Features by Prevalence

| Feature | Files Affected | Occurrences | Migration Strategy |
|---------|---------------|-------------|-------------------|
| UUID columns | 61 | 111+ | TEXT + application-generated UUIDs (uuid package) |
| timestamptz | 45+ | 100+ | TEXT + ISO 8601 format, no timezone conversion |
| JSONB | 24 | 39 | TEXT + ValueTransformer, query with json_extract() |
| Enum types | 19 | 36 | TEXT + CHECK constraints, TypeORM enum option |
| Array columns | 3 | 3 | TEXT + JSON array serialization |
| bigint/numeric | 4 | 4 | Native SQLite INTEGER/REAL support |

### High-Complexity Entities Requiring Special Attention

1. **BillingSubscriptionItem** - 14 timestamptz, 5 JSONB, 3 enums
2. **ConnectedAccount** - 6 enums, CHECK constraints
3. **WorkspaceMember** - 3 JSONB, CHECK constraints
4. **KeyValuePair** - 5 enums, 4 JSONB, numeric
5. **MessageChannel** - array, enum, CHECK constraint
6. **AppToken** - 2 JSONB, multiple UUID foreign keys
7. **Webhook** - 2 JSONB, array
8. **Workflow** - 4 JSONB fields
9. **WorkflowVersion** - array for event operations
10. **RemoteServer** - JSONB storing DDL

### Migration Patterns

#### Pattern 1: Base Entity with UUID Generation

```typescript
// All entities extend this or similar pattern
abstract class BaseEntity {
  @PrimaryColumn({ type: 'text' })
  id: string = uuidv4(); // Application-generated

  @Column({ type: 'text' })
  createdAt: string = new Date().toISOString();

  @Column({ type: 'text' })
  updatedAt: string = new Date().toISOString();
}
```

#### Pattern 2: JSON Value Transformer

```typescript
const jsonTransformer: ValueTransformer = {
  to: (value: any) => (value ? JSON.stringify(value) : null),
  from: (value: string) => (value ? JSON.parse(value) : null),
};

// Usage in entity
@Column({ type: 'text', transformer: jsonTransformer, nullable: true })
metadata: Record<string, any>;
```

#### Pattern 3: Enum as TEXT with Check

```typescript
// D1-compatible enum column
@Column({
  type: 'text',
  default: 'pending',
})
status: 'pending' | 'active' | 'deleted';

// Migration adds: CHECK(status IN ('pending', 'active', 'deleted'))
```

### Decision

**Selected Approach**: Create migration scripts to convert all PostgreSQL-specific types with the patterns above. Centralize transformers in a shared utilities module.

---

## Research Task 2: NestJS Worker Adapter Pattern

### Current Bootstrap Analysis

**File**: `packages/twenty-server/src/main.ts`

Current patterns:
- Uses `@nestjs/platform-express` (Express adapter)
- SSL configuration via Node.js `fs` and `https`
- Express-specific middleware: `express-session`, `graphql-upload`, `body-parser`
- Long-running HTTP server with `app.listen()`

**Critical Finding**: Twenty already uses **GraphQL Yoga** (`@graphql-yoga/nestjs`) which has native Cloudflare Workers support.

### Dependencies Compatibility Matrix

| Dependency | Current Usage | Workers Compatible | Replacement |
|------------|--------------|-------------------|-------------|
| @nestjs/platform-express | HTTP adapter | ❌ | Hono router |
| @graphql-yoga/nestjs | GraphQL server | ✅ | Native Workers support |
| express-session | Session middleware | ❌ | Not needed (JWT auth) |
| graphql-upload | File uploads | ❌ | R2 multipart handling |
| bcrypt | Password hashing | ❌ | bcryptjs (pure JS) |
| sharp | Image processing | ❌ | Cloudflare Images |
| crypto (Node.js) | Token generation | ⚠️ | Web Crypto API or nodejs_compat |
| ioredis | Redis client | ❌ | KV/Durable Objects |
| bullmq | Job queues | ❌ | Cloudflare Queues |

### Adapter Options Evaluated

| Option | Effort | Risk | Cold Start | Recommendation |
|--------|--------|------|------------|----------------|
| A: Full NestJS port | Very High | High | Slow (2-5s) | ❌ Not recommended |
| B: Hono + GraphQL Yoga hybrid | Medium | Medium | Fast (<500ms) | ✅ Recommended |
| C: Complete Hono rewrite | Very High | Low | Fastest (<200ms) | ❌ Too much work |

### Decision

**Selected Approach**: Option B - Hybrid Hono + GraphQL Yoga

Architecture:
```text
Worker Entry (fetch handler)
    └── Hono Router
         ├── /graphql → GraphQL Yoga (extracted from NestJS driver)
         ├── /metadata → GraphQL Yoga (metadata schema)
         ├── /rest/* → Ported REST handlers
         ├── /files/* → R2 file operations
         └── /health → Health check
```

**Rationale**:
1. Hono is native to Workers with zero cold start overhead
2. GraphQL Yoga already used in codebase - just extract from NestJS driver
3. Existing service interfaces enable gradual driver swapping
4. REST endpoints are minimal and can be ported incrementally

---

## Research Task 3: Session Management Migration

### Key Finding: Stateless JWT Authentication

**Twenty uses stateless JWT tokens, NOT server-side Redis sessions.** This is a major simplification.

| Token Type | TTL | Storage | Migration Impact |
|------------|-----|---------|------------------|
| Access Token | 30 minutes | Stateless JWT | ✅ Works as-is |
| Refresh Token | 60 days | PostgreSQL (appToken table) | ✅ Migrates with D1 |
| Login Token | 15 minutes | Stateless JWT | ✅ Works as-is |

### What Redis IS Used For

1. **Caching** (workspace metadata, permissions) → **KV**
2. **BullMQ Queues** (job processing) → **Cloudflare Queues**
3. **PubSub** (GraphQL subscriptions) → **Durable Objects** (if needed)

### Cache Migration Strategy

Current cache usage in `cache-manager-redis-yet`:
- Workspace settings cache
- Permission lookups
- Metadata schema cache

**KV Implementation**:
```typescript
// Session-like data in KV (for future caching needs)
await env.CACHE_STORE.put(
  `workspace:${workspaceId}:metadata`,
  JSON.stringify(metadata),
  { expirationTtl: 3600 } // 1 hour TTL
);
```

### Decision

**No session migration required.** JWT tokens work identically on Workers. Redis caching will be replaced with KV for metadata caching with appropriate TTLs.

---

## Research Task 4: BullMQ to Queues Migration

### Current Queue Architecture

| Metric | Value |
|--------|-------|
| Total BullMQ queues | 16 |
| Total job processors | 65+ |
| Retry configuration | 3 attempts (default) |
| Priority levels | 1-7 |
| Job retention | 4h completed, 7d failed |

### Queue Inventory

| Queue Name | Job Count | Priority | Examples |
|------------|-----------|----------|----------|
| messaging-jobs | 13 | Medium | Message sync, email sending |
| calendar-jobs | 8 | Medium | Event import, sync |
| workflow-jobs | 9 | High | Run workflows, delays |
| webhook-jobs | 2 | High | HTTP callback delivery |
| billing-jobs | 4 | Critical | Subscription sync |
| workspace-jobs | 2 | Low | Cleanup, maintenance |

### Cron Jobs (Scheduled Tasks)

| Pattern | Jobs | Description |
|---------|------|-------------|
| Every 1 min | 3 | Message sync polling |
| Every 5 min | 4 | Calendar sync, status check |
| Every 1 hour | 2 | Maintenance, cleanup |
| Daily | 1 | Billing aggregation |

### Cloudflare Queues Migration Plan

**Consolidation: 16 → 6 Queues**

| New Queue | Purpose | Max Batch | Retry | Dead Letter |
|-----------|---------|-----------|-------|-------------|
| twenty-critical | Billing, auth, entity events | 5 | 5 | twenty-dlq |
| twenty-workflow | Workflows, webhooks | 10 | 3 | twenty-dlq |
| twenty-messaging | Email, calendar sync | 20 | 5 | twenty-dlq |
| twenty-background | Cleanup, maintenance | 50 | 3 | twenty-dlq |
| twenty-scheduled | Delayed/scheduled jobs | 10 | 3 | twenty-dlq |
| twenty-dlq | Dead letter queue | 100 | 0 | - |

**Cron Jobs → Cloudflare Cron Triggers**:
```jsonc
// wrangler.jsonc
{
  "triggers": {
    "crons": [
      "*/1 * * * *",  // Message sync polling
      "*/5 * * * *",  // Calendar sync
      "0 * * * *"     // Hourly maintenance
    ]
  }
}
```

### Key Differences

| Feature | BullMQ | Cloudflare Queues | Adaptation |
|---------|--------|-------------------|------------|
| Priority queues | Built-in (1-7) | Not native | Use separate queues |
| Delayed jobs | Built-in | `delivery_delay` | ✅ Supported |
| Retries | Configurable | `max_retries` | ✅ Supported |
| Dead letter | Built-in | Separate queue | ✅ Supported |
| Rate limiting | Built-in | Manual | Implement backpressure |
| Cron scheduling | @nestjs/schedule | Cron Triggers | Use Workers scheduled event |

### Decision

**Consolidate to 6 queues** with priority-based separation. Use Cloudflare Cron Triggers for scheduled tasks. Implement manual backpressure monitoring for rate limiting.

---

## Research Task 5: File Storage Migration

### Current Architecture

**Clean Driver Abstraction** (minimal migration effort):
- `FileStorageService` interface with `LocalDriver` and `S3Driver` implementations
- Configuration-based driver selection via environment variables
- S3Driver already supports custom endpoints (`STORAGE_S3_ENDPOINT`)

### S3 SDK Operations Used

| Operation | Method | Usage |
|-----------|--------|-------|
| PutObjectCommand | write() | File uploads |
| GetObjectCommand | read() | File downloads |
| DeleteObjectCommand | delete() | File deletion |
| ListObjectsV2Command | list() | Folder listing |
| CopyObjectCommand | copy() | File copy/move |
| HeadObjectCommand | checkFileExists() | Existence check |

**Not used**: Presigned URLs, multipart uploads

### Storage Configuration

| Setting | Value |
|---------|-------|
| Max file size | 10MB |
| Storage path | `workspace/{workspaceId}/{folder}/{filename}` |
| Folders | profile-picture, workspace-logo, attachment, person-picture, serverless-function, file, agent-chat |

### R2 Migration Strategy

**Option A: S3 API Compatibility** (Minimal changes)
```typescript
// Update .env
STORAGE_S3_ENDPOINT=https://{account_id}.r2.cloudflarestorage.com
STORAGE_S3_REGION=auto
STORAGE_S3_BUCKET=twenty-crm-files
// Use existing S3Driver unchanged
```

**Option B: Native R2 Bindings** (Best performance on Workers)
```typescript
// New R2Driver implementation
class R2StorageDriver implements FileStorageDriver {
  constructor(private r2: R2Bucket) {}

  async write(params: FileStorageWriteParams): Promise<void> {
    await this.r2.put(params.key, params.data, {
      httpMetadata: { contentType: params.mimeType },
    });
  }

  async read(params: FileStorageReadParams): Promise<ArrayBuffer> {
    const object = await this.r2.get(params.key);
    return object?.arrayBuffer() ?? null;
  }
}
```

### Image Processing Challenge

**`sharp` is a Node.js native module** - not Workers compatible.

Options:
1. **Cloudflare Images** - Transform images on-the-fly via URL
2. **Client-side processing** - Use canvas API before upload
3. **Build-time processing** - Pre-generate sizes during upload via separate process

### Decision

**Phase 1**: Use S3 API compatibility (Option A) for fastest migration.
**Phase 2**: Migrate to native R2 bindings (Option B) for optimal performance.
**Image processing**: Use Cloudflare Images transformation URLs.

---

## Research Task 6: TypeORM Query Compatibility

### Query Pattern Analysis

Most queries use TypeORM's QueryBuilder or repository methods. Key patterns found:

| Pattern | Occurrences | SQLite Compatible |
|---------|-------------|-------------------|
| find/findOne | Extensive | ✅ Yes |
| QueryBuilder | Moderate | ⚠️ Mostly (avoid raw PG syntax) |
| Raw queries | Few | ❌ Need review |
| JSONB operators (`->`, `->>`) | Several | ❌ Use json_extract() |
| Array contains | Few | ❌ Use JSON array queries |
| ILIKE | Several | ❌ Use LIKE with COLLATE NOCASE |

### PostgreSQL-Specific Query Patterns to Migrate

```sql
-- PostgreSQL JSONB operator
WHERE metadata->>'key' = 'value'
-- SQLite equivalent
WHERE json_extract(metadata, '$.key') = 'value'

-- PostgreSQL array contains
WHERE 'tag' = ANY(tags)
-- SQLite equivalent (JSON array)
WHERE json_extract(tags, '$') LIKE '%"tag"%'

-- PostgreSQL ILIKE
WHERE name ILIKE '%search%'
-- SQLite equivalent
WHERE name LIKE '%search%' COLLATE NOCASE
```

### Decision

Create query compatibility layer with helper functions for JSONB and array operations. Review and migrate all raw SQL queries during implementation.

---

## Consolidated Decisions Summary

| Area | Decision | Rationale |
|------|----------|-----------|
| TypeORM entities | Migrate with transformers and patterns | Centralized, maintainable approach |
| NestJS adapter | Hono + GraphQL Yoga hybrid | Best balance of effort vs. performance |
| Authentication | No changes needed | Already stateless JWT |
| Caching | KV with TTL | Simple, globally distributed |
| Queues | 6 consolidated queues + Cron Triggers | Matches Cloudflare patterns |
| File storage | S3 API initially, native R2 later | Fast migration, then optimize |
| Image processing | Cloudflare Images | Workers-native solution |
| Real-time | Durable Objects + WebSocket | Required for GraphQL subscriptions |

---

## Research Task 7: Durable Objects for Real-Time

### Summary

Twenty CRM uses GraphQL subscriptions for real-time updates. Workers are stateless and cannot maintain WebSocket connections. Durable Objects solve this by providing:

1. **Persistent WebSocket connections** - Single DO instance per workspace
2. **In-memory state** - Track connected clients
3. **Broadcast capability** - Push updates to all subscribers

### Current Real-Time Implementation Analysis

Twenty uses GraphQL subscriptions for:
- **Record mutations** - When a record is created/updated/deleted
- **Notifications** - Real-time notification delivery
- **Workflow status** - Background job progress updates
- **Presence** - User online status (if implemented)

### Durable Objects Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Browser                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  GraphQL Client (Apollo/urql)                           │    │
│  │  - Queries/Mutations → HTTP Worker                      │    │
│  │  - Subscriptions → WebSocket → Durable Object           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │ HTTP                │ WebSocket           │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────────────────────────┐
│ HTTP Worker   │    │ Durable Object (per workspace)    │
│ (API + GQL)   │    │ ┌─────────────────────────────┐   │
│               │───▶│ │ WebSocket connections       │   │
│ On mutation:  │    │ │ - Map<userId, WebSocket>   │   │
│ POST to DO    │    │ └─────────────────────────────┘   │
│ /broadcast    │    │ ┌─────────────────────────────┐   │
└───────────────┘    │ │ Subscription topics         │   │
                     │ │ - recordUpdated:{objectId}  │   │
                     │ │ - notification:{userId}     │   │
                     │ └─────────────────────────────┘   │
                     └───────────────────────────────────┘
```

### Durable Object Implementation Design

```typescript
// packages/twenty-server/src/durable-objects/workspace-realtime.ts

export class WorkspaceRealtimeHub implements DurableObject {
  private connections = new Map<string, WebSocket>();
  private subscriptions = new Map<string, Set<string>>(); // topic → userIds

  constructor(
    private state: DurableObjectState,
    private env: WorkerEnv
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/ws':
        return this.handleWebSocketUpgrade(request);
      case '/broadcast':
        return this.handleBroadcast(request);
      case '/subscribe':
        return this.handleSubscribe(request);
      case '/unsubscribe':
        return this.handleUnsubscribe(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    const userId = new URL(request.url).searchParams.get('userId');

    server.accept();
    this.connections.set(userId!, server);

    server.addEventListener('close', () => {
      this.connections.delete(userId!);
      this.removeUserFromAllTopics(userId!);
    });

    server.addEventListener('message', (event) => {
      this.handleMessage(userId!, event.data);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const { topic, payload } = await request.json() as {
      topic: string;
      payload: unknown;
    };

    const subscribers = this.subscriptions.get(topic) ?? new Set();
    const message = JSON.stringify({ type: 'subscription', topic, data: payload });

    for (const userId of subscribers) {
      const ws = this.connections.get(userId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }

    return new Response(JSON.stringify({ delivered: subscribers.size }));
  }

  private handleMessage(userId: string, data: string | ArrayBuffer) {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'subscribe':
        this.addSubscription(message.topic, userId);
        break;
      case 'unsubscribe':
        this.removeSubscription(message.topic, userId);
        break;
      case 'ping':
        this.connections.get(userId)?.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  private addSubscription(topic: string, userId: string) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(userId);
  }

  private removeSubscription(topic: string, userId: string) {
    this.subscriptions.get(topic)?.delete(userId);
  }

  private removeUserFromAllTopics(userId: string) {
    for (const subscribers of this.subscriptions.values()) {
      subscribers.delete(userId);
    }
  }
}
```

### Subscription Topics

| Topic Pattern | Description | Trigger |
|--------------|-------------|---------|
| `record:{workspaceId}:{objectId}` | Record changes | Create/Update/Delete mutations |
| `notification:{userId}` | User notifications | Notification created |
| `workflow:{workflowRunId}` | Workflow progress | Workflow step completed |
| `presence:{workspaceId}` | User presence | User activity |

### Worker Integration

```typescript
// In HTTP Worker - trigger broadcast after mutation
async function handleMutation(ctx: Context, mutation: MutationResult) {
  // Execute GraphQL mutation...
  const result = await executeMutation(mutation);

  // Broadcast to Durable Object
  const workspaceId = ctx.get('workspaceId');
  const doId = ctx.env.REALTIME_HUB.idFromName(workspaceId);
  const stub = ctx.env.REALTIME_HUB.get(doId);

  await stub.fetch('https://internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      topic: `record:${workspaceId}:${result.objectId}`,
      payload: result,
    }),
  });

  return result;
}
```

### Wrangler Configuration

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "REALTIME_HUB",
        "class_name": "WorkspaceRealtimeHub"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["WorkspaceRealtimeHub"]
    }
  ]
}
```

### Scalability Considerations

| Limit | Value | Mitigation |
|-------|-------|------------|
| Connections per DO | 32,768 | Shard by workspace (1 DO = 1 workspace) |
| Memory per DO | 128 MB | Minimal state, offload to KV if needed |
| CPU per request | 30s | WebSocket handlers are lightweight |
| Inactivity eviction | ~10s | Connections survive, state rehydrates |

### Estimated Effort

| Task | Duration |
|------|----------|
| Durable Object implementation | 3-4 days |
| WebSocket client integration | 2-3 days |
| Subscription topic design | 1-2 days |
| Integration testing | 2-3 days |
| **Total** | **8-12 days (Weeks 9-10)** |

---

## Alternatives Considered

### Alternative: Full Hono Rewrite

**Rejected because**: Would require rewriting 50+ NestJS modules and all business logic. Estimated 6+ months of work vs. 10 weeks for hybrid approach.

### Alternative: Keep PostgreSQL (Use Hyperdrive)

**Rejected because**: Cloudflare Hyperdrive adds latency to every DB call. D1 provides edge-local reads for better performance. Also doesn't address Redis/BullMQ dependencies.

### Alternative: Durable Objects for All State

**Rejected because**: Would require fundamental architecture redesign. D1 is sufficient for relational CRM data. Durable Objects are used specifically for real-time WebSocket subscriptions where they excel.

### Alternative: Polling Instead of WebSockets

**Rejected because**: Would degrade user experience. Twenty's current implementation uses subscriptions for instant updates. Polling would increase latency and server load.

### Alternative: Third-Party WebSocket Service (Pusher/Ably)

**Rejected because**: Adds external dependency and cost. Durable Objects are included in Workers pricing and provide native integration.

---

## Next Steps

1. **Phase 1 Design**: Generate data-model.md with complete entity migration specifications
2. **Contracts**: Define API contracts and wrangler.jsonc schema
3. **Quickstart**: Create local development setup guide
4. **Tasks**: Break down into implementable task list (Phase 2)
