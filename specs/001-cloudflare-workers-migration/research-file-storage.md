# File Storage Migration Research: S3 to Cloudflare R2

## Executive Summary

Twenty CRM has a **well-abstracted file storage system** with a driver-based architecture. Migration from S3 to Cloudflare R2 should be **straightforward** since R2 is S3-compatible. The S3Driver can be reused with minimal configuration changes.

---

## 1. Current Architecture

### 1.1 Storage Driver Abstraction

**Location:** `packages/twenty-server/src/engine/core-modules/file-storage/`

The system uses a clean driver abstraction pattern:

```
StorageDriver (Interface)
    ├── LocalDriver (filesystem storage)
    └── S3Driver (AWS S3 storage) ← Can work with R2
```

**StorageDriver Interface** ([storage-driver.interface.ts](packages/twenty-server/src/engine/core-modules/file-storage/drivers/interfaces/storage-driver.interface.ts)):
```typescript
export interface StorageDriver {
  write(params: { file: Buffer | Uint8Array | string; name: string; folder: string; mimeType: string | undefined }): Promise<void>;
  writeFolder(sources: Sources, folderPath: string): Promise<void>;
  read(params: { folderPath: string; filename: string }): Promise<Readable>;
  readFolder(folderPath: string): Promise<Sources>;
  delete(params: { folderPath: string; filename?: string }): Promise<void>;
  move(params: { from: { folderPath: string; filename?: string }; to: { folderPath: string; filename?: string } }): Promise<void>;
  copy(params: { from: { folderPath: string; filename?: string }; to: { folderPath: string; filename?: string } }): Promise<void>;
  download(params: { from: { folderPath: string; filename?: string }; to: { folderPath: string; filename?: string } }): Promise<void>;
  checkFileExists(params: { folderPath: string; filename: string }): Promise<boolean>;
  checkFolderExists(folderPath: string): Promise<boolean>;
}
```

### 1.2 FileStorageService

**Location:** [file-storage.service.ts](packages/twenty-server/src/engine/core-modules/file-storage/file-storage.service.ts)

The service is a facade that delegates to the current driver:
- Implements `StorageDriver` interface
- Uses `FileStorageDriverFactory` to get the active driver
- Supports runtime driver switching based on configuration

### 1.3 FileStorageDriverFactory

**Location:** [file-storage-driver.factory.ts](packages/twenty-server/src/engine/core-modules/file-storage/file-storage-driver.factory.ts)

Factory creates drivers based on `STORAGE_TYPE` environment variable:
- `LOCAL` → LocalDriver
- `S_3` → S3Driver

**S3 Configuration Variables:**
| Variable | Purpose |
|----------|---------|
| `STORAGE_TYPE` | Driver selection (`S_3` or `LOCAL`) |
| `STORAGE_S3_NAME` | Bucket name |
| `STORAGE_S3_ENDPOINT` | S3 endpoint URL |
| `STORAGE_S3_REGION` | AWS region |
| `STORAGE_S3_ACCESS_KEY_ID` | Access key |
| `STORAGE_S3_SECRET_ACCESS_KEY` | Secret key |

---

## 2. S3 SDK Usage Analysis

### 2.1 AWS SDK Imports

**Location:** [s3.driver.ts](packages/twenty-server/src/engine/core-modules/file-storage/drivers/s3.driver.ts)

```typescript
import {
  CopyObjectCommand,
  CreateBucketCommandInput,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommandInput,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
```

### 2.2 SDK Operations Used

| Operation | Command | Method |
|-----------|---------|--------|
| Upload file | `PutObjectCommand` | `write()` |
| Download file | `GetObjectCommand` | `read()` |
| Delete single file | `DeleteObjectCommand` | `delete()` |
| Delete multiple files | `DeleteObjectsCommand` | `emptyS3Directory()` |
| List objects | `ListObjectsV2Command` | `fetchS3FolderContents()` |
| Copy object | `CopyObjectCommand` | `copy()`, `move()` |
| Check file exists | `HeadObjectCommand` | `checkFileExists()` |
| Check bucket exists | `headBucket()` | `checkBucketExists()` |
| Create bucket | `createBucket()` | `createBucket()` |

### 2.3 S3Driver Options

```typescript
export interface S3DriverOptions extends S3ClientConfig {
  bucketName: string;
  endpoint?: string;  // Custom endpoint for S3-compatible services
  region: string;
}
```

**Note:** The `endpoint` option and `forcePathStyle: true` already support S3-compatible services like R2!

---

## 3. File Module Structure

### 3.1 File Folders

**Location:** [file-folder.interface.ts](packages/twenty-server/src/engine/core-modules/file/interfaces/file-folder.interface.ts)

