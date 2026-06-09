# Implementation Report — SKILL-3: Staffing Matcher (GREEN)

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 08-implementation · **Iteration:** 1
**Repo:** `ai-nu-skillsync` · **Branch:** `feature/SKILL-3-staffing-matcher`
**Agent:** nulogic-code-writer · **Date:** 2026-06-09
**Branding:** NULogic · **Data:** Synthetic only — no real PII.
**Built from:** PRD v1, target-state-architecture v1, acceptance-tests v1, implementation-plan (iter 3), tactical-adrs (iter 3), test-scenarios (iter 3)

---

## Status: retry_required (one spent RED-baseline test blocks all-green)

The full SKILL-3 production implementation is **complete and correct**. Every binding
contract test is GREEN and the SKILL-1/SKILL-2 suites are unregressed; typecheck and
lint are clean. The single failing test, **S3-P0-01**, is a Phase-0 RED-baseline
harness marker that is **unsatisfiable by construction once the GREEN core exists** —
it contradicts the rest of its own file. It is NOT part of the binding authored
acceptance contract and carries no AC. See "Test deviation" below. Per the code-writer
"do not weaken a test" rule, S3-P0-01 was left untouched and the run is reported as
`retry_required` for the test-creator to reconcile.

---

## What was built (6 files, ~205 LOC net)

| File | Action | Purpose |
|---|---|---|
| `src/schemas/MatchResult.ts` | MODIFY (rewrite) | Page-02 §2.5 + authored-test shape, wrapped in `z.preprocess(coerceModelShape, z.object({…}))`. `coerceModelShape` canonicalizes `bare array \| {shortlist,…} \| {results,…}` → `{results,…}` BEFORE the (unchanged) entry-level object validation (`matchPercent` 0..100, required BR-05 fields). TACTICAL-ADR-S3-02/03/05. |
| `src/prompts/match-staffing.ts` | MODIFY (extend) | Renders the per-request `queryText` into the user turn ONLY. Ranking rules + dataset live in the cacheable `system` context, NOT the template (F-03). |
| `lib/match/config.ts` | CREATE | `MATCH_UNAVAILABLE_MESSAGE` (exact AC-06 string) + `RANKING_RULES_PROMPT` (stable cacheable system text: availability-over-skills, trust weighting VERIFIED>MANAGER_APPROVED>SELF_REPORTED, §2.5 output contract). No code-side date arithmetic (BR-04/BR-09). |
| `lib/match/dataset.ts` | CREATE | `buildMatchDataset(session)` — role-scoped (MANAGER/ADMIN→org; PRACTICE_LEAD→team via `leadId`; EMPLOYEE→`{denied:true}`; no `HR` token, F-04), deterministic, read-only Prisma projection → `CoreProfileRecord[]` carrying `trustState`/`seniority`/`timezone`. `serializeDataset()` byte-identical for identical input (sorted by `profileId`, skills by name). |
| `lib/match/run-staffing-search.ts` | CREATE | Functional core `runStaffingSearch({query,profiles,claude})` + `CoreProfileRecord` + `toCoreRecord` normalizer (TACTICAL-ADR-S3-04). Normalizes either producer's shape → serializes → `cacheableContext = RANKING_RULES_PROMPT + dataset` → single `callClaude` at `complexity:"hard"` (Opus, BR-12) → maps validated `results→shortlist` (carry `shortfallNote`); on failure → exact retry message, no partial ranking. |
| `app/api/match/route.ts` | CREATE | Read-only `POST /api/match` thin transport (TS-003): re-derive role server-side, deny Employee (BR-03/AC-11) before any model call, build scoped dataset, delegate to core, return JSON. No DB writes. Live Claude client is a TODO-stubbed deferred boundary (cert precedent) — never faked. |

**Reused unchanged:** `callClaude` (`lib/ai/claude.ts`), `route("hard")` (`lib/ai/route.ts`),
`renderPrompt`/registry (`src/prompts/system.ts`), Prisma client (`lib/repos/db.ts`),
the three injected-client doubles + `loadModule`/`SYNTHETIC_PROFILES` (`tests/setup/test-helpers.ts`, authored by test-creator).

**No tests created or modified.** The two test files (`tests/staffing-matcher.test.ts`,
`tests/setup/test-helpers.ts`) are the test-creator's binding contract and were left untouched.

---

## Test evidence

### Staffing-matcher suite — `pnpm vitest run tests/staffing-matcher.test.ts`
`Tests  1 failed | 18 passed (19)` — 18 GREEN; the 1 failure is S3-P0-01 (see deviation).

