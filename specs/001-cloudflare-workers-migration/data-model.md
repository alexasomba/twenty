# Data Model: Migrate Twenty CRM to Cloudflare Workers Stack

**Branch**: `001-cloudflare-workers-migration`
**Date**: 2026-01-08
**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

## Overview

This document defines the data model changes required to migrate Twenty CRM from PostgreSQL to Cloudflare D1 (SQLite-compatible).

## Type Mapping Reference

### PostgreSQL → SQLite Type Conversions

| PostgreSQL Type | SQLite/D1 Type | TypeORM Decorator | Notes |
|-----------------|----------------|-------------------|-------|
| `uuid` | `TEXT` | `@Column({ type: 'text' })` | UUID generated in application |
| `text` | `TEXT` | `@Column({ type: 'text' })` | Direct mapping |
| `varchar(n)` | `TEXT` | `@Column({ type: 'text' })` | No length enforcement in SQLite |
| `integer` | `INTEGER` | `@Column({ type: 'integer' })` | Direct mapping |
| `bigint` | `INTEGER` | `@Column({ type: 'integer' })` | SQLite uses 64-bit integers |
| `numeric`/`decimal` | `REAL` | `@Column({ type: 'real' })` | Floating point approximation |
| `boolean` | `INTEGER` | `@Column({ type: 'integer' })` | 0 = false, 1 = true |
| `timestamp`/`timestamptz` | `TEXT` | `@Column({ type: 'text' })` | ISO 8601 string format |
| `date` | `TEXT` | `@Column({ type: 'text' })` | YYYY-MM-DD format |
| `jsonb` | `TEXT` | `@Column({ type: 'text', transformer })` | JSON.stringify/parse |
| `array` | `TEXT` | `@Column({ type: 'text', transformer })` | JSON array format |
| `enum` | `TEXT` | `@Column({ type: 'text' })` | CHECK constraint in migration |
| `bytea` | `BLOB` | `@Column({ type: 'blob' })` | Direct mapping |

## Value Transformers

### JSON Transformer (for JSONB columns)

```typescript
// packages/twenty-server/src/database/typeorm/d1/transformers/json.transformer.ts

import { ValueTransformer } from 'typeorm';

export const jsonTransformer: ValueTransformer = {
  to: (value: unknown): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    return JSON.stringify(value);
  },
  from: (value: string | null): unknown => {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
};
```

### Array Transformer (for array columns)

```typescript
// packages/twenty-server/src/database/typeorm/d1/transformers/array.transformer.ts

import { ValueTransformer } from 'typeorm';

export const arrayTransformer: ValueTransformer = {
  to: (value: unknown[]): string | null => {
    if (!Array.isArray(value)) {
      return null;
    }
    return JSON.stringify(value);
  },
  from: (value: string | null): unknown[] => {
    if (value === null || value === undefined) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
};
```

### Timestamp Transformer (for timestamptz columns)

```typescript
// packages/twenty-server/src/database/typeorm/d1/transformers/timestamp.transformer.ts

import { ValueTransformer } from 'typeorm';

export const timestampTransformer: ValueTransformer = {
  to: (value: Date | string | null): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  },
  from: (value: string | null): Date | null => {
    if (value === null || value === undefined) {
      return null;
    }
    return new Date(value);
  },
};
```

### Boolean Transformer (for boolean columns)

```typescript
// packages/twenty-server/src/database/typeorm/d1/transformers/boolean.transformer.ts

import { ValueTransformer } from 'typeorm';

export const booleanTransformer: ValueTransformer = {
  to: (value: boolean | null): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    return value ? 1 : 0;
  },
  from: (value: number | null): boolean | null => {
    if (value === null || value === undefined) {
      return null;
    }
    return value === 1;
  },
};
```

## Entity Migration Examples

### Example 1: User Entity (UUID, timestamps, enum)

**Before (PostgreSQL)**:
```typescript
@Entity('core_user')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'enum', enum: UserState, default: UserState.ACTIVE })
  state: UserState;
}
```

**After (D1/SQLite)**:
```typescript
import { v4 as uuidv4 } from 'uuid';
import { timestampTransformer } from '../d1/transformers/timestamp.transformer';

@Entity('core_user')
export class User {
  @PrimaryColumn({ type: 'text' })
  id: string = uuidv4();

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text', transformer: timestampTransformer })
  createdAt: Date;

  @Column({ type: 'text', default: 'active' })
  state: 'active' | 'inactive' | 'deleted';
}
```

### Example 2: Workspace Entity (JSONB, arrays)

**Before (PostgreSQL)**:
```typescript
@Entity('core_workspace')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, any>;

  @Column({ type: 'text', array: true, default: [] })
  allowedDomains: string[];
}
```

**After (D1/SQLite)**:
```typescript
import { jsonTransformer, arrayTransformer } from '../d1/transformers';

@Entity('core_workspace')
export class Workspace {
  @PrimaryColumn({ type: 'text' })
  id: string = uuidv4();

  @Column({ type: 'text', transformer: jsonTransformer, nullable: true })
  settings: Record<string, any>;

  @Column({ type: 'text', transformer: arrayTransformer, default: '[]' })
  allowedDomains: string[];
}
```

### Example 3: AppToken Entity (complex, foreign keys)

**Before (PostgreSQL)**:
```typescript
@Entity('core_app_token')
export class AppToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, any>;

  @Column({ type: 'enum', enum: AppTokenType })
  type: AppTokenType;
}
```

