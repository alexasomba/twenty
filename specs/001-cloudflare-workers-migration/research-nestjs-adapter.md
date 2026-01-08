# Research Task 2: NestJS Worker Adapter Pattern

**Date**: 2026-01-08 | **Task**: Research Task 2 from plan.md
**Scope**: Analyze NestJS bootstrap pattern and evaluate adapter approaches for Cloudflare Workers

---

## Executive Summary

Running NestJS on Cloudflare Workers presents significant architectural challenges due to NestJS's Express-based HTTP adapter and Node.js dependencies. The **recommended approach** is a **Hybrid Adapter Strategy**: use Hono as the edge routing layer that delegates GraphQL requests to a NestJS-powered GraphQL Yoga handler, while progressively migrating non-GraphQL routes to native Hono handlers.

**Key Finding**: Twenty already uses GraphQL Yoga (`@graphql-yoga/nestjs`), which has first-class Cloudflare Workers support. This significantly simplifies the GraphQL migration path.

---

## 1. Current Bootstrap Pattern Analysis

### 1.1 Main Entry Point

**File**: [packages/twenty-server/src/main.ts](../../packages/twenty-server/src/main.ts)

```typescript
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import fs from 'fs';
import session from 'express-session';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

const bootstrap = async () => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
    bufferLogs: process.env.LOGGER_IS_BUFFER_ENABLED === 'true',
    rawBody: true,
    snapshot: process.env.NODE_ENV === NodeEnvironment.DEVELOPMENT,
    // SSL configuration using fs.readFileSync() - Node.js specific
    ...(process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH
      ? {
          httpsOptions: {
            key: fs.readFileSync(process.env.SSL_KEY_PATH),
            cert: fs.readFileSync(process.env.SSL_CERT_PATH),
          },
        }
      : {}),
  });

  // Express-specific middleware
  app.use(session(getSessionStorageOptions(twentyConfigService)));
  app.use('/graphql', graphqlUploadExpress({ ... }));
  app.use('/metadata', graphqlUploadExpress({ ... }));

  await app.listen(twentyConfigService.get('NODE_PORT'));
};
```

**Key Observations**:
| Component | Workers Compatibility | Notes |
|-----------|----------------------|-------|
| `NestFactory.create` with Express | ❌ Not compatible | Express relies on Node.js HTTP module |
| `fs.readFileSync` for SSL | ❌ Not available | Cloudflare handles SSL automatically |
| `express-session` middleware | ❌ Requires Redis | Replace with KV-based sessions |
| `graphql-upload` middleware | ❌ Express-specific | Replace with R2 multipart upload |
| `app.listen()` pattern | ❌ Not applicable | Workers use `fetch()` handler |

### 1.2 Queue Worker Entry Point

**File**: [packages/twenty-server/src/queue-worker/queue-worker.ts](../../packages/twenty-server/src/queue-worker/queue-worker.ts)

```typescript
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(QueueWorkerModule, {
    bufferLogs: process.env.LOGGER_IS_BUFFER_ENABLED === 'true',
  });
  // No HTTP server - just application context for DI
}
```

**Key Observation**: Uses `createApplicationContext` without HTTP server - this pattern is more adaptable for Cloudflare Queues since it only needs the DI container.

### 1.3 GraphQL Configuration

**File**: [packages/twenty-server/src/engine/api/graphql/graphql-config/graphql-config.service.ts](../../packages/twenty-server/src/engine/api/graphql/graphql-config/graphql-config.service.ts)

```typescript
import { YogaDriver, type YogaDriverConfig } from '@graphql-yoga/nestjs';

@Injectable()
export class GraphQLConfigService implements GqlOptionsFactory<YogaDriverConfig<'express'>> {
  createGqlOptions(): YogaDriverConfig {
    const plugins = [
      useGraphQLErrorHandlerHook({ ... }),
      useDisableIntrospectionAndSuggestionsForUnauthenticatedUsers(...),
      useValidateGraphqlQueryComplexity({ ... }),
    ];

    if (Sentry.isInitialized()) {
      plugins.push(useSentryTracing());
    }

    return {
      autoSchemaFile: true,
      include: [CoreEngineModule],
      // Dynamic schema per workspace - critical feature
      conditionalSchema: async (context) => {
        const { workspace } = context.req;
        return await this.createSchema(context, workspace);
      },
      plugins,
    };
  }
}
```

