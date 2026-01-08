# Environment Variable Mapping

**Branch**: `001-cloudflare-workers-migration`
**Date**: 2026-01-08

## Overview

This document maps current Twenty CRM environment variables to their Cloudflare Workers equivalents (vars, secrets, or bindings).

---

## Current Environment Variables Analysis

Source: `packages/twenty-server/.env.example` and codebase analysis

---

## Database Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `PG_DATABASE_URL` | `postgres://user:pass@host:5432/twenty` | `DB` binding | D1 Binding |
| `PG_SSL_ALLOW_SELF_SIGNED` | `true` | N/A | Removed |

**Migration Notes**:
- D1 is accessed via binding, not connection string
- No SSL configuration needed (internal Cloudflare network)
- Connection pooling handled automatically by D1

---

## Redis / Session Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `REDIS_URL` | `redis://localhost:6379` | `CACHE_STORE` + `SESSION_STORE` bindings | KV Bindings |
| `REDIS_HOST` | `localhost` | N/A | Removed |
| `REDIS_PORT` | `6379` | N/A | Removed |

**Migration Notes**:
- Session storage: JWT is stateless, no session migration needed
- Cache storage: Use KV with appropriate TTLs
- Rate limiting: Use KV with atomic counters

---

## File Storage Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `STORAGE_TYPE` | `s3` | N/A | Hardcoded to R2 |
| `STORAGE_S3_REGION` | `us-east-1` | N/A | Removed (R2 is global) |
| `STORAGE_S3_NAME` | `twenty-bucket` | `FILES` binding | R2 Binding |
| `STORAGE_S3_ENDPOINT` | `https://s3.amazonaws.com` | N/A | Removed |
| `STORAGE_S3_ACCESS_KEY_ID` | `AKIA...` | `R2_ACCESS_KEY_ID` | Secret |
| `STORAGE_S3_SECRET_ACCESS_KEY` | `...` | `R2_SECRET_ACCESS_KEY` | Secret |
| `STORAGE_LOCAL_PATH` | `./uploads` | N/A | Removed |

**Migration Notes**:
- R2 access via binding (no credentials needed for basic operations)
- R2 S3 API credentials only needed for presigned URLs
- Global replication automatic

---

## Authentication & Security

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `ACCESS_TOKEN_SECRET` | `random-secret` | `JWT_SECRET` | Secret |
| `ACCESS_TOKEN_EXPIRES_IN` | `30m` | `JWT_EXPIRES_IN` | Var |
| `REFRESH_TOKEN_SECRET` | `random-secret` | `JWT_REFRESH_SECRET` | Secret |
| `REFRESH_TOKEN_EXPIRES_IN` | `90d` | `JWT_REFRESH_EXPIRES_IN` | Var |
| `REFRESH_TOKEN_COOL_DOWN` | `1m` | `JWT_REFRESH_COOLDOWN` | Var |
| `LOGIN_TOKEN_SECRET` | `random-secret` | `JWT_LOGIN_SECRET` | Secret |
| `LOGIN_TOKEN_EXPIRES_IN` | `15m` | `JWT_LOGIN_EXPIRES_IN` | Var |
| `FILE_TOKEN_SECRET` | `random-secret` | `FILE_TOKEN_SECRET` | Secret |
| `FILE_TOKEN_EXPIRES_IN` | `1d` | `FILE_TOKEN_EXPIRES_IN` | Var |

**Migration Notes**:
- All token secrets → Wrangler secrets
- Token expiry durations → Environment variables
- JWT verification unchanged (stateless)

---

## Server Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `SERVER_URL` | `https://api.twenty.com` | `SERVER_URL` | Var |
| `FRONT_BASE_URL` | `https://app.twenty.com` | `FRONTEND_URL` | Var |
| `PORT` | `3000` | N/A | Removed |
| `NODE_ENV` | `production` | `ENVIRONMENT` | Var |
| `DEBUG_MODE` | `false` | `LOG_LEVEL` | Var |
| `LOG_LEVELS` | `error,warn,log` | `LOG_LEVEL` | Var |

