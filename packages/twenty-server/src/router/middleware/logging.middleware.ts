/**
 * Logging Middleware
 *
 * Provides structured JSON logging for all requests.
 * Includes request correlation IDs and timing metrics.
 *
 * @module logging-middleware
 */

import type { MiddlewareHandler } from 'hono';

import { Logger } from 'src/core/logger';

type HonoEnv = {
  Bindings: {
    LOG_LEVEL?: string;
  };
  Variables: {
    requestId: string;
    startTime: number;
    workspaceId?: string;
    userId?: string;
    logger: Logger;
  };
};

/**
 * Generate a unique request ID
 */
const generateRequestId = (): string => {
  return crypto.randomUUID();
};

/**
 * Logging middleware for Twenty CRM
 *
 * Logs all requests in structured JSON format with:
 * - Request ID for correlation
 * - Method, path, status
 * - Response time
 * - User/workspace context (when available)
 */
export const loggingMiddleware: MiddlewareHandler<HonoEnv> = async (
  c,
  next,
) => {
  // Generate or extract request ID
  const requestId = c.req.header('X-Request-Id') || generateRequestId();
  const startTime = Date.now();

  // Create logger instance for this request
  const logLevel =
    (c.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info';
  const logger = new Logger({ level: logLevel, service: 'twenty-worker' });

  // Store in context for use in handlers
  c.set('requestId', requestId);
  c.set('startTime', startTime);
  c.set('logger', logger);

  // Add request ID to response headers
  c.header('X-Request-Id', requestId);

  // Log request start
  if (logLevel === 'debug') {
    logger.debug('request_start', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent'),
    });
  }

  // Process request
  await next();

  // Calculate response time
  const responseTime = Date.now() - startTime;

  c.header('X-Response-Time', `${responseTime}ms`);

  // Get context values (may be set by auth middleware)
  const workspaceId = c.get('workspaceId');
  const userId = c.get('userId');

  // Determine log level based on status
  const status = c.res.status;

  // Skip logging for health checks in production (too noisy)
  const isHealthCheck = c.req.path === '/health' || c.req.path === '/healthz';
  const shouldLog = !isHealthCheck || logLevel === 'debug';

  if (shouldLog) {
    const logData = {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      responseTime,
      workspaceId,
      userId,
    };

    if (status >= 500) {
      logger.error('request_complete', undefined, logData);
    } else if (status >= 400) {
      logger.warn('request_complete', logData);
    } else {
      logger.info('request_complete', logData);
    }
  }
};

/**
 * Create a logger instance bound to a request context
 */
export const createRequestLogger = (
  requestId: string,
  workspaceId?: string,
): Logger => {
  const logger = new Logger({ level: 'info', service: 'twenty-worker' });

  // Return a wrapped logger that includes request context
  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      logger.debug(message, { requestId, workspaceId, ...data });
    },
    info: (message: string, data?: Record<string, unknown>) => {
      logger.info(message, { requestId, workspaceId, ...data });
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      logger.warn(message, { requestId, workspaceId, ...data });
    },
    error: (message: string, error?: Error, data?: Record<string, unknown>) => {
      logger.error(message, error, { requestId, workspaceId, ...data });
    },
  } as Logger;
};
