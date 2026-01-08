/**
 * Hono Router Setup
 *
 * Main router configuration for the Twenty CRM Worker API.
 * Combines all routes and middleware into a single Hono application.
 *
 * @module router
 */

import { Hono } from 'hono';

import { createRequestContext } from 'src/core/context-factory';
import { initializeYoga } from 'src/graphql/yoga-worker';
// Env type is globally available from worker-configuration.d.ts

import { corsMiddleware } from './middleware/cors.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { workspaceMiddleware } from './middleware/workspace.middleware';
import { healthRoute } from './routes/health.route';

/**
 * Extended Hono context with Twenty CRM bindings
 */
export type HonoEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    startTime: number;
    workspaceId?: string;
    userId?: string;
  };
};

/**
 * Create and configure the main Hono router
 */
export const createRouter = (): Hono<HonoEnv> => {
  const app = new Hono<HonoEnv>();

  // ============================================================================
  // Global Middleware (applied to all routes)
  // ============================================================================

  // Error handling (must be first)
  app.onError(errorMiddleware);

  // Request logging
  app.use('*', loggingMiddleware);

  // CORS handling
  app.use('*', corsMiddleware);

  // ============================================================================
  // Routes
  // ============================================================================

  // Health check endpoints (no auth required)
  app.route('/health', healthRoute);
  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // GraphQL endpoint with workspace context
  app.all('/graphql', workspaceMiddleware, async (c) => {
    const requestId = c.get('requestId') || crypto.randomUUID();
    const workspaceId = c.get('workspaceId');
    const userId = c.get('userId');

    const requestContext = createRequestContext(requestId, c.env);

    // Add workspace context to request context
    requestContext.workspaceId = workspaceId;
    requestContext.userId = userId;

    // Initialize Yoga with environment configuration
    const yoga = initializeYoga(c.env);

    // Handle the GraphQL request
    const response = await yoga.fetch(c.req.raw, {
      request: c.req.raw,
      requestContext,
      env: c.env,
    });

    return response;
  });

  // API routes (placeholder for REST endpoints)
  app.get('/api/v1/*', async (c) => {
    return c.json(
      {
        error: 'Not implemented',
        message: 'REST API endpoints are not yet configured',
      },
      501,
    );
  });

  // ============================================================================
  // Fallback
  // ============================================================================

  app.notFound((c) => {
    return c.json(
      {
        error: 'Not Found',
        message: `Route ${c.req.method} ${c.req.path} not found`,
        path: c.req.path,
      },
      404,
    );
  });

  return app;
};

/**
 * Default router instance
 */
export const router = createRouter();

export default router;
