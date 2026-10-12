# Agent Bootstrap: Faith-Link-Backend
Read this first and follow it. Preserve the existing architecture. No restarts, unrelated refactors, or unrequested features.

## 1. On start
1. Read `.agents/working.md`. If missing, read `docs/AI/PROJECT_CONTEXT.md` and `docs/AI/NEXT_TASKS.md`, then create it.
2. Read `docs/AI/DECISIONS.md`, Active section only (top ~20 lines), if it exists.
3. Open the file at the Handoff anchor. A quota cutoff may have left half-written code; finish or fix it before anything else.
4. If logs contradict the code, trust the code and log the discrepancy.
5. If any file read in steps 1-2 exceeds its cap (§3), run the cleanup in §4 once before continuing.
6. Reply with 3 sentences: last completed work, exact stopping point, next action. Then continue.
Never read at start: src/, test/, node_modules, CHANGELOG.md, archive.md. Open them only when the current task needs it.

## 2. Read discipline
- Read by symbol or line range, never whole files unless small. Skip anything under "Do not re-read".
- No broad searches. Targeted grep only, output capped (`| head -30`). Quiet test/build reporters; show failures only.
- Load a skill from `.agents/skills/` only when the task matches it, never the whole set.

## 3. Files, roles, caps (create only when there's real content; no empty skeletons)
- `.agents/working.md` (hot, ≤60 lines): Current State line · Handoff · Open risks · last 2-3 task entries in full · older ones as one line each.
- `.agents/archive.md` (cold, append-only): full text of collapsed entries, resolved risks, finished phases. Never read to resume.
- `docs/AI/DECISIONS.md`: Active (≤20 lines) + Superseded. One line each: `D-014 | date | model | decision | reason | active`.
- `docs/AI/PROJECT_CONTEXT.md` (≤80 lines): stable facts only (stack, architecture, conventions). Rewrite, never append history.
- `docs/AI/NEXT_TASKS.md`: next 5-7 tasks. Finished ones move to CHANGELOG.
- `docs/AI/CHANGELOG.md` (cold, append-only).
- `.agents/skills/<name>.md`: create only after a task has repeated.
If I name a file that doesn't exist, create it with the right structure for its purpose and real content only.

## 4. Retention and cleanup
Compress, don't delete: archive is lossless and never read, so it costs nothing.
- Keep in full: Current State, Handoff, open risks, last 2-3 task entries, active decisions.
- Compress to one line (full text → archive.md): older task entries (`✅ S4 auth middleware (auth.js, session.js)`), completed phases (1-2 lines total), resolved risks, superseded decisions.
- Drop entirely: duplicates, retries, routine passing checks, chatter, pasted code/diffs/long stack traces (keep the key error line and a `file:symbol` pointer).
- A task entry ≤6 lines. Reference `file:symbol`, don't paste code.
- Cleanup (once, when a file exceeds its cap): one pass, using only the file being cleaned. Don't read archive.md to do it.

## 5. Logging (as you work, never batched)
- Write-ahead: before any large or multi-file edit, update Handoff with the intent (🔄 + files + planned change). After: ✅/❌/⚠️ + how it was verified. Update Handoff first at every step boundary.
- Handoff contains: one-line Current State (status + next action) · file + function/line anchors · interrupted/partial state, if any · "Do not re-read" (finished and verified areas) · open risks.
- Log every decision, and every instruction from me that sets a rule, constraint, or direction, in DECISIONS.md immediately. Supersede, never delete. Skip routine chatter.
- Task entry fields: timestamp, model name, files, goal, change, status, verification, notes.
- Edge cases that can't be ignored: log in working.md as found (`case | impact | handled / unhandled / needs decision`) and report in the final summary.
- Never write secrets or .env values into any file.

## 6. Code standard
- Production-grade, modular, small single-purpose units, config over hardcoding. Follow existing patterns and naming.
- Hybrid design: simple and direct by default. Add a seam (interface, config, hook, strategy) only where a future change is likely or already planned in NEXT_TASKS/DECISIONS. Before each step, ask once: what's likely to change next? If it shapes the design, log one line in DECISIONS. Leave room for future features; don't build them.
- Defensive: validate inputs at boundaries, handle errors explicitly with meaningful messages, never swallow exceptions, safe defaults, idempotent where it matters. Handle null, empty, duplicate, concurrent, and oversized inputs.
- Comments explain why, not what. Complex or major functions get a doc comment (idiomatic for the language): purpose, inputs, outputs, side effects, assumptions, edge cases. Inline comments only for non-obvious logic, workarounds, and invariants. Mark known limits `LIMITATION:` and log them as edge cases. Update comments when code changes. No comments that restate the code.
- No dead code, TODO placeholders, or unused dependencies. Add a dependency only if essential, and log why.

## 7. Efficiency
- Do only what the step requires. Verify only what you touched.
- If a step fails: log ❌ with the error, attempt one targeted fix; if it still fails, log a blocker and ask. Don't loop.
- If requirements are ambiguous or conflict with the code, log it and ask instead of guessing.

## 8. ECC rules (Everything Claude Code)
ECC rule files add engineering discipline on top of §1-8. Where they conflict, §1-8 win; log the conflict as a decision.

Location: find the installed ECC rules directory once (e.g. `.claude/rules/` or `.agents/rules/`) and note its path in PROJECT_CONTEXT.md. If none is installed, apply the intent of this section from general best practice and don't search for them.

Load on demand, never all at once. Read only the rule file matching the work in front of you, plus `common/` and the project's language folder:
- writing or restructuring code → coding-style, patterns
- new logic, bug fix, edge case → testing
- auth, user input, secrets, queries, external calls → security (mandatory when touched)
- slow path, heavy query, large payload → performance
- committing, only when I ask → git-workflow
Example: adding an input-validated endpoint → read coding-style and security, skip the rest.

Workflow, scaled to the task:
1. Research first: before writing new code, do a targeted check for an existing utility, pattern, or module to reuse. Prefer reuse over new code.
2. Plan before writing: for work touching 3+ files, write a 3-5 line plan in working.md first.
3. Test new or changed logic: critical paths and edge cases only, not blanket coverage. Skip tests for trivial or unchanged code.
4. Review before closing a step: a short self-check against the matching rules (correctness, edge cases, security, naming, dead code). Log any finding in working.md.
5. Security gate: never hardcode secrets; validate and sanitize external input; use parameterized queries; return errors without leaking internals. Log any unresolved issue as an edge case.

Hooks and subagents: don't assume either exists. If the harness supports subagents, delegate only narrow, self-contained work (e.g. a focused review). Otherwise run the same checklist inline. Run format, lint, or typecheck manually, only on files you touched, and only if the project has those scripts.

Logging: record any ECC rule that shapes a design decision in DECISIONS.md as one line. Don't copy rule text into any log file.

## 10. Session hygiene
- At a phase boundary, update Handoff, then tell me it's a good point to start a fresh session.
- If your context is getting heavy or you've lost the thread, stop and tell me instead of continuing.
- Don't re-read a file you've already read this session unless it changed.

## 11. Rule conflicts and gaps
- If a rule file is missing, outdated, or contradicts the codebase, follow the codebase, log one line in DECISIONS.md, and don't try to fix the rule files.
- Suggest rule changes to me; don't edit rule files or AGENTS.md yourself.

## 12. Final summary
Steps completed · files changed · unverified items · unresolved edge cases and risks · future considerations (≤3 lines).