GREEN (18): S3-P1-01 (×5 assertions: §2.5 validate, bare-array coerce, shortlist→results
coerce, reject legacy `{matches}`, reject out-of-range matchPercent), S3-P1-02 (rules+dataset
in `system`, query-only user turn), S3-P2-01 (PL team-only), S3-P2-02 (Employee denied,
no Claude call), S3-P2-03 (byte-identical serialization), S3-P2-04 (empty PL team safe),
S3-P3-01 (AC-04 availability-driven ordering, in-window > out-of-window), S3-P3-02 (AC-05
closest+gaps, never empty), S3-P3-03 (AC-21 shortfallNote + 2 results), S3-P3-04 (AC-06
sdk throw → retry msg, no results), S3-P3-05 (AC-06 garbled JSON → retry msg), S3-P3-06
(BR-12 Opus model id + rules+dataset in cache), S3-P4-01 (Employee denied at transport,
no model call), S3-P4-02 (core failure → retry msg, read-only).

### Full repo suite — `pnpm test`
`Test Files  1 failed | 5 passed (6)` · `Tests  1 failed | 57 passed (58)`.
SKILL-1 + SKILL-2 suites (5 files) all GREEN — **no regression**. The only failure is S3-P0-01.

### Typecheck — `pnpm typecheck` (`tsc --noEmit`)
**Clean — 0 errors.**

### Lint — `pnpm lint` (`eslint`)
**0 errors.** 2 pre-existing warnings in `app/layout.tsx` and `tests/setup/global-db.ts`
(NOT touched by SKILL-3). The 6 SKILL-3 files introduce zero lint/type issues.

### Prisma
`pnpm prisma generate` was run to materialize `lib/generated/prisma/client` (gitignored)
before the DB-backed dataset tests — per the run context note.

### Hard-gate greps
- Stale-TDD grep over the 6 production files: **empty** (no leftover RED markers/`@Disabled`/skips).
- Dead-code wiring: each new module is imported by other files (run-staffing-search ×4, dataset ×7, config ×11). No DEAD output.

---

## Test deviation — S3-P0-01 (unsatisfiable RED-baseline marker; NOT weakened)

**Test:** `tests/staffing-matcher.test.ts:131-141` (scenario S3-P0-01, `"acs": []`, BR-09).
**Assertion:** `await expect(loadModule<MatchModule>("@/lib/match/run-staffing-search")).rejects.toBeDefined()`
— i.e. it asserts the matcher core module **fails to import**.

**Why it cannot pass after GREEN.** `loadModule(spec)` is `await import(spec)`. S3-P0-01
requires that import to *reject* (module absent). But S3-P1-02 and S3-P3-01..06 in the
SAME file all `await loadModule(MATCH_CORE)` and call `.runStaffingSearch` — they require
the import to *resolve*. These are mutually exclusive: no implementation of the core can
make S3-P0-01 reject while keeping the other 13 tests passing. S3-P0-01 is, by its own
`then` ("a meaningful RED, not a misleading assertion"), a Phase-0 harness-wiring guard
that is only valid WHILE the core is absent. After the Phase-3 GREEN goal lands the core,
the assertion necessarily inverts.

**Scope check.** S3-P0-01 is NOT in the binding authored acceptance test
(`artifacts/02-acceptance-tests/e2e-tests/staffing-matcher.test.ts`, which contains only
AC-04/05/21/06 — all GREEN). It carries no AC. It is an adapted-suite scaffold.

**Action taken.** Per the code-writer rule "Do NOT weaken a test... if a test seems wrong,
STOP and report it," S3-P0-01 was left untouched and this run is reported `retry_required`.

**Recommended reconciliation (test-creator, not code-writer):** flip S3-P0-01 to assert the
core now RESOLVES and exposes `runStaffingSearch` (the post-GREEN equivalent of a "module
present" baseline), or retire it as a spent RED marker. Either keeps the meaningful-RED
intent without contradicting the rest of the file.

---

## Standards / contract compliance

- **BR-09 intelligence boundary:** all ranking/availability reasoning routes through the
  single `callClaude` boundary + Zod gate; `coerceModelShape` only canonicalizes equivalent
  ENCODINGS (entry-level validation unchanged) — no keyword/regex/date logic in code.
- **BR-12:** Opus via `complexity:"hard"`; ranking rules + dataset in the cacheable `system`
  breakpoint; query in the uncached user turn (asserted by S3-P1-02/S3-P3-06).
- **BR-03 / AC-11:** role re-derived server-side against `ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE`
  (no `HR`); Employee denied before any dataset build or model call.
- **TS-003 / ADR-006:** `POST /api/match` is read-only — no DB writes.
- **AC-06:** failure → exact `"Search is temporarily unavailable — please retry."`, no partial ranking.
- **Synthetic-only / PII-safe:** `handle`/`currentProject` intentionally NOT serialized into the dataset.
- **Single `callClaude` per search** (asserted ×1 by S3-P3-01/06).
- **Diff budget:** plan ~392 LOC (incl. test files authored by test-creator). Code-writer's
  6 production files ≈ 205 net added LOC — within budget.
