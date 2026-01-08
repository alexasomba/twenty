/**
 * Workspace Schema Builder for D1
 *
 * Generates GraphQL schema with resolvers for workspace objects.
 * Creates type definitions and wires up D1-compatible resolvers.
 *
 * @module graphql/schema-builder
 */

import { createSchema } from 'graphql-yoga';

import type { GraphQLSchema } from 'graphql';

import {
  createAllStandardResolvers,
  STANDARD_OBJECTS,
} from './resolvers/object-record-resolver';
import { createSearchResolvers } from './resolvers/search-resolver';

/**
 * Context for GraphQL resolvers
 */
export interface D1GraphQLContext {
  workspaceId: string;
  userId?: string;
  db: D1Database;
  requestId: string;
}

/**
 * Generate GraphQL type definitions for standard objects
 */
const generateTypeDefs = (): string => {
  // Common scalar types and enums
  const commonTypes = /* GraphQL */ `
    scalar DateTime
    scalar UUID
    scalar JSON

    enum OrderDirection {
      ASC
      DESC
    }

    enum NullsOrder {
      FIRST
      LAST
    }

    type PageInfo {
      hasNextPage: Boolean!
      hasPreviousPage: Boolean!
      startCursor: String
      endCursor: String
    }

    input OrderByInput {
      field: String!
      direction: OrderDirection!
      nulls: NullsOrder
    }

    input StringFilter {
      eq: String
      neq: String
      in: [String!]
      like: String
    }

    input IDFilter {
      eq: ID
      neq: ID
      in: [ID!]
    }
  `;

  // Generate types for each standard object
  const objectTypes: string[] = [];
  const queryFields: string[] = [];
  const mutationFields: string[] = [];

  for (const [objectName, config] of Object.entries(STANDARD_OBJECTS)) {
    const typeName = objectName.charAt(0).toUpperCase() + objectName.slice(1);
    const connectionName = `${typeName}Connection`;
    const edgeName = `${typeName}Edge`;
    const inputName = `${typeName}Input`;
    const updateInputName = `${typeName}UpdateInput`;
    const filterInputName = `${typeName}FilterInput`;

    // Object type with common fields
    objectTypes.push(/* GraphQL */ `
      type ${typeName} {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        deletedAt: DateTime
        ${getObjectSpecificFields(objectName)}
      }

      type ${edgeName} {
        node: ${typeName}!
        cursor: String!
      }

      type ${connectionName} {
        edges: [${edgeName}!]!
        pageInfo: PageInfo!
        totalCount: Int
      }

      input ${inputName} {
        ${getObjectSpecificInputFields(objectName)}
      }

      input ${updateInputName} {
        ${getObjectSpecificInputFields(objectName, true)}
      }

      input ${filterInputName} {
        id: IDFilter
        ${getObjectSpecificFilterFields(objectName)}
      }
    `);

    // Query fields
    queryFields.push(`
      ${objectName}(filter: ${filterInputName}!): ${typeName}
      ${objectName}s(
        filter: ${filterInputName}
        orderBy: [OrderByInput!]
        first: Int
        last: Int
        before: String
        after: String
      ): ${connectionName}!
    `);

    // Mutation fields
    mutationFields.push(`
      create${typeName}(data: ${inputName}!): ${typeName}!
      create${config.labelPlural.replace(/ /g, '')}(data: [${inputName}!]!): [${typeName}!]!
      update${typeName}(id: ID!, data: ${updateInputName}!): ${typeName}
      delete${typeName}(id: ID!): ${typeName}
    `);
  }

  // Search result type
  const searchTypes = /* GraphQL */ `
    type SearchResult {
      id: ID!
      objectName: String!
      recordId: ID!
      label: String!
      snippet: String
      score: Float!
    }
  `;

  // Root types
  const rootTypes = /* GraphQL */ `
    type Query {
      """
      Health check
      """
      health: HealthStatus!

      """
      API version
      """
      version: String!

      """
      Search across all objects
      """
      search(
        query: String!
        objectNames: [String!]
        limit: Int
      ): [SearchResult!]!

      ${queryFields.join('\n')}
    }

    type Mutation {
      ${mutationFields.join('\n')}
    }

    type HealthStatus {
      status: String!
      timestamp: String!
      environment: String
    }
  `;

  return [commonTypes, ...objectTypes, searchTypes, rootTypes].join('\n');
};

/**
 * Get object-specific field definitions
 */
