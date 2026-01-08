/**
 * Health Check Routes
 *
 * Provides health check endpoints for monitoring and load balancers.
 *
 * @module health-route
 */

import { Hono } from 'hono';

import type { HonoEnv } from 'src/router';

/**
 * Health check response structure
 */
interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: CheckResult;
    cache: CheckResult;
    storage: CheckResult;
  };
}

interface CheckResult {
  status: 'pass' | 'fail' | 'skip';
  latency?: number;
  error?: string;
}

/**
 * Check D1 database connectivity
 */
const checkDatabase = async (db: D1Database): Promise<CheckResult> => {
  const startTime = Date.now();

  try {
    const result = await db.prepare('SELECT 1 as ok').first<{ ok: number }>();

    if (result?.ok === 1) {
      return {
        status: 'pass',
        latency: Date.now() - startTime,
      };
    }

    return {
      status: 'fail',
      error: 'Unexpected query result',
    };
  } catch (error) {
    return {
      status: 'fail',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Check KV store connectivity
 */
const checkCache = async (kv: KVNamespace): Promise<CheckResult> => {
  const startTime = Date.now();

  try {
    // Write a test key and read it back
    const testKey = `health_check_${Date.now()}`;

    await kv.put(testKey, 'ok', { expirationTtl: 60 });
    const value = await kv.get(testKey);

    // Clean up
    await kv.delete(testKey);

    if (value === 'ok') {
      return {
        status: 'pass',
        latency: Date.now() - startTime,
      };
    }

    return {
      status: 'fail',
      error: 'KV read/write mismatch',
    };
  } catch (error) {
    return {
      status: 'fail',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Check R2 storage connectivity
 */
const checkStorage = async (bucket: R2Bucket): Promise<CheckResult> => {
  const startTime = Date.now();

  try {
    // List objects with limit 1 to verify connectivity
    await bucket.list({ limit: 1 });

    return {
      status: 'pass',
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: 'fail',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Health check router
 */
export const healthRoute = new Hono<HonoEnv>();

/**
 * Basic liveness check
 * Used by load balancers for quick health verification
 */
healthRoute.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness check
 * Verifies all dependencies are accessible
 */
healthRoute.get('/ready', async (c) => {
  const [database, cache, storage] = await Promise.all([
    checkDatabase(c.env.DB),
    checkCache(c.env.CACHE_STORE),
    checkStorage(c.env.FILES),
  ]);

  const checks = { database, cache, storage };

  // Determine overall status
  const failedChecks = Object.values(checks).filter((c) => c.status === 'fail');
  let status: HealthCheckResponse['status'] = 'healthy';

  if (failedChecks.length === Object.keys(checks).length) {
    status = 'unhealthy';
  } else if (failedChecks.length > 0) {
    status = 'degraded';
  }

  // Access optional env vars safely
  const optionalEnv = c.env as unknown as Record<string, string | undefined>;

  const response: HealthCheckResponse = {
    status,
    timestamp: new Date().toISOString(),
    version: optionalEnv.VERSION || 'unknown',
    checks,
  };

  // Return 503 if unhealthy, 200 otherwise
  return c.json(response, status === 'unhealthy' ? 503 : 200);
});

/**
 * Detailed health check (for internal monitoring)
 */
healthRoute.get('/detailed', async (c) => {
  const startTime = Date.now();

  const [database, cache, storage] = await Promise.all([
    checkDatabase(c.env.DB),
    checkCache(c.env.CACHE_STORE),
    checkStorage(c.env.FILES),
  ]);

  const checks = { database, cache, storage };
  const failedChecks = Object.values(checks).filter((c) => c.status === 'fail');
  let status: HealthCheckResponse['status'] = 'healthy';

  if (failedChecks.length === Object.keys(checks).length) {
    status = 'unhealthy';
  } else if (failedChecks.length > 0) {
    status = 'degraded';
  }

  // Access optional env vars safely
  const optionalEnv = c.env as unknown as Record<string, string | undefined>;

  return c.json({
    status,
    timestamp: new Date().toISOString(),
    version: optionalEnv.VERSION || 'unknown',
    environment: c.env.ENVIRONMENT || 'development',
    region: optionalEnv.CF_REGION || 'unknown',
    totalLatency: Date.now() - startTime,
    checks,
  });
});
