# SKILL-1 — Foundation: synthetic data, trust-state persistence & the Claude intelligence boundary

## Metadata

| Field | Value |
|---|---|
| **Story ID** | SKILL-1 |
| **Epic** | EPIC-1 — Foundation & The Hero Loop |
| **Roadmap Phase** | Phase 1 (Foundation) |
| **Story Points** | 8 |
| **T-shirt** | L |
| **Estimated LOC** | ~700 |
| **Impact** | HIGH (new infrastructure; data model; security/PII guardrail) |
| **Priority** | Highest |
| **Component** | Data layer (Prisma/SQLite), Claude integration layer, seed + fixtures, test harness |
| **Target Repository** | ai-nu-skillsync |
| **Gaps Closed** | TD-SEED-01, TD-SEED-02, TD-DATA-01, TD-DATA-02, TD-DATA-03, TD-DATA-04, TD-DATA-05, TD-AI-01, TD-AI-02, TD-TEST-01, TD-GUARD-01, TD-DOC-01 |
| **Owner** | mouni.nagarajan@nulogic.io |
| **Started At** | 2026-06-06T00:00:00Z |
| **Status** | In Progress (Stage 11 — PR Assembly) · Docs Synced |

## User Story

**As a** Practitioner (employee) and a Manager/HR on the SkillSync platform,
**I want** my skills, availability, and learning catalog to live in one trustworthy shared profile store, with all "intelligence" routed through a single safe boundary,
**so that** every later capability — certificate parsing, staffing search, and the hero loop — stands on synthetic, PII-free data that never gets corrupted by an unreliable model output.

> Business persona: Employee / Manager-HR (no engineering persona). This story is the substrate every business journey depends on; its value is realized through the journeys built on top of it (SKILL-2 onward).

## Business Context

**Problem.** SkillSync is a fresh Next.js scaffold: the seed script is a `TODO` that exits non-zero, there are no fixtures, the starter Prisma schema trails the PRD (a flat `source` string instead of a trust-state machine, no resume/plan/identity models, no idempotency keys), and the installed Claude SDK and Zod have zero call sites. Nothing can be demoed until this substrate exists.

