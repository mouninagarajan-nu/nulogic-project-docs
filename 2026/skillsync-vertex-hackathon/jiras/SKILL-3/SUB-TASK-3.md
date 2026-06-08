# SKILL-3 / SUB-TASK-3 — Staffing-matcher tests (availability reasoning, hard match, partial-quantity, failure)

**Parent:** SKILL-3 · **Component:** Test harness (Vitest) · **Repo:** ai-nu-skillsync
**Gaps:** TD-MATCH-01, TD-TEST-01

## Pseudocode

1. **Set up `staffing-matcher.test.ts`** against the seeded synthetic dataset (SKILL-1) using the test helpers in `e2e-tests/setup/test-helpers.ts`:
   - Stub the Claude boundary so tests are deterministic: a fake `callClaude` that returns canned, schema-valid `MatchResult`s per scenario, plus a `Failure` variant for AC-06. (The boundary, not the model, is asserted — Page 02 §2.6 / intelligence-boundary rule.)
   - Assert the call boundary is invoked with the `match-staffing` prompt routed to **Opus** and that the **dataset is passed in the cacheable context** (BR-12).
2. **Write scenario tests mapped to S-04/05/06/07 (and the role-scope dependency):**
   - **S-04 (AC-04):** query "2 mid-level React + Node devs, free now or within 2 weeks, IST overlap" → assert each result has `matchPercent`, `matchedSkills[]`, `gaps[]`, `availability`, `rationale`; assert the call boundary was invoked once with the serialized dataset (availability fields present). Determinism: same input → identical serialized dataset string.
   - **S-05 (AC-05):** niche-skill query, no perfect fit → assert non-empty `results[]` with ramp-up wording in `gaps`/`rationale`.
   - **S-06 (AC-21):** "3 mid-level React devs free within 2 weeks", only 2 qualify → assert `shortfallNote` present and `results.length < requested.count`.
   - **S-07 (AC-06):** `callClaude` → `Failure` → assert the handler returns the retry message and **no `results[]`** are exposed.
   - **Role scope:** an `EMPLOYEE` session calling `/api/match` is denied; a `PRACTICE_LEAD` dataset contains only team members.
3. **Wire the single-file test command** so `staffing-matcher.test.ts` can run in isolation (reuses the Vitest config from SKILL-1); capture output as evidence.

## Implementation Contract

- **GOAL:** Green, deterministic matcher tests proving availability-aware ranking, hard-match, partial-quantity, failure UX, and role scoping — with the Claude boundary stubbed so the intelligence is asserted at the boundary, not faked in code.
- **CONSTRAINTS:**
  - Per the **intelligence-boundary rule** (test-scenarios.md §9), tests assert the **call boundary + Zod validation + graceful failure**, NOT hardcoded keyword/regex logic; a passing impl must not fake the ranking.
  - Per **BR-12**, assert Opus routing + dataset-in-cacheable-context.
  - Per **AC-06**, the failure test asserts the retry message and zero exposed results.
  - Per **CLAUDE.md**, show evidence (test output), don't assert success.
- **FORMAT:** `e2e-tests/staffing-matcher.test.ts` (extends the existing RED stub); reuses `e2e-tests/setup/test-helpers.ts`.

## Data Models

- **Test doubles:** stubbed `callClaude` returning canned `MatchResult` (happy / hard / partial) and `Failure` (AC-06).
- **Fixtures/seed:** the ~20–25 synthetic profiles from SKILL-1 (allocation, freeFrom, seniority, timezone, skills+trustState).
- **Assertions:** `MatchResult` shape (Page 02 §2.5), `shortfallNote`, Opus routing, deterministic dataset serialization.

## Error Handling

1. **Seed not present when the test runs:** test setup re-seeds (or fails with a clear "run seed first" message) — never asserts against an empty DB silently.
2. **Stubbed `callClaude` returns an out-of-contract object:** the Zod `safeParse` in the wrapper fails the test, proving the gate works.
3. **A flaky non-deterministic dataset string** breaks the determinism assertion → surfaces the ordering bug rather than passing intermittently.
4. **The failure test accidentally finds `results` exposed:** the assertion fails loudly (guards AC-06).
5. **Role-scope test runs with a mis-seeded `leadId`:** helper validates team membership setup before asserting scope.

## Failure Conditions (testable defects)

1. The happy test passes even though the matcher derived the ranking from keyword/date code instead of the Claude boundary → intelligence-boundary violation.
2. The partial-quantity test passes with an empty `results[]` (no `shortfallNote`) → AC-21 not actually covered.
3. The failure test passes while a partial ranking is shown → AC-06 not actually covered.
4. The role-scope test passes while a Practice Lead sees org-wide profiles → BR-03/AC-11 not covered.
5. Tests assert Opus but the impl silently used Sonnet (no routing assertion) → BR-12 coverage gap.