```typescript
export enum FileFolder {
  ProfilePicture = 'profile-picture',
  WorkspaceLogo = 'workspace-logo',
  Attachment = 'attachment',
  PersonPicture = 'person-picture',
  ServerlessFunction = 'serverless-function',
  ServerlessFunctionToDelete = 'serverless-function-to-delete',
  File = 'file',
  AgentChat = 'agent-chat',
}
```

### 3.2 File Entity (Database Metadata)

**Location:** [file.entity.ts](packages/twenty-server/src/engine/core-modules/file/entities/file.entity.ts)

```typescript
@Entity('file')
export class FileEntity {
  id: string;           // UUID
  name: string;         // Original filename
  fullPath: string;     // Storage path
  size: number;         // File size in bytes (bigint)
  type: string;         // MIME type
  createdAt: Date;
  workspaceId: string;  // Workspace association
}
```

### 3.3 Storage Path Convention

Files are stored with the pattern:
```
workspace-{workspaceId}/{fileFolder}/{filename}
```

Example:
```
workspace-abc123/attachment/document.pdf
workspace-abc123/profile-picture/original/avatar.jpg
```

---

## 4. File Operations

### 4.1 File Upload Service

**Location:** [file-upload.service.ts](packages/twenty-server/src/engine/core-modules/file/file-upload/services/file-upload.service.ts)

**Key Methods:**
| Method | Purpose |
|--------|---------|
| `uploadFile()` | Upload generic file |
| `uploadImage()` | Upload image with resizing |
| `uploadImageFromUrl()` | Download and upload image from URL |

### 4.2 Image Processing

Uses **sharp** library for image resizing:

```typescript
import sharp from 'sharp';

// Resize images to configured sizes
const images = await Promise.all(
  sizes.map((size) =>
    sharp(file).resize({
      [size?.type || 'width']: size?.value ?? undefined,
    }),
  ),
);
```

**Configured Crop Sizes:**
```typescript
imageCropSizes: {
  'profile-picture': ['original'],
  'workspace-logo': ['original'],
  'person-picture': ['original'],
}
```

### 4.3 File Access & Authentication

**FileService** ([file.service.ts](packages/twenty-server/src/engine/core-modules/file/services/file.service.ts)):
- Uses JWT tokens for file access authentication
- `encodeFileToken()` - Creates signed tokens for file access
- `signFileUrl()` - Adds authentication token to file URLs
- Token expiration configured via `FILE_TOKEN_EXPIRES_IN`

**Token Payload:**
```typescript
interface FileTokenJwtPayload {
  filename: string;
  workspaceId: string;
  sub: string;  // workspaceId
  type: JwtTokenTypeEnum.FILE;
}
```

---

## 5. Attachment System

### 5.1 Attachment Entity

**Location:** [attachment.workspace-entity.ts](packages/twenty-server/src/modules/attachment/standard-objects/attachment.workspace-entity.ts)

**Key Fields:**
```typescript
{
  name: string;         // Attachment name
  fullPath: string;     // Storage path
  type: string;         // MIME type (deprecated)
  fileCategory: string; // ARCHIVE, AUDIO, IMAGE, PRESENTATION, SPREADSHEET, TEXT_DOCUMENT, VIDEO, OTHER
  createdBy: ActorMetadata;
  authorId: string;     // Workspace member ID

  // Relations to CRM records
  taskId: string | null;
  noteId: string | null;
  personId: string | null;
  companyId: string | null;
  opportunityId: string | null;
  dashboardId: string | null;
  workflowId: string | null;
}
```

### 5.2 Attachment Cleanup

**FileAttachmentListener** ([file-attachment.listener.ts](packages/twenty-server/src/engine/core-modules/file/listeners/file-attachment.listener.ts)):
- Listens for `attachment.DESTROYED` events
- Queues file deletion via `MessageQueue.deleteCascadeQueue`

---

## 6. Configuration & Limits

### 6.1 File Size Limit

**Location:** [settings/index.ts](packages/twenty-server/src/engine/constants/settings/index.ts)

```typescript
export const settings = {
  storage: {
    maxFileSize: '10MB',  // Maximum upload size
    imageCropSizes: { ... }
  }
};
```

Applied in [main.ts](packages/twenty-server/src/main.ts):
```typescript
app.useBodyParser('json', { limit: settings.storage.maxFileSize });
app.useBodyParser('urlencoded', { limit: settings.storage.maxFileSize });
```

### 6.2 File Type Handling

- SVG files are sanitized using **DOMPurify** (security)
- File type detection uses **file-type** library
- MIME types are preserved in metadata

---

## 7. R2 Migration Strategy

### 7.1 R2 Compatibility

