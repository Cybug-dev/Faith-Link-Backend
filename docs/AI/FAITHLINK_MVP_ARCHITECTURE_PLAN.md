# FaithLink — Technology-Independent MVP Architecture & Delivery Plan

**Document type:** Stable product architecture / MVP roadmap  
**Status:** Planned baseline  
**Purpose:** This document defines **what FaithLink must become and the order in which the MVP should be built**, independent of the framework, language, database ORM, hosting provider, or other implementation technology used at any point in the project.

> **Core rule:** Technology may change. The product goal, domain boundaries, required behavior, security expectations, and MVP completion criteria in this document should remain the guiding plan. If the plan changes, the reason and impact must be recorded in the project decision documentation.

---

# 1. Product Goal

FaithLink is a church and youth faith platform designed to help people:

- belong to a church/community,
- learn Scripture and church learning material,
- take Bible quizzes,
- participate in activities and events,
- track learning and achievements,
- participate in healthy competition through scores and leaderboards.

The platform should feel like a real product, not only a demo or collection of pages.

### MVP goal

The MVP must let a real user complete a meaningful end-to-end journey:

```text
Discover FaithLink
      ↓
Create account / sign in
      ↓
Create or join a church
      ↓
Enter a church space
      ↓
Learn a Bible lesson
      ↓
Take a quiz
      ↓
Receive a result
      ↓
See learning progress / achievement
      ↓
Return and continue learning
```

A church administrator should also be able to manage the minimum church-side data needed for that journey.

---

# 2. MVP Success Definition

The MVP is successful when the following are true:

1. A new user can create an account and sign in securely.
2. The user has an application profile.
3. A user can create a church or join an existing church.
4. Church membership and roles are enforced by the backend.
5. A user can view church-appropriate learning content.
6. A user can start and complete a Bible quiz.
7. The system calculates and stores the result correctly.
8. The user can see progress/history for completed learning and quizzes.
9. The user can see a basic leaderboard or scoreboard based on verified results.
10. A church administrator can manage the minimum church content/settings required by the MVP.
11. Unauthorized users cannot access or modify another church's private data.
12. Important flows have loading, empty, error, retry, and unauthorized states.
13. The core API and database behavior are validated and tested.
14. The project documentation reflects the real implementation state.

If these are not working together, the MVP is not finished even if individual screens are already designed.

---

# 3. Stable Product Domains

Technology can change underneath these domains. The domains themselves should remain stable.

```text
FaithLink
│
├── Identity
│   ├── Account
│   ├── Session
│   └── Profile
│
├── Churches / Tenancy
│   ├── Church
│   ├── Membership
│   ├── Roles
│   └── Church settings
│
├── Learning
│   ├── Lessons
│   ├── Learning progress
│   └── Learning history
│
├── Quizzes
│   ├── Quiz
│   ├── Questions
│   ├── Attempts
│   ├── Answers
│   └── Results
│
├── Competition
│   ├── Scores
│   ├── Leaderboards
│   └── Achievements
│
└── Activities
    ├── Activity / Event
    ├── Participation
    └── Activity history
```

These domains should not become tightly coupled to a specific framework or vendor.

---

# 4. High-Level System Diagram

```text
                              ┌─────────────────────┐
                              │      FaithLink       │
                              │    User Interface   │
                              └──────────┬──────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │   Application API   │
                              │ / Application Core  │
                              └──────────┬──────────┘
                                         │
                ┌────────────────────────┼────────────────────────┐
                │                        │                        │
                ▼                        ▼                        ▼
       ┌─────────────────┐     ┌─────────────────┐      ┌─────────────────┐
       │ Identity/Auth   │     │ Domain Services │      │ File/Media      │
       │ Account/Session │     │ Business Rules  │      │ Storage         │
       └────────┬────────┘     └────────┬────────┘      └────────┬────────┘
                │                       │                        │
                ▼                       ▼                        ▼
       ┌─────────────────┐     ┌─────────────────┐      ┌─────────────────┐
       │ Auth Provider   │     │ Primary Database│      │ Object Storage  │
       └─────────────────┘     └─────────────────┘      └─────────────────┘
```

### Architectural rule

The **application/domain layer** owns FaithLink business rules.

Infrastructure providers implement those rules.

For example:

```text
ChurchService
   ↓
Repository / Data Access
   ↓
Current database technology
```

