# Project Context — FaithLink Backend

## Purpose
FaithLink is a production-grade, multi-tenant digital engagement platform for churches, youth ministries, and communities.

## Core Tech Stack
- **Language**: TypeScript (Node.js 24)
- **Compute**: Neon Serverless Functions (`neon.ts`, web-standard fetch handlers)
- **Database**: PostgreSQL on Neon (Project: `crimson-forest-33142254`, branch: `production`)
- **ORM / Data Layer**: Drizzle ORM + `node-postgres` (`pg`) with connection pooling
- **Authentication**: Neon Auth (Managed Better Auth in `neon_auth` schema)
- **Storage**: Neon Object Storage (branch-scoped)
- **AI / MCP**: Neon MCP Server (`mcp.neon.tech`) + Neon Agent Skills

## Excluded Stacks
- No Express server or CommonJS
- No Cloudflare Workers
- No Cloudinary (using Neon Storage)

## Core Domains (Incremental MVP)
1. **Auth & Identity**: Registration, login, sessions, token verification via Neon Auth.
2. **Tenancy & Profiles**: Multi-tenant church isolation (`public.churches`, `public.church_members`) and user profiles (`public.profiles`).
3. **Future**: Bible learning, live multiplayer quizzes, activities/events, achievements, leaderboards.
