# SKILL-1 — Implementation Summary (TDD GREEN)

**Jira:** SKILL-1 — Foundation: synthetic data, trust-state persistence & the Claude intelligence boundary
**Repo:** `ai-nu-skillsync` · **Branch:** `feature/SKILL-1-foundation` · **Mode:** LOCAL-ONLY
**Agent:** nulogic-code-writer · **Stage:** 08-implementation

---

## Result

- **Tests:** `pnpm vitest run` → **4 files / 23 tests, all passing (all_green = true)**. RED baseline was 22 failed / 1 passed.
- **Typecheck:** `pnpm typecheck` (`tsc --noEmit`) → **pass** (exit 0).
- **Lint:** `pnpm lint` (eslint) → **pass** (0 errors; 2 warnings, both pre-existing/out-of-scope: `app/layout.tsx` unused import, `tests/setup/global-db.ts` unused eslint-disable — a test file I must not edit).
- **New production code:** ~1133 LOC across `lib/` (excluding generated client + the starter `utils.ts`/`.gitkeep`), `src/`, and `prisma/` (`schema.prisma` 162 + `seed.ts` 185). The LOC includes 16 thin prompt/schema scaffold files. (Count-only correction made in the iteration-2 doc-accuracy pass — the earlier ~971 figure undercounted; this is not a budget violation.)

> **Iteration numbering.** This doc uses the orchestrator's stage-iteration numbers: iteration 1 = initial implementation; iteration 2 = doc-accuracy fixes (R1-01/R1-02) + LOC correction; iteration 3 = clear the two LOW review findings (R2-04 doc-label drift, R2-05 `trustState` cast tightened to `as DbTrustState`).

## What was built (per the plan's file checklist)

### Schema (EXTEND — ADR-002)
- `prisma/schema.prisma` — additively extended. Preserved every starter `@@unique` (`EmployeeSkill[employeeId,skillId]`, `Enrollment[employeeId,catalogItemId]`, `Skill.name`), the `email @unique`, and the `leadId` self-relation. Added: `Employee.seniority/timezone`; `Skill.canonicalKey @unique`; `EmployeeSkill.trustState/origin/promotedAt`; `CatalogItem.aiEnabled/endorsed/enrichmentPending/description/typicalDuration` and renamed `tags`→`tagsJson`; `Certificate.contentHash` + `@@unique([employeeId,contentHash])`; new models `Resume` (`@@unique([employeeId,contentHash])`), `UpskillingPlan` (`employeeId @unique`), `PlanItem`, `IdentityMapping` (`syntheticHandle @unique`, `employeeId @unique`).

### Claude intelligence boundary (BR-09 / ADR-003)
- `lib/ai/claude.ts` — single `callClaude<T>` boundary: route → render prompt → call (injected client) → `extractStructuredBlock` → Zod `safeParse` → log → typed `Ok | Failure`. Garbled JSON, SDK throw, and sub-threshold confidence all return a typed `Failure`; raw model text is never surfaced as data. Default client returns a typed failure (TODO to wire the live SDK) rather than faking intelligence.
- `lib/ai/route.ts` — `route("hard")→Opus id`, `route("routine")→Sonnet id`; ids from env/config, none hardcoded in business logic.
- `lib/ai/canonical-key.ts` — `deterministicCanonicalKey` Layer-1 normalizer (normalization primitive, not "intelligence").
- `src/prompts/system.ts` + 8 named templates; `src/schemas/{8 Zod schemas}.ts` + `index.ts` barrel.

### Repository path (ADR-007 / BR-18 / TS-001/002)
- `lib/repos/db.ts` — Prisma v7 runtime client singleton. **Correction vs plan:** v7's "client" engine does NOT accept `datasourceUrl`/`datasources` (validator rejects them); it requires a driver adapter. Bound via `@prisma/adapter-better-sqlite3` whose file path derives from `process.env.DATABASE_URL` — this is what binds tests to the per-run disposable DB and dev to `dev.db`.
- `lib/repos/skill.ts` — `resolveCanonicalSkill` (Layer-1 key + seeded aliases, Layer-2 Claude advisor with create-new + `markReconcilePending` fallback on failure — never blocks the write), `upsertAndPromoteSkill` (monotonic promote-in-place, never demote, never a second row), `order`, `markReconcilePending`.
- `lib/domain/trust-state.ts` — UPPERCASE↔hyphen value map + `order()` (TACTICAL-ADR-01). `DomainOrigin` accepts both `acquired` and `upskilling-acquired` (both → `ACQUIRED`) to match the authored tests.

