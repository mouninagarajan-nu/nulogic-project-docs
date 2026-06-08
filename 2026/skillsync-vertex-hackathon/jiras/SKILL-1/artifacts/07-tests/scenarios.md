# SKILL-1 — Foundation Test Scenarios (GIVEN-WHEN-THEN)

**Jira:** SKILL-1 — Foundation: synthetic data, trust-state persistence & the Claude intelligence boundary
**Stage:** 07-tests · **Agent:** nulogic-test-creator · **Mode:** LOCAL-ONLY (TDD RED)
**Target repo:** `ai-nu-skillsync` · **Branch:** `feature/SKILL-1-foundation`
**Built from:** implementation-plan v1, test-scenarios.json (20 scenarios) v1, tactical-adrs v1, acceptance-tests v1

All tests are authored in the **RED** state: they compile/collect and run, and fail because the
SKILL-1 implementation modules (`@/lib/ai/claude`, `@/lib/ai/route`, `@/lib/repos/db`,
`@/lib/repos/skill`, `@/lib/dev/guardrails`) and the extended Prisma schema/seed do not exist yet.

> **Carry-forward R3-01 (MANDATORY):** synthetic handles MUST use the literal prefix
> `synthetic-handle-`. `no-pii.test.ts` (TS-P1-04, TS-P3-02) asserts `/^synthetic-handle-/`,
> NOT `handle-<n>`. This locks the implementation in Stage 8.

---

## Test files (4 + 3 harness/setup) → 23 test cases

| File | Scenarios | Tests |
|---|---|---|
| `tests/foundation/wrapper-gate.test.ts` | TS-P2-01..05, TS-P3-03, TS-P3-05 | 7 |
| `tests/foundation/schema-invariant.test.ts` | TS-P1-01, TS-P2-06/07/08, TS-P3-01 | 6 |
| `tests/foundation/no-pii.test.ts` | TS-P1-04, TS-P1-05, TS-P3-02 | 5 |
| `tests/foundation/baseline-skills.test.ts` | TS-P1-02, TS-P1-03, TS-P3-04 | 5 |
| `vitest.config.ts`, `tests/setup/global-db.ts`, `tests/setup/db.ts` | TS-P0-01, TS-P3-06 (harness/infra) | — |

---

## Phase 0 — Baseline (harness)

### TS-P0-01 — Vitest harness runs; disposable-DB infra in place
- **GIVEN** a fresh `feature/SKILL-1-foundation` checkout
- **WHEN** `pnpm test` runs
- **THEN** Vitest executes, `globalSetup` overrides `DATABASE_URL` to a per-run temp file, applies
  the schema, and (once the seed lands) seeds it; the harness collects `tests/**/*.test.ts`.
- **Realized by:** `vitest.config.ts`, `tests/setup/global-db.ts`, `tests/setup/db.ts`.

---

## Phase 1 — Schema, seed, fixtures (SUB-TASK-1)

### TS-P1-01 — Extended schema applies with all unique constraints [AC-16, BR-18, BR-19]
- **GIVEN** the extended `prisma/schema.prisma`
- **WHEN** the disposable DB is pushed and queried
- **THEN** new models (`Resume`/`UpskillingPlan`/`PlanItem`/`IdentityMapping`) are queryable;
  `Skill.canonicalKey` is a populated column; `EmployeeSkill @@unique([employeeId,skillId])` rejects a
  duplicate; `Certificate @@unique([employeeId,contentHash])` rejects a duplicate.
- **Test fn:** `schema applies with all unique constraints`

### TS-P1-02 / TS-P3-04 — Seed: profiles with baseline skills + availability [AC-16, BR-16]
- **GIVEN** a freshly seeded disposable DB
- **WHEN** employees are inspected
- **THEN** 20–25 rows exist, each with ≥1 `origin=BASELINE`/`trustState=SELF_REPORTED` skill, an
  `allocation` in 0–100, a `freeFrom` Date (mix past/future), a `seniority` and a `timezone` (some `IST`).
- **Test fn:** `every seeded profile has baseline skills + freeFrom + allocation`

### TS-P1-03 — Catalog seeded with aiEnabled deliberately set [AC-26, BR-11]
- **GIVEN** a seeded catalog of ~12–20 items
- **WHEN** inspected
- **THEN** every `CatalogItem.aiEnabled` is a real boolean and ≥1 is `true`.
- **Test fn:** `catalog has aiEnabled set with at least one true`

### TS-P1-04 — One synthetic IdentityMapping per employee, no PII [AC-13/14, BR-10] **(R3-01)**
- **GIVEN** a seeded DB
- **WHEN** `IdentityMapping` rows are inspected
- **THEN** exactly one mapping per employee, each keyed by a handle matching `/^synthetic-handle-/`
  and never an email/PII.
- **Test fn:** `identity mappings keyed by synthetic handles only`

### TS-P1-05 — Seed never emits real-domain emails / PII [AC-13, BR-10]
- **GIVEN** all seeded `Employee.email`
- **WHEN** scanned
- **THEN** none matches `@(gmail|yahoo|outlook|hotmail|icloud|protonmail)\.com`; emails use a synthetic
  domain (`*.test` / `example.*`) only.
- **Test fn:** `no real-domain email in seed`

---

## Phase 2 — Claude boundary + repository (SUB-TASK-2)

### TS-P2-01 — Valid payload → Ok(typed) [BR-09, AC-13] *(critical path)*
- **GIVEN** `callClaude` with a per-call Zod schema + an injected client returning valid scripted JSON
- **WHEN** the response passes through the wrapper
- **THEN** `safeParse` succeeds, a typed `Ok(data)` is returned, and the boundary was invoked exactly once.

