-- Migration: 0003_crm_entities.sql
-- Description: Creates CRM standard object tables for D1 with workspace scoping
--
-- This migration creates the core CRM entity tables with workspaceId column
-- for tenant isolation (Option B: Single database with workspace scoping).
--
-- Tables created:
-- - company: Companies/organizations
-- - person: Contact persons (people)
-- - opportunity: Sales opportunities/deals
-- - note: Notes attached to records
-- - task: Tasks/todos attached to records
-- - attachment: File attachments
-- - favorite: User favorites/bookmarks
--
-- All tables include:
-- - workspaceId: For tenant isolation (indexed)
-- - Standard audit columns (id, createdAt, updatedAt, deletedAt)

-- ============================================================================
-- Company table
-- ============================================================================
CREATE TABLE IF NOT EXISTS company (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping (required for tenant isolation)
  workspaceId TEXT NOT NULL,

  -- Core fields
  name TEXT,
  employees INTEGER,
  idealCustomerProfile INTEGER DEFAULT 0, -- Boolean stored as INTEGER
  position REAL DEFAULT 0,

  -- JSON-serialized composite fields (D1/SQLite stores as TEXT)
  domainName TEXT, -- Links metadata (JSON)
  linkedinLink TEXT, -- Links metadata (JSON)
  xLink TEXT, -- Links metadata (JSON)
  annualRecurringRevenue TEXT, -- Currency metadata (JSON)
  address TEXT, -- Address metadata (JSON)
  createdBy TEXT, -- Actor metadata (JSON)
  updatedBy TEXT, -- Actor metadata (JSON)

  -- Account owner relation
  accountOwnerId TEXT,

  -- Search support (simplified for D1 - no tsvector)
  searchVector TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (accountOwnerId) REFERENCES workspaceMember(id) ON DELETE SET NULL
);

