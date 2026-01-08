/**
 * Boolean Value Transformer for D1/SQLite
 *
 * Transforms boolean values to/from INTEGER storage in SQLite.
 * SQLite stores booleans as INTEGER (0 or 1).
 *
 * @example
 * ```typescript
 * @Column({ type: 'integer', transformer: booleanTransformer, default: 0 })
 * isActive: boolean;
 * ```
 */
import { type ValueTransformer } from 'typeorm';

/**
 * Boolean transformer for TypeORM
 *
 * Converts boolean to 0/1 for storage, and 0/1 back to boolean when reading.
 */
export const booleanTransformer: ValueTransformer = {
  /**
   * Transform value before writing to database
   */
  to(value: boolean | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    return value ? 1 : 0;
  },

  /**
   * Transform value after reading from database
   */
  from(value: number | string | null | undefined): boolean | null {
    if (value === null || value === undefined) {
      return null;
    }
    // Handle both number and string representations
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      return value === '1' || value.toLowerCase() === 'true';
    }

    return Boolean(value);
  },
};

/**
 * Boolean transformer with default value
 *
 * Returns false instead of null for undefined values.
 */
export const booleanWithDefaultTransformer: ValueTransformer = {
  to(value: boolean | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return value ? 1 : 0;
  },

  from(value: number | string | null | undefined): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      return value === '1' || value.toLowerCase() === 'true';
    }

    return Boolean(value);
  },
};

/**
 * Boolean transformer that uses TEXT ('true'/'false')
 *
 * Alternative for compatibility with some SQLite patterns.
 */
export const booleanTextTransformer: ValueTransformer = {
  to(value: boolean | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    return value ? 'true' : 'false';
  },

  from(value: string | null | undefined): boolean | null {
    if (value === null || value === undefined) {
      return null;
    }

    return value.toLowerCase() === 'true';
  },
};
