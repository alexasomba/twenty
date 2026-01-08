/**
 * D1 Environment Detection Utility
 *
 * Provides utilities to detect whether the application is running
 * in a D1/SQLite environment vs PostgreSQL.
 *
 * @module is-d1-environment
 */

/**
 * Check if we're running in a Cloudflare Worker environment
 *
 * In Workers, we use D1 (SQLite) instead of PostgreSQL.
 * Detection is based on the presence of Cloudflare-specific globals.
 */
export const isCloudflareWorker = (): boolean => {
  // Check for Cloudflare Worker-specific globals
  // navigator.userAgent contains 'Cloudflare-Workers' in the Worker runtime
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    return navigator.userAgent.includes('Cloudflare-Workers');
  }

  // Alternative: Check for caches.default (Worker-specific)
  if (typeof caches !== 'undefined' && 'default' in caches) {
    return true;
  }

  return false;
};

/**
 * Check if we're using D1/SQLite as the database
 *
 * This can be true in:
 * - Cloudflare Worker production (D1 binding)
 * - Local development with SQLite/better-sqlite3
 * - Testing with in-memory SQLite
 */
export const isD1Environment = (): boolean => {
  // In Worker environment, always use D1
  if (isCloudflareWorker()) {
    return true;
  }

  // Check for explicit environment variable override
  if (
    process.env.DATABASE_TYPE === 'sqlite' ||
    process.env.DATABASE_TYPE === 'd1'
  ) {
    return true;
  }

  // Default to false (PostgreSQL) for NestJS/Node.js environment
  return false;
};

/**
 * Check if schemas are supported by the current database
 *
 * PostgreSQL supports schemas (e.g., workspace_abc123.tablename)
 * SQLite/D1 does not - we use workspaceId column instead
 */
export const supportsDatabaseSchemas = (): boolean => {
  return !isD1Environment();
};

/**
 * Get the database type string for logging/debugging
 */
export const getDatabaseType = (): 'postgres' | 'sqlite' | 'd1' => {
  if (isCloudflareWorker()) {
    return 'd1';
  }

  if (isD1Environment()) {
    return 'sqlite';
  }

  return 'postgres';
};