-- Company indexes
CREATE INDEX IF NOT EXISTS IDX_COMPANY_WORKSPACE ON company(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_COMPANY_NAME ON company(workspaceId, name);
CREATE INDEX IF NOT EXISTS IDX_COMPANY_DELETED ON company(workspaceId, deletedAt);
CREATE INDEX IF NOT EXISTS IDX_COMPANY_CREATED ON company(workspaceId, createdAt);
CREATE INDEX IF NOT EXISTS IDX_COMPANY_ACCOUNT_OWNER ON company(accountOwnerId);

-- ============================================================================
-- Person table
-- ============================================================================
CREATE TABLE IF NOT EXISTS person (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  jobTitle TEXT,
  phone TEXT, -- Deprecated, use phones
  city TEXT, -- Deprecated, use address
  avatarUrl TEXT,
  position REAL DEFAULT 0,

  -- JSON-serialized composite fields
  name TEXT, -- FullName metadata (JSON: {firstName, lastName})
  emails TEXT, -- Emails metadata (JSON)
  phones TEXT, -- Phones metadata (JSON)
  linkedinLink TEXT, -- Links metadata (JSON)
  xLink TEXT, -- Links metadata (JSON)
  createdBy TEXT, -- Actor metadata (JSON)
  updatedBy TEXT, -- Actor metadata (JSON)
  whatsapp TEXT, -- Links metadata (JSON)
  workPreference TEXT, -- Select field (JSON)
  performanceRating TEXT, -- Rating metadata (JSON)
  intro TEXT, -- Rich text (JSON)

  -- Relations
  companyId TEXT,

  -- Search support
  searchVector TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (companyId) REFERENCES company(id) ON DELETE SET NULL
);

-- Person indexes
CREATE INDEX IF NOT EXISTS IDX_PERSON_WORKSPACE ON person(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_PERSON_NAME ON person(workspaceId, name);
CREATE INDEX IF NOT EXISTS IDX_PERSON_COMPANY ON person(companyId);
CREATE INDEX IF NOT EXISTS IDX_PERSON_DELETED ON person(workspaceId, deletedAt);
CREATE INDEX IF NOT EXISTS IDX_PERSON_CREATED ON person(workspaceId, createdAt);

-- ============================================================================
-- Opportunity table
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  name TEXT,
  stage TEXT DEFAULT 'NEW',
  closeDate TEXT, -- DateTime as ISO string
  position REAL DEFAULT 0,

  -- JSON-serialized composite fields
  amount TEXT, -- Currency metadata (JSON)
  createdBy TEXT, -- Actor metadata (JSON)
  updatedBy TEXT, -- Actor metadata (JSON)

  -- Relations
  companyId TEXT,
  pointOfContactId TEXT,

  -- Search support
  searchVector TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (companyId) REFERENCES company(id) ON DELETE SET NULL,
  FOREIGN KEY (pointOfContactId) REFERENCES person(id) ON DELETE SET NULL
);

-- Opportunity indexes
CREATE INDEX IF NOT EXISTS IDX_OPPORTUNITY_WORKSPACE ON opportunity(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_OPPORTUNITY_STAGE ON opportunity(workspaceId, stage);
CREATE INDEX IF NOT EXISTS IDX_OPPORTUNITY_COMPANY ON opportunity(companyId);
CREATE INDEX IF NOT EXISTS IDX_OPPORTUNITY_POC ON opportunity(pointOfContactId);
CREATE INDEX IF NOT EXISTS IDX_OPPORTUNITY_DELETED ON opportunity(workspaceId, deletedAt);

-- ============================================================================
-- Note table
-- ============================================================================
CREATE TABLE IF NOT EXISTS note (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  title TEXT,
  position REAL DEFAULT 0,

  -- JSON-serialized fields
  body TEXT, -- Rich text content (JSON)
  createdBy TEXT, -- Actor metadata (JSON)
  updatedBy TEXT, -- Actor metadata (JSON)

  -- Search support
  searchVector TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE
);

-- Note indexes
CREATE INDEX IF NOT EXISTS IDX_NOTE_WORKSPACE ON note(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_NOTE_DELETED ON note(workspaceId, deletedAt);

-- ============================================================================
-- Note Target (polymorphic relation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS noteTarget (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Relations (polymorphic via morph fields)
  noteId TEXT NOT NULL,
  personId TEXT,
  companyId TEXT,
  opportunityId TEXT,

  -- Morph target (stored as JSON or separate columns)
  targetObjectName TEXT,
  targetRecordId TEXT,

  -- Actor metadata
  createdBy TEXT,
  updatedBy TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (noteId) REFERENCES note(id) ON DELETE CASCADE,
  FOREIGN KEY (personId) REFERENCES person(id) ON DELETE CASCADE,
  FOREIGN KEY (companyId) REFERENCES company(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunityId) REFERENCES opportunity(id) ON DELETE CASCADE
);

-- Note target indexes
CREATE INDEX IF NOT EXISTS IDX_NOTE_TARGET_WORKSPACE ON noteTarget(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_NOTE_TARGET_NOTE ON noteTarget(noteId);
CREATE INDEX IF NOT EXISTS IDX_NOTE_TARGET_PERSON ON noteTarget(personId);
CREATE INDEX IF NOT EXISTS IDX_NOTE_TARGET_COMPANY ON noteTarget(companyId);
CREATE INDEX IF NOT EXISTS IDX_NOTE_TARGET_OPPORTUNITY ON noteTarget(opportunityId);

-- ============================================================================
-- Task table
-- ============================================================================
CREATE TABLE IF NOT EXISTS task (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  title TEXT,
  status TEXT DEFAULT 'TODO',
  dueAt TEXT, -- DateTime as ISO string
  position REAL DEFAULT 0,

  -- JSON-serialized fields
  body TEXT, -- Rich text content (JSON)
  createdBy TEXT, -- Actor metadata (JSON)
  updatedBy TEXT, -- Actor metadata (JSON)

  -- Relations
  assigneeId TEXT,

  -- Search support
  searchVector TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (assigneeId) REFERENCES workspaceMember(id) ON DELETE SET NULL
);

-- Task indexes
CREATE INDEX IF NOT EXISTS IDX_TASK_WORKSPACE ON task(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_TASK_STATUS ON task(workspaceId, status);
CREATE INDEX IF NOT EXISTS IDX_TASK_ASSIGNEE ON task(assigneeId);
CREATE INDEX IF NOT EXISTS IDX_TASK_DUE ON task(workspaceId, dueAt);
CREATE INDEX IF NOT EXISTS IDX_TASK_DELETED ON task(workspaceId, deletedAt);

-- ============================================================================
-- Task Target (polymorphic relation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS taskTarget (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Relations
  taskId TEXT NOT NULL,
  personId TEXT,
  companyId TEXT,
  opportunityId TEXT,

  -- Morph target
  targetObjectName TEXT,
  targetRecordId TEXT,

  -- Actor metadata
  createdBy TEXT,
  updatedBy TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (taskId) REFERENCES task(id) ON DELETE CASCADE,
  FOREIGN KEY (personId) REFERENCES person(id) ON DELETE CASCADE,
  FOREIGN KEY (companyId) REFERENCES company(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunityId) REFERENCES opportunity(id) ON DELETE CASCADE
);

-- Task target indexes
CREATE INDEX IF NOT EXISTS IDX_TASK_TARGET_WORKSPACE ON taskTarget(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_TASK_TARGET_TASK ON taskTarget(taskId);
CREATE INDEX IF NOT EXISTS IDX_TASK_TARGET_PERSON ON taskTarget(personId);
CREATE INDEX IF NOT EXISTS IDX_TASK_TARGET_COMPANY ON taskTarget(companyId);

-- ============================================================================
-- Attachment table
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachment (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  name TEXT NOT NULL,
  fullPath TEXT NOT NULL,
  type TEXT NOT NULL,

  -- Relations
  authorId TEXT,

  -- Morph target (polymorphic attachment)
  targetObjectName TEXT,
  targetRecordId TEXT,

  -- Actor metadata
  createdBy TEXT,
  updatedBy TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (authorId) REFERENCES workspaceMember(id) ON DELETE SET NULL
);

-- Attachment indexes
CREATE INDEX IF NOT EXISTS IDX_ATTACHMENT_WORKSPACE ON attachment(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_ATTACHMENT_AUTHOR ON attachment(authorId);
CREATE INDEX IF NOT EXISTS IDX_ATTACHMENT_TARGET ON attachment(targetObjectName, targetRecordId);
CREATE INDEX IF NOT EXISTS IDX_ATTACHMENT_DELETED ON attachment(workspaceId, deletedAt);

-- ============================================================================
-- Favorite table (user bookmarks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS favorite (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  position REAL DEFAULT 0,

  -- Relations
  workspaceMemberId TEXT NOT NULL,
  favoriteFolderId TEXT,

  -- Morph target (which record is favorited)
  targetObjectName TEXT,
  targetRecordId TEXT,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (workspaceMemberId) REFERENCES workspaceMember(id) ON DELETE CASCADE
);

-- Favorite indexes
CREATE INDEX IF NOT EXISTS IDX_FAVORITE_WORKSPACE ON favorite(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_FAVORITE_MEMBER ON favorite(workspaceMemberId);
CREATE INDEX IF NOT EXISTS IDX_FAVORITE_TARGET ON favorite(targetObjectName, targetRecordId);
CREATE INDEX IF NOT EXISTS IDX_FAVORITE_POSITION ON favorite(workspaceMemberId, position);

-- ============================================================================
-- Favorite Folder table
-- ============================================================================
CREATE TABLE IF NOT EXISTS favoriteFolder (
  -- Primary key
  id TEXT PRIMARY KEY NOT NULL,

  -- Workspace scoping
  workspaceId TEXT NOT NULL,

  -- Core fields
  name TEXT NOT NULL,
  position REAL DEFAULT 0,

  -- Relations
  workspaceMemberId TEXT NOT NULL,

  -- Audit columns
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  deletedAt TEXT,

  -- Foreign keys
  FOREIGN KEY (workspaceId) REFERENCES workspace(id) ON DELETE CASCADE,
  FOREIGN KEY (workspaceMemberId) REFERENCES workspaceMember(id) ON DELETE CASCADE
);

-- Favorite folder indexes
CREATE INDEX IF NOT EXISTS IDX_FAVORITE_FOLDER_WORKSPACE ON favoriteFolder(workspaceId);
CREATE INDEX IF NOT EXISTS IDX_FAVORITE_FOLDER_MEMBER ON favoriteFolder(workspaceMemberId);

-- Add foreign key for favorite -> favoriteFolder after favoriteFolder is created
-- Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we define it inline above
