# API Contracts: Migrate Twenty CRM to Cloudflare Workers Stack

**Branch**: `001-cloudflare-workers-migration`
**Date**: 2026-01-08

## Overview

This document defines API contracts, configuration schemas, and interface definitions for the Cloudflare Workers migration.

---

## Wrangler Configuration Schema

### Main Worker (`packages/twenty-server/wrangler.jsonc`)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "twenty-crm-api",
  "main": "dist/worker.js",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,

  // D1 Database Bindings
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "twenty-crm-core",
      "database_id": "${D1_DATABASE_ID}"
    }
  ],

  // KV Namespace Bindings
  "kv_namespaces": [
    {
      "binding": "CACHE_STORE",
      "id": "${KV_CACHE_NAMESPACE_ID}",
      "preview_id": "${KV_CACHE_PREVIEW_ID}"
    },
    {
      "binding": "SESSION_STORE",
      "id": "${KV_SESSION_NAMESPACE_ID}",
      "preview_id": "${KV_SESSION_PREVIEW_ID}"
    }
  ],

  // R2 Bucket Bindings
  "r2_buckets": [
    {
      "binding": "FILES",
      "bucket_name": "twenty-crm-files"
    }
  ],

  // Queue Producer Bindings
  "queues": {
    "producers": [
      {
        "binding": "CRITICAL_QUEUE",
        "queue": "twenty-critical"
      },
      {
        "binding": "WORKFLOW_QUEUE",
        "queue": "twenty-workflow"
      },
      {
        "binding": "MESSAGING_QUEUE",
        "queue": "twenty-messaging"
      },
      {
        "binding": "BACKGROUND_QUEUE",
        "queue": "twenty-background"
      }
    ]
  },

  // Durable Objects for Real-Time
  "durable_objects": {
    "bindings": [
      {
        "name": "REALTIME_HUB",
        "class_name": "WorkspaceRealtimeHub"
      }
    ]
  },

  // Durable Object Migrations
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["WorkspaceRealtimeHub"]
    }
  ],

  // Scheduled Triggers (Cron Jobs)
  "triggers": {
    "crons": [
      "*/1 * * * *",
      "*/5 * * * *",
      "0 * * * *"
    ]
  },

  // Environment Variables
  "vars": {
    "ENVIRONMENT": "production",
    "LOG_LEVEL": "info"
  },

  // Environment-specific overrides
  "env": {
    "production": {
      "routes": [
        {
          "pattern": "api.twenty.com/*",
          "zone_name": "twenty.com"
        }
      ],
      "vars": {
        "SERVER_URL": "https://api.twenty.com",
        "FRONTEND_URL": "https://app.twenty.com"
      }
    },
    "staging": {
      "vars": {
        "SERVER_URL": "https://staging-api.twenty.com",
        "FRONTEND_URL": "https://staging.twenty.com",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Queue Consumer Worker (`packages/twenty-worker/wrangler.jsonc`)

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "twenty-crm-worker",
  "main": "dist/consumer.js",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],

  // Shared bindings (same as main worker)
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "twenty-crm-core",
      "database_id": "${D1_DATABASE_ID}"
    }
  ],

  "kv_namespaces": [
    {
      "binding": "CACHE_STORE",
      "id": "${KV_CACHE_NAMESPACE_ID}"
    }
  ],

  "r2_buckets": [
    {
      "binding": "FILES",
      "bucket_name": "twenty-crm-files"
    }
  ],

  // Queue Consumer Configuration
  "queues": {
    "consumers": [
      {
        "queue": "twenty-critical",
        "max_batch_size": 5,
        "max_batch_timeout": 10,
        "max_retries": 5,
        "dead_letter_queue": "twenty-dlq",
        "retry_delay": 60
      },
      {
        "queue": "twenty-workflow",
        "max_batch_size": 10,
        "max_batch_timeout": 30,
        "max_retries": 3,
        "dead_letter_queue": "twenty-dlq",
        "retry_delay": 120
      },
      {
        "queue": "twenty-messaging",
        "max_batch_size": 20,
        "max_batch_timeout": 30,
        "max_retries": 5,
        "dead_letter_queue": "twenty-dlq",
        "retry_delay": 300
      },
      {
        "queue": "twenty-background",
        "max_batch_size": 50,
        "max_batch_timeout": 60,
        "max_retries": 3,
        "dead_letter_queue": "twenty-dlq"
      }
    ]
  }
}
```

---

## Environment Variables / Secrets

### Required Secrets (via `wrangler secret put`)

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `JWT_SECRET` | JWT signing key | Random 256-bit key |
| `JWT_REFRESH_SECRET` | Refresh token signing key | Random 256-bit key |
| `ENCRYPTION_KEY` | Data encryption key | Random 256-bit key |
| `R2_ACCESS_KEY_ID` | R2 S3 API access key | Cloudflare R2 credentials |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API secret | Cloudflare R2 credentials |

### Environment Variables

| Variable | Production | Staging | Description |
|----------|------------|---------|-------------|
| `ENVIRONMENT` | `production` | `staging` | Deployment environment |
| `SERVER_URL` | `https://api.twenty.com` | `https://staging-api.twenty.com` | API base URL |
| `FRONTEND_URL` | `https://app.twenty.com` | `https://staging.twenty.com` | Frontend URL for CORS |
| `LOG_LEVEL` | `info` | `debug` | Logging verbosity |
| `ACCOUNT_ID` | `{cf_account_id}` | `{cf_account_id}` | Cloudflare account ID |

