/**
 * D1/SQLite Query Helpers
 *
 * This module exports all query helper functions for PostgreSQL → SQLite query migration.
 * These helpers provide SQLite-compatible alternatives to PostgreSQL-specific operators.
 *
 * @module query-helpers
 */

// JSONB query helpers (PostgreSQL JSONB → SQLite json_extract)
export {
  jsonArrayContains,
  jsonArrayLength,
  jsonEach,
  jsonExtract,
  jsonExtractNested,
  jsonExtractWithDefault,
  jsonType,
} from './jsonb.helper';

// Array query helpers (PostgreSQL arrays → SQLite JSON arrays)
export {
  arrayAppend,
  arrayContains,
  arrayContainsAll,
  arrayContainsAny,
  arrayElementAt,
  arrayIsEmpty,
  arrayIsNotEmpty,
  arrayLength,
  arrayRemove,
} from './array.helper';

// LIKE query helpers (case-insensitive text search)
export {
  equalsNoCase,
  escapeLikePattern,
  ftsMatch,
  glob,
  likeContains,
  likeNoCase,
  likePrefix,
  likeSuffix,
  notLikeNoCase,
} from './like.helper';
