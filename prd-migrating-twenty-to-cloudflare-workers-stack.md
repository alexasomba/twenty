# PRD: Migrating Twenty CRM to Cloudflare Workers Stack

## 1. Project Overview

### Objective
Port the Twenty CRM core (NestJS/TypeORM-based) to run natively on the Cloudflare `workerd` runtime, eliminating the need for Docker/VPS hosting. Replace PostgreSQL, Redis, and S3 with Cloudflare's serverless equivalents.

### Goal
Achieve a serverless, "zero-infrastructure" deployment using Cloudflare's global edge network, reducing operational overhead while maintaining full CRM functionality.

### Current Twenty Architecture
- **Backend**: NestJS with TypeORM + PostgreSQL (TypeORM migrations in `src/database/typeorm/core/migrations/`)
- **Frontend**: React 18 + Recoil (state management) + Emotion (styling)
- **Background Jobs**: Docker `twenty-worker` container with BullMQ
- **Storage**: File uploads via S3-compatible endpoint
- **Caching**: Redis for sessions and metadata caching

---

## 2. Infrastructure Requirements (The Stack)

Replace Twenty's standard Docker services with Cloudflare serverless bindings.

| Original Service | Cloudflare Replacement | Purpose | Key Details |
| --- | --- | --- | --- |
| PostgreSQL | **Cloudflare D1** | Serverless SQL database for CRM records | SQLite-compatible; supports foreign key constraints; includes Time Travel backups (30-day history) |
| Redis | **Cloudflare KV** | Global low-latency key-value store for sessions and caching | ~100ms latency worldwide; strong consistency; automatic geo-replication |
| S3 Storage | **Cloudflare R2** | S3-compatible object storage for file uploads and assets | Zero egress fees; 99.999999999% durability; S3 API compatible; supports custom domains & CORS |
| Background Workers (BullMQ) | **Cloudflare Queues** | Asynchronous task processing (email sync, CRM workflows, integrations) | Guaranteed delivery; message batching; configurable retry logic; dead-letter queues support |

---

## 3. Technical Specifications

### 3.1. Runtime Compatibility & Server Adapter

