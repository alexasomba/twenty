# Quickstart: Local Development Setup

**Branch**: `001-cloudflare-workers-migration`
**Date**: 2026-01-08

## Prerequisites

- Node.js 20+ (LTS)
- Yarn 4+
- Wrangler CLI 3.91+
- Cloudflare account (free tier works for development)

---

## 1. Install Wrangler CLI

```bash
# Install globally
npm install -g wrangler@latest

# Verify installation
wrangler --version
# Should show 3.91.0 or higher

# Login to Cloudflare
wrangler login
```

---

## 2. Clone and Setup Repository

```bash
# Clone repository
git clone https://github.com/twentyhq/twenty.git
cd twenty

# Checkout migration branch
git checkout 001-cloudflare-workers-migration

# Install dependencies
yarn install
```

---

## 3. Create Local D1 Database

```bash
# Navigate to server package
cd packages/twenty-server

# Create local D1 database
wrangler d1 create twenty-crm-core --local

# Note: This creates a local SQLite database at:
# .wrangler/state/v3/d1/

# Apply migrations
wrangler d1 migrations apply twenty-crm-core --local
```

---

## 4. Create Local KV Namespaces

```bash
# Create cache namespace
wrangler kv namespace create CACHE_STORE --preview

# Create session namespace
wrangler kv namespace create SESSION_STORE --preview

# Note the namespace IDs output and add to wrangler.jsonc
```

---

## 5. Create Local R2 Bucket

```bash
# Create R2 bucket (requires Cloudflare account)
wrangler r2 bucket create twenty-crm-files

# For local development, R2 is simulated locally
```

---

## 6. Configure Local Environment

Create `packages/twenty-server/wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "twenty-crm-api",
  "main": "dist/worker.js",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "twenty-crm-core",
      "database_id": "local"
    }
  ],

  "kv_namespaces": [
    {
      "binding": "CACHE_STORE",
      "id": "your-kv-namespace-id",
      "preview_id": "your-preview-id"
    },
    {
      "binding": "SESSION_STORE",
      "id": "your-session-namespace-id",
      "preview_id": "your-session-preview-id"
    }
  ],

  "r2_buckets": [
    {
      "binding": "FILES",
      "bucket_name": "twenty-crm-files"
    }
  ],

  "vars": {
    "ENVIRONMENT": "development",
    "SERVER_URL": "http://localhost:8787",
    "FRONTEND_URL": "http://localhost:3001",
    "LOG_LEVEL": "debug"
  }
}
```

---

## 7. Set Local Secrets

```bash
# Create .dev.vars file for local secrets
cat > packages/twenty-server/.dev.vars << 'EOF'
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_LOGIN_SECRET=dev-login-secret-change-in-production
FILE_TOKEN_SECRET=dev-file-secret-change-in-production
ENCRYPTION_KEY=dev-encryption-key-32-chars-long!
EOF

# Note: .dev.vars is gitignored
```

---

## 8. Build and Run

### Build the Worker

```bash
cd packages/twenty-server

# Build TypeScript to Worker-compatible JavaScript
yarn build:worker

# Or use watch mode for development
yarn dev:worker
```

### Run Local Development Server

```bash
# Start local Wrangler dev server
wrangler dev

# Server starts at http://localhost:8787
# GraphQL endpoint: http://localhost:8787/graphql
```

---

## 9. Run Frontend

In a separate terminal:

```bash
cd packages/twenty-front

# Update .env to point to local worker
echo "REACT_APP_SERVER_BASE_URL=http://localhost:8787" > .env.local

# Start frontend
yarn start
```

---

## 10. Seed Database

```bash
# Execute seed script
wrangler d1 execute twenty-crm-core --local --file=./seeds/dev-seed.sql

# Or via the API after startup
curl -X POST http://localhost:8787/dev/seed
```

---

## 11. Run Tests

```bash
# Run unit tests
yarn test

# Run integration tests (requires local D1)
yarn test:integration

# Run with Wrangler test utilities
npx vitest --config vitest.worker.config.ts
```

---

## Queue Development

### Start Queue Consumer Worker

```bash
cd packages/twenty-worker

# Start consumer in dev mode
wrangler dev --local

# Queues are simulated locally
```

### Send Test Message to Queue

```bash
# Via wrangler CLI
wrangler queues send twenty-background '{"type":"TEST","payload":"hello"}'

# Or via API
curl -X POST http://localhost:8787/dev/queue/test \
  -H "Content-Type: application/json" \
  -d '{"type":"TEST","payload":"hello"}'
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Error: D1_ERROR` | Check migrations applied: `wrangler d1 migrations list` |
| `KV namespace not found` | Verify namespace ID in wrangler.jsonc |
| `R2 bucket error` | Ensure bucket created: `wrangler r2 bucket list` |
| `Worker timeout` | Check for blocking operations (must be < 300ms CPU) |
| `Import error` | Ensure `nodejs_compat` flag is set |

### View Local Data

```bash
# Query local D1
wrangler d1 execute twenty-crm-core --local --command="SELECT * FROM workspace LIMIT 5"

# List KV keys
wrangler kv key list --namespace-id=your-namespace-id --preview

# List R2 objects
wrangler r2 object list twenty-crm-files
```

### Clear Local State

```bash
# Delete local D1 database
rm -rf .wrangler/state/v3/d1/

# Recreate
wrangler d1 migrations apply twenty-crm-core --local
```

---

## Project Structure After Migration

```
packages/twenty-server/
├── wrangler.jsonc           # Wrangler configuration
├── .dev.vars                 # Local secrets (gitignored)
├── dist/
│   └── worker.js            # Compiled worker bundle
├── migrations/
│   └── *.sql                # D1 migrations
├── seeds/
│   └── dev-seed.sql         # Development data
├── src/
│   ├── worker.ts            # Worker entry point
│   ├── router/              # Hono routes
│   ├── graphql/             # GraphQL Yoga setup
│   ├── database/            # D1 queries & entities
│   ├── cache/               # KV helpers
│   ├── storage/             # R2 file operations
│   └── queues/              # Queue producers

packages/twenty-worker/
├── wrangler.jsonc           # Consumer worker config
├── src/
│   ├── consumer.ts          # Queue consumer entry
│   └── handlers/            # Message handlers
```

---

## Next Steps

1. **Read research.md** for architecture decisions
2. **Review data-model.md** for type mappings
3. **Check api-contracts.md** for interface definitions
4. **Run `yarn build:worker`** to verify build works
5. **Start with one resolver** to validate the pattern

---

## Useful Commands Reference

```bash
# Wrangler Commands
wrangler dev                     # Start local dev server
wrangler deploy                  # Deploy to Cloudflare
wrangler tail                    # Stream live logs
wrangler d1 migrations create    # Create new migration
wrangler secret put <name>       # Set production secret

# Build Commands
yarn build:worker                # Build worker bundle
yarn dev:worker                  # Watch mode build
yarn test                        # Run unit tests
yarn typecheck                   # Type check

# Debug Commands
wrangler d1 execute ... --command  # Run SQL query
wrangler kv key get <key>          # Get KV value
wrangler r2 object get <key>       # Download R2 object
```