const getObjectSpecificFields = (objectName: string): string => {
  const fieldDefs: Record<string, string> = {
    company: `
      name: String!
      domainName: String
      address: String
      employees: Int
      linkedinLink: String
      xLink: String
      annualRecurringRevenue: Float
      idealCustomerProfile: Boolean
      position: Float
    `,
    person: `
      firstName: String
      lastName: String
      email: String
      phone: String
      city: String
      jobTitle: String
      linkedinLink: String
      xLink: String
      avatarUrl: String
      position: Float
      companyId: ID
    `,
    opportunity: `
      name: String!
      amount: Float
      closeDate: DateTime
      stage: String
      probability: Float
      position: Float
      companyId: ID
      personId: ID
    `,
    note: `
      title: String
      body: String
      position: Float
    `,
    task: `
      title: String
      body: String
      dueAt: DateTime
      status: String
      position: Float
      assigneeId: ID
    `,
    attachment: `
      name: String!
      fullPath: String!
      type: String!
      size: Int
    `,
    favorite: `
      position: Float!
      recordId: ID!
      objectName: String!
      folderId: ID
    `,
    favoriteFolder: `
      name: String!
      position: Float!
    `,
  };

  return fieldDefs[objectName] || '';
};

/**
 * Get object-specific input field definitions
 */
const getObjectSpecificInputFields = (
  objectName: string,
  isUpdate = false,
): string => {
  const makeOptional = (fields: string): string => {
    if (isUpdate) {
      // Remove ! from non-nullable fields for update input
      return fields.replace(/!$/gm, '');
    }

    return fields;
  };

  const fieldDefs: Record<string, string> = {
    company: makeOptional(`
      name: String!
      domainName: String
      address: String
      employees: Int
      linkedinLink: String
      xLink: String
      annualRecurringRevenue: Float
      idealCustomerProfile: Boolean
      position: Float
    `),
    person: makeOptional(`
      firstName: String
      lastName: String
      email: String
      phone: String
      city: String
      jobTitle: String
      linkedinLink: String
      xLink: String
      avatarUrl: String
      position: Float
      companyId: ID
    `),
    opportunity: makeOptional(`
      name: String!
      amount: Float
      closeDate: DateTime
      stage: String
      probability: Float
      position: Float
      companyId: ID
      personId: ID
    `),
    note: makeOptional(`
      title: String
      body: String
      position: Float
    `),
    task: makeOptional(`
      title: String
      body: String
      dueAt: DateTime
      status: String
      position: Float
      assigneeId: ID
    `),
    attachment: makeOptional(`
      name: String!
      fullPath: String!
      type: String!
      size: Int
    `),
    favorite: makeOptional(`
      position: Float!
      recordId: ID!
      objectName: String!
      folderId: ID
    `),
    favoriteFolder: makeOptional(`
      name: String!
      position: Float!
    `),
  };

  return fieldDefs[objectName] || '';
};

/**
 * Get object-specific filter field definitions
 */
const getObjectSpecificFilterFields = (objectName: string): string => {
  const fieldDefs: Record<string, string> = {
    company: `
      name: StringFilter
      domainName: StringFilter
    `,
    person: `
      firstName: StringFilter
      lastName: StringFilter
      email: StringFilter
      companyId: IDFilter
    `,
    opportunity: `
      name: StringFilter
      stage: StringFilter
      companyId: IDFilter
      personId: IDFilter
    `,
    note: `
      title: StringFilter
    `,
    task: `
      title: StringFilter
      status: StringFilter
      assigneeId: IDFilter
    `,
    attachment: `
      name: StringFilter
      type: StringFilter
    `,
    favorite: `
      recordId: IDFilter
      objectName: StringFilter
      folderId: IDFilter
    `,
    favoriteFolder: `
      name: StringFilter
    `,
  };

  return fieldDefs[objectName] || '';
};

/**
 * Create the complete workspace schema with D1 resolvers
 */
export const createWorkspaceSchema = (): GraphQLSchema => {
  const typeDefs = generateTypeDefs();

  // Get resolvers from factories
  const objectResolvers = createAllStandardResolvers();
  const searchResolvers = createSearchResolvers();

  // Combine all resolvers
  const resolvers = {
    Query: {
      health: () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: 'workers',
      }),
      version: () => '1.0.0',
      ...searchResolvers.Query,
      ...objectResolvers.Query,
    },
    Mutation: {
      ...objectResolvers.Mutation,
    },
  };

  return createSchema({
    typeDefs,
    resolvers,
  }) as unknown as GraphQLSchema;
};