not:

```text
ChurchService
   ↓
Provider-specific code everywhere
```

This keeps technology changes possible without changing the product plan.

---

# 5. MVP Development Order

Build the MVP in dependency order rather than screen order.

```text
Phase 0 — Foundation
        ↓
Phase 1 — Identity & Profile
        ↓
Phase 2 — Churches & Membership
        ↓
Phase 3 — Authorization & Tenant Security
        ↓
Phase 4 — Learning Content
        ↓
Phase 5 — Quiz Engine
        ↓
Phase 6 — Results, Progress & Achievements
        ↓
Phase 7 — Leaderboard / Scoreboard
        ↓
Phase 8 — Activities / Events
        ↓
Phase 9 — MVP Integration + Hardening
```

The order may change only when a dependency or technical discovery makes another order safer or simpler. Any change should be recorded.

---

# 6. Phase 0 — Foundation

## Goal

Create the minimum application structure that all future features can safely use.

## Must provide

- Application entry point.
- Environment separation.
- Configuration loading.
- Standard API response/error format.
- Request logging with secrets excluded.
- Global error handling.
- Health/readiness checks.
- Database access layer.
- Migration/schema process.
- Authentication integration point.
- Validation integration point.
- Test structure.
- Documentation structure.

## Core API

```http
GET /health
GET /ready
```

`/health` confirms the service is alive.

`/ready` confirms required dependencies are available enough to serve requests.

## Completion criteria

The application can boot in the intended environment, connect to required infrastructure, handle an invalid request safely, and report operational health.

---

# 7. Phase 1 — Identity & Profile

## Goal

Give every authenticated person a stable application identity.

Authentication provider details are implementation-specific; FaithLink only depends on the resulting authenticated identity and session.

## Data concepts

- User account identity.
- Session.
- Application profile.
- Display name.
- Avatar/media reference (optional in MVP).
- Basic profile status/preferences required by the product.

## API

```http
GET  /api/me
PUT  /api/me
```

Optional authentication support endpoints belong to the chosen auth provider unless FaithLink must wrap them.

## Behavior

### New user

```text
Authenticated identity detected
        ↓
Find application profile
        ↓
If missing → create minimal profile
        ↓
Return profile + membership summary
```

### Existing user

Return profile and their church memberships.

## Security

- Never trust user ID from the request body for ownership.
- The authenticated session determines the current user.
- Profile updates can modify only allowed fields.
- Do not allow a normal profile update to change roles or church ownership.

## Edge cases

- Valid auth identity but missing profile.
- Profile already exists.
- Deleted/inactive account.
- Invalid profile payload.
- Duplicate profile creation under concurrency.

---

# 8. Phase 2 — Churches & Membership

## Goal

Create the multi-tenant foundation.

Every church is a separate tenant/community boundary.

## Core data concepts

### Church

Minimum fields should support:

- unique ID,
- name,
- unique slug/identifier,
- description/about text (optional),
- status,
- created/updated timestamps.

### Church membership

Minimum fields:

- church ID,
- user ID,
- role,
- membership status where needed,
- created/updated timestamps.

Minimum roles:

```text
member
leader
pastor
admin
```

The exact role model may expand later.

## API

```http
POST /api/churches
GET  /api/churches/:id
POST /api/churches/:id/join
GET  /api/churches/:id/members
```

The members endpoint may be restricted to authorized church roles in the first release.

## Create church behavior

```text
Authenticated user
      ↓
Validate church input
      ↓
Create church
      ↓
Create membership for creator
      ↓
Assign creator = admin
      ↓
Return church + membership
```

Church creation should be transactional: do not create the church successfully while failing to create its initial admin membership.

## Join church behavior

At MVP level, the simplest option is direct join by a known identifier/code or an approved join mechanism.

The exact discovery/invitation model can evolve later.

## Edge cases

- Duplicate slug.
- User already a member.
- Invalid church ID.
- Church inactive.
- Join request from unauthenticated user.
- Concurrent join requests.
- Creator membership creation failure.

---

# 9. Phase 3 — Tenant & Role Authorization

## Goal

Make multi-tenancy secure before adding more church-owned features.

This is a critical security phase.

## Core rule

```text
User A in Church A
        ≠
Permission to access Church B private data
```

Authentication alone is not enough.

## Authorization checks

Every protected church operation should establish:

