# SKILL-6 / SUB-TASK-2 — Role scoping + Admin role assignment + Claude progress summary

**Parent:** SKILL-6 · **Component:** Role scoping + Role Admin + Progress/Summary service · **Repo:** ai-nu-skillsync
**Gaps:** TD-ROLE-01, TD-ADMIN-01, TD-PROG-01

## Pseudocode

1. **Enforce role-based data scoping** (`lib/auth/scope.ts`, BR-03, Page 02 §5):
   - A central `scopeForViewer(session)` helper: `MANAGER|HR|ADMIN` → org-wide; `PRACTICE_LEAD` → `where leadId == session.profileId`; `EMPLOYEE` → self only.
   - Apply to profile reads and the progress view. At `POST /api/match` (SKILL-3), **deny `EMPLOYEE`** (matcher inaccessible) — fully enforce the PL team-scoped dataset the SKILL-3 builder consumes (AC-11).
2. **`assignRole({userId, role})` Server Action** (`lib/admin/assignRole.ts`, BR-21, Page 02 §3.1):
   - Re-derive session + role; **only `ADMIN`** may proceed; a non-Admin is denied (AC-25). Update `Employee.role` for the (synthetic) target → re-scopes their access via `scopeForViewer`. No broader config (out of scope).
3. **Progress summary** (`lib/progress/summarizeProgress.ts`, AC-12, Page 02 §4):
   - Build a **role-scoped cohort** via `scopeForViewer` (PL=team, Manager=org). If empty (PL with no team) → return the empty state "No team members assigned yet." without calling Claude.
   - Else `callClaude({ promptName:"summarize-progress", complexity:"routine" /* → Sonnet */, schema: ProgressSummary, variables:{ cohort } })` → on-track / behind / thin-coverage. Zod-gate before render (BR-09).

## Implementation Contract

- **GOAL:** Server-side role scoping (PL=team, Employee blocked from the matcher), an Admin-only role-assignment action, and a Claude-summarized role-scoped progress view with an empty state.
- **CONSTRAINTS:**
  - Per **BR-03 / AC-11**, scope is re-derived server-side in every read/action; the client-sent role is never trusted; Employee is denied at `/api/match`.
  - Per **BR-21 / AC-25**, `assignRole` is Admin-only; a non-Admin is denied; it is the only Admin capability (no platform config).
  - Per **BR-09 / AC-12 / ADR-003**, the progress summary is the `summarize-progress` Claude call (Sonnet) Zod-validated before render; the PL empty state short-circuits without a model call.
  - Per **BR-10 / P3**, the cohort passed to Claude and the summary logged carry only synthetic ids/skill names — no PII.
- **FORMAT:** `lib/auth/scope.ts`, `lib/admin/assignRole.ts`, `lib/progress/summarizeProgress.ts`; `src/prompts/summarize-progress.ts`, `src/schemas/progress-summary.ts`. Reuses `callClaude` (SKILL-1) and the session from SUB-TASK-1.

## Data Models

- **Prompt:** `summarize-progress` (Sonnet) → `ProgressSummary { onTrack:[], behind:[], thinCoverage:[], note? }` (Page 02 §2.4/§2.5).
- **Server Action:** `assignRole({userId, role}) → {user} | {denied}` (Page 02 §3.1).
- **Prisma:** `Employee` (`role`, `leadId`), `EmployeeSkill`/`UpskillingPlan` (compliance/progress inputs from SKILL-5/SKILL-4). Reads scoped by `scopeForViewer`.

## Error Handling

1. **Employee calls `/api/match`:** denied server-side (matcher inaccessible) — never builds an org dataset for an Employee (AC-11/BR-03).
2. **PL views progress with no team:** return "No team members assigned yet." without a Claude call (AC-12 empty state).
3. **Non-Admin calls `assignRole`:** denied; no role change; action unavailable in the UI for them (AC-25).
4. **`summarize-progress` returns `Failure`:** show a typed-failure state (e.g. "Summary temporarily unavailable") — never render a fabricated/partial summary (BR-09).
5. **`assignRole` targets a non-existent user / invalid role value:** reject with a clear message; never write an out-of-hierarchy role string.

## Failure Conditions (testable defects)

1. A Practice Lead sees profiles/progress outside their team (`leadId != self`) → AC-11/BR-03 scoping violation.
2. An Employee can run the Staffing Matcher → AC-11/BR-03 violation.
3. A non-Admin successfully assigns/overrides a role → AC-25/BR-21 violation.
4. The progress summary is produced by hardcoded aggregation instead of the `summarize-progress` Claude call → BR-09/AC-12 violation.
5. A PL with no team triggers a Claude call (or errors) instead of showing the empty state → AC-12 violation.
