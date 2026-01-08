/**
 * GraphQL Yoga Worker Handler
 *
 * Creates a GraphQL Yoga instance configured for Cloudflare Workers.
 * Handles GraphQL requests with proper context injection.
 *
 * @module yoga-worker
 */

import { createSchema, createYoga } from 'graphql-yoga';

import type { GraphQLSchema } from 'graphql';

import {
  createGraphQLContext,
  type GraphQLContext,
  type RequestContext,
} from 'src/core/context-factory';
// Env type is globally available from worker-configuration.d.ts

import {
  createConfigFromEnv,
  getPlugins,
  type YogaWorkerConfig,
} from './yoga-config';

/**
 * GraphQL Yoga instance type for Workers
 */
export type YogaWorkerInstance = ReturnType<typeof createYogaWorker>;

/**
 * Context passed to the Yoga instance
 */
interface YogaServerContext {
  request: Request;
  requestContext: RequestContext;
  env: Env;
}

/**
 * Create a GraphQL Yoga instance for Cloudflare Workers
 */
export const createYogaWorker = (
  schema: GraphQLSchema,
  config?: Partial<YogaWorkerConfig>,
) => {
  return createYoga<YogaServerContext, GraphQLContext>({
    schema,
    graphqlEndpoint: '/graphql',
    landingPage: false, // Disable default landing page
    graphiql: config?.renderGraphiQL
      ? {
          title: 'Twenty CRM GraphQL API',
        }
      : false,
    plugins: getPlugins({
      schema,
      enableIntrospection: config?.enableIntrospection ?? false,
      maxFields: config?.maxFields ?? 100,
      maxRootResolvers: config?.maxRootResolvers ?? 20,
      renderGraphiQL: config?.renderGraphiQL ?? false,
      environment: config?.environment ?? 'production',
    }),
    context: async (params: {
      request: Request;
      requestContext: RequestContext;
      env: Env;
    }): Promise<GraphQLContext> => {
      const { requestContext } = params;

      // Create GraphQL context from request context
      const graphqlContext = createGraphQLContext(requestContext);

      return graphqlContext;
    },
    fetchAPI: {
      // Use native Web APIs in Workers environment
      Request,
      Response,
    },
    cors: false, // CORS is handled by Hono middleware
    batching: {
      // Enable query batching with reasonable limits
      limit: 10,
    },
  });
};

/**
 * Create GraphQL handler for Hono router
 *
 * This integrates GraphQL Yoga with the Hono request/response cycle.
 */
export const createGraphQLHandler = (yoga: YogaWorkerInstance) => {
  return async (
    request: Request,
    requestContext: RequestContext,
    env: Env,
  ): Promise<Response> => {
    // Execute GraphQL request through Yoga
    const response = await yoga.fetch(request, {
      request,
      requestContext,
      env,
    });

    return response;
  };
};

/**
 * Placeholder schema for initial setup
 *
 * This will be replaced with the actual schema loaded from workspace metadata.
 */
export const createPlaceholderSchema = (): GraphQLSchema => {
  return createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        """
        Health check query
        """
        health: HealthStatus!

        """
        Get current API version
        """
        version: String!
      }

      type HealthStatus {
        status: String!
        timestamp: String!
        environment: String
      }
    `,
    resolvers: {
      Query: {
        health: () => ({
          status: 'ok',
          timestamp: new Date().toISOString(),
          environment: 'workers',
        }),
        version: () => '1.0.0',
      },
    },
  });
};

/**
 * Initialize the default Yoga instance with placeholder schema
 */
export const initializeYoga = (env: Env): YogaWorkerInstance => {
  // Access optional env vars safely using type assertion for optional config
  const optionalEnv = env as unknown as Record<string, string | undefined>;
  const maxFields = optionalEnv.GRAPHQL_MAX_FIELDS ?? '100';
  const maxRootResolvers = optionalEnv.GRAPHQL_MAX_ROOT_RESOLVERS ?? '20';
  const enableGraphiql = optionalEnv.ENABLE_GRAPHIQL ?? 'false';
  const environment = env.ENVIRONMENT ?? 'development';

  const config = createConfigFromEnv({
    GRAPHQL_MAX_FIELDS: maxFields,
    GRAPHQL_MAX_ROOT_RESOLVERS: maxRootResolvers,
    ENABLE_GRAPHIQL: enableGraphiql,
    ENVIRONMENT: environment,
  });

  const schema = createPlaceholderSchema();

  return createYogaWorker(schema, config);
};
