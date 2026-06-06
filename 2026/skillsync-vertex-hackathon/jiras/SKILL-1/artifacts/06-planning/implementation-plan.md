# SKILL-1 — Implementation Plan (Foundation)

**Jira:** SKILL-1 — Foundation: synthetic data, trust-state persistence & the Claude intelligence boundary
**Epic:** EPIC-1 (Phase 1, critical-path root) · **Target repo:** `ai-nu-skillsync` · **Branch:** `feature/SKILL-1-foundation`
**Stage:** 06-implementation-planning · **Agent:** nulogic-implementation-planner · **Mode:** LOCAL-ONLY
**Built from:** target-state v1 (Pages 02/03/04/05), acceptance-tests v1, STORY.md + SUB-TASK-1/2/3
**Sizing mode:** L (~700 LOC budget)

---

## Executive Summary

SKILL-1 builds the substrate every later SkillSync story stands on: the extended Prisma/SQLite data model (trust-state machine on a single promotable `EmployeeSkill` record), a deterministic synthetic seed (~20–25 PII-free profiles + catalog + identity mappings), synthetic cert/resume fixtures, the **single Claude call boundary** (`callClaude<T>` — route → cache → call → extract → Zod `safeParse` → log → typed `Ok`/`Failure`), the `src/prompts/` + `src/schemas/` scaffolds, the `resolveCanonicalSkill` / `upsertAndPromoteSkill` repository path, a Vitest harness with a single-file command, and a no-PII review gate. No feature surface (no routes, no UI, no live Claude calls) — only the foundation interfaces that downstream stories and the authored RED acceptance tests consume.

**Discovery headline:** the toolchain is further along than CLAUDE.md claims. `@anthropic-ai/sdk@^0.100.1`, `prisma`/`@prisma/client@^7.8.0`, `zod@^4.4.3`, `vitest@^4.1.8` are **all installed**; `test: vitest run` and a `seed` stub already exist in `package.json`; `prisma/schema.prisma` (6 starter models, `db:push` wired, client → `lib/generated/prisma`) and `prisma.config.ts` exist. So this story EXTENDS far more than it creates. The CLAUDE.md "Current state" section is stale (TD-DOC-01) and is reconciled in Phase 1. **One concrete gap (F-01):** there is **no TypeScript executor** anywhere — `tsx`, `ts-node`, and `@swc-node` are absent from `package.json`, `pnpm-lock.yaml`, and `node_modules/.bin/` (verified). A `.ts` seed therefore cannot run without a new dependency; the earlier "no installs needed" line was wrong and is corrected below. This story adds **`tsx`** as a devDependency and runs the seed through the **Prisma v7 native seed runner** (`migrations.seed` in `prisma.config.ts`), not an ad-hoc `tsx prisma/seed.ts` shell call (TACTICAL-ADR-03).

**Two reconciliations drive the plan (both produce tactical ADRs):**
1. **Identifier/value-set bridge.** The authored acceptance-test stubs (`artifacts/02-acceptance-tests/e2e-tests/`, which Stage 7 ports into the repo) import product modules at `@/lib/profile/...`, `@/lib/cert/...`, `@/lib/upload/...`, `@/lib/dev/guardrails`, and use **lowercase-hyphen** trust/source values (`self-reported`/`manager-approved`/`verified`, `source: "certificate"`). The architecture (Page 03 §3.1) and SUB-TASKs persist **uppercase string-enums** (`SELF_REPORTED`…) and place repo code at `lib/repos/skill.ts`. The foundation persists the architecture's canonical uppercase value sets and exposes a documented value-mapping + the consumer module surface the tests resolve. (TACTICAL-ADR-01.)
2. **`src/` vs repo-root path alias.** SUB-TASK-2 specifies `src/prompts/` + `src/schemas/`; `tsconfig.json` maps `@/*` → repo root, so `@/src/prompts/x` resolves to `<root>/src/prompts/x`. CLAUDE.md also names `src/prompts/`. We honor `src/` per the spec; the alias resolves it. (Documented in TACTICAL-ADR-02.)

---

## Discovery Findings (evidence-based)

