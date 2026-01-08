/**
 * JSON Value Transformer for D1/SQLite
 *
 * Transforms JSON objects to/from TEXT storage in SQLite.
 * Used for columns that were JSONB in PostgreSQL.
 *
 * @example
 * ```typescript
 * @Column({ type: 'text', transformer: jsonTransformer, nullable: true })
 * metadata: Record<string, unknown>;
 * ```
 */
import { type ValueTransformer } from 'typeorm';

/**
 * JSON transformer for TypeORM
 *
 * Serializes JavaScript objects to JSON strings for storage,
 * and parses JSON strings back to objects when reading.
 */
export const jsonTransformer: ValueTransformer = {
  /**
   * Transform value before writing to database
   */
  to(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.stringify(value);
    } catch {
      console.error('Failed to stringify JSON value:', value);

      return null;
    }
  },

  /**
   * Transform value after reading from database
   */
  from(value: string | null): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      console.error('Failed to parse JSON value:', value);

      return null;
    }
  },
};

/**
 * Typed JSON transformer factory
 *
 * Creates a type-safe JSON transformer for specific object types.
 *
 * @example
 * ```typescript
 * const metadataTransformer = createTypedJsonTransformer<WorkspaceMetadata>();
 * ```
 */
export const createTypedJsonTransformer = <T>(): ValueTransformer => ({
  to(value: T | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  },

  from(value: string | null): T | null {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },
});