```text
1. Is the request authenticated?
2. Which user is making it?
3. Which church/tenant is being accessed?
4. Is the user a member of that church?
5. Does the user's role permit this action?
6. Is the target resource actually owned by that church?
```

## Suggested authorization levels

| Role | Base capability |
|---|---|
| member | View permitted church content; participate in learning/activities |
| leader | Member capabilities + selected management functions |
| pastor | Leader capabilities + higher church management functions |
| admin | Full church administration within allowed scope |

Do not hard-code role checks only in the frontend.

## API behavior

Example:

```http
GET /api/churches/:id
```

May return a public view to non-members and a richer member view to authorized members.

A future protected endpoint such as:

```http
PUT /api/churches/:id
```

must verify tenant membership and role on the backend.

## Edge cases

- User changed roles while a session is active.
- User removed from church.
- User is admin in Church A and member in Church B.
- Resource belongs to Church A but request contains Church B ID.
- User tries to guess IDs.
- Race between membership removal and protected action.

---

# 10. Phase 4 — Learning Content

## Goal

Provide the first real spiritual learning experience.

The learning system should be able to support church-provided material while remaining flexible enough for future shared/public content.

## Content concepts

```text
Lesson / Course
    ↓
Sections / Content
    ↓
Learning Progress
```

Possible MVP lesson fields:

- ID
- title
- slug
- summary
- body/content reference
- published status
- owner/scope
- ordering
- timestamps

## Content ownership model

A lesson should have a clear scope, for example:

```text
GLOBAL / PLATFORM
CHURCH
```

Do not allow a church user to modify global content unless explicitly authorized.

## API

```http
GET  /api/lessons
GET  /api/lessons/:id
POST /api/lessons
PUT  /api/lessons/:id
```

Create/update endpoints must be role-protected. Read endpoints can expose only content allowed for the current user.

## Progress API

```http
GET  /api/me/progress
GET  /api/lessons/:id/progress
PUT  /api/lessons/:id/progress
```

## MVP behavior

User should be able to:

1. Discover an available lesson.
2. Open the lesson.
3. Read through the content.
4. Mark progress.
5. Resume later.
6. Finish the lesson.

## Edge cases

- Lesson unpublished while user has it open.
- Lesson deleted/archived.
- Invalid progress state.
- User submits 100% repeatedly.
- Progress update arrives out of order.
- User belongs to multiple churches with different content access.

---

# 11. Phase 5 — Bible Quiz Engine

## Goal

Turn learning into an interactive assessment.

The quiz engine is one of the most important MVP domains because later live quizzes and competitions should build on the same foundation.

## Core concepts

```text
Quiz
 ↓
Questions
 ↓
Attempt
 ↓
Answers
 ↓
Result
```

## Minimum quiz data

### Quiz

- ID
- title
- description
- status
- time limit (optional)
- owner/scope
- scoring rule/version
- publication state

### Question

- ID
- quiz ID
- prompt
- question type
- order
- options
- correct-answer definition
- explanation (optional)

Sensitive scoring data should not be exposed to clients before submission when that would allow cheating.

### Attempt

- ID
- user ID
- quiz ID
- status
- started timestamp
- completed timestamp
- score
- correct count
- total count
- scoring metadata/version where required.

### Answer

- attempt ID
- question ID
- submitted answer
- correctness/result
- timestamps

## API

```http
GET  /api/quizzes
GET  /api/quizzes/:id
POST /api/quizzes/:id/attempts
GET  /api/attempts/:id
POST /api/attempts/:id/answers
POST /api/attempts/:id/complete
GET  /api/me/quiz-history
```

## Attempt lifecycle

```text
NOT STARTED
    ↓
IN PROGRESS
    ↓
COMPLETED
```

Possible terminal states:

```text
COMPLETED
EXPIRED
ABANDONED
INVALIDATED
```

## Important rule

**The server is authoritative for scoring.**

The client may display score calculations for UX, but the trusted result is produced server-side from validated answers and quiz rules.

## Edge cases

### Duplicate answer submission

A retry should not create a second answer for the same logical question submission unless the question/attempt rules explicitly allow changes.

### Double completion

Two requests to complete the same attempt must not award points twice.

### Expired attempt

An expired attempt cannot continue submitting answers.

### Tampered quiz ID

The server must verify that the requested quiz exists and is available to the user.

### Wrong answer shape

