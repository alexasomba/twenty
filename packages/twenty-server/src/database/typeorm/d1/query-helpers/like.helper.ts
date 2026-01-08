/**
 * LIKE Query Helper for D1/SQLite
 *
 * Provides case-insensitive LIKE operations for SQLite.
 * SQLite LIKE is case-insensitive for ASCII but not for Unicode by default.
 *
 * @example
 * ```typescript
 * // PostgreSQL: WHERE name ILIKE '%john%'
 * // SQLite: WHERE name LIKE '%john%' COLLATE NOCASE
 * queryBuilder.where(likeNoCase('name', '%john%'));
 * ```
 */

/**
 * Generate case-insensitive LIKE expression
 *
 * @param column - The column name to search
 * @param paramPlaceholder - Parameter placeholder (default: ?)
 * @returns SQLite LIKE expression with COLLATE NOCASE
 */
export const likeNoCase = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `${column} LIKE ${paramPlaceholder} COLLATE NOCASE`;
};

/**
 * Generate case-insensitive NOT LIKE expression
 *
 * @param column - The column name to search
 * @param paramPlaceholder - Parameter placeholder (default: ?)
 * @returns SQLite NOT LIKE expression with COLLATE NOCASE
 */
export const notLikeNoCase = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `${column} NOT LIKE ${paramPlaceholder} COLLATE NOCASE`;
};

/**
 * Generate LIKE pattern for prefix match
 *
 * @param value - The prefix to match
 * @returns LIKE pattern with trailing wildcard
 */
export const likePrefix = (value: string): string => {
  return `${escapeLikePattern(value)}%`;
};

/**
 * Generate LIKE pattern for suffix match
 *
 * @param value - The suffix to match
 * @returns LIKE pattern with leading wildcard
 */
export const likeSuffix = (value: string): string => {
  return `%${escapeLikePattern(value)}`;
};

/**
 * Generate LIKE pattern for contains match
 *
 * @param value - The substring to find
 * @returns LIKE pattern with wildcards on both sides
 */
export const likeContains = (value: string): string => {
  return `%${escapeLikePattern(value)}%`;
};

/**
 * Escape special LIKE pattern characters
 *
 * @param value - The raw search value
 * @returns Escaped value safe for LIKE patterns
 */
export const escapeLikePattern = (value: string): string => {
  return value.replace(/[%_\\]/g, '\\$&');
};

/**
 * Generate case-insensitive equals using LOWER()
 *
 * Alternative to COLLATE NOCASE for exact matching.
 *
 * @param column - The column name
 * @param paramPlaceholder - Parameter placeholder (default: ?)
 * @returns SQLite expression using LOWER() on both sides
 */
export const equalsNoCase = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `LOWER(${column}) = LOWER(${paramPlaceholder})`;
};

/**
 * Generate GLOB expression (case-sensitive pattern matching)
 *
 * SQLite GLOB is always case-sensitive and uses * and ? wildcards.
 *
 * @param column - The column name
 * @param paramPlaceholder - Parameter placeholder (default: ?)
 * @returns SQLite GLOB expression
 */
export const glob = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `${column} GLOB ${paramPlaceholder}`;
};

/**
 * Full-text search hint for SQLite FTS5
 *
 * Note: Requires FTS5 virtual table to be set up separately.
 *
 * @param tableName - The FTS5 virtual table name
 * @param paramPlaceholder - Search query parameter placeholder
 * @returns SQLite FTS5 MATCH expression
 */
export const ftsMatch = (
  tableName: string,
  paramPlaceholder: string = '?',
): string => {
  return `${tableName} MATCH ${paramPlaceholder}`;
};