---

## TypeScript Interfaces

### Worker Environment Types

```typescript
// packages/twenty-server/src/types/worker-env.ts

export interface WorkerEnv {
  // D1 Database
  DB: D1Database;

  // KV Namespaces
  CACHE_STORE: KVNamespace;
  SESSION_STORE: KVNamespace;

  // R2 Bucket
  FILES: R2Bucket;

  // Queue Producers
  CRITICAL_QUEUE: Queue;
  WORKFLOW_QUEUE: Queue;
  MESSAGING_QUEUE: Queue;
  BACKGROUND_QUEUE: Queue;

  // Durable Objects
  REALTIME_HUB: DurableObjectNamespace;

  // Environment variables
  ENVIRONMENT: string;
  SERVER_URL: string;
  FRONTEND_URL: string;
  LOG_LEVEL: string;

  // Secrets
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  ENCRYPTION_KEY: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
```

### Durable Object Types

```typescript
// packages/twenty-server/src/types/realtime.ts

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'subscription';
  topic?: string;
  data?: unknown;
}

export interface BroadcastRequest {
  topic: string;
  payload: unknown;
}

export interface SubscriptionTopics {
  // Record change events
  record: `record:${string}:${string}`; // record:{workspaceId}:{objectMetadataId}

  // User notifications
  notification: `notification:${string}`; // notification:{userId}

  // Workflow execution updates
  workflow: `workflow:${string}`; // workflow:{workflowRunId}

  // User presence in workspace
  presence: `presence:${string}`; // presence:{workspaceId}
}

// Helper to create topic strings
export const Topics = {
  record: (workspaceId: string, objectId: string) =>
    `record:${workspaceId}:${objectId}` as const,
  notification: (userId: string) =>
    `notification:${userId}` as const,
  workflow: (workflowRunId: string) =>
    `workflow:${workflowRunId}` as const,
  presence: (workspaceId: string) =>
    `presence:${workspaceId}` as const,
} as const;
```

### Queue Message Types

```typescript
// packages/twenty-shared/src/types/queue-messages.ts

export type QueueMessageType =
  | 'EMAIL_SYNC'
  | 'CALENDAR_SYNC'
  | 'WORKFLOW_RUN'
  | 'WEBHOOK_SEND'
  | 'BILLING_SYNC'
  | 'ENTITY_EVENT'
  | 'CLEANUP_TASK';

export interface QueueMessage<T = unknown> {
  type: QueueMessageType;
  workspaceId: string;
  payload: T;
  metadata: {
    timestamp: string;
    correlationId: string;
    priority?: 'critical' | 'high' | 'normal' | 'low';
    attemptNumber?: number;
  };
}

// Specific message payloads
export interface EmailSyncPayload {
  accountId: string;
  syncType: 'full' | 'incremental';
  cursor?: string;
}

export interface WorkflowRunPayload {
  workflowId: string;
  versionId: string;
  triggerId: string;
  input: Record<string, unknown>;
}

export interface WebhookSendPayload {
  webhookId: string;
  eventType: string;
  data: Record<string, unknown>;
  retryCount: number;
}

export interface EntityEventPayload {
  objectMetadataId: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
```

