/**
 * JSONB Query Helper for D1/SQLite
 *
 * Provides helper functions for querying JSON data stored as TEXT in SQLite.
 * Replaces PostgreSQL JSONB operators with SQLite json_extract() functions.
 *
 * @example
 * ```typescript
 * // PostgreSQL: WHERE metadata->>'key' = 'value'
 * // SQLite: WHERE json_extract(metadata, '$.key') = 'value'
 * queryBuilder.where(jsonExtract('metadata', 'key'), 'value');
 * ```
 */

/**
 * Generate a json_extract() SQL expression
 *
 * @param column - The column name containing JSON text
 * @param path - The JSON path (without $. prefix)
 * @returns SQLite json_extract expression
 */
export const jsonExtract = (column: string, path: string): string => {
  // Handle nested paths
  const jsonPath = path.startsWith('$') ? path : `$.${path}`;

  return `json_extract(${column}, '${jsonPath}')`;
};

/**
 * Generate a json_extract() for array length
 *
 * @param column - The column name containing JSON array
 * @returns SQLite expression for array length
 */
export const jsonArrayLength = (column: string): string => {
  return `json_array_length(${column})`;
};

/**
 * Generate a json_each() table expression for array unnesting
 *
 * @param column - The column name containing JSON array
 * @param alias - Alias for the virtual table
 * @returns SQLite json_each expression for use in FROM/JOIN
 */
export const jsonEach = (column: string, alias: string = 'je'): string => {
  return `json_each(${column}) AS ${alias}`;
};

/**
 * Check if JSON array contains a value
 *
 * @param column - The column name containing JSON array
 * @param value - The value to search for (will be parameterized)
 * @returns SQLite EXISTS expression
 */
export const jsonArrayContains = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${paramPlaceholder})`;
};

/**
 * Extract nested JSON object
 *
 * @param column - The column name containing JSON
 * @param paths - Array of path segments
 * @returns SQLite json_extract expression for nested path
 */
export const jsonExtractNested = (
  column: string,
  ...paths: string[]
): string => {
  const jsonPath = `$.${paths.join('.')}`;

  return `json_extract(${column}, '${jsonPath}')`;
};

/**
 * Coalesce JSON value with default
 *
 * @param column - The column name containing JSON
 * @param path - The JSON path
 * @param defaultValue - Default value if null
 * @returns SQLite COALESCE expression
 */
export const jsonExtractWithDefault = (
  column: string,
  path: string,
  defaultValue: string,
): string => {
  return `COALESCE(${jsonExtract(column, path)}, '${defaultValue}')`;
};

/**
 * JSON type check helper
 *
 * @param column - The column name containing JSON
 * @param path - The JSON path
 * @param type - Expected JSON type ('null', 'true', 'false', 'integer', 'real', 'text', 'array', 'object')
 * @returns SQLite json_type expression
 */
export const jsonType = (column: string, path: string): string => {
  const jsonPath = path.startsWith('$') ? path : `$.${path}`;

  return `json_type(${column}, '${jsonPath}')`;
};