**Critical Finding**: ✅ **GraphQL Yoga is already in use!** This is excellent news because:
- Yoga natively supports Cloudflare Workers via fetch handler
- The existing Yoga plugins can be directly ported
- Dynamic schema per workspace pattern is supported

### 1.4 App Module Middleware Configuration

**File**: [packages/twenty-server/src/app.module.ts](../../packages/twenty-server/src/app.module.ts)

```typescript
@Module({
  imports: [
    GraphQLModule.forRootAsync<YogaDriverConfig>({
      driver: YogaDriver,
      imports: [GraphQLConfigModule, MetricsModule, DataloaderModule],
      useClass: GraphQLConfigService,
    }),
    // ... 20+ module imports
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(GraphQLHydrateRequestFromTokenMiddleware)
      .forRoutes({ path: 'graphql', method: RequestMethod.ALL });

    consumer
      .apply(GraphQLHydrateRequestFromTokenMiddleware)
      .forRoutes({ path: 'metadata', method: RequestMethod.ALL });

    for (const method of MIGRATED_REST_METHODS) {
      consumer
        .apply(RestCoreMiddleware)
        .forRoutes({ path: 'rest/*path', method });
    }
  }
}
```

**Middleware to Port**:
| Middleware | Function | Workers Compatibility |
|------------|----------|----------------------|
| `GraphQLHydrateRequestFromTokenMiddleware` | JWT validation, workspace context | ✅ Portable (uses crypto) |
| `RestCoreMiddleware` | REST API request handling | ✅ Portable |

---

## 2. Node.js-Specific Dependencies

### 2.1 Critical Blockers (Require Replacement)

| Module | Files Using | Workers Status | Migration Strategy |
|--------|-------------|----------------|-------------------|
| `fs` / `fs/promises` | main.ts, s3.driver.ts, dev-seeder, add-packages.command | ❌ Not available | Remove SSL (CF handles), use R2 for files |
| `child_process` | add-packages.command.ts | ❌ Not available | Move to build time or disable |
| `stream` | storage drivers, file handling | ⚠️ Limited | Use Web Streams API |
| `express-session` | main.ts | ❌ Express-specific | Replace with KV sessions |
| `graphql-upload` | main.ts | ❌ Express-specific | Replace with R2 upload |

### 2.2 Crypto Usage (Works with Web Crypto API)

**Files using Node.js `crypto`** (12+ files):
- `session-storage.module-factory.ts`: `createHash()`
- `workspace-cache-storage.service.ts`: `crypto`
- `workspace-invitation.service.ts`: `crypto`
- `auth.service.ts`: `crypto`, `randomUUID`
- `reset-password.service.ts`: `crypto`
- `user.resolver.ts`: `crypto`
- `postgres-credentials.service.ts`: `randomBytes`
- `cloudflare-secret.guard.ts`: `timingSafeEqual`
- `create-deterministic-uuid.util.ts`: `createHash`
- `use-cached-metadata.ts`: `createHash`

**Migration Pattern**:
```typescript
// Before (Node.js)
import { createHash, randomBytes } from 'crypto';
const hash = createHash('sha256').update(data).digest('hex');
const random = randomBytes(32).toString('hex');

// After (Workers with Web Crypto)
const encoder = new TextEncoder();
const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
const hash = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0')).join('');
const random = Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(b => b.toString(16).padStart(2, '0')).join('');
```

**Note**: With `nodejs_compat` flag, many Node.js crypto functions work in Workers.

### 2.3 Guards and Interceptors

