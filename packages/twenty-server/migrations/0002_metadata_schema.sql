-- D1 Migration 0002: Metadata schema (dataSource, objectMetadata, fieldMetadata)
--
-- Notes:
-- - D1 is SQLite-based; keep types SQLite-friendly.
-- - Enable FK enforcement explicitly.

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- dataSource
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dataSource (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,

  label TEXT,
  url TEXT,
  schema TEXT,
  type TEXT NOT NULL DEFAULT 'postgres',
  isRemote INTEGER NOT NULL DEFAULT 0,

  createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IDX_DATA_SOURCE_WORKSPACE_ID_CREATED_AT
  ON dataSource(workspaceId, createdAt);

-- -----------------------------------------------------------------------------
-- objectMetadata
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS objectMetadata (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  universalIdentifier TEXT,
  applicationId TEXT,

  standardId TEXT,
  dataSourceId TEXT NOT NULL,

  nameSingular TEXT NOT NULL,
  namePlural TEXT NOT NULL,
  labelSingular TEXT NOT NULL,
  labelPlural TEXT NOT NULL,
  description TEXT,
  icon TEXT,

  standardOverrides TEXT,

  targetTableName TEXT NOT NULL,

  isCustom INTEGER NOT NULL DEFAULT 0,
  isRemote INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 0,
  isSystem INTEGER NOT NULL DEFAULT 0,
  isUIReadOnly INTEGER NOT NULL DEFAULT 0,
  isAuditLogged INTEGER NOT NULL DEFAULT 1,
  isSearchable INTEGER NOT NULL DEFAULT 0,

  duplicateCriteria TEXT,
  shortcut TEXT,

  labelIdentifierFieldMetadataId TEXT,
  imageIdentifierFieldMetadataId TEXT,

  isLabelSyncedWithName INTEGER NOT NULL DEFAULT 0,

  createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (dataSourceId) REFERENCES dataSource(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS IDX_OBJECT_METADATA_NAME_SINGULAR_WORKSPACE_ID_UNIQUE
  ON objectMetadata(nameSingular, workspaceId);

CREATE UNIQUE INDEX IF NOT EXISTS IDX_OBJECT_METADATA_NAME_PLURAL_WORKSPACE_ID_UNIQUE
  ON objectMetadata(namePlural, workspaceId);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_OBJECT_METADATA_WORKSPACE_ID_UNIVERSAL_IDENTIFIER
  ON objectMetadata(workspaceId, universalIdentifier);

-- -----------------------------------------------------------------------------
-- fieldMetadata
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fieldMetadata (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL,
  universalIdentifier TEXT,
  applicationId TEXT,

  standardId TEXT,
  objectMetadataId TEXT NOT NULL,

  type TEXT NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,

  defaultValue TEXT,
  description TEXT,
  icon TEXT,

  standardOverrides TEXT,
  options TEXT,
  settings TEXT,

  isCustom INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 0,
  isSystem INTEGER NOT NULL DEFAULT 0,
  isUIReadOnly INTEGER NOT NULL DEFAULT 0,

  isNullable INTEGER DEFAULT 1,
  isUnique INTEGER DEFAULT 0,

  isLabelSyncedWithName INTEGER NOT NULL DEFAULT 0,

  relationTargetFieldMetadataId TEXT,
  relationTargetObjectMetadataId TEXT,
  morphId TEXT,

  createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  CHECK(
    (type != 'MORPH_RELATION')
    OR (type = 'MORPH_RELATION' AND morphId IS NOT NULL)
  ),

  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (objectMetadataId) REFERENCES objectMetadata(id) ON DELETE CASCADE,
  FOREIGN KEY (relationTargetObjectMetadataId) REFERENCES objectMetadata(id) ON DELETE CASCADE,
  FOREIGN KEY (relationTargetFieldMetadataId) REFERENCES fieldMetadata(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS IDX_FIELD_METADATA_RELATION_TARGET_FIELD_METADATA_ID
  ON fieldMetadata(relationTargetFieldMetadataId);

CREATE INDEX IF NOT EXISTS IDX_FIELD_METADATA_RELATION_TARGET_OBJECT_METADATA_ID
  ON fieldMetadata(relationTargetObjectMetadataId);

CREATE UNIQUE INDEX IF NOT EXISTS IDX_FIELD_METADATA_NAME_OBJECT_METADATA_ID_WORKSPACE_ID_UNIQUE
  ON fieldMetadata(name, objectMetadataId, workspaceId);

CREATE INDEX IF NOT EXISTS IDX_FIELD_METADATA_OBJECT_METADATA_ID_WORKSPACE_ID
  ON fieldMetadata(objectMetadataId, workspaceId);

CREATE INDEX IF NOT EXISTS IDX_FIELD_METADATA_WORKSPACE_ID
  ON fieldMetadata(workspaceId);

CREATE INDEX IF NOT EXISTS IDX_FIELD_METADATA_OBJECT_METADATA_ID
  ON fieldMetadata(objectMetadataId);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_FIELD_METADATA_WORKSPACE_ID_UNIVERSAL_IDENTIFIER
  ON fieldMetadata(workspaceId, universalIdentifier);
