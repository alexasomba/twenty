/**
 * GraphQL Yoga Configuration for Cloudflare Workers
 *
 * Extracts and adapts the GraphQL Yoga configuration from the NestJS driver
 * for use in the Cloudflare Workers environment.
 *
 * @module yoga-config
 */

import {
  GraphQLError,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

import type { Plugin } from 'graphql-yoga';

import type { GraphQLContext } from 'src/core/context-factory';
import { Logger } from 'src/core/logger';

/**
 * GraphQL Yoga configuration options
 */
export interface YogaWorkerConfig {
  /**
   * GraphQL schema
   */
  schema: GraphQLSchema;

  /**
   * Whether introspection is enabled
   */
  enableIntrospection: boolean;

  /**
   * Maximum query complexity (fields)
   */
  maxFields: number;

  /**
   * Maximum root resolvers per query
   */
  maxRootResolvers: number;

  /**
   * Whether to render GraphiQL in development
   */
  renderGraphiQL: boolean;

  /**
   * Environment (development, staging, production)
   */
  environment: string;
}

/**
 * Default configuration values
 */
export const defaultYogaConfig: YogaWorkerConfig = {
  schema: new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        _empty: { type: GraphQLString, resolve: () => null },
      },
    }),
  }),
  enableIntrospection: false,
  maxFields: 100,
  maxRootResolvers: 20,
  renderGraphiQL: false,
  environment: 'development',
};

/**
 * Create configuration from environment
 */
export const createConfigFromEnv = (env: {
  GRAPHQL_MAX_FIELDS?: string;
  GRAPHQL_MAX_ROOT_RESOLVERS?: string;
  ENABLE_GRAPHIQL?: string;
  ENVIRONMENT?: string;
}): Partial<YogaWorkerConfig> => {
  return {
    maxFields: env.GRAPHQL_MAX_FIELDS
      ? parseInt(env.GRAPHQL_MAX_FIELDS, 10)
      : 100,
    maxRootResolvers: env.GRAPHQL_MAX_ROOT_RESOLVERS
      ? parseInt(env.GRAPHQL_MAX_ROOT_RESOLVERS, 10)
      : 20,
    renderGraphiQL: env.ENABLE_GRAPHIQL === 'true',
    enableIntrospection: env.ENVIRONMENT !== 'production',
    environment: env.ENVIRONMENT || 'development',
  };
};

// ============================================================================
// Plugins
// ============================================================================

/**
 * Plugin to disable introspection for unauthenticated users in production
 */
export const useDisableIntrospection = (
  disableForUnauthenticated: boolean,
): Plugin<GraphQLContext> => {
  return {
    onParse: ({
      params,
      context,
    }: {
      params: { source: string | { body?: string } };
      context: GraphQLContext;
    }) => {
      if (!disableForUnauthenticated) {
        return;
      }

      // Allow introspection for authenticated users
      if (context.user) {
        return;
      }

      // Check for introspection query
      const source =
        typeof params.source === 'string'
          ? params.source
          : (params.source.body ?? '');

      if (
        source.includes('__schema') ||
        source.includes('__type') ||
        source.includes('__typename')
      ) {
        throw new GraphQLError('Introspection is disabled', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
    },
  };
};

/**
 * Plugin to validate query complexity
 */
export const useQueryComplexityValidation = (options: {
  maxFields: number;
  maxRootResolvers: number;
}): Plugin<GraphQLContext> => {
  return {
    onParse: ({
      params,
    }: {
      params: { source: string | { body?: string } };
    }) => {
      // Basic complexity check on query string
      const source =
        typeof params.source === 'string'
          ? params.source
          : (params.source.body ?? '');

      // Count approximate field selections (rough estimate)
      const fieldMatches = source.match(/\w+\s*[({]/g) || [];

      if (fieldMatches.length > options.maxFields) {
        throw new GraphQLError(
          `Query exceeds maximum field limit (${options.maxFields})`,
          {
            extensions: {
              code: 'QUERY_COMPLEXITY_EXCEEDED',
              maxFields: options.maxFields,
              actualFields: fieldMatches.length,
            },
          },
        );
      }

      // Count root-level resolvers (top-level query/mutation fields)
      const rootPattern = /(query|mutation)\s*\{([^}]+)\}/gi;
      const rootMatch = rootPattern.exec(source);

      if (rootMatch) {
        const rootFields = (rootMatch[2].match(/\w+\s*[({:]/g) || []).length;

        if (rootFields > options.maxRootResolvers) {
          throw new GraphQLError(
            `Query exceeds maximum root resolver limit (${options.maxRootResolvers})`,
            {
              extensions: {
                code: 'QUERY_COMPLEXITY_EXCEEDED',
                maxRootResolvers: options.maxRootResolvers,
                actualRootResolvers: rootFields,
              },
            },
          );
        }
      }
    },
  };
};

/**
 * Plugin for request/response logging
 */
export const useRequestLogging = (): Plugin<GraphQLContext> => {
  const startTimesByRequest = new WeakMap<Request, number>();
  const logger = new Logger({ level: 'info', service: 'graphql' });

  return {
    onRequest: ({ request }: { request: Request }) => {
      startTimesByRequest.set(request, Date.now());
    },
    onResponse: ({ request }: { request: Request }) => {
      const startTime = startTimesByRequest.get(request) ?? Date.now();
      const duration = Date.now() - startTime;

      logger.info('graphql_request', {
        method: request.method,
        url: request.url,
        duration,
      });
    },
  };
};

/**
 * Plugin for error handling and reporting
 */
export const useErrorHandling = (): Plugin<GraphQLContext> => {
  const logger = new Logger({ level: 'error', service: 'graphql' });

  return {
    onResultProcess: ({ result }: { result: unknown }) => {
      // Handle single result (not async iterator)
      if (Symbol.asyncIterator in (result as object)) {
        return;
      }

      const singleResult = result as unknown as {
        errors?: readonly GraphQLError[];
      };

      if (singleResult.errors && singleResult.errors.length > 0) {
        // Log errors
        for (const error of singleResult.errors) {
          logger.error('graphql_error', undefined, {
            message: error.message,
            code: error.extensions?.code,
            path: error.path,
          });
        }
      }
    },
  };
};

/**
 * Get all plugins for the GraphQL Yoga instance
 */
export const getPlugins = (
  config: YogaWorkerConfig,
): Plugin<GraphQLContext>[] => {
  const plugins: Plugin<GraphQLContext>[] = [
    useErrorHandling(),
    useQueryComplexityValidation({
      maxFields: config.maxFields,
      maxRootResolvers: config.maxRootResolvers,
    }),
  ];

  // Disable introspection in production for unauthenticated users
  if (config.environment === 'production') {
    plugins.push(useDisableIntrospection(true));
  }

  // Add request logging in development
  if (config.environment === 'development') {
    plugins.push(useRequestLogging());
  }

  return plugins;
};
