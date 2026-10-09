# Feature: Church Tenant Foundation

## Status
Completed & Verified

## Goal
Implement the foundational multi-tenant church endpoints and reusable role authorization guard for FaithLink, enabling authenticated users to create a church (with creator assigned as admin in a transaction), view church information (with public vs member visibility), and join a church safely as a standard member.

## User Experience / Behavior
- **Create Church**: An authenticated user creates a church with name, unique slug, and optional details. The system transactionally creates the church and establishes the user as the initial `admin`.
- **View Church**: Anyone (or authenticated user) can view public church profile information. If the authenticated user is an active member, richer member-scoped details are returned.
- **Join Church**: An authenticated user joins a church by ID. Role is strictly assigned as `member` (client cannot self-elevate). Duplicate membership is cleanly rejected.
- **Tenant Authorization**: Future church-scoped actions verify that the user is an active member of that specific church with the required role (`requireTenantRole(['admin', 'pastor', 'leader'])`).

## Architecture
- **Framework**: Hono on Neon Serverless Functions (Node.js 24).
- **ORM**: Drizzle ORM on PostgreSQL with connection pooling.
- **Multi-Tenancy Guard**: `requireTenantRole` middleware enforcing church isolation.
- **Validation**: Zod schemas validating request payloads and UUID route parameters before hitting the database.

## API Endpoints
- `POST /api/churches`: Creates a new church and assigns creator as `admin` (atomic transaction).
- `GET /api/churches/:id`: Fetches church details, distinguishing public vs member view.
- `POST /api/churches/:id/join`: Joins a church as a standard `member`.
- `GET /api/churches/:id/members`: Returns member roster for church; protected by `requireTenantRole(['admin', 'pastor', 'leader'])`.

## Database Schema Usage
- `public.churches`: Church tenant record (`id`, `name`, `slug`, `description`, `logo_url`, `address`, `city`, `country`, timestamps).
- `public.church_members`: Membership linking `church_id` and `user_id` with composite unique constraint `(church_id, user_id)`.
- `public.profiles`: Ensures user profile exists before foreign key linking.

## Validation & Security
- Strict server-side role assignment: users cannot set their own role when joining or creating.
- Zod schema validates name, slug format (lowercase alphanumeric and hyphens), optional URLs and text lengths.
- Transactional atomicity: rollback if membership creation fails during church creation.
- Safe error handling: duplicate slug returns 409 Conflict, duplicate membership returns 409 Conflict, invalid ID returns 400 Bad Request, missing church returns 404 Not Found.
- No leakage of raw database errors or stack traces.

## Tests & Verification
- Test input validation with valid and invalid payloads: Verified.
- Test duplicate slug rejection (409 Conflict): Verified.
- Test unauthenticated requests rejection (401 Unauthorized): Verified.
- Test church retrieval (public vs member views): Verified.
- Test joining church and duplicate join rejection (409 Conflict): Verified.
- Test tenant role guard rejection for unauthorized/non-member users (403 Forbidden): Verified.
- Local suite (`test/church.test.ts`): All 9 tests passing.
- TypeScript compiler (`tsc --noEmit`): Code 0.
- Live deployment: Verified on `https://br-soft-butterfly-b482q79w-api.compute.c-6.us-east-2.aws.neon.tech/`.
