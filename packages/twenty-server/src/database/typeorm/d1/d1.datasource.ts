/**
 * D1 DataSource Configuration
 *
 * TypeORM DataSource configuration for Cloudflare D1 (SQLite-compatible).
 * This file provides the database connection configuration for the Worker environment.
 *
 * @module d1-datasource
 */

import { DataSource, type DataSourceOptions } from 'typeorm';

/**
 * D1 DataSource options
 *
 * These options configure TypeORM to work with SQLite (D1-compatible).
 * Note: In the actual Worker, we use the D1 binding directly, not this DataSource.
 * This configuration is primarily for:
 * - Local development with SQLite
 * - Migration generation
 * - Type checking
 */
export const d1DataSourceOptions: DataSourceOptions = {
  type: 'better-sqlite3',
  database: ':memory:', // Will be overridden by D1 binding in production
  synchronize: false, // Never auto-sync in production
  logging: process.env.LOG_LEVEL === 'debug',
  entities: [
    // Core entities
    __dirname + '/../../engine/core-modules/**/*.entity.{ts,js}',
    // Metadata entities
    __dirname + '/../../engine/metadata-modules/**/*.entity.{ts,js}',
  ],
  migrations: [__dirname + '/../../../migrations/*.{ts,js}'],
  migrationsTableName: '__migrations',
};

/**
 * D1 DataSource instance for development and migrations
 *
 * Usage:
 * ```typescript
 * import { d1DataSource } from './d1.datasource';
 * await d1DataSource.initialize();
 * ```
 */
export const d1DataSource = new DataSource(d1DataSourceOptions);

/**
 * Create a DataSource for a specific SQLite file
 *
 * Useful for testing or local development with persistent storage.
 *
 * @param databasePath - Path to SQLite database file
 * @returns Configured DataSource
 */
export const createD1DataSource = (databasePath: string): DataSource => {
  return new DataSource({
    ...d1DataSourceOptions,
    database: databasePath,
  });
};

/**
 * D1 Database configuration for production
 *
 * In the Worker environment, we use the D1 binding directly.
 * This interface represents the configuration needed.
 */
export type D1Config = {
  /** D1 database binding from Worker env */
  database: D1Database;
  /** Enable query logging */
  logging?: boolean;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
};

/**
 * Execute a query using D1 binding
 *
 * Low-level query execution for cases where TypeORM isn't suitable.
 *
 * @param db - D1 database binding
 * @param sql - SQL query string
 * @param params - Query parameters
 * @returns Query results
 */
export const executeD1Query = async <T = unknown>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.all<T>();

  if (!result.success) {
    throw new Error(`D1 query failed: ${result.error}`);
  }

  return result.results;
};

/**
 * Execute a single-result query using D1 binding
 *
 * @param db - D1 database binding
 * @param sql - SQL query string
 * @param params - Query parameters
 * @returns Single result or null
 */
export const executeD1First = async <T = unknown>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> => {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.first<T>();

  return result;
};

/**
 * Execute a write operation using D1 binding
 *
 * @param db - D1 database binding
 * @param sql - SQL statement (INSERT, UPDATE, DELETE)
 * @param params - Query parameters
 * @returns Write result with changes count
 */
export const executeD1Run = async (
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<{ changes: number; lastRowId: number }> => {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.run();

  if (!result.success) {
    throw new Error(`D1 write failed: ${result.error}`);
  }

  return {
    changes: result.meta.changes,
    lastRowId: result.meta.last_row_id,
  };
};

/**
 * Execute multiple statements in a batch
 *
 * D1 batches are atomic - all succeed or all fail.
 *
 * @param db - D1 database binding
 * @param statements - Array of prepared statements
 * @returns Array of results
 */
export const executeD1Batch = async (
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result<unknown>[]> => {
  return db.batch(statements);
};
