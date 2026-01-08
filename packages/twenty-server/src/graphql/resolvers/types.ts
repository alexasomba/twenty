/**
 * GraphQL Resolver Types for D1/Worker Environment
 *
 * Type definitions for workspace-scoped GraphQL resolvers.
 *
 * @module resolvers/types
 */

/**
 * Pagination arguments for list queries
 */
export interface PaginationArgs {
  first?: number;
  last?: number;
  before?: string;
  after?: string;
}

/**
 * Filter conditions for queries
 */
export interface FilterCondition {
  [field: string]:
    | string
    | number
    | boolean
    | null
    | { eq?: unknown; neq?: unknown; in?: unknown[]; like?: string };
}

/**
 * Order by specification
 */
export interface OrderBySpec {
  field: string;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}

/**
 * Common arguments for find operations
 */
export interface FindManyArgs extends PaginationArgs {
  filter?: FilterCondition;
  orderBy?: OrderBySpec[];
}

/**
 * Arguments for findOne operation
 */
export interface FindOneArgs {
  filter: FilterCondition;
}

/**
 * Arguments for create operations
 */
export interface CreateOneArgs<T> {
  data: T;
}

export interface CreateManyArgs<T> {
  data: T[];
}

/**
 * Arguments for update operations
 */
export interface UpdateOneArgs<T> {
  id: string;
  data: Partial<T>;
}

export interface UpdateManyArgs<T> {
  filter: FilterCondition;
  data: Partial<T>;
}

/**
 * Arguments for delete operations
 */
export interface DeleteOneArgs {
  id: string;
}

export interface DeleteManyArgs {
  filter: FilterCondition;
}

/**
 * Page info for cursor-based pagination
 */
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

/**
 * Connection type for paginated results
 */
export interface Connection<T> {
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  pageInfo: PageInfo;
  totalCount?: number;
}

/**
 * Workspace context for resolvers
 */
export interface WorkspaceContext {
  workspaceId: string;
  userId?: string;
  db: D1Database;
}

/**
 * GraphQL context for Worker environment
 */
export interface ResolverContext {
  workspace: WorkspaceContext;
  requestId: string;
}

/**
 * Base record type with common fields
 */
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Object metadata for dynamic schema building
 */
export interface ObjectMetadata {
  id: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  isCustom: boolean;
  isActive: boolean;
  fields: FieldMetadata[];
}

/**
 * Field metadata for dynamic schema building
 */
export interface FieldMetadata {
  id: string;
  name: string;
  label: string;
  type: string;
  isNullable: boolean;
  isCustom: boolean;
  isActive: boolean;
  defaultValue?: unknown;
}
