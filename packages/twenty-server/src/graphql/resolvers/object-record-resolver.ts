/**
 * Object Record Resolver Factory for D1
 *
 * Creates GraphQL resolvers for workspace object CRUD operations.
 * Resolvers are workspace-scoped and work with D1 database.
 *
 * @module resolvers/object-record-resolver
 */

import {
  executeInsert,
  executeInsertMany,
  executeSelect,
  executeSelectOne,
  executeSoftDelete,
  executeUpdate,
} from './d1-query-builder';
import type {
  Connection,
  CreateManyArgs,
  CreateOneArgs,
  DeleteOneArgs,
  FindManyArgs,
  FindOneArgs,
  UpdateOneArgs,
} from './types';

/**
 * Context passed to resolver functions
 */
interface ResolverContext {
  workspaceId: string;
  userId?: string;
  db: D1Database;
}

/**
 * Generic record type
 */
type ObjectRecord = Record<string, unknown> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Create findMany resolver for a table
 */
export const createFindManyResolver = (tableName: string) => {
  return async (
    _parent: unknown,
    args: FindManyArgs,
    context: ResolverContext,
  ): Promise<Connection<ObjectRecord>> => {
    const { workspaceId, db } = context;

    const { records, pageInfo, totalCount } = await executeSelect<ObjectRecord>(
      db,
      tableName,
      workspaceId,
      {
        filter: args.filter,
        orderBy: args.orderBy,
        pagination: {
          first: args.first,
          last: args.last,
          before: args.before,
          after: args.after,
        },
      },
    );

    // Transform to connection format
    const edges = records.map((record) => ({
      node: record,
      cursor: btoa(JSON.stringify({ id: record.id })),
    }));

    return {
      edges,
      pageInfo,
      totalCount,
    };
  };
};

/**
 * Create findOne resolver for a table
 */
export const createFindOneResolver = (tableName: string) => {
  return async (
    _parent: unknown,
    args: FindOneArgs,
    context: ResolverContext,
  ): Promise<ObjectRecord | null> => {
    const { workspaceId, db } = context;

    const record = await executeSelectOne<ObjectRecord>(
      db,
      tableName,
      workspaceId,
      args.filter,
    );

    return record;
  };
};

/**
 * Create createOne resolver for a table
 */
export const createCreateOneResolver = (tableName: string) => {
  return async (
    _parent: unknown,
    args: CreateOneArgs<Record<string, unknown>>,
    context: ResolverContext,
  ): Promise<ObjectRecord> => {
    const { workspaceId, db } = context;

    const record = await executeInsert(db, tableName, workspaceId, args.data);

    return record as ObjectRecord;
  };
};

/**
 * Create createMany resolver for a table
 */
export const createCreateManyResolver = (tableName: string) => {
  return async (
    _parent: unknown,
    args: CreateManyArgs<Record<string, unknown>>,
    context: ResolverContext,
  ): Promise<ObjectRecord[]> => {
    const { workspaceId, db } = context;

    const records = await executeInsertMany(
      db,
      tableName,
      workspaceId,
      args.data,
    );

    return records as ObjectRecord[];
  };
};

/**
 * Create updateOne resolver for a table
 */
export const createUpdateOneResolver = (tableName: string) => {
  return async (
    _parent: unknown,
    args: UpdateOneArgs<Record<string, unknown>>,
    context: ResolverContext,
  ): Promise<ObjectRecord | null> => {
    const { workspaceId, db } = context;

    const record = await executeUpdate(
      db,
      tableName,
      workspaceId,
      args.id,
      args.data,
    );

    return record as ObjectRecord | null;
  };
};

/**
 * Create deleteOne resolver for a table (soft delete)
 */
export const createDeleteOneResolver = (tableName: string) => {
  return async (
    _parent: unknown,
    args: DeleteOneArgs,
    context: ResolverContext,
  ): Promise<ObjectRecord | null> => {
    const { workspaceId, db } = context;

    const record = await executeSoftDelete<ObjectRecord>(
      db,
      tableName,
      workspaceId,
      args.id,
    );

    return record;
  };
};

/**
 * Standard object names and their table mappings
 */
export const STANDARD_OBJECTS: Record<
  string,
  { tableName: string; labelSingular: string; labelPlural: string }
> = {
  company: {
    tableName: 'company',
    labelSingular: 'Company',
    labelPlural: 'Companies',
  },
  person: {
    tableName: 'person',
    labelSingular: 'Person',
    labelPlural: 'People',
  },
  opportunity: {
    tableName: 'opportunity',
    labelSingular: 'Opportunity',
    labelPlural: 'Opportunities',
  },
  note: {
    tableName: 'note',
    labelSingular: 'Note',
    labelPlural: 'Notes',
  },
  task: {
    tableName: 'task',
    labelSingular: 'Task',
    labelPlural: 'Tasks',
  },
  attachment: {
    tableName: 'attachment',
    labelSingular: 'Attachment',
    labelPlural: 'Attachments',
  },
  favorite: {
    tableName: 'favorite',
    labelSingular: 'Favorite',
    labelPlural: 'Favorites',
  },
  favoriteFolder: {
    tableName: 'favoriteFolder',
    labelSingular: 'Favorite Folder',
    labelPlural: 'Favorite Folders',
  },
};

/**
 * Create all CRUD resolvers for a standard object
 */
export const createObjectResolvers = (
  objectName: string,
  tableName: string,
): {
  Query: Record<string, unknown>;
  Mutation: Record<string, unknown>;
} => {
  const capitalizedName =
    objectName.charAt(0).toUpperCase() + objectName.slice(1);
  const pluralName = (
    STANDARD_OBJECTS[objectName]?.labelPlural ||
    `${capitalizedName}s`.replace(/ys$/, 'ies')
  ).replace(/ /g, '');

  return {
    Query: {
      [`${objectName}`]: createFindOneResolver(tableName),
      [`${objectName}s`]: createFindManyResolver(tableName),
    },
    Mutation: {
      [`create${capitalizedName}`]: createCreateOneResolver(tableName),
      [`create${pluralName}`]: createCreateManyResolver(tableName),
      [`update${capitalizedName}`]: createUpdateOneResolver(tableName),
      [`delete${capitalizedName}`]: createDeleteOneResolver(tableName),
    },
  };
};

/**
 * Create all resolvers for standard CRM objects
 */
export const createAllStandardResolvers = (): {
  Query: Record<string, unknown>;
  Mutation: Record<string, unknown>;
} => {
  const Query: Record<string, unknown> = {};
  const Mutation: Record<string, unknown> = {};

  for (const [objectName, config] of Object.entries(STANDARD_OBJECTS)) {
    const resolvers = createObjectResolvers(objectName, config.tableName);

    Object.assign(Query, resolvers.Query);
    Object.assign(Mutation, resolvers.Mutation);
  }

  return { Query, Mutation };
};
