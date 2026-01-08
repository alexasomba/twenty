/**
 * Worker Context Factory
 *
 * Creates and manages request context for the Twenty CRM Worker.
 * Provides access to services, database, and authenticated user info.
 *
 * @module context-factory
 */

import { createRequestLogger } from 'src/router/middleware/logging.middleware';
// Env type is globally available from worker-configuration.d.ts

/**
 * Workspace context - available after authentication
 */
export interface WorkspaceContext {
  id: string;
  name?: string;
  subdomain?: string;
  databaseSchema?: string;
}

/**
 * User context - available after authentication
 */
export interface UserContext {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

/**
 * Request context - created for each request
 */
export interface RequestContext {
  // Request identification
  requestId: string;
  startTime: number;

  // Environment bindings
  env: Env;

  // Authentication (optional until auth middleware runs)
  workspace?: WorkspaceContext;
  user?: UserContext;

  // Services (lazy-loaded)
  readonly logger: ReturnType<typeof createRequestLogger>;
}

/**
 * Create a new request context
 */
export const createRequestContext = (
  requestId: string,
  env: Env,
): RequestContext => {
  const startTime = Date.now();

  return {
    requestId,
    startTime,
    env,

    get logger() {
      return createRequestLogger(requestId, this.workspace?.id);
    },
  };
};

/**
 * GraphQL context type for resolvers
 */
export interface GraphQLContext extends RequestContext {
  // Database utilities
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
    queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
    execute: (sql: string, params?: unknown[]) => Promise<D1Result>;
    batch: (statements: D1PreparedStatement[]) => Promise<D1Result[]>;
  };
}

/**
 * Create a GraphQL context from a request context
 */
export const createGraphQLContext = (ctx: RequestContext): GraphQLContext => {
  const db = ctx.env.DB;

  return {
    ...ctx,
    db: {
      async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
        const stmt = params ? db.prepare(sql).bind(...params) : db.prepare(sql);
        const result = await stmt.all<T>();

        return result.results;
      },

      async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
        const stmt = params ? db.prepare(sql).bind(...params) : db.prepare(sql);

        return stmt.first<T>();
      },

      async execute(sql: string, params?: unknown[]): Promise<D1Result> {
        const stmt = params ? db.prepare(sql).bind(...params) : db.prepare(sql);

        return stmt.run();
      },

      async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
        return db.batch(statements);
      },
    },
  };
};

/**
 * Type guard to check if context is authenticated
 */
export const isAuthenticated = (
  ctx: RequestContext,
): ctx is RequestContext & {
  workspace: WorkspaceContext;
  user: UserContext;
} => {
  return ctx.workspace !== undefined && ctx.user !== undefined;
};

/**
 * Create an anonymous context (for public endpoints)
 */
export const createAnonymousContext = (
  requestId: string,
  env: Env,
): RequestContext => {
  return createRequestContext(requestId, env);
};

/**
 * Create an authenticated context
 */
export const createAuthenticatedContext = (
  requestId: string,
  env: Env,
  workspace: WorkspaceContext,
  user: UserContext,
): RequestContext => {
  const ctx = createRequestContext(requestId, env);

  ctx.workspace = workspace;
  ctx.user = user;

  return ctx;
};
