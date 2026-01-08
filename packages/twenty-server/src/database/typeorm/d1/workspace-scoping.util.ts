/**
 * Workspace Scoping Utility for D1
 *
 * Provides utilities for adding workspace-level data isolation
 * when using a single D1 database with workspaceId column scoping.
 *
 * In PostgreSQL, isolation is achieved via per-workspace schemas.
 * In D1/SQLite, isolation is achieved via workspaceId column filtering.
 *
 * @module workspace-scoping
 */

import {
  type FindManyOptions,
  type FindOneOptions,
  type FindOptionsWhere,
  type ObjectLiteral,
} from 'typeorm';

import { isD1Environment } from 'src/database/typeorm/d1/is-d1-environment.util';

/**
 * Add workspaceId scoping to find options
 *
 * For D1/SQLite, this adds a workspaceId filter to ensure tenant isolation.
 * For PostgreSQL, this is a no-op (isolation via schema).
 *
 * @param options - TypeORM find options
 * @param workspaceId - The workspace ID to scope to
 * @returns Modified find options with workspace scoping
 */
export const addWorkspaceScope = <T extends ObjectLiteral>(
  options: FindManyOptions<T> | FindOneOptions<T> | undefined,
  workspaceId: string,
): FindManyOptions<T> | FindOneOptions<T> => {
  // Skip for PostgreSQL (uses schema-based isolation)
  if (!isD1Environment()) {
    return options ?? {};
  }

  const scopedOptions = { ...options } as FindManyOptions<T>;

  if (!scopedOptions.where) {
    scopedOptions.where = { workspaceId } as unknown as FindOptionsWhere<T>;
  } else if (Array.isArray(scopedOptions.where)) {
    // Multiple where conditions - add workspaceId to each
    scopedOptions.where = scopedOptions.where.map((condition) => ({
      ...condition,
      workspaceId,
    })) as FindOptionsWhere<T>[];
  } else {
    // Single where condition
    scopedOptions.where = {
      ...scopedOptions.where,
      workspaceId,
    } as FindOptionsWhere<T>;
  }

  return scopedOptions;
};

/**
 * Add workspaceId scoping to a where clause
 *
 * @param where - TypeORM where clause
 * @param workspaceId - The workspace ID to scope to
 * @returns Modified where clause with workspace scoping
 */
export const addWorkspaceScopeToWhere = <T extends ObjectLiteral>(
  where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
  workspaceId: string,
): FindOptionsWhere<T> | FindOptionsWhere<T>[] => {
  // Skip for PostgreSQL (uses schema-based isolation)
  if (!isD1Environment()) {
    return where ?? ({} as FindOptionsWhere<T>);
  }

  if (!where) {
    return { workspaceId } as unknown as FindOptionsWhere<T>;
  }

  if (Array.isArray(where)) {
    return where.map((condition) => ({
      ...condition,
      workspaceId,
    })) as FindOptionsWhere<T>[];
  }

  return {
    ...where,
    workspaceId,
  } as FindOptionsWhere<T>;
};

/**
 * Add workspaceId to an entity before insert/update
 *
 * For D1/SQLite, ensures workspaceId is set on all records.
 *
 * @param entity - Entity or array of entities
 * @param workspaceId - The workspace ID to add
 * @returns Entity with workspaceId added
 */
export const addWorkspaceIdToEntity = <T extends ObjectLiteral>(
  entity: T | T[],
  workspaceId: string,
): T | T[] => {
  // Skip for PostgreSQL (uses schema-based isolation)
  if (!isD1Environment()) {
    return entity;
  }

  if (Array.isArray(entity)) {
    return entity.map((e) => ({
      ...e,
      workspaceId,
    }));
  }

  return {
    ...entity,
    workspaceId,
  };
};

/**
 * Build a raw SQL WHERE clause for workspace scoping
 *
 * Useful for raw queries in D1.
 *
 * @param workspaceId - The workspace ID to scope to
 * @param alias - Optional table alias
 * @returns SQL WHERE clause fragment
 */
export const buildWorkspaceScopeClause = (
  workspaceId: string,
  alias?: string,
): string => {
  // Skip for PostgreSQL (uses schema-based isolation)
  if (!isD1Environment()) {
    return '1=1'; // Always true (no-op)
  }

  const column = alias ? `${alias}.workspaceId` : 'workspaceId';

  return `${column} = '${workspaceId}'`;
};

/**
 * Type guard to check if an entity has workspaceId
 */
export const hasWorkspaceId = (
  entity: unknown,
): entity is { workspaceId: string } => {
  return (
    typeof entity === 'object' &&
    entity !== null &&
    'workspaceId' in entity &&
    typeof (entity as { workspaceId: unknown }).workspaceId === 'string'
  );
};