### Cache Key Patterns

```typescript
// packages/twenty-server/src/types/cache-keys.ts

export const CacheKeys = {
  // Workspace metadata cache
  workspaceMetadata: (workspaceId: string) =>
    `workspace:${workspaceId}:metadata`,

  // User permissions cache
  userPermissions: (workspaceId: string, userId: string) =>
    `workspace:${workspaceId}:user:${userId}:permissions`,

  // Object metadata cache
  objectMetadata: (workspaceId: string, objectName: string) =>
    `workspace:${workspaceId}:object:${objectName}`,

  // Custom fields cache
  customFields: (workspaceId: string) =>
    `workspace:${workspaceId}:custom-fields`,

  // Rate limiting
  rateLimit: (workspaceId: string, endpoint: string) =>
    `ratelimit:${workspaceId}:${endpoint}`,
} as const;

export const CacheTTL = {
  METADATA: 3600,      // 1 hour
  PERMISSIONS: 300,    // 5 minutes
  RATE_LIMIT: 60,      // 1 minute
} as const;
```

---

## GraphQL Schema Notes

### No Breaking Changes Expected

The GraphQL schema exposed to clients remains unchanged. The migration affects:

1. **Resolvers**: Backend data fetching logic (TypeORM queries)
2. **Subscriptions**: May require Durable Objects for real-time (future phase)
3. **File uploads**: Mutation handlers switch to R2

### GraphQL Yoga Worker Integration

```typescript
// packages/twenty-server/src/graphql/yoga-worker.ts

import { createYoga } from 'graphql-yoga';
import { schema } from './schema';

export const createGraphQLHandler = (env: WorkerEnv) => {
  return createYoga({
    schema,
    context: async ({ request }) => {
      // Build context with D1, KV, R2 bindings
      return {
        db: env.DB,
        cache: env.CACHE_STORE,
        files: env.FILES,
        queues: {
          critical: env.CRITICAL_QUEUE,
          workflow: env.WORKFLOW_QUEUE,
          messaging: env.MESSAGING_QUEUE,
          background: env.BACKGROUND_QUEUE,
        },
        // ... auth context from JWT
      };
    },
    graphqlEndpoint: '/graphql',
    landingPage: false,
  });
};
```

---

## REST Endpoints

### Health Check

```typescript
// GET /health
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  services: {
    database: 'up' | 'down';
    cache: 'up' | 'down';
    storage: 'up' | 'down';
    queues: 'up' | 'down';
  };
}
```

### File Operations

```typescript
// POST /files/upload-url
// Request
interface UploadUrlRequest {
  workspaceId: string;
  filename: string;
  contentType: string;
  folder: 'attachment' | 'profile-picture' | 'workspace-logo' | ...;
}

// Response
interface UploadUrlResponse {
  uploadUrl: string;  // Pre-signed R2 URL
  fileKey: string;    // Storage path
  expiresAt: string;  // ISO timestamp
}

// GET /files/:fileKey
// Returns file content or redirect to R2 URL
```

---

## Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable code
    message: string;        // Human-readable message
    details?: unknown;      // Additional context
    requestId: string;      // Correlation ID
  };
}

// Standard error codes
const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
```

---

## Migration Compatibility Notes

### Frontend Changes Required

| Change | Description | Impact |
|--------|-------------|--------|
| API URL | Update `SERVER_URL` env var | Configuration only |
| CORS | Workers handle CORS headers | Automatic |
| Auth | JWT tokens unchanged | None |
| GraphQL | Schema unchanged | None |
| File uploads | Same presigned URL pattern | None |

### Backend API Compatibility

- **GraphQL queries**: 100% compatible (same schema)
- **GraphQL mutations**: 100% compatible (same schema)
- **REST endpoints**: 100% compatible (same paths)
- **Auth flows**: 100% compatible (JWT-based)
- **Webhooks**: 100% compatible (same payload format)

---

## Monitoring & Observability

### Structured Log Format

```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  requestId: string;
  workspaceId?: string;
  userId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}
```

### Metrics (Cloudflare Analytics)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `request_count` | Total requests | - |
| `request_latency_p99` | 99th percentile latency | > 200ms |
| `error_rate` | 5xx responses / total | > 1% |
| `queue_depth` | Messages in queue | > 1000 |
| `cache_hit_rate` | KV cache hits | < 80% |
