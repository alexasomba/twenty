/**
 * D1 Query Builder Utility
 *
 * Provides SQL query building utilities for D1/SQLite.
 * Handles workspace scoping, filtering, ordering, and pagination.
 *
 * @module resolvers/d1-query-builder
 */

import type {
  FilterCondition,
  OrderBySpec,
  PageInfo,
  PaginationArgs,
} from './types';

/**
 * Build WHERE clause from filter conditions with workspace scoping
 */
export const buildWhereClause = (
  filter: FilterCondition | undefined,
  workspaceId: string,
): { clause: string; params: unknown[] } => {
  const conditions: string[] = ['workspaceId = ?'];
  const params: unknown[] = [workspaceId];

  // Always exclude soft-deleted records
  conditions.push('("deletedAt" IS NULL)');

  if (!filter) {
    return { clause: conditions.join(' AND '), params };
  }

  for (const [field, value] of Object.entries(filter)) {
    if (value === null) {
      conditions.push(`"${field}" IS NULL`);
    } else if (typeof value === 'object') {
      // Handle complex filter operators
      if ('eq' in value) {
        conditions.push(`"${field}" = ?`);
        params.push(value.eq);
      }
      if ('neq' in value) {
        conditions.push(`"${field}" != ?`);
        params.push(value.neq);
      }
      if ('in' in value && Array.isArray(value.in)) {
        const placeholders = value.in.map(() => '?').join(', ');

        conditions.push(`"${field}" IN (${placeholders})`);
        params.push(...value.in);
      }
      if ('like' in value) {
        // SQLite case-insensitive search using LIKE with COLLATE NOCASE
        conditions.push(`"${field}" LIKE ? COLLATE NOCASE`);
        params.push(`%${value.like}%`);
      }
    } else {
      conditions.push(`"${field}" = ?`);
      params.push(value);
    }
  }

  return { clause: conditions.join(' AND '), params };
};

/**
 * Build ORDER BY clause from order specifications
 */
export const buildOrderByClause = (
  orderBy: OrderBySpec[] | undefined,
): string => {
  if (!orderBy || orderBy.length === 0) {
    return 'ORDER BY "createdAt" DESC, "id" ASC';
  }

  const orderClauses = orderBy.map((spec) => {
    const direction = spec.direction || 'ASC';
    const nullsHandling = spec.nulls
      ? ` NULLS ${spec.nulls}`
      : direction === 'ASC'
        ? ' NULLS FIRST'
        : ' NULLS LAST';

    return `"${spec.field}" ${direction}${nullsHandling}`;
  });

  // Always add id as final sort for stable pagination
  orderClauses.push('"id" ASC');

  return `ORDER BY ${orderClauses.join(', ')}`;
};

/**
 * Build LIMIT/OFFSET clause for pagination
 */
export const buildPaginationClause = (
  pagination: PaginationArgs,
): { clause: string; limit: number } => {
  const limit = pagination.first ?? pagination.last ?? 50;

  // Add 1 to limit to check for next page
  return {
    clause: `LIMIT ${limit + 1}`,
    limit,
  };
};

/**
 * Encode cursor from record id
 */
export const encodeCursor = (id: string): string => {
  return btoa(JSON.stringify({ id }));
};

/**
 * Decode cursor to record id
 */
export const decodeCursor = (cursor: string): { id: string } | null => {
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
};

/**
 * Build page info from query results
 */
export const buildPageInfo = <T extends { id: string }>(
  records: T[],
  limit: number,
  args: PaginationArgs,
): { records: T[]; pageInfo: PageInfo } => {
  const hasExtraRecord = records.length > limit;
  const trimmedRecords = hasExtraRecord ? records.slice(0, limit) : records;

  // Reverse for backward pagination
  if (args.last && !args.first) {
    trimmedRecords.reverse();
  }

  const pageInfo: PageInfo = {
    hasNextPage: args.first ? hasExtraRecord : Boolean(args.before),
    hasPreviousPage: args.last ? hasExtraRecord : Boolean(args.after),
    startCursor:
      trimmedRecords.length > 0
        ? encodeCursor(trimmedRecords[0].id)
        : undefined,
    endCursor:
      trimmedRecords.length > 0
        ? encodeCursor(trimmedRecords[trimmedRecords.length - 1].id)
        : undefined,
  };

  return { records: trimmedRecords, pageInfo };
};

/**
 * Execute a SELECT query on D1
 */
