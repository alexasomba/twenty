-- D1 Migration 0001: Core schema (user, workspace, userWorkspace)
--
-- Notes:
-- - D1 is SQLite-based; keep types SQLite-friendly.
-- - Enable FK enforcement explicitly.

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- user
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  firstName TEXT NOT NULL DEFAULT '',
  lastName TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  defaultAvatarUrl TEXT,
  isEmailVerified INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  passwordHash TEXT,
  canImpersonate INTEGER NOT NULL DEFAULT 0,
  canAccessFullAdminPanel INTEGER NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'en',
  createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  deletedAt TEXT
);

-- Unique email among non-deleted users
CREATE UNIQUE INDEX IF NOT EXISTS UQ_USER_EMAIL
  ON "user"(email)
  WHERE deletedAt IS NULL;

-- -----------------------------------------------------------------------------
-- workspace
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY,
  displayName TEXT,
  logo TEXT,
  inviteHash TEXT,
  deletedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),

  allowImpersonation INTEGER NOT NULL DEFAULT 1,
  isPublicInviteLinkEnabled INTEGER NOT NULL DEFAULT 1,
  trashRetentionDays INTEGER NOT NULL DEFAULT 14,

  activationStatus TEXT NOT NULL DEFAULT 'INACTIVE',
  metadataVersion INTEGER NOT NULL DEFAULT 1,

  databaseUrl TEXT NOT NULL DEFAULT '',
  databaseSchema TEXT NOT NULL DEFAULT '',
  subdomain TEXT NOT NULL,
  customDomain TEXT,

  isGoogleAuthEnabled INTEGER NOT NULL DEFAULT 1,
  isGoogleAuthBypassEnabled INTEGER NOT NULL DEFAULT 0,
  isTwoFactorAuthenticationEnforced INTEGER NOT NULL DEFAULT 0,
  isPasswordAuthEnabled INTEGER NOT NULL DEFAULT 1,
  isPasswordAuthBypassEnabled INTEGER NOT NULL DEFAULT 0,
  isMicrosoftAuthEnabled INTEGER NOT NULL DEFAULT 1,
  isMicrosoftAuthBypassEnabled INTEGER NOT NULL DEFAULT 0,
  isCustomDomainEnabled INTEGER NOT NULL DEFAULT 0,

  editableProfileFields TEXT DEFAULT '["email","profilePicture","firstName","lastName"]',

  defaultRoleId TEXT,
  version TEXT,
  fastModel TEXT NOT NULL DEFAULT 'default-fast-model',
  smartModel TEXT NOT NULL DEFAULT 'default-smart-model',
  workspaceCustomApplicationId TEXT NOT NULL,
  routerModel TEXT NOT NULL DEFAULT 'auto'
);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_WORKSPACE_SUBDOMAIN
  ON workspace(subdomain);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_WORKSPACE_CUSTOM_DOMAIN
  ON workspace(customDomain)
  WHERE customDomain IS NOT NULL;

CREATE INDEX IF NOT EXISTS IDX_WORKSPACE_ACTIVATION_STATUS
  ON workspace(activationStatus);

-- -----------------------------------------------------------------------------
-- userWorkspace (workspace membership)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS userWorkspace (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  workspaceId TEXT NOT NULL,

  defaultAvatarUrl TEXT,
  locale TEXT NOT NULL DEFAULT 'en',

  createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  deletedAt TEXT,

  FOREIGN KEY (userId) REFERENCES "user"(id) ON DELETE CASCADE,
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS IDX_USER_WORKSPACE_USER_ID_WORKSPACE_ID_UNIQUE
  ON userWorkspace(userId, workspaceId)
  WHERE deletedAt IS NULL;

CREATE INDEX IF NOT EXISTS IDX_USER_WORKSPACE_USER_ID
  ON userWorkspace(userId);

CREATE INDEX IF NOT EXISTS IDX_USER_WORKSPACE_WORKSPACE_ID
  ON userWorkspace(workspaceId);