#### Wrangler Configuration (`wrangler.jsonc`)
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "twenty-crm-worker",
  "main": "src/worker.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "routes": [
    {
      "pattern": "api.yourdomain.com/*",
      "zone_name": "yourdomain.com"
    }
  ],
  "env": {
    "production": {
      "vars": {
        "SERVER_URL": "https://api.yourdomain.com",
        "FRONTEND_URL": "https://yourdomain.com",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

#### Key Requirements
- **Engine**: Use `wrangler.jsonc` (recommended over `.toml` as of v3.91.0) with `nodejs_compat` flag to support Twenty's Node.js dependencies (GraphQL Yoga, TypeORM, NestJS, Express).
- **Runtime Entry Point**: Create a `src/worker.ts` that wraps NestJS's HTTP adapter or use Hono as a thin routing layer delegating to NestJS modules.
- **Fetch Handler**: Workers invoke handlers with `fetch(request, env, ctx)` signature. NestJS requires adapter wrapper to intercept and forward HTTP requests:
  ```typescript
  export default {
    async fetch(request, env, ctx) {
      return handleNestJSRequest(request, env, ctx);
    }
  };
  ```
- **Memory & CPU Limits**: Workers Standard plan offers up to 300ms CPU per invocation; optimize NestJS module loading (lazy modules, tree-shaking) to meet edge latency budgets.
- **Execution Context**: Use `ctx.waitUntil()` for background tasks extending beyond response time.

---

### 3.2. Data Layer Migration: D1 + TypeORM

#### D1 Database Initialization
```bash
# Create D1 database
npx wrangler d1 create twenty-crm-prod

# Output:
# [[d1_databases]]
# binding = "DB"
# database_name = "twenty-crm-prod"
# database_id = "<UUID>"
# database_id_preview = "<UUID>"
```

#### Migration Path: PostgreSQL → SQLite (D1)

**Step 1: Export PostgreSQL Schema**
```bash
# Dump PostgreSQL to SQL
pg_dump --schema-only your_postgres_db > schema.sql

# Convert binary SQLite dump if needed
sqlite3 postgres_dump.sqlite3 .dump > schema.sql
```

**Step 2: Adapt TypeORM Entities**
Twenty uses TypeORM with entities in `packages/twenty-server/src/**/*.entity.ts`. Required changes:

| PostgreSQL | SQLite (D1) | Action |
| --- | --- | --- |
| `uuid` type | `TEXT PRIMARY KEY` | Map UUIDs as strings; keep UUID generation in application |
| `SERIAL` / `BIGSERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` | D1 auto-increments by default |
| `RETURNING *` clause | Not supported | Use `last_insert_rowid()` or `PRAGMA foreign_keys` |
| `JSONB` | `TEXT` (stored as JSON string) | Query with `json_extract()` function |
| Enums | `TEXT CHECK (...)` | Define check constraints inline |

**Step 3: D1 Migration Workflow**
```bash
# Create migration
npx wrangler d1 migrations create twenty-crm-prod add_workspace_tables

# Test locally first
npx wrangler d1 execute twenty-crm-prod --local --file=./migrations/001_schema.sql

# Deploy to production
npx wrangler d1 execute twenty-crm-prod --remote --file=./migrations/001_schema.sql
```

**Step 4: Data Import**
```bash
# Clean PostgreSQL dump (remove unsupported clauses)
sed -i '/BEGIN TRANSACTION/d; /COMMIT/d; /CREATE TABLE _cf_KV/,+3d' schema.sql

# Import to D1
npx wrangler d1 execute twenty-crm-prod --remote --file=./schema.sql
```

#### TypeORM Configuration for D1
```typescript
// src/database/typeorm/core/core.datasource.ts
export const dataSourceOptions: DataSourceOptions = {
  type: 'better-sqlite3', // or 'sqlite'
  database: ':memory:', // Use D1 binding in production
  entities: [/* ... entities */],
  migrations: ['src/database/typeorm/core/migrations/*{.ts,.js}'],
  migrationsRun: true,
  synchronize: false, // Always use migrations
  logging: ['error', 'warn'],
};

// In Worker context, override with D1:
const dbInstance = new DataSource({
  ...dataSourceOptions,
  database: 'file::memory:?cache=shared', // Or use D1 binding
});
```

#### Foreign Key Handling
- D1 enforces foreign key constraints by default (equivalent to `PRAGMA foreign_keys = ON`).
- During migrations with complex operations, use:
  ```sql
  PRAGMA defer_foreign_keys = true;
  -- ... migration steps ...
  PRAGMA defer_foreign_keys = false;
  ```

#### Database Backups & Point-in-Time Recovery
D1's **Time Travel** feature automatically captures backups every minute for 30 days:
```bash
# List backups
npx wrangler d1 backup list twenty-crm-prod

# Restore to a specific point
npx wrangler d1 restore twenty-crm-prod <backup-id>
```

---

### 3.3. Session & Cache Layer: KV

#### KV Namespace Setup
```jsonc
{
  "kv_namespaces": [
    {
      "binding": "SESSION_STORE",
      "id": "<NAMESPACE_ID>",
      "preview_id": "<PREVIEW_NAMESPACE_ID>"
    },
    {
      "binding": "CACHE_STORE",
      "id": "<CACHE_NAMESPACE_ID>",
      "preview_id": "<PREVIEW_CACHE_NAMESPACE_ID>"
    }
  ]
}
```

#### Session Storage Implementation
Replace Redis with KV for HTTP session tokens:
```typescript
// In NestJS auth module (guard or session service)
// Store session on login
await env.SESSION_STORE.put(
  `session:${token}`,
  JSON.stringify({
    userId,
    workspaceId,
    permissions: userPermissions,
    createdAt: Date.now(),
  }),
  { expirationTtl: 86400 } // 24-hour TTL
);

// Validate session on request
const sessionData = await env.SESSION_STORE.get(`session:${token}`);
if (!sessionData) {
  // Session expired or invalid
  throw new UnauthorizedException();
}
```

#### Metadata Caching Strategy
Twenty stores workspace metadata (custom fields, objects, permissions). Cache in KV to reduce D1 queries:
```typescript
const cacheKey = `workspace:${workspaceId}:metadata`;
let metadata = await env.CACHE_STORE.get(cacheKey);

if (!metadata) {
  // Fetch from D1
  metadata = await env.DB.prepare(
    `SELECT * FROM workspace_metadata WHERE workspace_id = ?`
  ).bind(workspaceId).first();

  // Cache for 1 hour
  await env.CACHE_STORE.put(
    cacheKey,
    JSON.stringify(metadata),
    { expirationTtl: 3600 }
  );
}
```

#### KV Performance Notes
- **Latency**: ~100ms global average; cache is eventually consistent (strong consistency within same region).
- **Throughput**: Millions of operations/day; suitable for session storage and frequently accessed data.

---

### 3.4. File Storage: R2

#### R2 Bucket Setup
```bash
# Create R2 bucket
npx wrangler r2 bucket create twenty-crm-files

# Wrangler configuration:
# [[r2_buckets]]
# binding = "FILES"
# bucket_name = "twenty-crm-files"
```

#### S3 API Compatibility (Drop-In Replacement)
Twenty's file upload logic can use AWS S3 SDK with R2 endpoint:
```typescript
// Update environment
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

// AWS SDK v3 configuration
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// Or use R2 binding directly in Worker (recommended):
const fileBuffer = await request.arrayBuffer();
await env.FILES.put(`uploads/${workspaceId}/${fileId}`, fileBuffer, {
  httpMetadata: {
    contentType: mimeType,
    contentDisposition: `attachment; filename="${fileName}"`,
  },
  customMetadata: {
    uploadedBy: userId,
    workspaceId,
  },
});
```

#### CORS Configuration for Frontend
Enable frontend to fetch files directly from R2:
```bash
# Configure CORS policy
npx wrangler r2 bucket cors-set twenty-crm-files --cors-config '[
  {
    "origin": "https://yourdomain.com",
    "allowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "allowedHeaders": ["Content-Type", "Authorization"],
    "exposeHeaders": ["ETag", "x-amz-meta-*"],
    "maxAgeSeconds": 3600
  }
]'
```

#### Pre-Signed URLs for Direct Upload
Generate pre-signed URLs for frontend to upload directly without proxying:
```typescript
// In NestJS controller
const presignedUrl = await generateR2PresignedUrl(
  env.FILES,
  `uploads/${workspaceId}/${fileId}`,
  { expirationTtl: 3600 } // 1-hour expiry
);

// Return to frontend; frontend uploads directly to R2
return { presignedUrl, uploadUrl: presignedUrl };
```

---

### 3.5. Background Tasks: Queues

Replace Twenty's Docker `twenty-worker` container (BullMQ) with Cloudflare Queues.

#### Wrangler Configuration
```jsonc
{
  "queues": {
    "producers": [
      {
        "binding": "EMAIL_QUEUE",
        "queue": "email-sync",
        "delivery_delay": 60
      },
      {
        "binding": "WORKFLOW_QUEUE",
        "queue": "crm-workflows"
      }
    ],
    "consumers": [
      {
        "queue": "email-sync",
        "max_batch_size": 10,
        "max_batch_timeout": 30,
        "max_retries": 5,
        "dead_letter_queue": "email-sync-dlq",
        "retry_delay": 120
      }
    ]
  }
}
```

#### Producer (Main NestJS Worker)
Enqueue email sync tasks:
```typescript
// In email sync service (NestJS)
async enqueueEmailSync(workspaceId: string, accountId: string) {
  await env.EMAIL_QUEUE.send({
    type: "sync_emails",
    workspaceId,
    accountId,
    timestamp: Date.now(),
    priority: "high",
  });
}
```

#### Consumer Worker
Dedicated Worker processes email sync batches:
```typescript
// consumer-worker.ts
export default {
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      const { type, workspaceId, accountId } = message.body;

      try {
        if (type === "sync_emails") {
          await syncEmails(env.DB, env.KV, workspaceId, accountId);
          message.ack(); // Mark as successfully processed
        }
      } catch (error) {
        console.error(`Failed to sync emails for ${workspaceId}:`, error);
        // Message will be retried automatically (max_retries: 5)
        // After max retries, sent to dead_letter_queue
      }
    }
  }
};
```

#### Retry & Dead-Letter Logic
- **Automatic Retries**: Messages failing processing are retried up to `max_retries` times with `retry_delay` between attempts.
- **Dead-Letter Queue**: After exhausting retries, messages move to `dead_letter_queue` for manual inspection and debugging.
- **Batching**: Consumer receives up to `max_batch_size` messages at once (10 in example); processes in parallel within a batch.

---

### 3.6. Build & Deployment

#### Monorepo Build Strategy (with Nx)
```bash
# 1. Build frontend React app
npx nx build twenty-front --configuration=production

# 2. Build NestJS backend + Worker adapter
npx nx build twenty-server --configuration=production

# 3. Build/bundle Worker entry point
npx nx build twenty-workers-adapter

# 4. Single deployment command
npx wrangler deploy
```

#### Frontend Deployment: Cloudflare Pages
Deploy React frontend via Pages (automatic Git integration):
```toml
# _routes.json (route static assets, delegate API to Worker)
[
  {
    "include": "/api/*",
    "method": ["GET", "POST", "PUT", "DELETE", "PATCH"],
    "route": "/api/*"
  },
  {
    "include": "/*",
    "method": ["GET"],
    "route": "/index.html" # SPA fallback
  }
]
```

#### Local Development
```bash
# Local development with D1, KV, R2 simulators (all in-memory)
npx wrangler dev --local

# Test against remote D1 (real production data) - use cautiously
npx wrangler dev --remote

# Watch mode for code changes
npx wrangler dev --watch
```

---

## 4. Functional Requirements for Developer

### 4.1. Environment & Secrets Management

**Secrets** (encrypted, only available at runtime):
```bash
# Set secrets for all environments
wrangler secret put JWT_SECRET
wrangler secret put DATABASE_PASSWORD
wrangler secret put R2_ACCESS_KEY_ID --env production
```

**Environment Variables** (plaintext, in `wrangler.jsonc`):
```jsonc
{
  "env": {
    "production": {
      "vars": {
        "SERVER_URL": "https://api.yourdomain.com",
        "FRONTEND_URL": "https://yourdomain.com",
        "LOG_LEVEL": "info",
        "ACCOUNT_ID": "abc123def456"
      }
    },
    "staging": {
      "vars": {
        "SERVER_URL": "https://staging-api.yourdomain.com",
        "FRONTEND_URL": "https://staging.yourdomain.com",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### 4.2. API Gateway & Custom Routing

**Custom Domain** (Cloudflare Workers custom domain):
```bash
# Deploy to custom domain (no DNS CNAME required)
npx wrangler deploy --name twenty-crm-worker

# Assign custom domain in Cloudflare dashboard or via API
# Workers → Settings → Custom Domains → Add Custom Domain
# Domain: api.yourdomain.com
```

**Monitoring & Logging**:
```bash
# Tail logs from deployed Worker in real-time
npx wrangler deployments tail

# View all recent deployments
npx wrangler deployments list
```

### 4.3. File Upload Workflow

1. **Frontend** requests a pre-signed R2 URL from NestJS endpoint
2. **NestJS** generates pre-signed URL via R2 binding
3. **Frontend** uploads directly to R2 (bypasses backend)
4. **NestJS** stores file metadata in D1 (size, MIME type, owner, workspace)
5. **KV** caches file metadata for quick access

### 4.4. Email Sync & Background Workflows

- **Replace** Docker `twenty-worker` with Cloudflare Queues consumer
- **NestJS producer** (main Worker) enqueues sync tasks → Queues batches → **Consumer Worker** processes
- **Workflow automation** (e.g., send email when deal closes) follows same producer/consumer pattern

### 4.5. Database Backups & Disaster Recovery

D1's **Time Travel** feature—restore database to any minute in last 30 days:
```bash
# List available backups
npx wrangler d1 backup list twenty-crm-prod

# Restore to specific point
npx wrangler d1 restore twenty-crm-prod <backup-id>

# Export current database for archival
npx wrangler d1 export twenty-crm-prod > backup-$(date +%s).sql
```

---

## 5. Implementation Roadmap

| Phase | Duration | Tasks | Deliverables |
| --- | --- | --- | --- |
| **Phase 1: Foundation** | Weeks 1–2 | 1. Create D1 database & import schema 2. Bind D1, KV, R2, Queues in wrangler.jsonc 3. Wrap NestJS in fetch handler; test locally | Working local environment; D1 schema validated |
| **Phase 2: Data Layer** | Weeks 3–4 | 1. Migrate TypeORM configs for D1 2. Validate all queries against SQLite 3. Integration tests vs. D1 | All queries passing; D1 compatibility confirmed |
| **Phase 3: Session & Caching** | Weeks 5–6 | 1. Implement KV session store 2. Add metadata caching 3. Load testing | KV throughput tested; cache hit rates monitored |
| **Phase 4: Storage & Queues** | Weeks 7–8 | 1. Integrate R2 file uploads 2. Implement Queues-based email sync 3. Dead-letter queue monitoring | File uploads working; email sync operational |
| **Phase 5: Deployment & Optimization** | Weeks 9–10 | 1. Deploy frontend to Pages 2. Deploy backend Worker globally 3. Performance profiling | Global deployment complete; latency optimized |

---

## 6. Success Metrics

| Metric | Target | Rationale |
| --- | --- | --- |
| **Global Response Time (p99)** | < 200ms | Edge execution eliminates round-trip to VPS; reduces latency globally |
| **Database Integrity** | 100% data preservation | Zero data loss during migration; validate schema parity |
| **Query Performance vs. PostgreSQL** | Within 20% | SQLite adequate for CRM use case; occasional query optimization needed |
| **Deployment Time** | < 2 minutes | Single `wrangler deploy` command; fast iteration |
| **Cost Reduction vs. VPS** | 60–70% lower | Serverless pricing model + zero egress fees (R2) |
| **Availability (Uptime)** | 99.99% | Cloudflare global network redundancy; automatic failover |
| **Cold Start Time** | < 1 second | Optimize NestJS module loading; lazy-load features |

---

## 7. Risk Mitigation

| Risk | Impact | Mitigation Strategy |
| --- | --- | --- |
| **SQLite query limits** | Medium | Profile queries early; avoid N+1 patterns; batch operations; use indexes |
| **Cold starts (first request latency)** | Medium | Enable Workers Unbound if needed; cache with KV; pre-warm critical paths |
| **Regional latency variability** | Low | D1 globally replicated; R2 edge-cached; KV geo-replicated |
| **Data migration issues** | High | Dry-run migrations on staging; validate schema parity; keep PostgreSQL backup for rollback |
| **TypeORM incompatibilities** | High | Early testing with D1; maintain compatibility layer if needed; unit test all query patterns |
| **Queues throughput bottleneck** | Medium | Monitor queue depth; scale consumer concurrency; adjust batch size |
| **R2 egress costs (if misconfigured)** | Low | R2 has zero egress within Cloudflare; ensure no external downloads |

---

## 8. Testing Strategy

- **Unit Tests**: Unchanged from Twenty codebase; run against local D1 with `wrangler dev --local`
- **Integration Tests**: Deploy to staging environment; test against remote D1 in isolation
- **Load Testing**: Verify Queues throughput (messages/sec), KV cache hit rates, D1 concurrent connection limits
- **E2E Tests**: Use Playwright against deployed Worker + Pages frontend; test critical CRM workflows
- **Backup & Recovery**: Test D1 Time Travel restore; validate data integrity post-restore

---

## 9. Next Steps

1. **Week 1**: Schedule kick-off; assign developer lead; begin D1 schema validation
2. **Week 2**: Set up GitHub Actions CI/CD for automated `wrangler deploy`
3. **Week 3**: Begin TypeORM migration; run first D1 integration tests
4. **Week 4–10**: Execute phases 2–5 per roadmap; weekly sync with stakeholders
5. **Week 11+**: Post-launch monitoring; performance tuning; document runbook for ops team