Reject malformed answers before business logic.

### Concurrent requests

Use transactions/constraints/idempotency as required so scoring remains correct.

---

# 12. Phase 6 — Results, Progress & Achievements

## Goal

Close the loop between learning and measurable progress.

## Results

After completing a quiz the user should receive:

- score,
- correct/incorrect summary,
- completion status,
- basic performance feedback,
- optional explanations.

## Progress

Track only the data needed to support useful product behavior.

Examples:

```text
Lessons completed
Quizzes completed
Best quiz scores
Recent learning activity
Current learning streak (optional if simple enough)
```

## Achievements

MVP achievements can be simple and deterministic.

Examples:

```text
First Lesson Completed
First Quiz Completed
Perfect Score
Completed 5 Lessons
Completed 10 Quizzes
```

## API

```http
GET /api/me/progress
GET /api/me/achievements
GET /api/me/stats
```

Achievement awarding must be based on server-trusted events, not client claims.

---

# 13. Phase 7 — Leaderboard / Scoreboard

## Goal

Introduce healthy competition without making ranking the main purpose of the platform.

## MVP scope

Use a simple leaderboard based on verified quiz/activity results.

Possible scopes:

```text
PERSONAL
CHURCH
GLOBAL
```

Start with the smallest useful scope. Church leaderboard is the safest MVP starting point.

## API

```http
GET /api/leaderboards
GET /api/leaderboards/:scope
```

Example query parameters:

```text
?churchId=<id>
?period=weekly
?limit=20
```

## Important rules

- Never trust a client-supplied score.
- Do not expose more user information than needed.
- Paginate rankings.
- Define tie behavior.
- Define whether rankings are lifetime or period-based.
- Protect minor/private profile information.

## Edge cases

- Equal scores.
- Same user appears under multiple records.
- Deleted/deactivated account.
- Church membership removed after a score was earned.
- Very large leaderboard.
- Recalculation after quiz scoring bug.

---

# 14. Phase 8 — Activities & Events

## Goal

Give churches a basic way to create activities/events that users can discover and participate in.

## Activity data

Minimum concepts:

- ID
- church ID / owner scope
- title
- description
- type
- start/end time
- status
- location or meeting information where needed
- capacity (optional)
- created by
- timestamps

## Participation

A separate participation record should track a user's relationship with the activity.

## API

```http
GET  /api/activities
GET  /api/activities/:id
POST /api/activities
PUT  /api/activities/:id
POST /api/activities/:id/join
POST /api/activities/:id/leave
GET  /api/me/activities
```

## Edge cases

- Event already started.
- Event cancelled.
- User already joined.
- Capacity reached.
- Concurrent join requests.
- Church access removed.
- Invalid date range.

---

# 15. Phase 9 — MVP Integration & Hardening

This phase is mandatory.

Do not declare the MVP complete immediately after the last feature is implemented.

## Full user journey test

```text
Sign up / sign in
      ↓
Profile created
      ↓
Create/join church
      ↓
Church dashboard
      ↓
Open lesson
      ↓
Track progress
      ↓
Start quiz
      ↓
Answer questions
      ↓
Complete quiz
      ↓
Receive result
      ↓
Progress updated
      ↓
Achievement awarded
      ↓
Leaderboard updated
      ↓
Activity discovered/joined
```

## Hardening checklist

### Security

- Authentication required where appropriate.
- Tenant authorization enforced server-side.
- Roles enforced server-side.
- Input validation applied.
- Ownership checks applied.
- Sensitive data not returned unnecessarily.
- Secrets excluded from source/logs.
- Rate limits or abuse controls applied to sensitive endpoints.

### Correctness

- Transactions where multi-step writes must succeed together.
- Idempotency where retries can duplicate results.
- Unique constraints for important relationships.
- Foreign keys and domain constraints.
- Correct handling of expired/invalid resources.

### API

- Consistent status codes.
- Stable response shapes.
- Safe error messages.
- Pagination for collections.
- No unbounded data fetches.

### UX

Every important screen supports:

```text
Loading
Success
Empty
Error
Unauthorized
Not Found
Retry
```

### Performance

- Indexed hot queries.
- Efficient joins/queries.
- No unnecessary database round trips.
- Limited response payloads.
- No unnecessary client polling.
- Real-time features do not block the core product.

### Operations