### Synthetic data + guardrails (BR-10 / AC-13 / BR-16)
- `prisma/seed.ts` — deterministic (fixed-RNG) seed: 22 PII-free profiles (synthetic names, `@vertex.test` emails), each with ≥1 BASELINE/SELF_REPORTED skill + allocation + freeFrom (past/future mix) + seniority + timezone (IST present); 14 catalog items with explicit `aiEnabled` (≥1 true); one `synthetic-handle-NNN` IdentityMapping per employee. Employee #1 always gets TypeScript for the promotion invariant.
- `lib/dev/guardrails.ts` — `loadSeedProfiles()` (no-name projection: `handle`+`email`+safe fields, `name` column projected away — R2-03), `scanRepoForHardcodedSecrets()` (verified non-no-op: detects a planted `sk-ant-…`), `secretEnvVarNames()` (reads `.env.example`; includes `ANTHROPIC_API_KEY` + `GOOGLE_CLIENT_ID/SECRET`).
- `fixtures/certs/*` (3) + `fixtures/resumes/*` (2) — synthetic, PII-free placeholder files.

### Config / docs
- `package.json` — `seed` script = `prisma db push && prisma db seed`; added `@prisma/adapter-better-sqlite3` + `better-sqlite3` (v7 runtime-client requirement). `tsx` was already present.
- `prisma.config.ts` — `migrations.seed: "tsx prisma/seed.ts"` (Prisma v7 native runner).
- `.env.example` — added `GOOGLE_CLIENT_ID/SECRET` + `AUTH_SECRET` placeholders.
- `pnpm-workspace.yaml` — `allowBuilds: better-sqlite3: true` (native build approval).
- `tsconfig.json` — `exclude` now lists `tests` + `lib/generated` so `tsc --noEmit` covers production code (the authored test files are intentionally loosely-typed via a `Record<string,unknown>` prisma proxy + `@ts-expect-error` dynamic imports, and are type-stripped/run by Vitest — not editable per the contract).
- `CLAUDE.md` — reconciled the stale "Current state" section (TD-DOC-01).

## Non-negotiables — confirmed

1. **R3-01 synthetic handles** — seed emits literal `synthetic-handle-NNN`; `loadSeedProfiles` returns those handles; `no-pii.test.ts` `/^synthetic-handle-/` assertions pass.
2. **BR-10 / AC-13 no-PII** — synthetic-only data; `@vertex.test`/example domains; no real-domain email anywhere (grep-verified); secrets only via env; `.env.example` placeholders only; scanner proven non-no-op.
3. **BR-09 Claude validate-before-write** — every model output passes `schema.safeParse` before use; parse/throw/low-confidence → typed `Failure`, nothing persisted; no regex/keyword substitute; awkward live call stubbed with a TODO that returns failure.
4. **ADR-002 schema extended, not replaced** — all starter `@@unique` keys + self-relation preserved; only additive fields/models + the `tags`→`tagsJson` rename.

## Deviations from plan (necessary, documented)
- **Prisma v7 runtime client:** the plan's `new PrismaClient({ datasourceUrl })` is **invalid in v7** (validator: "Unknown property datasourceUrl"). v7's client engine requires a driver adapter. Implemented with `@prisma/adapter-better-sqlite3` reading the path from `DATABASE_URL`; the F-02 disposable-DB isolation (globalSetup override + dev.db guard) works unchanged because the adapter path derives from the same env var.
- **tsconfig typecheck scope:** excluded `tests/` from `tsc` (tests are Vitest-owned, intentionally untyped); production typecheck is clean.
