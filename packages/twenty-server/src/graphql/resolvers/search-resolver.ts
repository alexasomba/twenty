/**
 * Search Resolver for D1
 *
 * Provides full-text search across workspace objects using
 * SQLite's LIKE with COLLATE NOCASE for case-insensitive matching.
 *
 * @module resolvers/search-resolver
 */

import { STANDARD_OBJECTS } from './object-record-resolver';

/**
 * Search result item
 */
interface SearchResultItem {
  id: string;
  objectName: string;
  recordId: string;
  label: string;
  snippet: string;
  score: number;
}

/**
 * Search arguments
 */
interface SearchArgs {
  query: string;
  objectNames?: string[];
  limit?: number;
}

/**
 * Context for search resolver
 */
interface SearchContext {
  workspaceId: string;
  db: D1Database;
}

/**
 * Searchable fields for each object type
 */
const SEARCHABLE_FIELDS: Record<string, string[]> = {
  company: ['name', 'domainName'],
  person: ['firstName', 'lastName', 'email'],
  opportunity: ['name'],
  note: ['title', 'body'],
  task: ['title', 'body'],
};

/**
 * Escape special SQL characters in search query
 */
const escapeSearchQuery = (query: string): string => {
  return query.replace(/[%_]/g, '\\$&');
};

/**
 * Build search query for a single table
 */
const buildSearchQuery = (
  tableName: string,
  objectName: string,
  searchFields: string[],
  workspaceId: string,
  query: string,
  limit: number,
): { sql: string; params: unknown[] } => {
  const escapedQuery = escapeSearchQuery(query);
  const likePattern = `%${escapedQuery}%`;

  // Build OR conditions for each searchable field
  const fieldConditions = searchFields
    .map((field) => `"${field}" LIKE ? COLLATE NOCASE`)
    .join(' OR ');

  // Build snippet from matching field - use subquery or inline values to avoid parameter ordering issues
  // We'll inline the pattern directly in the CASE statement since it's the same pattern
  const snippetCase = searchFields
    .map(
      (field) =>
        `WHEN "${field}" LIKE '${likePattern.replace(/'/g, "''")}' COLLATE NOCASE THEN SUBSTR("${field}", 1, 100)`,
    )
    .join(' ');

  const sql = `
    SELECT
      id,
      '${objectName}' as objectName,
      id as recordId,
      ${searchFields.length === 1 ? `"${searchFields[0]}"` : `COALESCE(${searchFields.map((f) => `"${f}"`).join(', ')})`} as label,
      CASE ${snippetCase} ELSE '' END as snippet,
      1 as score
    FROM "${tableName}"
    WHERE workspaceId = ?
      AND "deletedAt" IS NULL
      AND (${fieldConditions})
    LIMIT ?
  `;

  // Parameters: workspaceId, then likePattern for each field condition (WHERE), then limit
  const params = [workspaceId, ...searchFields.map(() => likePattern), limit];

  return { sql, params };
};

/**
 * Create search resolver
 */
export const createSearchResolver = () => {
  return async (
    _parent: unknown,
    args: SearchArgs,
    context: SearchContext,
  ): Promise<SearchResultItem[]> => {
    const { workspaceId, db } = context;
    const { query, objectNames, limit = 20 } = args;

    if (!query || query.trim().length === 0) {
      return [];
    }

    // Determine which objects to search
    const objectsToSearch = objectNames?.length
      ? objectNames.filter((name) => STANDARD_OBJECTS[name])
      : Object.keys(STANDARD_OBJECTS);

    // Limit per object type
    const limitPerType = Math.ceil(limit / objectsToSearch.length);

    const allResults: SearchResultItem[] = [];

    // Execute search for each object type
    for (const objectName of objectsToSearch) {
      const config = STANDARD_OBJECTS[objectName];
      const searchFields = SEARCHABLE_FIELDS[objectName];

      if (!config || !searchFields) {
        continue;
      }

      const { sql, params } = buildSearchQuery(
        config.tableName,
        objectName,
        searchFields,
        workspaceId,
        query,
        limitPerType,
      );

      try {
        const result = await db
          .prepare(sql)
          .bind(...params)
          .all();
        const items = (result.results || []) as unknown as SearchResultItem[];

        allResults.push(...items);
      } catch (error) {
        // Log error but continue with other object types
        console.error(`Search failed for ${objectName}:`, error);
      }
    }

    // Sort by score and limit total results
    return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
  };
};

/**
 * Create global search resolvers
 */
export const createSearchResolvers = (): {
  Query: Record<string, unknown>;
} => {
  return {
    Query: {
      search: createSearchResolver(),
    },
  };
};