### Existing components (target repo)
| Artifact | State | Evidence | Decision |
|---|---|---|---|
| `prisma/schema.prisma` | 6 starter models; sqlite; client → `../lib/generated/prisma` | `prisma/schema.prisma:1-98` | **EXTEND** (ADR-002) |
| `prisma.config.ts` | `schema` + `migrations.path` + `datasource.url: process.env["DATABASE_URL"]` (no `migrations.seed`). **CLI-scope only** — this block governs the Prisma CLI (`db push`/`db seed`/`studio`/migrations), NOT the generated runtime client. | `prisma.config.ts:1-14` | **EXTEND** (add `migrations.seed: "tsx prisma/seed.ts"`, F-01) |
| `prisma/schema.prisma` datasource block | `datasource db { provider = "sqlite" }` — **has NO `url` / NO `env()`** | `prisma/schema.prisma:9-11` | the generated runtime client therefore receives **no datasource URL from the schema**; the runtime `PrismaClient` MUST be constructed with an explicit `datasourceUrl` (F-02 mechanism, below) |
| `package.json` scripts | `test`, `test:watch`, `db:push`, `db:generate`, `seed` (stub `exit 1`) | `package.json:13-18` | **EXTEND** (replace seed stub with `prisma db push && prisma db seed`; document single-file test convention) |
| Installed deps | sdk, prisma, zod, vitest all present | `package.json:20-50` | IMPORT (these are present) |
| **TS executor (`tsx`/`ts-node`/`@swc-node`)** | **ABSENT** — not in `package.json`, `pnpm-lock.yaml`, or `node_modules/.bin/` (verified) | `package.json:36-50`; `node_modules/.bin/` scan | **ADD `tsx`** as devDependency (F-01) — required to run `prisma/seed.ts` |
| Prisma v7 seed runner | `prisma db seed` reads `migrations.seed` from `prisma.config.ts` (build emits the "add a `seed` property to the `migrations` section" hint; example `seed: 'bun ./prisma/seed.ts'`) | `node_modules/prisma/build/index.js:631,640` | **WIRE** `migrations.seed: "tsx prisma/seed.ts"` (F-01) |
| `dev.db` (shared) | EXISTS at repo root (`DATABASE_URL="file:./dev.db"` in `.env`) | `dev.db`; `.env:DATABASE_URL` | tests MUST NOT touch it — disposable test DB (F-02) |
| `lib/utils.ts` | `cn()` only (shadcn) | `lib/utils.ts` | leave; unrelated |
| `.env.example` | `ANTHROPIC_API_KEY`, `DATABASE_URL` placeholders | `.env.example:1-7` | **EXTEND** (add Google OAuth placeholders for AC-13 secretEnvVarNames test) |
| `lib/generated/prisma` | NOT generated yet | (absent) | produced by `db:generate`/`db:push` |
| `src/`, `tests/`, `fixtures/` | absent | (absent) | BUILD-NEW |
| `CLAUDE.md` "Current state" | stale (claims deps not installed) | `CLAUDE.md:28-34,52` | **EXTEND** (reconcile, TD-DOC-01) |

### Test infrastructure
- **Vitest 4** present; `test: vitest run`. No `vitest.config.ts`, no `tests/` dir yet.
- **Authored RED acceptance stubs** live in the docs repo at `artifacts/02-acceptance-tests/e2e-tests/` (12 spec files + `setup/test-helpers.ts`). README §"How to run" says copy the tree into `ai-nu-skillsync/tests/acceptance/` so `@/*` resolves. They import not-yet-existing `@/lib/...` modules via `loadModule()` (throws `NOT_IMPLEMENTED`). **Stage 7 (test-creator) ports these.** SKILL-1 foundation tests are the GREEN gates for the substrate (schema invariant, no-PII, wrapper gate, baseline data) — distinct from the 27-AC suite which lands per feature.
- Injectable Claude client contract the stubs assume: an object with `createMessage(...) → { content: [{ type:"text", text }] }` (see `test-helpers.ts:145-165`). The wrapper must accept an injectable client of this shape (not import the SDK singleton directly) so tests can inject spy/garbled/throwing doubles. (Wiring Trace below.)

### Patterns observed
- ES modules, named exports, `@/*` → repo root (`tsconfig.json` paths).
- Prisma v7 `prisma-client` generator → `lib/generated/prisma` (import client from there, not `@prisma/client`).
- Next.js 16 docs present at `node_modules/next/dist/docs/` — no Next.js code in this story (data/infra only), so `proxy.ts`/async-API conventions are noted but not exercised here.

### Per-file analog scan (BUILD-NEW justifications)
| New file | Closest analog searched | Reason no reuse |
|---|---|---|
| `lib/ai/claude.ts` | none (`@anthropic-ai/sdk` has zero call sites; grep `anthropic` → only package.json) | first call boundary; nothing to extend |
| `lib/ai/route.ts` | none | model-routing table is net-new (Page 02 §2.2) |
| `lib/repos/skill.ts` | `lib/utils.ts` (unrelated shadcn util) | repository layer does not exist |
| `prisma/seed.ts` | `package.json` seed stub (`exit 1`) | stub has no logic to extend |
| `src/prompts/*`, `src/schemas/*` | none (`src/` absent) | scaffolds are net-new per Page 02 §2.4/2.5 |
| `vitest.config.ts` | none | no test config exists |
| `lib/dev/guardrails.ts` | none | no-PII gate is net-new; consumed by `data-guardrails.test.ts` |

---

## Reuse Strategy (per-file decision)

| Path | Decision | Evidence / rationale |
|---|---|---|
| `prisma/schema.prisma` | **EXTEND** | ADR-002 — add fields/models, preserve `EmployeeSkill @@unique`, `Enrollment @@unique`, self-relation, `Skill.name @unique` |
| `package.json` | **EXTEND** | replace `seed` stub with `prisma db push && prisma db seed`; **add `tsx` devDependency** (F-01); document single-file test command |
| `prisma.config.ts` | **EXTEND** | add `migrations.seed: "tsx prisma/seed.ts"` so Prisma v7's `db seed` runner executes the TS seed (F-01) |
| `.env.example` | **EXTEND** | add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`AUTH_SECRET` placeholders (AC-13 `secretEnvVarNames` expects a GOOGLE…CLIENT…(ID|SECRET) var) |
| `CLAUDE.md` | **EXTEND** | TD-DOC-01 reconcile stale "Current state" |
| `prisma/seed.ts` | **BUILD-NEW** | seed stub has no body |
| `lib/ai/claude.ts`, `lib/ai/route.ts` | **BUILD-NEW** | no Claude boundary exists |
| `lib/repos/skill.ts`, `lib/repos/db.ts` | **BUILD-NEW** | no repository/Prisma-client module exists |
| `lib/ai/canonical-key.ts` | **BUILD-NEW** | deterministic key normalizer (Page 03 §3.4 Layer 1) |
| `lib/dev/guardrails.ts` | **BUILD-NEW** | no-PII scan module consumed by AC-13 test |
| `src/prompts/*.ts` (8) + `src/prompts/system.ts` | **BUILD-NEW** | named prompt templates (Page 02 §2.4) |
| `src/schemas/*.ts` (8) + `src/schemas/index.ts` | **BUILD-NEW** | Zod schemas (Page 02 §2.5) |
| `vitest.config.ts` | **BUILD-NEW** | no config exists |
| `tests/foundation/*.test.ts` | **BUILD-NEW** | foundation GREEN gates |
| `fixtures/certs/*`, `fixtures/resumes/*` | **BUILD-NEW** | synthetic fixtures absent |