**File**: [packages/twenty-server/src/engine/guards/](../../packages/twenty-server/src/engine/guards/)

| Guard | Dependencies | Workers Compatibility |
|-------|--------------|----------------------|
| `JwtAuthGuard` | `jsonwebtoken` | ✅ Works with `nodejs_compat` |
| `WorkspaceAuthGuard` | Request context | ✅ Portable |
| `FeatureFlagGuard` | DB query | ✅ Portable with D1 |
| `CloudflareSecretGuard` | `timingSafeEqual` | ✅ Works with `nodejs_compat` |
| `AdminPanelGuard` | User role check | ✅ Portable |
| `SettingsPermissionGuard` | Workspace context | ✅ Portable |

**Finding**: All guards can be ported as Hono middleware with minimal changes.

---

## 3. Adapter Approach Evaluation

### 3.1 Option A: Direct NestJS Fetch Handler Wrapper

**Concept**: Wrap entire NestJS app in Worker fetch handler.

```typescript
// Theoretical approach
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = await getNestApp(); // Cached NestJS instance
    const expressReq = convertToExpress(request);
    const expressRes = new MockResponse();
    await app.getHttpAdapter().getInstance()(expressReq, expressRes);
    return expressRes.toFetchResponse();
  }
}
```

**Evaluation**:
| Factor | Rating | Notes |
|--------|--------|-------|
| Code changes required | ✅ Low | Minimal changes to existing code |
| Workers compatibility | ❌ Poor | Express adapter has deep Node.js dependencies |
| Cold start performance | ❌ Poor | Full NestJS bootstrap: 2-5 seconds |
| Maintenance burden | ⚠️ Medium | Custom adapter code to maintain |
| Community support | ❌ None | No official NestJS Worker adapter |

**Verdict**: ❌ **Not Recommended** - Express adapter's Node.js dependencies make this impractical.

### 3.2 Option B: Hono as Routing Layer with NestJS Service Extraction

**Concept**: Use Hono for edge routing, extract NestJS services for business logic.

```typescript
// worker.ts
import { Hono } from 'hono';
import { createYoga } from 'graphql-yoga';

const app = new Hono<{ Bindings: Env }>();

// Auth middleware (ported from NestJS)
app.use('*', authMiddleware);

// GraphQL using standalone Yoga (extracted from NestJS)
app.all('/graphql', async (c) => {
  const yoga = createYoga({
    schema: await getWorkspaceSchema(c.env.DB, c.get('workspace')),
    context: () => ({ db: c.env.DB, cache: c.env.CACHE }),
  });
  return yoga.fetch(c.req.raw, c.env, c.executionCtx);
});

// REST routes (migrated to Hono)
app.route('/rest', restRouter);

export default app;
```

**Evaluation**:
| Factor | Rating | Notes |
|--------|--------|-------|
| Code changes required | ⚠️ Medium | Extract services, port middleware |
| Workers compatibility | ✅ Excellent | Hono is Workers-native |
| Cold start performance | ✅ Excellent | ~10-50ms cold start |
| Maintenance burden | ⚠️ Medium | Two systems during migration |
| Community support | ✅ Good | Hono has strong Workers community |

**Verdict**: ✅ **Recommended** - Best balance of compatibility and performance.

### 3.3 Option C: Complete Hono Rewrite

**Concept**: Rewrite entire backend using Hono with manual dependency injection.

```typescript
// Full Hono application
const app = new Hono<{ Bindings: Env; Variables: Context }>();

app.use('*', async (c, next) => {
  c.set('workspaceService', new WorkspaceService(c.env.DB));
  c.set('userService', new UserService(c.env.DB));
  await next();
});

// All routes reimplemented from scratch
app.route('/graphql', graphqlRouter);
app.route('/rest', restRouter);
app.route('/api', apiRouter);
```