- Health/readiness checks.
- Error logging without sensitive data.
- Monitoring of database/storage/compute where supported.
- Backup and restore plan.
- Documented environment setup.

---

# 16. Stable API Map

This is the **MVP API contract map**, not a claim that every endpoint is already implemented.

## Identity

```http
GET  /api/me
PUT  /api/me
```

## Churches

```http
POST /api/churches
GET  /api/churches/:id
POST /api/churches/:id/join
GET  /api/churches/:id/members
```

## Lessons

```http
GET  /api/lessons
GET  /api/lessons/:id
POST /api/lessons
PUT  /api/lessons/:id
```

## Learning progress

```http
GET /api/me/progress
GET /api/lessons/:id/progress
PUT /api/lessons/:id/progress
```

## Quizzes

```http
GET  /api/quizzes
GET  /api/quizzes/:id
POST /api/quizzes/:id/attempts
GET  /api/attempts/:id
POST /api/attempts/:id/answers
POST /api/attempts/:id/complete
GET  /api/me/quiz-history
```

## Progress / achievements

```http
GET /api/me/stats
GET /api/me/achievements
```

## Leaderboards

```http
GET /api/leaderboards
GET /api/leaderboards/:scope
```

## Activities

```http
GET  /api/activities
GET  /api/activities/:id
POST /api/activities
PUT  /api/activities/:id
POST /api/activities/:id/join
POST /api/activities/:id/leave
GET  /api/me/activities
```

## System

```http
GET /health
GET /ready
```

### Endpoint evolution rule

An endpoint should not be removed or radically changed just to match a framework migration.

If technology changes, preserve the **business contract** where practical and document intentional breaking changes.

---

# 17. Core Data Relationship Map

Technology-independent logical model:

```text
USER
 │
 ├────────────── PROFILE
 │
 ├────────────── CHURCH_MEMBERSHIP ────────────── CHURCH
 │                                                     │
 │                                                     ├── LESSONS
 │                                                     ├── QUIZZES
 │                                                     └── ACTIVITIES
 │
 ├────────────── LESSON_PROGRESS
 │
 ├────────────── QUIZ_ATTEMPTS ────────── QUIZ
 │                     │                    │
 │                     └──── ANSWERS       └── QUESTIONS
 │
 ├────────────── ACHIEVEMENTS
 │
 └────────────── ACTIVITY_PARTICIPATION ── ACTIVITY
```

The real database schema may normalize or split these concepts differently. The logical relationships are the stable part.

---

# 18. Content Scope & Ownership Rules

Every shared resource must have a clear ownership/scope model.

Examples:

```text
Global content
Church content
User-owned data
System-generated data
```

For every feature, define:

```text
Who owns it?
Who can view it?
Who can create it?
Who can edit it?
Who can delete/archive it?
```

This should be answered before implementation, not after a security bug appears.

---

# 19. API Security Model

All future protected endpoints should follow the same logical pipeline:

```text
Request
  ↓
Parse request
  ↓
Authenticate
  ↓
Validate input
  ↓
Resolve tenant / ownership
  ↓
Authorize role/action
  ↓
Run business rules
  ↓
Database transaction/query
  ↓
Return safe response
```

Never rely only on:

- hidden frontend buttons,
- route visibility,
- user-supplied role values,
- user-supplied ownership IDs,
- client-calculated scores.

---

# 20. Common API Error Categories

The implementation can use any concrete error format, but the application should consistently distinguish cases such as:

```text
400 — malformed / invalid input
401 — unauthenticated
403 — authenticated but not allowed
404 — resource not found / not visible
409 — conflict / duplicate operation
422 — semantically invalid input where useful
429 — too many requests
500 — unexpected server error
503 — dependency/service unavailable
```

Error responses should be safe and useful without exposing stack traces, SQL, provider secrets, or internal infrastructure details.

---

# 21. Real-Time Features: MVP Boundary

Live quizzes and real-time scoreboards are part of the **future expansion of the quiz domain**, but they should not block the basic quiz engine.

The MVP foundation should first support:

```text
normal quiz
→ attempt
→ answers
→ result
```

Then real-time capabilities can build on that trusted scoring model.

Future flow:

```text
HOST CREATES LIVE SESSION
        ↓
USERS JOIN WITH CODE
        ↓
SERVER CONTROLS SESSION STATE
        ↓
QUESTIONS RELEASED
        ↓
ANSWERS RECEIVED
        ↓
SERVER VALIDATES / SCORES
        ↓
LIVE SCOREBOARD
        ↓
FINAL RESULT
```