> No new file substantially duplicates an existing module. The only large EXTEND is the Prisma schema (purely additive).

---

## Spec Contracts Inventory (verbatim from target-state)

**Data layer (Page 03 §2, §6.1):**
- `Employee` + `seniority String` (`JUNIOR|MID|SENIOR`), `timezone String` (e.g. `IST`), identity back-relation. Keep `name`, `email @unique`, `role` (`ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE`), `allocation Int 0-100`, `freeFrom DateTime?`, `leadId` self-relation.
- `Skill` + `canonicalKey String @unique` (TS-001). Keep `name @unique`, `category String?`.
- `EmployeeSkill` + `trustState String` (`SELF_REPORTED|MANAGER_APPROVED|VERIFIED`), `origin String` (`BASELINE|ACQUIRED`), `promotedAt DateTime?`. Keep `source String` (`SELF|CERTIFICATE|RESUME|CATALOG`), `proficiency Int 1-5`, **`@@unique([employeeId, skillId])`** (BR-18 key).
- `CatalogItem` + `aiEnabled Boolean @default(false)`, `endorsed Boolean @default(false)`, `enrichmentPending Boolean @default(false)`, `description String?`, `typicalDuration String?`, `provider String?` (already nullable in starter). Keep `tagsJson` (starter field is `tags String?` — rename to `tagsJson` per Page 03; see Wiring Trace), `kind` (`CERT|COURSE`).
- New `UpskillingPlan` (`employeeId String @unique`, `status String` (`DRAFT|FINALIZED`), `finalizedAt DateTime?`).
- New `PlanItem` (`planId String`, `catalogItemId String`).
- New `Resume` (`employeeId String`, `fileName String`, `contentHash String`, `parsedJson String?`, `uploadedAt DateTime`, **`@@unique([employeeId, contentHash])`**).
- `Certificate` + `contentHash String`, **`@@unique([employeeId, contentHash])`** (TS-004).
- New `IdentityMapping` (`syntheticHandle String @unique`, `employeeId String`).
- Constraints (§6.1): `Skill.canonicalKey @unique`, `EmployeeSkill @@unique([employeeId, skillId])`, `Certificate`/`Resume @@unique([employeeId, contentHash])`, `UpskillingPlan @@unique([employeeId])`, `IdentityMapping.syntheticHandle @unique`, `Skill.name @unique`.

**Claude wrapper (Page 02 §2.1):** `callClaude<T>(input)` where `input = { promptName, variables, schema, complexity, cacheableContext }`; `model = route(complexity)`; `messages = renderPrompt(promptName, variables)`; `system = withCacheControl(systemPrompt, cacheableContext)`; `raw = extractStructuredBlock(response)`; `result = schema.safeParse(raw)`; `log({ requestId, promptName, model, cacheRead, ok })`; on fail `return Failure(promptName, requestId)`, else `return Ok(result.data)`.
**Model routing (§2.2):** `route("routine") → Sonnet id`; `route("hard") → Opus id` — only `match-staffing` is `hard`. Model ids from config/env.
**Prompt templates (§2.4):** `parse-certificate`, `parse-resume`, `match-staffing`, `catalog-dedupe`, `catalog-enrich`, `recommend-items`, `summarize-progress`, `skill-identity`.
**Zod schemas (§2.5):** `CertParseResult`, `ResumeParseResult`, `MatchResult`, `DedupeDecision`, `CatalogEnrichment`, `Recommendations`, `ProgressSummary`, `SkillIdentityDecision`.
**Repository (Page 03 §3.2/§3.4):** `resolveCanonicalSkill(rawSkillName)`, `upsertAndPromoteSkill(profileId, skillNameOrId, targetState, source, origin)`, `order(trustState)`, `markReconcilePending(key)`, `deterministicCanonicalKey(raw)`.

> **MISSING_IN_ARCH (documented, not P0 for this story):** `reconcilePending` is described behaviorally (Page 03 §3.4) but no column is named in the §2 ERD. P2 — the demo-acceptable interpretation is an in-memory/log flag for SKILL-1 (no write path needs it yet; reconcile pass is a later story). Flagged in OPEN-ITEMS; not blocking because no SKILL-1 AC requires persisting it.

---

## Wiring Trace (every new field/identifier → consumer)