### TS-P2-02 — Garbled JSON → Failure, no write [BR-09, AC-03/06/20] *(critical path)*
- **GIVEN** an injected client returning malformed JSON
- **WHEN** the response passes through the wrapper
- **THEN** extract + `safeParse` fail, a typed `Failure(promptName, requestId)` is returned, no `data`
  field is present, no raw model text is surfaced.

### TS-P2-03 — SDK throw → Failure [BR-09, AC-06]
- **GIVEN** an injected client whose `createMessage` throws
- **WHEN** `callClaude` is invoked
- **THEN** the throw is caught and mapped to a `Failure`; the raw error message never leaks onto a write path.

### TS-P2-04 — Sub-threshold confidence → Failure [BR-09, AC-03]
- **GIVEN** a schema-valid payload whose `confidence` is below threshold
- **WHEN** `callClaude` validates it
- **THEN** the wrapper returns `Failure` (write nothing).

### TS-P2-05 — Model routing: Opus for hard, Sonnet for routine; ids from config [BR-12, AC-04]
- **GIVEN** `route(complexity)`
- **WHEN** `route('hard')` and `route('routine')` are called
- **THEN** `hard` returns an Opus id, `routine` a Sonnet id, and they differ (no hardcoded id in logic).

### TS-P2-06 / TS-P3-01 — Aliases collapse to one canonical Skill id [AC-22, BR-18] *(critical path)*
- **GIVEN** a seeded alias where `TS` resolves to TypeScript's `canonicalKey`
- **WHEN** `resolveCanonicalSkill('TypeScript')` and `('TS')` are called
- **THEN** both return the same canonical `Skill.id`.

### TS-P2-07 — upsertAndPromoteSkill: promote in place, never demote/duplicate [AC-22, BR-18] *(critical path)*
- **GIVEN** a profile holding a canonical skill
- **WHEN** promoted to a higher state, then re-asserted at a lower state
- **THEN** the first call promotes the SAME row (`createdNewRow=false`), the second is a no-op (no demote),
  and exactly one `EmployeeSkill` row exists for `(employee, canonical skill)`.

### TS-P2-08 — Skill-identity failure → create-new + reconcilePending, write never blocks [AC-22, BR-18, TS-002]
- **GIVEN** `resolveCanonicalSkill` with a Layer-2 Claude advisor that returns invalid output
- **WHEN** a new, non-aliased skill name is resolved
- **THEN** it falls back to create-new keyed by the deterministic `canonicalKey` + `markReconcilePending`,
  returns a new `Skill.id`, and completes without throwing/hanging (Skill count increments by one).

---

## Phase 3 — Foundation gates + no-PII (SUB-TASK-3)

### TS-P3-02 — No-PII gate executable [AC-13, BR-10] *(critical path)* **(R3-01 + R2-03)**
- **GIVEN** `loadSeedProfiles()`, `scanRepoForHardcodedSecrets()`, `secretEnvVarNames()` from
  `@/lib/dev/guardrails`
- **WHEN** the gate runs
- **THEN** each `loadSeedProfiles()` object exposes ONLY the no-PII-safe projection (handle matching
  `/^synthetic-handle-/` + email), with NO name-like key (R2-03 — `name` projected away); no hardcoded
  secret literals in tracked source; `secretEnvVarNames` includes `ANTHROPIC_API_KEY` and a
  `GOOGLE…CLIENT…(ID|SECRET)` name.

### TS-P3-03 — Validate-before-write (invalid then valid) [BR-09, AC-13] *(critical path)*
- **GIVEN** the wrapper with an injected SDK double
- **WHEN** fed an invalid payload then a valid one
- **THEN** invalid → `Failure` (nothing persisted); valid → `Ok(typed)`.

### TS-P3-05 — Single-file test command isolates one file [harness]
- **GIVEN** `pnpm test <file>` → `vitest run <file>`
- **WHEN** invoked against one foundation file
- **THEN** only that file's suites execute (CLAUDE.md single-file requirement).

### TS-P3-06 — Never hit the live API or the shared dev.db [BR-09, BR-10, AC-13]
- **GIVEN** `globalSetup` overrides `DATABASE_URL` to a per-run temp file before any test imports the
  client, and `lib/repos/db.ts` builds `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })`
- **WHEN** the suite runs and re-seeds
- **THEN** the Claude client is an injected double (no live key); every read/write hits the disposable
  temp DB (guard refuses `dev.db`); teardown deletes the temp file.
- **Realized by:** `tests/setup/global-db.ts` (override + push + seed + teardown) and the `dev.db` guard in
  `tests/setup/db.ts`.

---

## AC / BR → scenario coverage

| AC / BR | Scenarios | Critical path |
|---|---|---|
| AC-13 (no-PII / env-secrets) | TS-P1-04, TS-P1-05, TS-P2-01, TS-P3-02, TS-P3-03, TS-P3-06 | ✔ (BR-10 gate) |
| AC-16 (baseline data) | TS-P1-01, TS-P1-02, TS-P3-04 | |
| BR-09 (validate-before-write) | TS-P2-01..04, TS-P3-03 | ✔ |
| BR-10 (synthetic only, env secrets) | TS-P1-04, TS-P1-05, TS-P3-02, TS-P3-06 | ✔ |
| BR-12 (Sonnet default / Opus for match) | TS-P2-05 | |
| BR-16 (baseline distinct from acquired) | TS-P1-02, TS-P3-04 | |
| BR-18 (single canonical-record invariant) | TS-P1-01, TS-P2-06/07/08, TS-P3-01 | ✔ |
| BR-19 (contentHash idempotency substrate) | TS-P1-01 | |
| TS-002 (de-dupe failure fallback) | TS-P2-08 | |

All 20 planner scenarios are covered (TS-P0-01 & TS-P3-06 realized as harness/infra, not standalone `it`s).
