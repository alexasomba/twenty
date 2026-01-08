/**
 * Timestamp Value Transformer for D1/SQLite
 *
 * Transforms Date objects to/from TEXT storage in SQLite using ISO 8601 format.
 * Used for columns that were timestamptz in PostgreSQL.
 *
 * @example
 * ```typescript
 * @Column({ type: 'text', transformer: timestampTransformer })
 * createdAt: Date;
 * ```
 */
import { type ValueTransformer } from 'typeorm';

/**
 * Timestamp transformer for TypeORM
 *
 * Serializes Date objects to ISO 8601 strings for storage,
 * and parses ISO strings back to Date objects when reading.
 */
export const timestampTransformer: ValueTransformer = {
  /**
   * Transform value before writing to database
   */
  to(value: Date | string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      // Validate it's a valid date string
      const date = new Date(value);

      if (isNaN(date.getTime())) {
        console.warn('timestampTransformer.to: Invalid date string:', value);

        return value; // Return as-is for SQLite to handle
      }

      return date.toISOString();
    }
    console.warn('timestampTransformer.to: Unexpected type:', typeof value);

    return null;
  },

  /**
   * Transform value after reading from database
   */
  from(value: string | null): Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      const date = new Date(value);

      if (isNaN(date.getTime())) {
        console.warn('timestampTransformer.from: Invalid date string:', value);

        return null;
      }

      return date;
    } catch {
      console.error('Failed to parse timestamp value:', value);

      return null;
    }
  },
};

/**
 * Timestamp transformer that returns strings instead of Date objects
 *
 * Useful when you want to work with ISO strings directly.
 */
export const timestampStringTransformer: ValueTransformer = {
  to(value: Date | string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
  },

  from(value: string | null): string | null {
    return value;
  },
};

/**
 * Create timestamp with current time if null
 *
 * Useful for createdAt columns that should auto-populate.
 */
export const timestampWithDefaultTransformer: ValueTransformer = {
  to(value: Date | string | null): string {
    if (value === null || value === undefined) {
      return new Date().toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value;
  },

  from(value: string | null): Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return new Date(value);
    } catch {
      return null;
    }
  },
};