**After (D1/SQLite)**:
```typescript
@Entity('core_app_token')
export class AppToken {
  @PrimaryColumn({ type: 'text' })
  id: string = uuidv4();

  @Column({ type: 'text' })
  workspaceId: string;

  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'text', transformer: timestampTransformer })
  expiresAt: Date;

  @Column({ type: 'text', transformer: jsonTransformer, nullable: true })
  context: Record<string, any>;

  @Column({ type: 'text' })
  type: 'AccessToken' | 'RefreshToken' | 'LoginToken' | 'TransientToken' | ...;
}
```

## Migration Script Pattern

### D1 Migration Template

```sql
-- migrations/0001_initial_schema.sql

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Core schema (converted from PostgreSQL)
CREATE TABLE IF NOT EXISTS core_user (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'inactive', 'deleted')),
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS core_workspace (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  domain_name TEXT UNIQUE,
  invite_hash TEXT,
  logo TEXT,
  settings TEXT, -- JSON
  allowed_domains TEXT DEFAULT '[]', -- JSON array
  is_public_invitation_link_enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS core_workspace_member (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES core_user(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES core_workspace(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
  name TEXT, -- JSON {firstName, lastName}
  locale TEXT DEFAULT 'en',
  avatar_url TEXT,
  time_zone TEXT DEFAULT 'UTC',
  date_format TEXT DEFAULT 'SYSTEM', -- JSON
  time_format TEXT DEFAULT 'SYSTEM', -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS core_app_token (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT REFERENCES core_workspace(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES core_user(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('AccessToken', 'RefreshToken', 'LoginToken', 'TransientToken', 'PasswordResetToken', 'EmailVerificationToken', 'InvitationToken', 'ApiKey', 'WorkspaceMemberInvitation')),
  value TEXT NOT NULL,
  context TEXT, -- JSON
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_user_email ON core_user(email);
CREATE INDEX idx_workspace_domain ON core_workspace(domain_name);
CREATE INDEX idx_workspace_member_user ON core_workspace_member(user_id);
CREATE INDEX idx_workspace_member_workspace ON core_workspace_member(workspace_id);
CREATE INDEX idx_app_token_value ON core_app_token(value);
CREATE INDEX idx_app_token_workspace ON core_app_token(workspace_id);
CREATE INDEX idx_app_token_user ON core_app_token(user_id);
```

## Query Helper Functions

### JSONB Query Replacement

```typescript
// packages/twenty-server/src/database/typeorm/d1/query-helpers.ts

/**
 * Helper for querying JSON fields in SQLite
 * Replaces PostgreSQL JSONB operators (->>, ->)
 */
export const jsonExtract = (column: string, path: string): string => {
  return `json_extract(${column}, '$.${path}')`;
};

/**
 * Helper for case-insensitive search (replaces ILIKE)
 */
export const ilike = (column: string, pattern: string): string => {
  return `${column} LIKE '${pattern}' COLLATE NOCASE`;
};

/**
 * Helper for array contains check
 */
export const arrayContains = (column: string, value: string): string => {
  return `json_extract(${column}, '$') LIKE '%"${value}"%'`;
};

// Usage in QueryBuilder:
// .where(jsonExtract('metadata', 'key'), '=', 'value')
// .where(ilike('name', '%search%'))
```

## Schema Differences Summary

| Concern | PostgreSQL | D1/SQLite | Impact |
|---------|------------|-----------|--------|
| Auto-increment | `SERIAL`/`BIGSERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Low |
| UUID generation | `uuid_generate_v4()` | Application-side `uuidv4()` | Low |
| Case-insensitive | `ILIKE` | `LIKE ... COLLATE NOCASE` | Low |
| JSON queries | `jsonb_extract_path_text()` | `json_extract()` | Medium |
| Array columns | Native arrays | JSON text arrays | Medium |
| Enums | Native `CREATE TYPE` | TEXT + CHECK | Low |
| Full-text search | `tsvector`/`tsquery` | FTS5 extension | High (if used) |
| Transactions | Multi-statement | Single-statement preferred | Medium |

## Entity Count by Complexity

| Complexity | Count | Description |
|------------|-------|-------------|
| Simple (UUID + timestamps only) | 25 | Direct migration with transformers |
| Medium (+ JSONB or enum) | 28 | Transformers + CHECK constraints |
| Complex (arrays, multiple JSONB, many enums) | 10 | Careful migration, test thoroughly |

## Validation Strategy

1. **Unit Tests**: Test each transformer with edge cases (null, empty, malformed)
2. **Entity Tests**: Validate save/load roundtrips for each entity
3. **Query Tests**: Verify all QueryBuilder patterns work with SQLite
4. **Integration Tests**: Test against local D1 with real data samples
5. **Migration Tests**: Dry-run migration with PostgreSQL data export

## Foreign Key Enforcement

D1/SQLite requires explicit foreign key enforcement:

```sql
-- At connection time or start of session
PRAGMA foreign_keys = ON;

-- During complex migrations (disable temporarily)
PRAGMA defer_foreign_keys = true;
-- ... migration steps ...
PRAGMA defer_foreign_keys = false;
```

**TypeORM Configuration**:
```typescript
// D1 datasource configuration
export const d1DataSourceOptions: DataSourceOptions = {
  type: 'better-sqlite3',
  database: ':memory:', // Replaced by D1 binding at runtime
  entities: [...],
  migrations: [...],
  synchronize: false,
  logging: ['error', 'warn'],
  extra: {
    // Enable foreign keys
    pragma: { foreign_keys: 'ON' },
  },
};
```