**Value.** A correct data model and a single validated Claude boundary are what make the hero loop *possible and safe*: one canonical skill record that only promotes (so the loop's before/after compares the same row), validate-before-write (so a bad model output never corrupts the profile), and synthetic-only seed data (so the non-negotiable no-PII rule holds). Getting this right de-risks everything downstream.

## Business Rules

| BR | Description |
|---|---|
| BR-09 | All intelligence goes through the Claude API; outputs validated (Zod) before any use/write. No hardcoded/keyword/regex substitutes; awkward calls stubbed with a `TODO` that returns failure. |
| BR-10 | Synthetic data only; never real names/emails/PII; `ANTHROPIC_API_KEY` (and OAuth secrets) read from env, never committed. |
| BR-12 | Token-efficient Claude usage — Sonnet default / Opus for hard ranking; prompt-cache the system prompt + profile dataset. |
| BR-16 | Baseline/current skills (`origin=BASELINE`) distinguished from upskilling-acquired skills; seeded on every profile with allocation + freeFrom. |
| BR-18 | One canonical skill record per profile; trust state promotes in place (`self-reported → manager-approved → verified`), never duplicates — enforced by `Skill.canonicalKey @unique` + `EmployeeSkill @@unique([employeeId, skillId])`. |
| BR-19 | Idempotent uploads — DB-enforced `@@unique([employeeId, contentHash])` on Certificate and Resume. |

## AC Mapping

| AC | Description |
|---|---|
| AC-13 | Synthetic-data / no-PII guardrail; secrets from env, never hardcoded or committed (review). |
| AC-16 | Baseline current skills present on every seeded profile (origin distinct from verified), with current project + allocation/availability; matcher can reason over them. (Data-present half; UI/self-service half in SKILL-5.) |

## Technical Architecture

- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript; Prisma + SQLite (`dev.db`, `db:push`); `@anthropic-ai/sdk`; Zod; Vitest. Generated client at `lib/generated/prisma` (starter generator output). pnpm.
- **Data layer:** Extend the starter `prisma/schema.prisma` (do NOT replace — Artifact Preservation / ADR-002). Add trust-state fields to `EmployeeSkill`, `Skill.canonicalKey @unique`, catalog flags, new `Resume`/`UpskillingPlan`/`PlanItem`/`IdentityMapping` models, `Certificate.contentHash`, Employee `seniority`/`timezone`. SQLite has no enums — store role/state/status/source as Strings with documented value sets.
- **Claude integration layer:** one client wrapper (`lib/ai/claude.ts`-style) doing model routing → prompt-cache assembly → SDK call → JSON extract → `schema.safeParse` → log; `src/prompts/` named templates (scaffolded, returning message arrays); `src/schemas/` Zod schemas. A `safeParse` failure or sub-threshold confidence returns a typed `Failure`, never throws raw model text into a write.
- **Seed + fixtures:** `prisma/seed.ts` generates ~20–25 synthetic profiles (baseline skills, allocation, freeFrom, seniority, timezone), a starter catalog with `aiEnabled` set, and seeded `IdentityMapping` entries; `fixtures/certs/` and `fixtures/resumes/` (synthetic, spanning happy + edge).
- **Test harness:** `vitest.config.ts` + single-file test command; a no-PII review gate.
- **NFRs:** validate-before-write (Reliability); no PII anywhere (Security/Privacy); secrets from env (Security); deterministic seed ordering for cache reuse (Cost efficiency); call-boundary logging of requestId + validation outcome (Observability).

## Architecture References

- **Data model (Page 03):** `Employee` (+ `seniority`, `timezone`, identity relation), `Skill` (+ `canonicalKey @unique`, TS-001), `EmployeeSkill` (+ `trustState`, `origin`, `promotedAt`; `@@unique([employeeId, skillId])`), `CatalogItem` (+ `aiEnabled`, `endorsed`, `enrichmentPending`, enrichment fields), `UpskillingPlan` + `PlanItem`, `Certificate` (+ `contentHash`, `@@unique([employeeId, contentHash])`), `Resume` (new, same idempotency key), `IdentityMapping` (`syntheticHandle @unique`). Indexing table Page 03 §6.1.
- **Skill trust-state machine (Page 03 §3):** ordering `SELF_REPORTED(1) < MANAGER_APPROVED(2) < VERIFIED(3)`; `upsertAndPromoteSkill(...)` (§3.2); two-layer `resolveCanonicalSkill(...)` (§3.4, deterministic key + Claude merge advisor + reconcile-pending fallback, TS-002).
- **Service design (Page 02):** Claude wrapper contract `callClaude<T>` (§2.1); model routing table (§2.2); prompt caching (§2.3); prompt template list (§2.4); Zod schema shapes (§2.5); observability (§2.6).
- **ADRs (Page 05):** ADR-002 (Prisma+SQLite, extend starter), ADR-003 (Claude call patterns: one wrapper, Zod-before-write, routing, caching), ADR-005 (synthetic-data strategy + synthetic-handle identity), ADR-006 (single Next.js 16 app; `proxy.ts`; async `cookies()`/`headers()`/`params`), ADR-007 (single promotable skill record).
- **Roadmap:** Phase 1 deliverables + exit criteria (Page 04 §2).

## Acceptance Criteria (Gherkin)

### Scenario A — Synthetic seed runs clean with zero PII (AC-13, S-14)
```gherkin
GIVEN a fresh checkout of ai-nu-skillsync with the extended Prisma schema applied via db:push
WHEN the seed script runs
THEN ~20-25 synthetic Employee profiles are created with synthetic names/emails only, each carrying baseline skills (origin=BASELINE), allocation, freeFrom, seniority and timezone
AND a starter catalog is created with the aiEnabled boolean set per item
AND seeded IdentityMapping rows exist keyed by synthetic handles (never real email/PII)
AND a review of repo, DB, and fixtures finds no real names, emails, or PII
AND ANTHROPIC_API_KEY and OAuth secrets are read from the environment and appear only as placeholders in .env.example.
```

### Scenario B — Baseline skills present and matcher-readable (AC-16, S-17)
```gherkin
GIVEN a seeded synthetic employee profile
WHEN the profile is inspected via the repository / matcher dataset builder
THEN it carries baseline/current skills (origin=BASELINE) distinct from any cert-verified (origin=ACQUIRED) skills
AND it carries a current project, allocation, and freeFrom
AND the dataset builder can serialize these skills + availability for the matcher.
```

### Scenario C — The Claude boundary validates before any write (AC-13 / BR-09 / P2)
```gherkin
GIVEN the Claude client wrapper and a per-call Zod schema
WHEN a (stubbed or real) model response is passed through the wrapper
THEN the response is run through schema.safeParse
AND on success a typed object is returned to the caller
AND on safeParse failure (or sub-threshold confidence) a typed Failure is returned and nothing is persisted
AND the call logs requestId + promptName + model + validation outcome (no PII in logs).
```

### Scenario D — Single-record invariant is enforceable at the data layer (BR-18 / TS-001)
```gherkin
GIVEN the extended schema with Skill.canonicalKey @unique and EmployeeSkill @@unique([employeeId, skillId])
WHEN two aliases of the same concept ("TypeScript" and "TS") are resolved through resolveCanonicalSkill
THEN both collapse to a single canonical Skill.id
AND only one EmployeeSkill row can exist per (employeeId, canonicalSkillId).
```

## Dependencies

- **blocks:** SKILL-2, SKILL-3, SKILL-5, SKILL-6 (all build on this substrate).
- **blocked_by:** none (critical-path root).

## Sub-Tasks

- **SUB-TASK-1** — Extend the Prisma schema + seed + fixtures + no-PII gate (TD-SEED-01/02, TD-DATA-01..05, TD-GUARD-01, TD-DOC-01).
- **SUB-TASK-2** — Build the Claude client wrapper, `src/prompts/` scaffold, `src/schemas/` Zod skeletons, and the upsert+promote / resolveCanonicalSkill repository path (TD-AI-01/02, TD-DATA-01).
- **SUB-TASK-3** — Vitest config + single-file test command + foundation tests (schema invariant, seed no-PII, wrapper validation gate) (TD-TEST-01).

## UX/Design

Status: Awaiting UX designs (UI screens are delivered in SKILL-6). This story is data/infra only — no user-facing surface beyond what the seed exposes to later stories. NULogic branding applies to any generated artifact.

## Definition of Done

- Extended schema applies via `db:push`; matches Page 03; starter `@@unique` keys preserved.
- Seed runs clean producing ~20–25 synthetic profiles + catalog + identity mappings; zero PII (review gate passes).
- `fixtures/certs/` and `fixtures/resumes/` exist with synthetic happy + edge files.
- Claude wrapper returns a typed object on valid output and a typed `Failure` on invalid/low-confidence; never persists on failure; logs the call boundary.
- `resolveCanonicalSkill` + `upsertAndPromoteSkill` exist and enforce single-record promotion.
- Vitest runs; single-file test command works; foundation tests green.
- `CLAUDE.md` doc drift (TD-DOC-01) reconciled. Typecheck + lint clean.

## Risks & Assumptions

- **Risk:** SQLite string-enums lose DB-level ordering enforcement → promotion ordering must be enforced in the repository layer (Page 03 §3.1). **Mitigation:** central `order(state)` helper; covered by tests.
- **Risk:** Claude de-dupe call failure could block the canonical-skill write. **Mitigation:** TS-002 fallback — deterministic `canonicalKey` create-new + `reconcilePending`; the write never blocks (validated in SKILL-2/SKILL-4).
- **Assumption:** Next.js 16 conventions are binding (`proxy.ts`, async `cookies()`/`headers()`/`params`) — read `node_modules/next/dist/docs/` before any Next.js code.
- **Assumption:** the starter generator output path (`lib/generated/prisma`) and `db:push` wiring remain as verified.

## Progress Log

| Timestamp | Actor | Note |
|---|---|---|
| 2026-06-05T00:00:00Z | nulogic-jira-creator | Story created from PRD + target-state architecture (Phase 1). Local-only run. |
| 2026-06-06T00:00:00Z | nulogic-dependency-checker | 05-dependencies | Dependencies cleared. blocked_by=[] (no upstream Jiras). Zero merge conflict risk. All prerequisite packages present. 2 non-blocking advisories (seed stub, prisma/ dir pending). dependency_status=READY. |
| 2026-06-06T00:00:00Z | nulogic-implementation-planner | 06-implementation-planning | Plan created. 4 phases, 18 test scenarios. 41 files planned (36 create / 5 modify). 2 tactical ADRs. No P0/P1 gaps. |
| 2026-06-06T00:00:00Z | nulogic-implementation-planner | 06-implementation-planning | Plan revised (iteration 2). Resolved reviewer findings F-01 (pin `tsx` devDependency + Prisma v7 `migrations.seed` runner — repo had no TS executor), F-02 (per-run disposable test DB via Vitest globalSetup overriding DATABASE_URL before client init + dev.db guard), F-03 (corrected count to 20 test scenarios). 44 files planned (38 create / 6 modify). 3 tactical ADRs (added ADR-03: tsx executor + Prisma v7 seed runner). No P0/P1 gaps. |
| 2026-06-06T00:00:00Z | nulogic-implementation-planner | 06-implementation-planning | Plan revised (iteration 3). Resolved reviewer findings R2-01 (fixed test-scenarios.json header `scenarios` field 18→20 for internal consistency), R2-02 (load-bearing: verified schema datasource has no `url`/`env()` and `prisma.config.ts` is CLI-only, so pinned `lib/repos/db.ts` to construct `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` — runtime client now honors the globalSetup override; documented in plan, db.ts checklist, test-harness section, and corrected F-02 non-deviation note; dev.db guard retained), R2-03 (`loadSeedProfiles()` must project away `name` and return only the no-PII-safe `handle`/`email` projection — specified in plan + TS-P3-02). Deviation re-scan: no new divergence; 3 tactical ADRs unchanged. Counts: 4 phases / 20 scenarios / 44 files (38 create / 6 modify). No P0/P1 gaps. |