**Evaluation**:
| Factor | Rating | Notes |
|--------|--------|-------|
| Code changes required | ❌ High | ~50 modules, ~100 entities to rewrite |
| Workers compatibility | ✅ Excellent | Pure Workers-native |
| Cold start performance | ✅ Excellent | Optimal performance |
| Maintenance burden | ⚠️ High initially | Clean long-term |
| Community support | ✅ Good | Hono ecosystem |

**Verdict**: ❌ **Not Recommended** - 6-12 month timeline, excessive effort for marginal gains over Option B.

---

## 4. Recommended Architecture: Hybrid Adapter Strategy

### 4.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                     Hono Router                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │  │
│  │  │  /rest   │  │   /api   │  │     /graphql       │   │  │
│  │  │  (Hono)  │  │  (Hono)  │  │  (GraphQL Yoga)    │   │  │
│  │  └────┬─────┘  └────┬─────┘  └─────────┬──────────┘   │  │
│  │       │             │                  │               │  │
│  │  ┌────┴─────────────┴──────────────────┴────────────┐ │  │
│  │  │              Service Layer                        │ │  │
│  │  │  ┌────────────┐ ┌──────────┐ ┌─────────────────┐  │ │  │
│  │  │  │ D1 ORM    │ │ KV Cache │ │ R2 Storage      │  │ │  │
│  │  │  │ (TypeORM) │ │          │ │ (S3-compatible) │  │ │  │
│  │  │  └────────────┘ └──────────┘ └─────────────────┘  │ │  │
│  │  └───────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Queue Consumer                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  async queue(batch: MessageBatch) {                    │  │
│  │    for (const msg of batch.messages) {                │  │
│  │      await jobProcessors[msg.type](msg.data, env);    │  │
│  │    }                                                   │  │
│  │  }                                                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Implementation Phases

**Phase 1: Foundation (Weeks 1-2)**
1. Create minimal Hono worker with D1 connection
2. Extract GraphQL Yoga as standalone (without NestJS driver)
3. Port auth middleware to Hono

**Phase 2: GraphQL Migration (Weeks 3-4)**
1. Port `GraphQLConfigService` schema generation
2. Implement workspace schema caching in KV
3. Port Yoga plugins (error handling, complexity)

**Phase 3: Service Extraction (Weeks 5-6)**
1. Create interface-based service layer
2. Implement D1 repositories
3. Port guards as Hono middleware

**Phase 4: REST & Queue (Weeks 7-8)**
1. Migrate REST endpoints to Hono
2. Convert BullMQ jobs to Queues handlers
3. Port background job processors

### 4.3 Worker Entry Point Structure

**File**: `packages/twenty-server/src/worker.ts` (NEW)

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createYoga } from 'graphql-yoga';

type Bindings = {
  DB: D1Database;
  CACHE: KVNamespace;
  STORAGE: R2Bucket;
  QUEUE: Queue;
  APP_SECRET: string;
  JWT_SECRET: string;
};