**Migration Notes**:
- PORT not applicable (Workers don't bind ports)
- NODE_ENV → ENVIRONMENT (use `production`, `staging`, `development`)
- Debug flags consolidated to LOG_LEVEL

---

## Email Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `EMAIL_FROM_ADDRESS` | `hello@twenty.com` | `EMAIL_FROM_ADDRESS` | Var |
| `EMAIL_FROM_NAME` | `Twenty` | `EMAIL_FROM_NAME` | Var |
| `EMAIL_SYSTEM_ADDRESS` | `system@twenty.com` | `EMAIL_SYSTEM_ADDRESS` | Var |
| `EMAIL_DRIVER` | `smtp` | `EMAIL_DRIVER` | Var |
| `EMAIL_SMTP_HOST` | `smtp.example.com` | `EMAIL_SMTP_HOST` | Var |
| `EMAIL_SMTP_PORT` | `587` | `EMAIL_SMTP_PORT` | Var |
| `EMAIL_SMTP_USER` | `user` | `EMAIL_SMTP_USER` | Secret |
| `EMAIL_SMTP_PASSWORD` | `password` | `EMAIL_SMTP_PASSWORD` | Secret |

**Migration Notes**:
- Consider Cloudflare Email Workers for outbound email
- SMTP credentials → Secrets
- Email sending moves to Queue consumer (async)

---

## OAuth / SSO Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `AUTH_GOOGLE_ENABLED` | `true` | `AUTH_GOOGLE_ENABLED` | Var |
| `AUTH_GOOGLE_CLIENT_ID` | `...` | `GOOGLE_CLIENT_ID` | Var |
| `AUTH_GOOGLE_CLIENT_SECRET` | `...` | `GOOGLE_CLIENT_SECRET` | Secret |
| `AUTH_GOOGLE_CALLBACK_URL` | `https://...` | `GOOGLE_CALLBACK_URL` | Var |
| `AUTH_MICROSOFT_ENABLED` | `true` | `AUTH_MICROSOFT_ENABLED` | Var |
| `AUTH_MICROSOFT_CLIENT_ID` | `...` | `MICROSOFT_CLIENT_ID` | Var |
| `AUTH_MICROSOFT_CLIENT_SECRET` | `...` | `MICROSOFT_CLIENT_SECRET` | Secret |
| `AUTH_MICROSOFT_CALLBACK_URL` | `https://...` | `MICROSOFT_CALLBACK_URL` | Var |

**Migration Notes**:
- OAuth callbacks work unchanged
- Client secrets → Wrangler secrets
- Token exchange via fetch() (Workers compatible)

---

## Messaging Configuration (Gmail/Calendar Sync)

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `MESSAGING_PROVIDER_GMAIL_ENABLED` | `true` | `GMAIL_SYNC_ENABLED` | Var |
| `CALENDAR_PROVIDER_GOOGLE_ENABLED` | `true` | `GOOGLE_CALENDAR_ENABLED` | Var |
| `MESSAGE_QUEUE_TYPE` | `bull-mq` | N/A | Removed |

**Migration Notes**:
- Queue type hardcoded to Cloudflare Queues
- Gmail/Calendar sync moves to Queue consumers
- API credentials same as OAuth

---

## Billing Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `IS_BILLING_ENABLED` | `true` | `BILLING_ENABLED` | Var |
| `BILLING_STRIPE_API_KEY` | `sk_...` | `STRIPE_API_KEY` | Secret |
| `BILLING_STRIPE_WEBHOOK_SECRET` | `whsec_...` | `STRIPE_WEBHOOK_SECRET` | Secret |
| `BILLING_STRIPE_BASE_PLAN_PRODUCT_ID` | `prod_...` | `STRIPE_BASE_PLAN_ID` | Var |

**Migration Notes**:
- Stripe SDK works in Workers with fetch adapter
- Webhook signature verification unchanged

---

## Telemetry Configuration

| Current Variable | Current Value Example | Cloudflare Equivalent | Type |
|-----------------|----------------------|----------------------|------|
| `TELEMETRY_ENABLED` | `true` | `TELEMETRY_ENABLED` | Var |
| `TELEMETRY_ANONYMIZATION_ENABLED` | `true` | `TELEMETRY_ANONYMIZATION` | Var |
| `SENTRY_DSN` | `https://...` | `SENTRY_DSN` | Var |
| `SENTRY_FRONT_DSN` | `https://...` | `SENTRY_FRONT_DSN` | Var |

**Migration Notes**:
- Sentry SDK works in Workers (use @sentry/browser or edge SDK)
- OpenTelemetry → Cloudflare Workers Analytics Engine

---

## Secrets Summary

All secrets to be set via `wrangler secret put <NAME>`:

```bash
# Authentication
wrangler secret put JWT_SECRET
wrangler secret put JWT_REFRESH_SECRET
wrangler secret put JWT_LOGIN_SECRET
wrangler secret put FILE_TOKEN_SECRET
wrangler secret put ENCRYPTION_KEY

# Storage
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY

# Email
wrangler secret put EMAIL_SMTP_USER
wrangler secret put EMAIL_SMTP_PASSWORD

# OAuth
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put MICROSOFT_CLIENT_SECRET

# Billing
wrangler secret put STRIPE_API_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

---

## Environment Variables Summary

All vars to be set in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    // Server
    "ENVIRONMENT": "production",
    "SERVER_URL": "https://api.twenty.com",
    "FRONTEND_URL": "https://app.twenty.com",
    "LOG_LEVEL": "info",

    // JWT Expiry
    "JWT_EXPIRES_IN": "30m",
    "JWT_REFRESH_EXPIRES_IN": "90d",
    "JWT_REFRESH_COOLDOWN": "1m",
    "JWT_LOGIN_EXPIRES_IN": "15m",
    "FILE_TOKEN_EXPIRES_IN": "1d",

    // Email
    "EMAIL_FROM_ADDRESS": "hello@twenty.com",
    "EMAIL_FROM_NAME": "Twenty",
    "EMAIL_SYSTEM_ADDRESS": "system@twenty.com",
    "EMAIL_DRIVER": "smtp",
    "EMAIL_SMTP_HOST": "smtp.example.com",
    "EMAIL_SMTP_PORT": "587",

    // OAuth
    "AUTH_GOOGLE_ENABLED": "true",
    "GOOGLE_CLIENT_ID": "...",
    "GOOGLE_CALLBACK_URL": "https://api.twenty.com/auth/google/callback",
    "AUTH_MICROSOFT_ENABLED": "true",
    "MICROSOFT_CLIENT_ID": "...",
    "MICROSOFT_CALLBACK_URL": "https://api.twenty.com/auth/microsoft/callback",

    // Features
    "GMAIL_SYNC_ENABLED": "true",
    "GOOGLE_CALENDAR_ENABLED": "true",
    "BILLING_ENABLED": "true",
    "TELEMETRY_ENABLED": "true"
  }
}
```

---

## Bindings Summary

| Binding Name | Type | Resource |
|--------------|------|----------|
| `DB` | D1 Database | `twenty-crm-core` |
| `CACHE_STORE` | KV Namespace | Metadata cache |
| `SESSION_STORE` | KV Namespace | Session/rate limit data |
| `FILES` | R2 Bucket | `twenty-crm-files` |
| `CRITICAL_QUEUE` | Queue Producer | Critical operations |
| `WORKFLOW_QUEUE` | Queue Producer | Workflow executions |
| `MESSAGING_QUEUE` | Queue Producer | Email/calendar sync |
| `BACKGROUND_QUEUE` | Queue Producer | Low priority tasks |

---

## Removed Variables

These variables are no longer needed in Workers environment:

| Variable | Reason |
|----------|--------|
| `PG_DATABASE_URL` | D1 binding replaces connection string |
| `PG_SSL_*` | No SSL config needed |
| `REDIS_*` | KV bindings replace Redis |
| `STORAGE_S3_ENDPOINT` | R2 has global endpoint |
| `STORAGE_S3_REGION` | R2 is globally distributed |
| `STORAGE_LOCAL_PATH` | No local filesystem |
| `PORT` | Workers don't bind ports |
| `MESSAGE_QUEUE_TYPE` | Hardcoded to CF Queues |
| `CACHE_STORAGE_TYPE` | Hardcoded to KV |
| `CACHE_STORAGE_TTL` | Set per-key in code |