export const executeSelect = async <T>(
  db: D1Database,
  tableName: string,
  workspaceId: string,
  options: {
    filter?: FilterCondition;
    orderBy?: OrderBySpec[];
    pagination?: PaginationArgs;
    columns?: string[];
  } = {},
): Promise<{ records: T[]; pageInfo: PageInfo; totalCount: number }> => {
  const { filter, orderBy, pagination = {}, columns = ['*'] } = options;

  // Build query parts
  const { clause: whereClause, params } = buildWhereClause(filter, workspaceId);
  const orderByClause = buildOrderByClause(orderBy);
  const { clause: paginationClause, limit } = buildPaginationClause(pagination);

  // Handle cursor-based pagination
  if (pagination.after) {
    const decoded = decodeCursor(pagination.after);

    if (decoded) {
      // This is a simplified cursor - real impl would use composite cursor
      const cursorFilter = { id: { neq: decoded.id } };
      const { clause: cursorWhere, params: cursorParams } = buildWhereClause(
        cursorFilter,
        workspaceId,
      );

      params.push(...cursorParams.slice(1)); // Skip duplicate workspaceId
    }
  }

  // Build SELECT query
  const columnList = columns.join(', ');
  const query = `
    SELECT ${columnList}
    FROM "${tableName}"
    WHERE ${whereClause}
    ${orderByClause}
    ${paginationClause}
  `;

  // Execute query
  const result = await db
    .prepare(query)
    .bind(...params)
    .all<T>();

  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as count
    FROM "${tableName}"
    WHERE ${whereClause}
  `;
  const countResult = await db
    .prepare(countQuery)
    .bind(...params.slice(0, params.length))
    .first<{ count: number }>();

  const records = result.results || [];
  const { records: paginatedRecords, pageInfo } = buildPageInfo(
    records as (T & { id: string })[],
    limit,
    pagination,
  );

  return {
    records: paginatedRecords,
    pageInfo,
    totalCount: countResult?.count ?? 0,
  };
};

/**
 * Execute a SELECT ONE query on D1
 */
export const executeSelectOne = async <T>(
  db: D1Database,
  tableName: string,
  workspaceId: string,
  filter: FilterCondition,
): Promise<T | null> => {
  const { clause: whereClause, params } = buildWhereClause(filter, workspaceId);

  const query = `
    SELECT *
    FROM "${tableName}"
    WHERE ${whereClause}
    LIMIT 1
  `;

  const result = await db
    .prepare(query)
    .bind(...params)
    .first<T>();

  return result;
};

/**
 * Execute an INSERT query on D1
 */
export const executeInsert = async <T extends Record<string, unknown>>(
  db: D1Database,
  tableName: string,
  workspaceId: string,
  data: T,
): Promise<T & { id: string }> => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    ...data,
    workspaceId,
    createdAt: now,
    updatedAt: now,
  };

  const columns = Object.keys(record);
  const placeholders = columns.map(() => '?').join(', ');
  const values = Object.values(record);

  const query = `
    INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
    VALUES (${placeholders})
  `;

  await db
    .prepare(query)
    .bind(...values)
    .run();

  return record as T & { id: string };
};

/**
 * Execute a batch INSERT query on D1
 */
export const executeInsertMany = async <T extends Record<string, unknown>>(
  db: D1Database,
  tableName: string,
  workspaceId: string,
  dataArray: T[],
): Promise<Array<T & { id: string }>> => {
  const now = new Date().toISOString();
  const records: Array<T & { id: string; workspaceId: string }> = [];

  const statements = dataArray.map((data) => {
    const id = crypto.randomUUID();
    const record = {
      id,
      ...data,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    };

    records.push(record as T & { id: string; workspaceId: string });

    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(record);

    const query = `
      INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
      VALUES (${placeholders})
    `;

    return db.prepare(query).bind(...values);
  });

  // Execute batch
  await db.batch(statements);

  return records;
};

/**
 * Execute an UPDATE query on D1
 */
export const executeUpdate = async <T extends Record<string, unknown>>(
  db: D1Database,
  tableName: string,
  workspaceId: string,
  id: string,
  data: Partial<T>,
): Promise<T | null> => {
  const now = new Date().toISOString();
  const updates = { ...data, updatedAt: now };

  const setClauses = Object.keys(updates)
    .map((key) => `"${key}" = ?`)
    .join(', ');
  const values = [...Object.values(updates), workspaceId, id];

  const query = `
    UPDATE "${tableName}"
    SET ${setClauses}
    WHERE workspaceId = ? AND id = ?
  `;

  await db
    .prepare(query)
    .bind(...values)
    .run();

  // Return updated record
  return executeSelectOne<T>(db, tableName, workspaceId, { id });
};

/**
 * Execute a soft DELETE query on D1
 */
export const executeSoftDelete = async <T>(
  db: D1Database,
  tableName: string,
  workspaceId: string,
  id: string,
): Promise<T | null> => {
  const now = new Date().toISOString();

  const query = `
    UPDATE "${tableName}"
    SET "deletedAt" = ?, "updatedAt" = ?
    WHERE workspaceId = ? AND id = ? AND "deletedAt" IS NULL
  `;

  await db.prepare(query).bind(now, now, workspaceId, id).run();

  // Return the soft-deleted record
  const selectQuery = `
    SELECT * FROM "${tableName}"
    WHERE workspaceId = ? AND id = ?
  `;

  return db.prepare(selectQuery).bind(workspaceId, id).first<T>();
};

/**
 * Execute a hard DELETE query on D1
 */
export const executeHardDelete = async (
  db: D1Database,
  tableName: string,
  workspaceId: string,
  id: string,
): Promise<boolean> => {
  const query = `
    DELETE FROM "${tableName}"
    WHERE workspaceId = ? AND id = ?
  `;

  const result = await db.prepare(query).bind(workspaceId, id).run();

  return result.meta.changes > 0;
};
