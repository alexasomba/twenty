/**
 * Array Query Helper for D1/SQLite
 *
 * Provides helper functions for querying arrays stored as JSON TEXT in SQLite.
 * Replaces PostgreSQL array operators with SQLite JSON array functions.
 *
 * @example
 * ```typescript
 * // PostgreSQL: WHERE 'tag' = ANY(tags)
 * // SQLite: WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE value = 'tag')
 * queryBuilder.where(arrayContains('tags'), tag);
 * ```
 */

/**
 * Generate SQL to check if array contains a specific value
 *
 * @param column - The column name containing JSON array
 * @param paramPlaceholder - Parameter placeholder (default: ?)
 * @returns SQLite EXISTS expression for array containment check
 */
export const arrayContains = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${paramPlaceholder})`;
};

/**
 * Generate SQL to check if array contains any of the given values
 *
 * @param column - The column name containing JSON array
 * @param count - Number of values to check
 * @returns SQLite EXISTS expression for array overlap check
 */
export const arrayContainsAny = (column: string, count: number): string => {
  const placeholders = Array(count).fill('?').join(', ');

  return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value IN (${placeholders}))`;
};

/**
 * Generate SQL to check if array contains all of the given values
 *
 * @param column - The column name containing JSON array
 * @param count - Number of values that must all be present
 * @returns SQLite expression for array containment check
 */
export const arrayContainsAll = (column: string, count: number): string => {
  const conditions = Array(count)
    .fill(null)
    .map(
      (_, i) => `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ?)`,
    )
    .join(' AND ');

  return `(${conditions})`;
};

/**
 * Generate SQL for array length
 *
 * @param column - The column name containing JSON array
 * @returns SQLite json_array_length expression
 */
export const arrayLength = (column: string): string => {
  return `json_array_length(${column})`;
};

/**
 * Generate SQL to check if array is empty
 *
 * @param column - The column name containing JSON array
 * @returns SQLite expression checking for empty array
 */
export const arrayIsEmpty = (column: string): string => {
  return `(${column} IS NULL OR json_array_length(${column}) = 0)`;
};

/**
 * Generate SQL to check if array is not empty
 *
 * @param column - The column name containing JSON array
 * @returns SQLite expression checking for non-empty array
 */
export const arrayIsNotEmpty = (column: string): string => {
  return `(${column} IS NOT NULL AND json_array_length(${column}) > 0)`;
};

/**
 * Generate SQL to get array element at index
 *
 * @param column - The column name containing JSON array
 * @param index - Zero-based array index
 * @returns SQLite json_extract expression for array element
 */
export const arrayElementAt = (column: string, index: number): string => {
  return `json_extract(${column}, '$[${index}]')`;
};

/**
 * Generate SQL to append value to array (for UPDATE)
 *
 * Note: SQLite doesn't have native array append, so this creates
 * a new array by combining existing elements with new value.
 *
 * @param column - The column name containing JSON array
 * @returns SQLite expression for appending to array
 */
export const arrayAppend = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `json_insert(COALESCE(${column}, '[]'), '$[#]', ${paramPlaceholder})`;
};

/**
 * Generate SQL to remove value from array (for UPDATE)
 *
 * @param column - The column name containing JSON array
 * @returns SQLite expression for removing from array (returns new array)
 */
export const arrayRemove = (
  column: string,
  paramPlaceholder: string = '?',
): string => {
  return `(SELECT json_group_array(value) FROM json_each(${column}) WHERE value != ${paramPlaceholder})`;
};
