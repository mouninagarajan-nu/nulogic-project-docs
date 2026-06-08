# SKILL-3 — Staffing Matcher: availability-aware ranked shortlist

## Metadata

| Field | Value |
|---|---|
| **Story ID** | SKILL-3 |
| **Epic** | EPIC-1 — Foundation & The Hero Loop |
| **Roadmap Phase** | Phase 3 (Staffing Matcher) |
| **Story Points** | 5 |
| **T-shirt** | L |
| **Estimated LOC** | ~360 |
| **Impact** | HIGH (P0 hero risk #2; Opus reasoning; token-efficient caching) |
| **Priority** | Highest |
| **Component** | Matching service, Claude integration (Opus + caching), role-scoped dataset builder |
| **Target Repository** | ai-nu-skillsync |
| **Gaps Closed** | TD-MATCH-01, TD-DATA-04 (matcher reads seniority/timezone) |
| **Owner** | mouni.nagarajan@nulogic.io |
| **Started At** | 2026-06-08T00:00:00Z |
| **Status** | In Progress |
| **Pipeline Stage** | 06-implementation-planning |

## User Story

**As a** Manager/HR (and Practice Lead for their team),
**I want** to search for people in plain English by skill *and* availability and get a ranked shortlist with match %, matched skills, gaps, availability, and a one-line rationale,
**so that** I can staff an engagement in minutes — reasoning over who is "free now" or "free in two weeks" — instead of staffing from memory and stale resumes.

## Business Context

**Problem.** Managers cannot quickly ask "who has React + Node *and* is available within two weeks?" Staffing from memory costs billable time and client confidence; time-to-staff is measured in days. This is **hero risk #2** — the matcher is the second half of the loop and the capability whose quality the demo lives or dies on.

**Value.** A Claude-ranked, availability-aware shortlist turns days into minutes. Reasoning over `allocation` + `freeFrom` (not skills alone) is the core differentiator; hard-match and partial-quantity handling mean the manager always gets a useful answer (closest people + gaps, or "2 of 3 qualify"), never an empty list or a crash.

## Business Rules

| BR | Description |
|---|---|
| BR-03 | Role-based data scope: the matcher dataset is scoped to the viewer (Manager/HR/Admin = org; Practice Lead = own team; Employee = denied). |
| BR-04 | Matching must reason over availability (`allocation` %, `freeFrom`) — "free now" vs "free in N weeks" — not skills alone. |
| BR-05 | Every shortlist entry returns match %, matched skills, gaps, availability, a one-line rationale; hard matches return closest people + ramp-up rather than empty. |
| BR-09 | Matching/ranking + availability reasoning is a Claude API call, JSON validated (Zod) before use — no keyword/date-arithmetic substitute. |
| BR-12 | Use **Opus** for ranking (tricky reasoning that drives the loop); prompt-cache the system prompt + serialized profile dataset across queries (and the loop's before/after). |

## AC Mapping

| AC | Description |
|---|---|
| AC-04 | Availability-aware ranked match (happy) — validated shortlist reasons over availability, not skills alone. |
| AC-05 | Hard match with no perfect fit returns closest people + gap/ramp-up analysis (not empty). |
| AC-06 | Search failure — Claude unreachable / invalid JSON → no partial ranking; spec'd retry message. |
| AC-21 | Partial-quantity fulfillment — fewer than requested qualify → return them with an explicit shortfall note. |

## Technical Architecture

- **Transport (TS-003, ADR-006):** `POST /api/match` Route Handler, **read-only** (query in body), NOT a Server Action — a staffing search writes nothing. Re-derives session + role server-side; Employee denied; PL scoped to team.
- **Flow (Page 02 §4.2):** Matching service → role-scoped **dataset builder** produces a deterministic serialized profile set (skills + `trustState`, `allocation`, `freeFrom`, `seniority`, `timezone`) → Claude wrapper `match-staffing` (**Opus**) with the **system prompt + dataset marked cacheable** and the per-request query outside the cache breakpoint → `MatchResult` (Zod) → branch on happy / hard-match / partial-quantity / failure.
- **Availability reasoning is in the prompt** (BR-04): rank over allocation + freeFrom ("free now" / "free in ~2 weeks"); no date arithmetic in code substituting for the model.
- **NFRs:** interactive latency with a loading state (Performance); no partial/garbled ranking on failure (Reliability); deterministic dataset ordering so the loop's before/after reuses the cache (Cost efficiency); call-boundary logging incl. cache hit (Observability).

## Architecture References

- **API contracts (Page 02):** `POST /api/match` read transport + POST-as-read rationale (§3.2a / TS-003); match flow sequence (§4.2); model routing — Opus for match (§2.2); prompt caching (§2.3); `MatchResult` schema (§2.5).
- **Data model (Page 03):** `Employee.seniority`/`timezone`/`allocation`/`freeFrom` (§4.1), `EmployeeSkill.trustState` weighting (§3, matching weight `VERIFIED > MANAGER_APPROVED > SELF_REPORTED`).
- **ADRs:** ADR-003 (Claude wrapper, routing, caching), ADR-006 (single app, read-only handler for match — TS-003), ADR-002 (data store).
- **Roadmap:** Phase 3 deliverables + exit criteria (Page 04 §2); risk register "Claude invalid JSON" / "Claude API unavailable".

## Acceptance Criteria (Gherkin)

### Scenario A — Availability-aware ranked match (AC-04, S-04)
```gherkin
GIVEN a Manager/HR user and ~20-25 synthetic profiles with skills, allocation %, and freeFrom dates
WHEN the manager submits "2 mid-level React + Node devs, free now or within 2 weeks, IST overlap"
THEN the match-staffing Claude call (Opus) is invoked with the cached system prompt + serialized dataset
AND it returns a Zod-validated MatchResult where each entry has matchPercent, matchedSkills[], gaps[], availability, and a one-line rationale
AND the ranking demonstrably reasons over availability (free now / within 2 weeks) and seniority/timezone, not skill overlap alone.
```

### Scenario B — Hard match, closest people + gaps (AC-05, S-05)
```gherkin
GIVEN a query for a niche skill where no profile is a perfect fit
WHEN the manager submits the query
THEN Claude returns the closest available people with explicit gap and ramp-up analysis (e.g. "~1 week of AWS ramp-up")
AND the result is never an empty list.
```

### Scenario C — Partial-quantity fulfillment (AC-21, S-06)
```gherkin
GIVEN a query requesting "3 mid-level React devs free within 2 weeks" but fewer than 3 qualify
WHEN the manager submits the query
THEN Claude returns the qualifying people (fewer than requested)
AND a shortfallNote is included (e.g. "2 of 3 requested qualify")
AND the result is neither empty nor a silent drop of the shortfall.
```

### Scenario D — Search failure (AC-06, S-07)
```gherkin
GIVEN the Claude API is unreachable or returns output that fails Zod validation
WHEN the manager submits a search
THEN no partial or garbled ranking is shown
AND the user sees "Search is temporarily unavailable — please retry."
```

### Scenario E — Role scope on the dataset (BR-03 / AC-11 dependency)
```gherkin
GIVEN a Practice Lead runs a search
WHEN the dataset builder assembles profiles
THEN only the PL's team profiles are included
AND an Employee calling /api/match is denied (matcher not accessible to Employee role).
```

## Dependencies

- **blocks:** SKILL-4 (the loop re-runs this same search before/after a promotion).
- **blocked_by:** SKILL-1 (Claude wrapper + Opus routing + caching, `MatchResult` schema, seeded profiles with availability/seniority/timezone). Role scoping is fully enforced in SKILL-6; SKILL-3 builds the scoped dataset builder and denies Employee.

## Sub-Tasks

- **SUB-TASK-1** — Role-scoped deterministic dataset builder + `match-staffing` prompt (Opus) + `MatchResult` schema + prompt caching.
- **SUB-TASK-2** — Matching service `runMatch` via `POST /api/match`: happy / hard-match / partial-quantity / failure branches + graceful UX.
- **SUB-TASK-3** — Staffing-matcher tests (availability reasoning, hard match, partial-quantity, failure).

## UX/Design

Status: Awaiting UX designs (final screens in SKILL-6). Required states: a plain-English query input; a loading state (no multi-minute hang); a ranked shortlist with per-person match %, matched skills, gaps, availability, rationale; a hard-match view (closest + ramp-up); a shortfall banner; the failure retry message; an Employee-denied state. NULogic branding.

## Definition of Done

- `POST /api/match` returns a validated `MatchResult` reasoning over availability + seniority/timezone, not skills alone (AC-04).
- Hard-match returns closest people + ramp-up (never empty); partial-quantity returns qualifiers + shortfall note; failure shows the retry message with no partial ranking.
- Opus is used for ranking; system prompt + dataset are cached; dataset ordering is deterministic for loop reuse.
- Employee is denied; PL dataset is team-scoped.
- Matcher tests green; evidence shown. Typecheck + lint clean.

## Risks & Assumptions

- **Risk:** Opus latency makes the demo feel slow. **Mitigation:** loading state; prompt caching of the dataset; downgrade to Sonnet only if AC-04/AC-21 still pass.
- **Risk:** the model returns a near-but-invalid JSON shape. **Mitigation:** Zod gate → typed failure → retry message; never show partial ranking (AC-06).
- **Risk:** non-deterministic dataset serialization defeats caching and muddies the loop's before/after. **Mitigation:** stable ordering (Page 02 §2.3).
- **Assumption:** full role enforcement (PL team membership, view-switcher) lands in SKILL-6; SKILL-3 consumes the role from the session and scopes the dataset accordingly.

## Progress Log

| Timestamp | Actor | Note |
|---|---|---|
| 2026-06-05T00:00:00Z | nulogic-jira-creator | Story created from PRD + target-state architecture (Phase 3). Local-only run. |
| 2026-06-08T00:00:00Z | nulogic-dependency-checker | Dependencies cleared. SKILL-1 Done/merged. All foundation building blocks present on branch. No merge conflict risk. Status → Ready. |
| 2026-06-08T00:00:00Z | 06-implementation-planning | implementation-planner | Plan created. 5 phases, 14 test scenarios. 3 tactical ADRs (reconcile authored test vs Page-02 contract; MatchResult superset; rewrite SKILL-1 stub schema/prompt). ~358 LOC across 7 files (5 new, 2 modified). No P0 gaps. |
| 2026-06-08T00:00:00Z | 06-implementation-planning | implementation-planner | Plan revised (iteration 2) — resolved 6 reviewer findings, each re-verified against the repo: F-01 test-helpers MODIFY (loadModule + SYNTHETIC_PROFILES); F-02 canonical CoreProfileRecord (new ADR-S3-04); F-03 ranking rules + dataset in cacheableContext; F-04 roles ADMIN/MANAGER/PRACTICE_LEAD/EMPLOYEE (no HR); F-05 AC-24 out-of-scope (SKILL-6); F-06 additive scenario relabel + count fix. Now 5 phases, 15 scenarios, 4 tactical ADRs, ~385 LOC across 8 files (5 new, 3 modified). No P0 gaps. |
| 2026-06-08T00:00:00Z | 06-implementation-planning | implementation-planner | Plan revised (iteration 3, final) — clean-slate reviewer confirmed all 6 prior findings RESOLVED; resolved 2 new: F-01 (CRITICAL) MatchResult is now z.preprocess(coerceModelShape, z.object({...})) coercing the model's bare-array (AC-04/05) and shortlist-keyed (AC-21) output encodings to {results,...} before the unchanged entry-level validation — required because callClaude runs schema.safeParse(raw) internally at claude.ts:132; new TACTICAL-ADR-S3-05; BR-09 intact. F-02 (LOW) LOC reconciled to a single ~392 throughout. Now 5 phases, 15 scenarios, 5 tactical ADRs, ~392 LOC across 8 files (5 new, 3 modified). No P0 gaps. next_stage_ready=true. |
