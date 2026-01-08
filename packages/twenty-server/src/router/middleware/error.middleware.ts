/**
 * Error Handling Middleware
 *
 * Centralized error handling for the Twenty CRM API.
 * Provides consistent error response format and logging.
 *
 * @module error-middleware
 */

import type { ErrorHandler } from 'hono';

import type { HonoEnv } from 'src/router';
import { createRequestLogger } from 'src/router/middleware/logging.middleware';

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Custom API error class
 */
export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  // Common error factories
  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError('BAD_REQUEST', message, 400, details);
  }

  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError('FORBIDDEN', message, 403);
  }

  static notFound(resource: string = 'Resource'): ApiError {
    return new ApiError('NOT_FOUND', `${resource} not found`, 404);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError('CONFLICT', message, 409, details);
  }

  static tooManyRequests(
    message: string = 'Too many requests',
    retryAfter?: number,
  ): ApiError {
    return new ApiError('TOO_MANY_REQUESTS', message, 429, { retryAfter });
  }

  static internal(message: string = 'Internal server error'): ApiError {
    return new ApiError('INTERNAL_ERROR', message, 500);
  }

  static serviceUnavailable(message: string = 'Service unavailable'): ApiError {
    return new ApiError('SERVICE_UNAVAILABLE', message, 503);
  }
}

/**
 * GraphQL error format for compatibility
 */
export interface GraphQLErrorResponse {
  data: null;
  errors: Array<{
    message: string;
    extensions: {
      code: string;
      details?: unknown;
      requestId?: string;
    };
  }>;
}

/**
 * Error handler middleware
 *
 * Catches all errors and formats them consistently.
 * Logs errors with context for debugging.
 */
export const errorMiddleware: ErrorHandler<HonoEnv> = (error, c) => {
  const requestId = c.get('requestId') || 'unknown';
  const workspaceId = c.get('workspaceId');
  const logger = createRequestLogger(requestId, workspaceId);

  // Determine error type and response
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof SyntaxError) {
    // JSON parsing error
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (error instanceof TypeError) {
    // Usually a programming error
    statusCode = 500;
    code = 'TYPE_ERROR';
    message =
      c.env.ENVIRONMENT === 'development'
        ? error.message
        : 'Type error occurred';
  }

  // Log the error
  if (statusCode >= 500) {
    logger.error(`Server error: ${error.message}`, error as Error, {
      code,
      statusCode,
    });
  } else if (statusCode >= 400) {
    logger.warn(`Client error: ${error.message}`, {
      code,
      statusCode,
    });
  }

  // Check if this is a GraphQL request
  const isGraphQL =
    c.req.path.includes('/graphql') ||
    c.req.header('Content-Type')?.includes('application/graphql');

  if (isGraphQL) {
    // Return GraphQL-formatted error
    const graphqlError: GraphQLErrorResponse = {
      data: null,
      errors: [
        {
          message,
          extensions: {
            code,
            details: c.env.ENVIRONMENT === 'development' ? details : undefined,
            requestId,
          },
        },
      ],
    };

    return c.json(graphqlError, statusCode as 400 | 401 | 403 | 404 | 500);
  }

  // Return REST API error format
  const apiError: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details: c.env.ENVIRONMENT === 'development' ? details : undefined,
      requestId,
    },
  };

  return c.json(apiError, statusCode as 400 | 401 | 403 | 404 | 500);
};

/**
 * Not Found handler for unmatched routes
 */
export const notFoundHandler = (c: {
  req: { path: string; method: string };
  json: (data: ApiErrorResponse, status: number) => Response;
}) => {
  const apiError: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${c.req.method} ${c.req.path}`,
    },
  };

  return c.json(apiError, 404);
};