type Variables = {
  workspace: Workspace | null;
  user: User | null;
  requestId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global middleware
app.use('*', cors());
app.use('*', requestIdMiddleware);
app.use('*', authMiddleware); // Ported from NestJS

// GraphQL endpoint
app.all('/graphql', async (c) => {
  const yoga = await createWorkspaceYoga(c.env, c.get('workspace'));
  return yoga.fetch(c.req.raw, c.env, c.executionCtx);
});

// Metadata GraphQL endpoint
app.all('/metadata', async (c) => {
  const yoga = await createMetadataYoga(c.env, c.get('workspace'));
  return yoga.fetch(c.req.raw, c.env, c.executionCtx);
});

// REST API
app.route('/rest', restRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default {
  fetch: app.fetch,

  // Queue consumer
  async queue(batch: MessageBatch<JobMessage>, env: Bindings): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processJob(message.body, env);
        message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },
};
```

---

## 5. GraphQL Yoga Workers Integration

### 5.1 Current NestJS Integration

```typescript
// Current: Using @graphql-yoga/nestjs driver
GraphQLModule.forRootAsync<YogaDriverConfig>({
  driver: YogaDriver,
  useClass: GraphQLConfigService,
}),
```

### 5.2 Standalone Workers Integration

```typescript
// Extracted: Standalone Yoga for Workers
import { createYoga, createSchema } from 'graphql-yoga';
import { buildWorkspaceSchema } from './schema';

export async function createWorkspaceYoga(env: Bindings, workspace: Workspace) {
  // Cache schema in KV for performance
  const cacheKey = `schema:${workspace.id}:${workspace.metadataVersion}`;
  let schema = await env.CACHE.get(cacheKey, 'json');

  if (!schema) {
    schema = await buildWorkspaceSchema(env.DB, workspace);
    await env.CACHE.put(cacheKey, JSON.stringify(schema), { expirationTtl: 3600 });
  }

  return createYoga({
    schema,
    graphqlEndpoint: '/graphql',
    context: async ({ request }) => ({
      db: env.DB,
      cache: env.CACHE,
      storage: env.STORAGE,
      workspace,
    }),
    plugins: [
      // Port existing plugins
      useGraphQLErrorHandler(),
      useQueryComplexityValidation({ maxFields: 500, maxRootResolvers: 50 }),
    ],
  });
}
```

### 5.3 Yoga Workers Documentation

From [GraphQL Yoga Cloudflare Workers docs](https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-cloudflare-workers):

```typescript
// Yoga is built on WHATWG Fetch API - native Workers support
import { createYoga } from 'graphql-yoga';

const yoga = createYoga({ schema });

export default {
  fetch: yoga.fetch  // Direct export as fetch handler
};
```

---

## 6. Existing Edge-Compatible Patterns in Codebase

### 6.1 Storage Driver Interface

**File**: [packages/twenty-server/src/engine/core-modules/file-storage/drivers/interfaces/storage-driver.interface.ts](../../packages/twenty-server/src/engine/core-modules/file-storage/drivers/interfaces/storage-driver.interface.ts)

```typescript
export interface StorageDriver {
  delete(params: { folderPath: string; filename?: string }): Promise<void>;
  read(params: { folderPath: string; filename: string }): Promise<Readable>;
  write(params: { file: Buffer; name: string; folder: string; mimeType?: string }): Promise<void>;
  move(params: { from: PathSpec; to: PathSpec }): Promise<void>;
  copy(params: { from: PathSpec; to: PathSpec }): Promise<void>;
  checkFileExists(params: { folderPath: string; filename: string }): Promise<boolean>;
}
```

**Migration**: Create `R2StorageDriver` implementing this interface. R2 is S3-compatible, so existing `S3Driver` can largely be reused.

### 6.2 Message Queue Abstraction

**File**: `packages/twenty-server/src/engine/core-modules/message-queue/drivers/`

```typescript
// Existing interface
export interface MessageQueueDriver {
  register(queueName: MessageQueue): void;
  work<T>(queueName: MessageQueue, handler: Handler<T>): Promise<void>;
  add<T>(queueName: MessageQueue, data: T, options?: QueueJobOptions): Promise<void>;
  addCron<T>(options: QueueCronJobOptions): Promise<void>;
}

// Existing implementations
// - bullmq.driver.ts (BullMQ/Redis)
// - sync.driver.ts (synchronous for testing)
```

**Migration**: Create `CloudflareQueuesDriver` implementing this interface.

### 6.3 Cache Storage Service

**File**: `packages/twenty-server/src/engine/workspace-cache-storage/`

Existing abstraction allows swapping cache implementations:
```typescript
// Can implement KV-based cache behind same interface
export class WorkspaceCacheStorageService {
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, value: T, ttl?: number): Promise<void>;
  async delete(key: string): Promise<void>;
}
```

---

## 7. Dependencies Compatibility Matrix

### 7.1 Must Replace

| Dependency | Version | Reason | Replacement |
|------------|---------|--------|-------------|
| `@nestjs/platform-express` | 11.1.9 | Node.js HTTP server | Hono |
| `express-session` | 1.18.2 | Express middleware | KV sessions |
| `connect-redis` | 7.1.1 | Redis sessions | KV sessions |
| `bullmq` | 5.40.0 | Redis queues | Cloudflare Queues |
| `ioredis` | 5.6.0 | Redis client | KV bindings |
| `graphql-upload` | 16.0.2 | Express file upload | R2 multipart |
| `bcrypt` | 5.1.1 | Native bindings | `bcryptjs` |

### 7.2 Works with `nodejs_compat`

| Dependency | Version | Notes |
|------------|---------|-------|
| `jsonwebtoken` | 9.0.2 | JWT signing/verification |
| `class-validator` | 0.14.0 | DTO validation |
| `class-transformer` | 0.5.1 | Object transformation |
| `graphql` | 16.8.1 | GraphQL execution |
| `graphql-yoga` | 4.0.5 | Native Workers support |
| `@aws-sdk/client-s3` | 3.825.0 | R2 is S3-compatible |
| `date-fns` | 2.30.0 | Date utilities |
| `lodash.*` | various | Utility functions |
| `uuid` | various | UUID generation |

### 7.3 Needs Testing

| Dependency | Version | Concern |
|------------|---------|---------|
| `typeorm` | 0.3.x | D1 SQLite driver compatibility |
| `passport` | 0.7.0 | Some strategies may fail |
| `nodemailer` | 7.0.11 | May need Workers-compatible SMTP |
| `imapflow` | 1.2.1 | IMAP client - needs sockets |

---

## 8. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| NestJS cold start exceeds 1s | High | High | Use Hono as edge layer, not NestJS |
| Guards/interceptors don't port cleanly | Medium | Medium | Port as Hono middleware patterns |
| GraphQL schema generation slow | Medium | Medium | Cache in KV, pre-generate at deploy |
| TypeORM D1 query failures | High | Medium | Early POC, fallback raw SQL |
| Session migration data loss | High | Low | Parallel Redis+KV during migration |
| 300ms CPU limit exceeded | Medium | Low | Optimize queries, use batch operations |

---

## 9. Recommendations

### 9.1 Immediate Actions

1. **Create POC Worker** with Hono + standalone GraphQL Yoga
2. **Test D1 connection** with TypeORM SQLite driver
3. **Port auth middleware** to Hono as proof of concept
4. **Benchmark cold start** of minimal worker

### 9.2 Architecture Decisions

1. ✅ **Use Hono as primary router** - Native Workers, minimal overhead
2. ✅ **Extract GraphQL Yoga standalone** - Already Workers-compatible
3. ✅ **Implement service interfaces** - Enable gradual driver swapping
4. ✅ **Cache schemas in KV** - Avoid cold-start schema compilation

### 9.3 Dependencies to Replace (Priority Order)

| Priority | Replace | With | Effort |
|----------|---------|------|--------|
| P0 | `@nestjs/platform-express` | `hono` | High |
| P0 | `express-session` + Redis | Hono + KV sessions | Medium |
| P0 | `bcrypt` | `bcryptjs` | Low |
| P1 | `graphql-upload` | Custom R2 handler | Medium |
| P1 | `bullmq` | Cloudflare Queues | Medium |
| P1 | `ioredis` / cache-manager-redis | KV bindings | Medium |
| P2 | `nodemailer` | Cloudflare Email Workers | Low |

---

## 10. Next Research Tasks

- [x] **Research Task 1**: TypeORM D1/SQLite compatibility (completed in research.md)
- [x] **Research Task 2**: NestJS Worker adapter pattern (this document)
- [ ] **Research Task 3**: TypeORM query compatibility analysis
- [ ] **Research Task 4**: Session management migration design
- [ ] **Research Task 5**: BullMQ to Queues migration design
- [ ] **Research Task 6**: File storage R2 migration design

---

*Research completed: 2026-01-08*
