# Architecture — FaithLink Backend

## Request & Compute Flow
```text
Client (Web/Mobile)
  │
  ├── 1. Auth Flow: Direct to Neon Auth (NEON_AUTH_BASE_URL)
  │      └── Manages credentials & sessions in `neon_auth` schema -> returns Bearer JWT
  │
  └── 2. API Flow: HTTPS to Neon Function (Authorization: Bearer <JWT>)
         ├── Verify JWT with remote JWKS (NEON_AUTH_JWKS_URL)
         ├── Tenant & Role authorization checks
         └── PostgreSQL queries via pooled DATABASE_URL (Drizzle ORM)
```

## Database Schema Boundaries
- **`neon_auth`**: Managed entirely by Neon Auth (users, sessions, accounts). Read-only for app code.
- **`public`**: Application domain tables (`profiles`, `churches`, `church_members`, etc.). References `neon_auth.user(id)` via `user_id`.

## Multi-Tenancy & Concurrency Rules
- Every church-scoped resource must contain a `church_id`.
- Tenant access must be enforced server-side against authenticated membership.
- Use atomic SQL operations and transactions to prevent race conditions during high concurrency.