| New identifier | Defined in | Consumer (file/contract) |
|---|---|---|
| `EmployeeSkill.trustState/origin/promotedAt` | `prisma/schema.prisma` | `lib/repos/skill.ts:upsertAndPromoteSkill`; `prisma/seed.ts`; foundation schema-invariant test |
| `Skill.canonicalKey @unique` | `prisma/schema.prisma` | `lib/repos/skill.ts:resolveCanonicalSkill`; `lib/ai/canonical-key.ts` |
| `Certificate/Resume.contentHash @@unique` | `prisma/schema.prisma` | (SKILL-2/5 upload path) — SKILL-1 only declares + seeds; foundation idempotency-substrate assertion |
| `CatalogItem.aiEnabled` | `prisma/schema.prisma` | `prisma/seed.ts` (sets some true); failure-condition test (not all false) |
| `tagsJson` (renamed from `tags`) | `prisma/schema.prisma` | `prisma/seed.ts`; (catalog service SKILL-4) — delta sweep below |
| `IdentityMapping.syntheticHandle` | `prisma/schema.prisma` | `prisma/seed.ts`; `lib/dev/guardrails.ts:loadSeedProfiles` (AC-13 handle prefix) |
| `loadSeedProfiles()` no-name projection | `lib/dev/guardrails.ts` | `data-guardrails.test.ts` (R2-03 — returned objects expose `handle`/`email` only; the `Employee.name` column is projected away so NO name-like key appears, even though the DB row retains `name`) |
| `callClaude<T>` / injectable client | `lib/ai/claude.ts` | `lib/repos/skill.ts` (skill-identity Layer 2); SKILL-2..6 services; wrapper-gate test injects `createMessage` double |
| `route(complexity)` | `lib/ai/route.ts` | `lib/ai/claude.ts`; routing-failure-condition test |
| `order(trustState)` | `lib/repos/skill.ts` | `upsertAndPromoteSkill`; promotion-monotonicity test |
| `GOOGLE_CLIENT_ID/SECRET`, `AUTH_SECRET` | `.env.example` | `lib/dev/guardrails.ts:secretEnvVarNames` (AC-13 test expects a GOOGLE…CLIENT…(ID|SECRET) name) |
| trust-state value map (UPPER↔hyphen) | `lib/repos/skill.ts` (or `lib/domain/trust-state.ts`) | Stage-7 ported tests assert hyphen values; TACTICAL-ADR-01 |

**Identifier delta sweep (rename `tags` → `tagsJson`):** `grep -rn "\.tags" / "tags:"` across repo — only occurrences are in the starter schema (`prisma/schema.prisma:69`) and none in app/lib code (catalog service not built). No test references `tags` yet. Safe additive/rename; recorded as MODIFY on the schema only. If keeping the starter `tags` name is preferred to avoid a Page-03 mismatch, the alternative is to ADD `tagsJson` and leave `tags` — but Page 03 §2 names the field `tagsJson`, so we rename (single producer/consumer = the seed).

---

## AC / BR Mechanism Map

| AC / BR | Literal mechanism (from spec) | Phase implementing |
|---|---|---|
| AC-13 | "review" — synthetic data, no real PII, secrets from env, placeholders only in `.env.example`; executable as `loadSeedProfiles`/`scanRepoForHardcodedSecrets`/`secretEnvVarNames`. `loadSeedProfiles()` returns the no-name projection (`handle`/`email` only, no name-like key — R2-03) | P1 (seed + `.env.example`), P3 (`lib/dev/guardrails.ts` + no-PII test) |
| AC-16 (data half) | baseline `origin=BASELINE` skills + `currentProject`/`allocation`/`freeFrom` on every seeded profile; matcher dataset builder can serialize | P1 (seed), P3 (baseline-skills test) |
| BR-09 / P2 | every model output → `schema.safeParse` before any write; typed `Failure` on fail; no regex/keyword substitute; awkward call stubbed `TODO`→`Failure` | P2 (wrapper), P3 (wrapper-gate test) |
| BR-10 | synthetic only; secrets from env, never committed | P1, P3 |
| BR-12 | Sonnet default / Opus for `match-staffing`; cache system prompt + dataset; model ids from config | P2 (`route`, `withCacheControl`) |
| BR-16 | `origin=BASELINE` distinct from `ACQUIRED`; seeded with allocation + freeFrom | P1 |
| BR-18 / TS-001 | `Skill.canonicalKey @unique` + `EmployeeSkill @@unique([employeeId,skillId])`; resolve canonical id before upsert | P1 (schema), P2 (`resolveCanonicalSkill`/`upsertAndPromoteSkill`), P3 (schema-invariant test) |
| BR-19 / TS-004 | DB-enforced `@@unique([employeeId, contentHash])` on Certificate + Resume | P1 (schema) |
| TS-002 | Claude de-dupe failure → deterministic `canonicalKey` create-new + `reconcilePending`; write never blocks | P2 (`resolveCanonicalSkill` fallback) |

---

## Phase 0 — Baseline (RED)

**GOAL:** establish the failing baseline before any code, matching the test infra.
- Confirm `pnpm test` currently runs Vitest and finds **0 test files** (no `tests/` dir) — i.e. exit-0-no-tests, the honest pre-state. Record output.
- Confirm `pnpm seed` exits non-zero (stub). Confirm **no TS executor is installed** (`tsx`/`ts-node`/`@swc-node` absent from `node_modules/.bin/` and lockfile) — the pre-state that makes `tsx` a required add (F-01). Confirm `pnpm db:push` against the starter schema succeeds (6 models) as the pre-extension baseline.
- Confirm `pnpm typecheck` + `pnpm lint` are clean on the untouched tree.
**FORMAT:** captured command output in the implementation log.
**FAILURE CONDITIONS:** if Vitest is mis-wired or `db:push` fails on the starter schema, fix the harness before Phase 1.

---

## Phase 1 — Schema extension, synthetic seed, fixtures, doc + env reconcile (SUB-TASK-1)

