/**
 * CORS Middleware
 *
 * Handles Cross-Origin Resource Sharing for the Twenty CRM API.
 * Allows requests from configured frontend domains.
 *
 * @module cors-middleware
 */

import { cors } from 'hono/cors';

import type { MiddlewareHandler } from 'hono';

import type { HonoEnv } from 'src/router';

/**
 * Default allowed origins for development
 */
const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

/**
 * CORS middleware for Twenty CRM
 *
 * Configures CORS based on environment settings.
 * In production, uses FRONTEND_URL; in development, allows localhost.
 */
export const corsMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const frontendUrl = c.env.FRONTEND_URL;
  const environment = c.env.ENVIRONMENT || 'development';

  // Build allowed origins list
  const allowedOrigins = [...DEFAULT_ORIGINS];

  if (frontendUrl) {
    allowedOrigins.push(frontendUrl);
  }

  // In development, be more permissive
  if (environment === 'development') {
    // Allow all localhost variants
    allowedOrigins.push('http://localhost:*');
  }

  // Apply CORS middleware
  return cors({
    origin: (origin) => {
      // No origin (e.g., same-origin request, curl, etc.)
      if (!origin) {
        return '*';
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      // In development, allow all localhost origins
      if (environment === 'development' && origin.includes('localhost')) {
        return origin;
      }

      // Check for wildcard patterns
      for (const allowed of allowedOrigins) {
        if (allowed.includes('*')) {
          const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');

          if (pattern.test(origin)) {
            return origin;
          }
        }
      }

      // Deny by returning empty string
      return '';
    },
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-Id',
      'X-Workspace-Id',
      'Apollo-Require-Preflight',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Request-Id', 'X-Response-Time'],
    credentials: true,
    maxAge: 86400, // 24 hours
  })(c, next);
};
