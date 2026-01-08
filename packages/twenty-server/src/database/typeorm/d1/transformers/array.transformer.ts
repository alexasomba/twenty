/**
 * Array Value Transformer for D1/SQLite
 *
 * Transforms arrays to/from TEXT storage in SQLite using JSON serialization.
 * Used for columns that were array types in PostgreSQL.
 *
 * @example
 * ```typescript
 * @Column({ type: 'text', transformer: arrayTransformer, nullable: true })
 * tags: string[];
 * ```
 */
import { type ValueTransformer } from 'typeorm';

/**
 * Generic array transformer for TypeORM
 *
 * Serializes arrays to JSON strings for storage,
 * and parses JSON strings back to arrays when reading.
 */
export const arrayTransformer: ValueTransformer = {
  /**
   * Transform value before writing to database
   */
  to(value: unknown[]): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!Array.isArray(value)) {
      console.warn('arrayTransformer.to: Expected array, got:', typeof value);

      return JSON.stringify([value]);
    }
    try {
      return JSON.stringify(value);
    } catch {
      console.error('Failed to stringify array value:', value);

      return null;
    }
  },

  /**
   * Transform value after reading from database
   */
  from(value: string | null): unknown[] {
    if (value === null || value === undefined) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);

      if (!Array.isArray(parsed)) {
        console.warn(
          'arrayTransformer.from: Expected array, got:',
          typeof parsed,
        );

        return [parsed];
      }

      return parsed;
    } catch {
      console.error('Failed to parse array value:', value);

      return [];
    }
  },
};

/**
 * Typed array transformer factory
 *
 * Creates a type-safe array transformer for specific element types.
 *
 * @example
 * ```typescript
 * const stringArrayTransformer = createTypedArrayTransformer<string>();
 * const enumArrayTransformer = createTypedArrayTransformer<MyEnum>();
 * ```
 */
export const createTypedArrayTransformer = <T>(): ValueTransformer => ({
  to(value: T[] | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  },

  from(value: string | null): T[] {
    if (value === null || value === undefined) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  },
});

/**
 * String array transformer with additional validation
 */
export const stringArrayTransformer: ValueTransformer = {
  to(value: string[] | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    return JSON.stringify(value.filter((v) => typeof v === 'string'));
  },

  from(value: string | null): string[] {
    if (value === null || value === undefined) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string')
        : [];
    } catch {
      return [];
    }
  },
};