**GOAL:** deliver the Page 03 schema (extend, not replace), a deterministic ~20–25-profile synthetic seed + catalog + identity mappings, synthetic fixtures, the `.env.example` secret placeholders, and the CLAUDE.md drift fix.
**CONSTRAINTS:** ADR-002 (extend; preserve all starter `@@unique` keys + self-relation); ADR-005/BR-10/AC-13 (synthetic only, secrets as placeholders); Page 03 §6.1 constraints; ADR-006 (SQLite string-enums, document value sets in comments); fixed RNG seed for determinism (cache reuse + reproducible tests); seeded skill names routed through `resolveCanonicalSkill` (depends on Phase 2 repo — sequence the seed's skill-write after the repo path exists, OR have the seed call a Phase-2 export; see Sequencing note).
**FORMAT:** Prisma DSL additions; `prisma/seed.ts` (TS, ESM, named export `main()`, self-invoking when run directly); fixtures under `fixtures/certs/` + `fixtures/resumes/`. **Seed execution (F-01):** the seed runs via the Prisma v7 native runner — add `tsx` as a devDependency and set `migrations.seed: "tsx prisma/seed.ts"` in `prisma.config.ts`; the `seed` npm script becomes `prisma db push && prisma db seed`. (Prisma's CLI executes `migrations.seed` on `db seed`; see `node_modules/prisma/build/index.js:631,640`.) `tsx` is the chosen executor because the repo has no `bun` and no other TS runner, and it requires no Next.js/SWC integration for a standalone Node script.
**TEST SCENARIOS:** TS-P1-01 (db:push applies, 6 starter models intact + new models/fields), TS-P1-02 (seed produces 20–25 profiles each with ≥1 BASELINE skill + allocation + freeFrom + seniority + timezone), TS-P1-03 (every catalog item has aiEnabled set; ≥1 true), TS-P1-04 (one IdentityMapping per employee, handle-prefixed, no real email), TS-P1-05 (no real-domain email in any seeded Employee).
**FAILURE CONDITIONS:** starter `@@unique` dropped; a real-domain email/PII appears; all `aiEnabled` false; seed below ~20 profiles; non-deterministic seed across runs.

> **Sequencing note:** `resolveCanonicalSkill` lives in Phase 2. To keep Phase 1 seed honest (route skill names through canonical resolution), implement Phase 2's `lib/ai/canonical-key.ts` + `lib/repos/skill.ts` resolution BEFORE the seed's skill-write step, or land Phase 2 first then the seed. Plan order: P1 schema → P2 repo/wrapper → P1 seed/fixtures → P3 tests. (Phases are logical, not strictly serial.)

---

## Phase 2 — Claude call boundary, prompts/schemas scaffold, repository path (SUB-TASK-2)

**GOAL:** the single enforceable Claude boundary (`callClaude<T>` with Zod-before-write, routing, caching, logging, injectable client), the 8 prompt-template + 8 Zod-schema scaffolds, and the canonical-skill + upsert-promote repository path.
**CONSTRAINTS:** ADR-003/BR-09/P2 (exactly one boundary; `safeParse` before any use; typed `Failure`, never persist on fail; awkward call stubbed `TODO`→`Failure`; no regex/keyword substitute); BR-12 (Sonnet default / Opus only for `match-staffing`; cache system prompt + dataset; model ids from config/env); ADR-007/BR-18/TS-001/TS-002 (all skill writes via `upsertAndPromoteSkill`; two-layer `resolveCanonicalSkill`; Claude de-dupe failure NEVER blocks the write — deterministic key create-new + `reconcilePending` fallback); observability (log requestId/model/cache/validation; no PII). **Injectable client:** the wrapper accepts a client of shape `{ createMessage(args) → { content:[{type:"text",text}] } }` (test-helpers contract) so tests inject doubles; default client wraps `@anthropic-ai/sdk` `messages.create`. No data-layer read-then-write: canonical create-new is idempotent under races via `@unique` (Page 03 §3.4) — catch the unique-constraint violation and re-read the winner (no pre-read lock).
**FORMAT:** `lib/ai/claude.ts`, `lib/ai/route.ts`, `lib/ai/canonical-key.ts`; `src/prompts/*.ts` (8) + `src/prompts/system.ts`; `src/schemas/*.ts` (8) + `src/schemas/index.ts`; `lib/repos/db.ts` (Prisma client singleton from `lib/generated/prisma`, constructed with explicit `datasourceUrl: process.env.DATABASE_URL` — F-02, since the schema datasource has no `url`/`env()`), `lib/repos/skill.ts` (`resolveCanonicalSkill`, `upsertAndPromoteSkill`, `order`, `markReconcilePending`).
**TEST SCENARIOS:** TS-P2-01 (valid payload → `Ok(typed)`), TS-P2-02 (garbled JSON → `Failure`, nothing persisted), TS-P2-03 (SDK throws → mapped to `Failure`, no raw text), TS-P2-04 (sub-threshold confidence → `Failure`), TS-P2-05 (`route("hard")`→Opus id, `route("routine")`→Sonnet id; no hardcoded id in business logic), TS-P2-06 (`resolveCanonicalSkill("TypeScript")` & `("TS")` collapse to one id when alias seeded), TS-P2-07 (`upsertAndPromoteSkill` promotes in place, never demotes, never a second row), TS-P2-08 (skill-identity failure → create-new + reconcilePending, write completes).
**FAILURE CONDITIONS:** wrapper returns data that did not pass `safeParse`; `match-staffing` routed to Sonnet or a hardcoded model id in logic; lower targetState demotes a row; aliases return different ids; skill-identity failure throws/hangs instead of falling back.

---

## Phase 3 — Vitest harness, single-file command, foundation tests + no-PII gate (SUB-TASK-3)

**GOAL:** a runnable Vitest harness with a single-file command, the `lib/dev/guardrails.ts` no-PII module, and the four foundation GREEN-gate tests.
**CONSTRAINTS:** CLAUDE.md single-file test command for SKILL-2's cert tests; ADR-005/AC-13 no-PII gate over seed + fixtures fails build on any real-looking PII; BR-09/P2 wrapper test proves bad output rejected before any write; tests use synthetic seed only, never a live Anthropic call (inject SDK double); detect a live `ANTHROPIC_API_KEY` use in unit tests and fail loudly.

**Disposable test-DB isolation — exact mechanism (F-02, corrected).** Two distinct URL-resolution paths exist and must not be conflated:

- **Prisma CLI path** (`db push`, `db seed`, `studio`): reads `datasource.url` from `prisma.config.ts:11-13`, which is `process.env["DATABASE_URL"]`. So spawning the CLI with `DATABASE_URL` set in its `env` is sufficient for CLI-side operations.
- **Runtime client path** (the generated `PrismaClient` in `lib/generated/prisma`, imported by `lib/repos/db.ts` and used by every test): the **`prisma/schema.prisma` datasource block declares `provider = "sqlite"` with NO `url` and NO `env()`** (`prisma/schema.prisma:9-11`). `prisma.config.ts` does **not** feed the runtime client — it is CLI-only. Therefore the in-test runtime client will **NOT** pick up the `globalSetup` `DATABASE_URL` override automatically. The runtime `PrismaClient` **MUST be constructed with an explicit datasource URL read from the env**: `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` (Prisma v7 client-constructor override; `datasourceUrl` overrides the schema datasource at instantiation). This is the only thing that binds the runtime client to the disposable test DB.

Because the URL is fixed at the moment `lib/repos/db.ts` constructs its singleton, the `DATABASE_URL` override MUST be in place before any test module imports `lib/repos/db.ts`. Pin the override as a **Vitest `globalSetup`** (`tests/setup/global-db.ts`, runs in a separate context strictly before any test file is loaded):
  1. Compute a unique per-run path, e.g. `file:./.tmp/test-${process.pid}-${Date.now()}.db`, under a git-ignored `.tmp/` dir.
  2. **Set `process.env.DATABASE_URL` to that path** (overriding the `.env` value) and export it so worker processes inherit it.
  3. Run `prisma db push --skip-generate` and the seed against that URL (spawn with the same `DATABASE_URL` in `env`; the CLI resolves it via `prisma.config.ts`), so the disposable file is schema-applied + seeded once.
  4. In `globalSetup`'s returned teardown, delete the `.tmp/test-*.db` file(s).

  `lib/repos/db.ts` constructs its singleton as `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` so the runtime client reads whatever `globalSetup` set (the temp file in tests; `dev.db` from `.env` in dev). The per-test setup file (`tests/setup/db.ts`, referenced by `setupFiles`) only imports the client (now bound to the temp URL via that explicit `datasourceUrl`) and provides reset/transaction helpers — it never re-points the URL. A guard asserts `process.env.DATABASE_URL` is set, does **not** equal `file:./dev.db`, and does not end in `/dev.db` before any test runs, failing loudly if the override did not take — this is what stops TS-P3-06's re-seed from false-greening against `dev.db`. Add `.tmp/` to `.gitignore`.

**FORMAT:** `vitest.config.ts` (node env, `globalSetup: ['tests/setup/global-db.ts']`, `setupFiles: ['tests/setup/db.ts']`, include `tests/**/*.test.ts`); `tests/setup/global-db.ts` (per-run temp `DATABASE_URL` + push + seed + teardown delete); `tests/setup/db.ts` (client import + reset helpers + `dev.db` guard — asserts the override took before any test); `lib/repos/db.ts` constructs the singleton as `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` so the runtime client honors the override (F-02); `package.json` single-file convention (`pnpm test <file>` already works via `vitest run <file>` — document it); `.gitignore` `.tmp/` entry; `lib/dev/guardrails.ts`; `tests/foundation/*.test.ts` (4 files).
**TEST SCENARIOS (6):** TS-P3-01 schema-invariant (one canonical id for TypeScript/TS; no second EmployeeSkill row), TS-P3-02 no-PII (no real-domain emails in seed; fixture filenames clean; `.env.example` placeholders only; `secretEnvVarNames` includes ANTHROPIC + a GOOGLE…CLIENT…(ID|SECRET)), TS-P3-03 wrapper-gate (invalid → Failure + no write; valid → Ok), TS-P3-04 baseline-skills (every profile ≥1 BASELINE skill + freeFrom + allocation), TS-P3-05 single-file command runs one test in isolation, TS-P3-06 isolation guard (Claude client is an injected double — fail loudly on live `ANTHROPIC_API_KEY`; DB is the per-run disposable file from `global-db.ts`, never `dev.db`; the `dev.db` guard in `db.ts` asserts the override took before any re-seed — F-02).
**FAILURE CONDITIONS:** single-file command can't isolate a test; no-PII test green while a real-domain email exists; wrapper test green on invalid JSON; schema-invariant green with two rows; tests pass against a stale/shared DB.

---

## LOC Envelope

| Phase | Files | Est. LOC |
|---|---|---|
| P1 schema + seed + fixtures (text) + .env + CLAUDE.md | schema (~90 added), seed (~180), fixtures (synthetic text PDFs/PNGs ~minimal), .env (~5), CLAUDE.md (~10) | ~285 |
| P2 wrapper + route + canonical-key + 8 prompts + 8 schemas + repo (db + skill) | claude (~90), route (~25), canonical-key (~20), prompts (~120 total stubs), schemas (~120), db (~15), skill (~110) | ~500 → trimmed: prompt/schema stubs are thin (~10–15 LOC each) |
| P3 vitest.config + guardrails + 4 tests + db setup (per-test + globalSetup) | config (~20), guardrails (~70), tests (~180), db setup `tests/setup/db.ts` (~30) + `tests/setup/global-db.ts` (~45, F-02) | ~345 |
| **Total** | | **~700–900** |

**Budget:** story estimate ~700 LOC (L). Estimate lands at the upper edge; the 16 prompt/schema scaffold files are deliberately thin stubs (named exports returning message arrays / Zod shapes), keeping real logic concentrated in the wrapper + repo. **Within L budget; no split required.** If P2 trends over, the prompt/schema scaffolds can be split to a follow-up but are cheap as stubs.

---

## Release Strategy

- **Feature flag:** **none.** Per `release-strategy.md` default, a flag defaults `false` when upstreams are not deployed — but SKILL-1 is the critical-path root with **no upstream** and ships **no user-facing feature** (data/infra only, no routes/UI). There is nothing to gate behind a flag; the substrate is either present (schema applies, seed runs, tests green) or the build fails. Single local/demo environment (Page 04 §6). No canary/blue-green (out of scope).
- **Rollback:** disposable SQLite DB — `db:push` re-applies; re-seed restores state.

---

## Pipeline Impact

- **No** changes to `.github/workflows/*.yml`, Helm, or K8s (none exist; local-only run).
- Adds `vitest.config.ts` and a `tests/` tree; documents the single-file test command. No CI gate is disabled or bypassed.
- `pnpm typecheck` + `pnpm lint` remain the pre-commit gates (CLAUDE.md) and must stay clean.

---

## Testing Strategy (≥80% of substrate behaviors)

Foundation tests target the substrate invariants (not the 27-AC feature suite, which lands per feature in SKILL-2..6):
- **Schema invariant (BR-18/Scenario D):** canonical collapse + single-record promotion.
- **No-PII (AC-13/S-14):** seed + fixtures + env-secrets scan (review AC made executable).
- **Wrapper gate (BR-09/P2/Scenario C):** validate-before-write with injected doubles (valid/garbled/throwing).
- **Baseline data (AC-16/S-17):** every profile carries BASELINE skills + availability.
- **Promotion monotonicity & routing** covered in P2 scenarios.

No RBAC×flag×resource matrix applies (no roles enforced, no flags in this story). The Stage-7 test-creator additionally ports the authored e2e stubs into `tests/acceptance/`; SKILL-1 only needs them to *resolve their foundation imports* (`@/lib/profile/upsert-skill`, `@/lib/dev/guardrails`, the injectable Claude client) — those modules are delivered here so the ported stubs stop throwing `NOT_IMPLEMENTED` at the foundation boundary (feature bodies still RED until their stories).

---

## File Checklist

> Cross-PR overlap: `gh pr list` → "no git remotes"; all downstream Jiras not started (dependency-report). **Overlap risk: NONE** for every file.

### Create
| File | Purpose | Diff budget |
|---|---|---|
| `prisma/seed.ts` | deterministic synthetic seed | ~180 |
| `lib/repos/db.ts` | Prisma client singleton from `lib/generated/prisma`, constructed `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` — explicit override is REQUIRED because the schema datasource has no `url`/`env()` and `prisma.config.ts` is CLI-only (F-02) | ~15 |
| `lib/repos/skill.ts` | `resolveCanonicalSkill`, `upsertAndPromoteSkill`, `order`, `markReconcilePending` | ~110 |
| `lib/ai/claude.ts` | `callClaude<T>` boundary (injectable client, Zod gate, log) | ~90 |
| `lib/ai/route.ts` | `route(complexity)` model routing from config/env | ~25 |
| `lib/ai/canonical-key.ts` | `deterministicCanonicalKey` normalizer | ~20 |
| `lib/dev/guardrails.ts` | no-PII scan: `loadSeedProfiles`/`scanRepoForHardcodedSecrets`/`secretEnvVarNames`. **`loadSeedProfiles()` MUST project away `name`** — return only the no-PII-safe projection exposing `handle` + `email` (and other non-name fields), never any name-like key, even though the `Employee` row keeps its `name` column (R2-03; `data-guardrails.test.ts` asserts no name-like key is present) | ~70 |
| `lib/domain/trust-state.ts` | UPPER↔hyphen value map + `order()` source of truth (TACTICAL-ADR-01) | ~30 |
| `src/prompts/system.ts` | shared cacheable system prompt | ~20 |
| `src/prompts/{parse-certificate,parse-resume,match-staffing,catalog-dedupe,catalog-enrich,recommend-items,summarize-progress,skill-identity}.ts` | 8 named templates | ~15 each |
| `src/schemas/{CertParseResult,ResumeParseResult,MatchResult,DedupeDecision,CatalogEnrichment,Recommendations,ProgressSummary,SkillIdentityDecision}.ts` + `index.ts` | 8 Zod schemas + barrel | ~12 each |
| `vitest.config.ts` | node env, `globalSetup` + `setupFiles`, include tests | ~20 |
| `tests/setup/global-db.ts` | F-02 per-run disposable DB: override `DATABASE_URL`→temp file, `db push`+seed, teardown delete | ~45 |
| `tests/setup/db.ts` | per-test client import + reset helpers + `dev.db` guard (asserts override took) | ~30 |
| `tests/foundation/schema-invariant.test.ts` | BR-18 canonical + single-record | ~45 |
| `tests/foundation/no-pii.test.ts` | AC-13 gate | ~50 |
| `tests/foundation/wrapper-gate.test.ts` | BR-09 validate-before-write | ~45 |
| `tests/foundation/baseline-skills.test.ts` | AC-16 data half | ~40 |
| `fixtures/certs/aws-saa-valid.pdf` | synthetic happy cert | n/a |
| `fixtures/certs/multi-skill-bootcamp.pdf` | synthetic multi-skill cert | n/a |
| `fixtures/certs/not-a-cert.png` | synthetic non-cert | n/a |
| `fixtures/resumes/synthetic-engineer.pdf` | synthetic happy resume | n/a |
| `fixtures/resumes/garbled.png` | synthetic edge resume (matches test-helpers `RESUME_FIXTURES.unreadable`) | n/a |

### Modify
| File | Change | Diff budget |
|---|---|---|
| `prisma/schema.prisma` | EXTEND: add fields/models per Page 03; rename `tags`→`tagsJson`; preserve all `@@unique` + self-relation | ~90 |
| `package.json` | **add `tsx` devDependency (F-01)**; replace `seed` stub with `prisma db push && prisma db seed`; document single-file test command | ~4 |
| `.env.example` | add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` placeholders | ~4 |
| `CLAUDE.md` | TD-DOC-01: reconcile "Current state" (deps installed; test/seed scripts exist; prisma/ + src/ being added; note `tsx` added for the seed) | ~10 |
| `prisma.config.ts` | **add `migrations.seed: "tsx prisma/seed.ts"` (F-01)** so `prisma db seed` runs the TS seed via the Prisma v7 runner | ~2 |
| `.gitignore` | add `.tmp/` (per-run disposable test DB dir, F-02) | ~1 |

---

## Validation (internal checks)

- **Domain/data flow:** matches Page 03 ERD; one bounded context; EXTEND honored; all `@@unique` preserved. ✓
- **Structural integrity:** wrapper depends on an *injected* client interface (DIP — not the SDK singleton); repo functions are single-responsibility; no class with excessive constructor deps (functional modules). ✓
- **Data & concurrency:** canonical create-new is atomic via `@unique` + catch-violation-and-reread (no read-then-write lock); no hard deletes introduced (seed only inserts; disposable DB). ✓
- **Performance:** seed is a single batched generation pass (no per-iteration external calls — skill-identity Claude calls are avoided in seed via deterministic key fallback); cache breakpoint marks system prompt + dataset (BR-12). ✓
- **Business rules:** every BR (09,10,12,16,18,19) mapped to a code path in the AC/BR Mechanism Map. ✓
- **Security:** secrets from env only; `.env.example` placeholders; no-PII gate; no secret literal in source. ✓
- **Frontend/UX:** none (data/infra story; UX "Awaiting designs" — SKILL-6). ✓

### Gaps
- **P2 (document):** `reconcilePending` has no named column in the arch ERD (MISSING_IN_ARCH). SKILL-1 implements it as a log/in-memory flag returned by the repo; persisting it is deferred to the reconcile-pass story. Non-blocking — no SKILL-1 AC requires persistence.
- **P2 (document):** identifier/value-set bridge between authored hyphen-case test stubs and uppercase string-enums → TACTICAL-ADR-01 (resolved by a value map).
- **No P0/P1 gaps.** All Scenario A–D ACs have phases + tests; Phase 0 baseline defined; coverage of substrate invariants complete.

---

## Standards Compliance

- **tech-stack:** Prisma+SQLite, Anthropic SDK, Zod, Vitest, Next.js 16 — all per ADRs 002/003/006; no new tech introduced.
- **architecture-patterns:** single Claude boundary (P1/ADR-003), single skill write path (ADR-007), extend-not-replace (ADR-002).
- **security/privacy:** no-PII by design (ADR-005), env secrets (AC-13).
- **testing:** Vitest harness + single-file command; substrate invariants covered; disposable DB.
- **ci-cd:** no gate disabled; typecheck+lint pre-commit preserved.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQLite string-enums lose DB ordering | High (by design) | Med | `order()` helper in `lib/domain/trust-state.ts`; covered by promotion test |
| Claude skill-identity failure blocks canonical write | Low | High | TS-002 deterministic-key create-new + reconcilePending; seed avoids the call entirely |
| Authored test stubs assume hyphen values / `@/lib/...` module names | High | Med | TACTICAL-ADR-01 value map + deliver the consumer module surface the stubs import |
| Seed RNG collision on unique email/handle | Low | Low | detect + re-roll (SUB-TASK-1 Error Handling 2) |
| Synthetic PDF/PNG fixtures hard to author as real binaries | Med | Low | minimal synthetic placeholder files; parse logic stubbed (SKILL-2 owns real parse); no-PII gate checks filenames/metadata |
| CLAUDE.md drift misleads later agents | resolved | — | TD-DOC-01 reconcile in P1 |