Real-time transport technology is intentionally left open.

---

# 22. Media & Storage Boundary

The MVP should keep application records separate from large file contents.

```text
Database
  ├── file ID
  ├── owner
  ├── scope
  ├── storage key
  ├── type
  └── size

Object storage
  └── actual file
```

This allows the storage provider to change later without changing the main product model.

Potential media:

- profile photos,
- church logos,
- church banners,
- lesson attachments,
- activity images.

Large video/audio systems should be added only when the product actually needs them.

---

# 23. Notifications Boundary

Notifications are useful but should not be tightly coupled to core writes.

Potential future notifications:

- new lesson available,
- quiz reminder,
- event reminder,
- church announcement,
- achievement unlocked.

For MVP, notification infrastructure can remain minimal unless required for a core user flow.

If added later:

```text
Core business action
      ↓
Create durable event / notification intent
      ↓
Notification service
      ↓
Email / push / in-app channel
```

A failed notification should not normally roll back a successful quiz completion or church membership action unless the product explicitly requires transactional behavior.

---

# 24. Admin & Moderation Boundary

A minimum administrative layer is required for safe operation, even if a full admin dashboard is not in the first visual release.

MVP must have a way to support:

- church role management,
- church status management,
- content publication/unpublication,
- basic moderation of inappropriate content where applicable,
- handling of abusive accounts/actions.

Do not build a huge platform-admin suite before these minimum controls are needed.

---

# 25. Teen / User Safety Rules

Because FaithLink is intended for teens and church communities, the product should start with safer defaults.

MVP direction:

- Do not introduce unrestricted private messaging.
- Keep profile exposure limited to what the feature needs.
- Avoid publishing sensitive personal information.
- Make church membership visibility intentional.
- Enforce role boundaries server-side.
- Provide reporting/moderation paths when community-generated content is introduced.

Safety requirements take priority over convenience when there is a conflict.

---

# 26. Performance & Scale Rules

The MVP should be small, but it must not be fragile.

Design for:

- many concurrent normal API requests,
- bursts during quizzes/events,
- repeated client retries,
- slow networks,
- mobile users,
- temporary dependency failures.

Avoid premature infrastructure such as multiple databases, queues, caches, or microservices unless measurements show a need.

### Important rule

Optimize the **queries and business operations first**.

Do not try to solve every possible future scale problem with infrastructure before the workload exists.

---

# 27. Data Retention & Growth

Every domain should classify its data as:

```text
Essential long-term data
Operational data
Temporary session data
Derived/aggregate data
Disposable data
```

Examples:

- User identity and membership → long-term.
- Quiz results → long-term/useful history.
- Temporary failed session state → potentially disposable.
- Cached/derived leaderboard data → rebuildable where practical.

This classification makes future storage management safer.

---

# 28. Technology Independence Rules

The following may be replaced without changing the MVP goal:

```text
Frontend framework
Backend framework
ORM
Database provider
Authentication provider
Object storage provider
Hosting provider
Real-time transport
Validation library
Testing framework
```

What should remain stable is:

```text
Product domains
User journeys
Authorization rules
Data ownership rules
API/business contracts
Security expectations
MVP completion criteria
```

When replacing a technology, ask:

1. Does the replacement satisfy the same capability?
2. Does it preserve the security model?
3. Does it preserve important data relationships?
4. Does it preserve the API contract where practical?
5. Does it reduce or increase operational risk?
6. What migration work is required?

---

# 29. MVP Out of Scope Unless Added Deliberately

The following are **not required to declare the core MVP complete** unless product requirements later promote them:

- AI Bible assistant.
- Full social feed.
- Unrestricted direct messaging.
- Advanced church discovery marketplace.
- Inter-church competitions.
- Large-scale live game platform.
- Complex recommendation engine.
- Advanced analytics platform.
- Full video streaming infrastructure.
- Microservices architecture.
- Dedicated caching infrastructure.
- Native mobile applications.
- Payment/subscription system.
- Complex notification platform.

These can be added after the core platform proves its main user journey.

---

# 30. Future Expansion Path

The MVP is designed to grow into the larger FaithLink vision.

