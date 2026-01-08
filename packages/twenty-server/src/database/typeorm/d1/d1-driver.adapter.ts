/**
 * D1 Driver Adapter
 *
 * Provides an adapter layer to use Cloudflare D1 with TypeORM-like patterns.
 * This adapter bridges the gap between TypeORM's expected interface and D1's API.
 *
 * @module d1-driver-adapter
 */

// Env type is globally available from worker-configuration.d.ts

/**
 * Query result from D1
 */
export type D1QueryResult<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    served_by?: string;
  };
};

/**
 * D1 Driver Adapter
 *
 * Provides a simplified interface for database operations using D1.
 * Designed to work seamlessly in the Worker environment.
 */
export class D1DriverAdapter {
  private db: D1Database;
  private logging: boolean;

  constructor(db: D1Database, options: { logging?: boolean } = {}) {
    this.db = db;
    this.logging = options.logging ?? false;
  }

  /**
   * Create adapter from Worker environment
   */
  static fromEnv(
    env: Env,
    options: { logging?: boolean } = {},
  ): D1DriverAdapter {
    return new D1DriverAdapter(env.DB, options);
  }

  /**
   * Execute a SELECT query and return all results
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (this.logging) {
      console.log('[D1] Query:', sql, 'Params:', params);
    }

    const startTime = Date.now();
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.all<T>();

    if (this.logging) {
      console.log(
        `[D1] Query completed in ${Date.now() - startTime}ms, ${result.results.length} rows`,
      );
    }

    if (!result.success) {
      throw new D1Error('Query failed', sql, result.error);
    }

    return result.results;
  }

  /**
   * Execute a SELECT query and return first result
   */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    if (this.logging) {
      console.log('[D1] QueryOne:', sql, 'Params:', params);
    }

    const stmt = this.db.prepare(sql).bind(...params);

    return stmt.first<T>();
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement
   */
  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ changes: number; lastRowId: number }> {
    if (this.logging) {
      console.log('[D1] Execute:', sql, 'Params:', params);
    }

    const startTime = Date.now();
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.run();

    if (this.logging) {
      console.log(
        `[D1] Execute completed in ${Date.now() - startTime}ms, ${result.meta.changes} changes`,
      );
    }

    if (!result.success) {
      throw new D1Error('Execute failed', sql, result.error);
    }

    return {
      changes: result.meta.changes,
      lastRowId: result.meta.last_row_id,
    };
  }

  /**
   * Execute multiple statements in an atomic batch
   */
  async batch(
    statements: Array<{ sql: string; params?: unknown[] }>,
  ): Promise<D1QueryResult[]> {
    if (this.logging) {
      console.log('[D1] Batch:', statements.length, 'statements');
    }

    const preparedStatements = statements.map(({ sql, params = [] }) =>
      this.db.prepare(sql).bind(...params),
    );

    const results = await this.db.batch(preparedStatements);

    return results as D1QueryResult[];
  }

  /**
   * Begin a transaction-like batch operation
   *
   * D1 doesn't have traditional transactions, but batch operations are atomic.
   * This method provides a builder pattern for constructing batches.
   */
  transaction(): D1TransactionBuilder {
    return new D1TransactionBuilder(this);
  }

  /**
   * Get raw D1 database binding
   */
  getRawDatabase(): D1Database {
    return this.db;
  }
}

/**
 * Transaction-like batch builder for D1
 *
 * Collects statements and executes them atomically.
 */
export class D1TransactionBuilder {
  private statements: Array<{ sql: string; params?: unknown[] }> = [];
  private adapter: D1DriverAdapter;

  constructor(adapter: D1DriverAdapter) {
    this.adapter = adapter;
  }

  /**
   * Add a statement to the batch
   */
  add(sql: string, params?: unknown[]): this {
    this.statements.push({ sql, params });

    return this;
  }

  /**
   * Execute all statements atomically
   */
  async commit(): Promise<D1QueryResult[]> {
    if (this.statements.length === 0) {
      return [];
    }

    return this.adapter.batch(this.statements);
  }

  /**
   * Clear all pending statements
   */
  rollback(): void {
    this.statements = [];
  }
}

/**
 * D1-specific error class
 */
export class D1Error extends Error {
  public readonly sql: string;
  public readonly d1Error?: string;

  constructor(message: string, sql: string, d1Error?: string) {
    super(`${message}: ${d1Error || 'Unknown error'}`);
    this.name = 'D1Error';
    this.sql = sql;
    this.d1Error = d1Error;
  }
}

/**
 * Create a D1 adapter from environment
 *
 * Convenience function for quick adapter creation.
 */
export const createD1Adapter = (env: Env): D1DriverAdapter => {
  return D1DriverAdapter.fromEnv(env, {
    logging: env.LOG_LEVEL === 'debug',
  });
};