Cloudflare R2 is **S3-compatible**, supporting:
- ✅ `PutObjectCommand`
- ✅ `GetObjectCommand`
- ✅ `DeleteObjectCommand`
- ✅ `DeleteObjectsCommand`
- ✅ `ListObjectsV2Command`
- ✅ `CopyObjectCommand`
- ✅ `HeadObjectCommand`

**Not supported (but not used by Twenty):**
- ❌ Pre-signed URLs (not currently used)
- ❌ Multipart uploads (not currently used)

### 7.2 Configuration Changes

To switch to R2, only environment variables need updating:

```bash
# S3 (current)
STORAGE_TYPE=S_3
STORAGE_S3_ENDPOINT=https://s3.amazonaws.com
STORAGE_S3_REGION=us-east-1
STORAGE_S3_NAME=my-bucket
STORAGE_S3_ACCESS_KEY_ID=...
STORAGE_S3_SECRET_ACCESS_KEY=...

# R2 (new)
STORAGE_TYPE=S_3
STORAGE_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_S3_REGION=auto
STORAGE_S3_NAME=my-r2-bucket
STORAGE_S3_ACCESS_KEY_ID=<r2-access-key>
STORAGE_S3_SECRET_ACCESS_KEY=<r2-secret-key>
```

### 7.3 Code Changes Required

**Minimal changes needed:**

1. **R2Driver (Optional)** - Create explicit R2 driver extending S3Driver:
   ```typescript
   export class R2Driver extends S3Driver {
     // Override any R2-specific behavior if needed
   }
   ```

2. **Factory Update** - Add R2 driver type:
   ```typescript
   enum StorageDriverType {
     S_3 = 'S_3',
     LOCAL = 'LOCAL',
     R_2 = 'R_2',  // Optional: explicit R2 type
   }
   ```

3. **Environment Variables** - Add R2-specific config (optional):
   ```
   STORAGE_R2_ACCOUNT_ID
   STORAGE_R2_ACCESS_KEY_ID
   STORAGE_R2_SECRET_ACCESS_KEY
   STORAGE_R2_BUCKET_NAME
   ```

### 7.4 For Cloudflare Workers

When running on Cloudflare Workers:
- Replace `@aws-sdk/client-s3` with Workers-compatible R2 bindings
- Use `R2Bucket` from Workers runtime
- Direct R2 binding is faster than S3 API

**Workers R2 Binding Example:**
```typescript
export interface Env {
  R2_BUCKET: R2Bucket;
}

// In Workers, use native R2 API
await env.R2_BUCKET.put(key, file);
const object = await env.R2_BUCKET.get(key);
await env.R2_BUCKET.delete(key);
```

---

## 8. Migration Checklist

### 8.1 Immediate (Works Today)
- [x] S3Driver already supports custom endpoints
- [x] `forcePathStyle: true` enabled for S3-compatible services
- [x] Configuration-based driver selection

### 8.2 Short-term (Minimal Work)
- [ ] Add explicit R2 environment variable support
- [ ] Test with R2 endpoint configuration
- [ ] Update documentation

### 8.3 Long-term (Workers Migration)
- [ ] Create Workers-native R2Driver using R2 bindings
- [ ] Migrate image processing (sharp → Workers-compatible)
- [ ] Update file serving to use Workers runtime

---

## 9. Edge Cases & Considerations

### 9.1 Image Processing
- **Current:** Uses `sharp` library (Node.js native)
- **Workers:** Need alternative (e.g., Cloudflare Images, or pure JS library)
- **Recommendation:** Use Cloudflare Image Resizing or move to client-side

### 9.2 Large Files
- **Current limit:** 10MB
- **R2 limit:** 5GB per object (no change needed)
- **Workers limit:** 100MB body size (needs streaming for large files)

### 9.3 Streaming
- Current code uses Node.js `Readable` streams
- Workers have different stream APIs (`ReadableStream`)
- Need adapter layer for Workers environment

### 9.4 File Deletion
- Background job via message queue
- Works with R2 (same delete operations)
- Queue system may need Workers-compatible replacement

---

## 10. Summary

| Aspect | Current State | R2 Migration Effort |
|--------|---------------|---------------------|
| Storage abstraction | ✅ Well-designed | Minimal changes |
| S3 SDK usage | ✅ Standard operations | Works with R2 |
| Configuration | ✅ Env-based | Change endpoint/credentials |
| File metadata | ✅ Database-stored | No changes |
| Image processing | ⚠️ Uses `sharp` | Needs Workers alternative |
| Streaming | ⚠️ Node.js streams | Needs Workers adapter |
| File authentication | ✅ JWT-based | No changes |

**Overall Assessment:** Migration is **low risk** and **straightforward** for the storage layer. Main challenges are around Workers runtime compatibility for image processing and streaming.