```text
MVP
│
├── Identity
├── Churches
├── Membership / Roles
├── Learning
├── Quiz Engine
├── Progress
├── Achievements
├── Leaderboards
└── Activities
        │
        ▼
Phase 2
│
├── Live Quiz Sessions
├── Join Codes
├── Real-Time Scoreboards
├── Better Church Management
├── Richer Lesson Authoring
├── Notifications
└── Moderation Tools
        │
        ▼
Phase 3
│
├── Inter-Church Competitions
├── Advanced Game Modes
├── Community Features
├── AI-assisted Bible Learning
├── Rich Analytics
└── Expanded Media Features
```

Every future feature should fit into an existing domain or introduce a clearly justified new domain.

---

# 31. Definition of Done for Each Feature

A feature is complete only when:

```text
Behavior works
   +
Security works
   +
Authorization works
   +
Validation works
   +
Data integrity works
   +
Important edge cases handled
   +
Tests/checks pass
   +
UX states work
   +
Documentation updated
```

"The endpoint returns 200" is not enough.

---

# 32. Definition of Done for the MVP

The MVP can be marked **Implemented** only after the end-to-end journey works in an environment representative of production.

It can be marked **Verified** only after:

- core user journeys are tested,
- authorization/tenant isolation is tested,
- invalid input is tested,
- important concurrency/retry cases are tested,
- quiz scoring is verified,
- database integrity is verified,
- failure states are verified,
- storage/auth dependencies are verified,
- documentation matches reality.

---

# 33. Change Control for This Plan

This document is the stable roadmap, but it is **not immutable**.

A change is justified when:

- a product requirement changes,
- a major technical constraint is discovered,
- security requires it,
- a domain is proven incorrect,
- a feature is intentionally promoted/deferred,
- user testing shows the MVP journey is wrong.

When changing the plan:

1. Update this document.
2. Record the reason in `DECISIONS.md`.
3. Update `NEXT_TASKS.md`.
4. Update affected feature documents.
5. Keep old decisions/history rather than silently rewriting project history.

---

# 34. AI Agent Handoff Rule

Any AI agent working on FaithLink should treat this document as the **product and MVP roadmap**.

The agent should then read the project state documents to determine implementation reality:

```text
This document
    ↓
What FaithLink is supposed to become

PROJECT_CONTEXT.md
    ↓
What the project currently is

ARCHITECTURE.md
    ↓
How the current implementation is structured

DECISIONS.md
    ↓
Why important choices were made

NEXT_TASKS.md
    ↓
What should be worked on next

FEATURES/<feature>.md
    ↓
Detailed state of an individual feature
```

### Critical rule

An AI agent must **not treat this roadmap as proof that a feature is already implemented**.

It is the target plan.

Current implementation state must come from the actual repository and project-state documentation.

---

# 35. Current MVP Starting Point

Based on the current project state, the stable roadmap should continue from the following point:

```text
FOUNDATION                    ✅ Implemented
IDENTITY / PROFILE            ✅ Implemented
CHURCH DATA MODEL             ✅ Implemented
AUTHENTICATION                ✅ Implemented
BASIC PROFILE API             ✅ Implemented

CHURCH TENANT ENDPOINTS       🔜 Next
TENANT / ROLE AUTHORIZATION   🔜 Next
INPUT VALIDATION              🔜 Next

LEARNING                      ⏳ Planned
QUIZZES                       ⏳ Planned
RESULTS / PROGRESS            ⏳ Planned
ACHIEVEMENTS                  ⏳ Planned
LEADERBOARDS                  ⏳ Planned
ACTIVITIES                    ⏳ Planned
MVP HARDENING                 ⏳ Planned
```

**Important:** The statuses above are a project-state snapshot supplied for this roadmap. They must be updated from the repository and current project documentation as implementation changes.

---

# 36. Final Guiding Principle

FaithLink should be built as a **small real product first**, not as a small collection of disconnected features and not as an over-engineered enterprise system.

The path is:

```text
Secure foundation
      ↓
Real user identity
      ↓
Real church tenancy
      ↓
Real authorization
      ↓
Real learning
      ↓
Real quiz engine
      ↓
Real progress/results
      ↓
Real engagement
      ↓
Hardening
      ↓
MVP
      ↓
Measured expansion
```

Technology is the implementation vehicle.

**This roadmap is the destination and the route.**

END OF DOCUMENT
