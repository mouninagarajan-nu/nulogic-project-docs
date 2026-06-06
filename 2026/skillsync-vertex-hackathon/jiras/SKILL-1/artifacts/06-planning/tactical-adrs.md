# SKILL-1 — Tactical ADRs

**Jira:** SKILL-1 (Foundation) · **Stage:** 06-implementation-planning · **Mode:** LOCAL-ONLY
**Scope:** tactical, story-level decisions that deviate from / refine the target-state architecture (Pages 02/03/05). Strategic ADRs (ADR-001..007) remain authoritative; these record implementation-level choices the planner made without an AskUserQuestion gate (orchestrator owns confirmation).

**Deviation scan result (iteration 3):** 3 deviations detected — unchanged from iteration 2 (all PASS-2 judgment-based). ADR-01/02 unchanged (backward-compat/integration alignment, T14-adjacent). ADR-03 unchanged (the `tsx` dev-dependency + Prisma seed-runner wiring from iteration 2, T18-adjacent). **Iteration-3 re-scan:** the three reviewer findings resolved this iteration — R2-01 (count field internal consistency), R2-02 (runtime client must use explicit `datasourceUrl: process.env.DATABASE_URL` because the schema datasource has no `url`/`env()` and `prisma.config.ts` is CLI-only), and R2-03 (`loadSeedProfiles()` no-name projection) — introduce **no new architecture divergence**. R2-02 uses the standard Prisma v7 client-constructor override and is captured by the corrected F-02 non-deviation note below (a test-harness/runtime-wiring implementation detail, not an architecture deviation); R2-01 and R2-03 are internal-consistency / output-projection refinements. No new tactical ADR warranted; no PASS-1 standards-scannable violations. `tactical_adrs_created = true`; `tactical_adrs_count = 3`.

---

## TACTICAL-ADR-01 — Persist canonical UPPERCASE trust/source value sets; bridge the authored test stubs' hyphen-case via a domain value map

**Status:** Accepted (tactical)

**Context.**
Two authoritative sources disagree on the *spelling* of the trust-state and source value sets:
- **Target-state Page 03 §2/§3.1 + SUB-TASK-1** persist string-enums in **UPPERCASE**: `trustState ∈ {SELF_REPORTED, MANAGER_APPROVED, VERIFIED}`, `origin ∈ {BASELINE, ACQUIRED}`, `source ∈ {SELF, CERTIFICATE, RESUME, CATALOG}`, `role ∈ {ADMIN, MANAGER, PRACTICE_LEAD, EMPLOYEE}`, ordering `SELF_REPORTED(1) < MANAGER_APPROVED(2) < VERIFIED(3)`.
- **The authored acceptance-test stubs** (`artifacts/02-acceptance-tests/e2e-tests/`, ported into the repo by Stage 7) assert **lowercase-hyphen** values: `state: "self-reported" | "manager-approved" | "verified"`, `source: "certificate"`, `origin: "baseline" | "upskilling-acquired"`, `role: "employee" | "practice-lead" | "manager" | "admin"` (see `setup/test-helpers.ts:42-58`, `profile-skills.test.ts:48,72,98`, `cert-parsing.test.ts:48`).

The DB is the single source of truth (Page 03); the tests assert a domain-facing API. If the repository returned raw DB strings, the ported feature tests (SKILL-2..6) would fail on a cosmetic spelling mismatch, not a real defect.

**Decision.**
Persist the **UPPERCASE** value sets in SQLite exactly as Page 03 specifies (no schema deviation). Introduce a small **domain value-map module** `lib/domain/trust-state.ts` that is the single source of truth for: the ordered trust-state ladder, the `order(state)` helper, and bidirectional maps between the persisted UPPERCASE tokens and the **hyphen-case domain tokens** the product API/tests use (`SELF_REPORTED ↔ self-reported`, `ACQUIRED ↔ upskilling-acquired`, etc.). Repository functions accept and return domain (hyphen-case) tokens at their boundary and translate to/from UPPERCASE at the persistence edge. `origin=ACQUIRED` maps to the test's `upskilling-acquired`.

**Rationale.**
- Keeps the DB aligned to Page 03 (no strategic deviation) while making the authored RED tests turn GREEN against real behavior, not a renamed schema.
- One map module prevents scattered string-literal translation (avoids the exact keyword-soup the BR-09 discipline warns against, here for value tokens).
- `order()` lives with the map, satisfying the "ordering enforced in the repository layer, not the DB" requirement (Page 03 §3.1) in one place — covered by the promotion-monotonicity test.

**Alternatives considered.**
- *Persist hyphen-case directly* (match tests, deviate from Page 03): rejected — contradicts the data-model spec other stories read; the DB is the contract.
- *Rewrite the authored test stubs to UPPERCASE*: rejected — the planner does not own Stage-2 acceptance artifacts; Stage 7 ports them as-authored, and the product should expose the domain vocabulary the ACs use.
- *No map; translate ad hoc in each consumer*: rejected — duplicated literals, drift risk.

**Trade-offs.** Gain: spec-faithful persistence + GREEN tests, one translation seam. Give up: a thin indirection layer (~30 LOC).

**Impact.** New file `lib/domain/trust-state.ts`; `lib/repos/skill.ts` imports it; no schema change. Downstream stories reuse the same map.

**Evidence.** Page 03 §2 (ERD value annotations), §3.1 (ordering); `test-helpers.ts:42-58`; `profile-skills.test.ts`; `cert-parsing.test.ts`; STORY.md value-set table (SUB-TASK-1 Data Models).

---

## TACTICAL-ADR-02 — Honor `src/prompts/` + `src/schemas/` (resolved via the repo-root `@/*` alias); keep AI wrapper/repo under `lib/`

**Status:** Accepted (tactical)

**Context.**
SUB-TASK-2 and Page 02 §2.4/2.5 and CLAUDE.md all name the prompt/schema directories `src/prompts/` and `src/schemas/`. CLAUDE.md "Conventions" also says "App Router lives at the top-level `app/`; there is no `src/`" and "`@/*` maps to the **repo root** … Not `@/src`." `tsconfig.json` confirms `"@/*": ["./*"]` (repo root). So `@/src/prompts/parse-certificate` resolves correctly to `<root>/src/prompts/parse-certificate` — the alias does not forbid a `src/` subtree, it simply roots at the repo, not at `src/`. The authored test stubs import product code from `@/lib/...` (cert, profile, upload, dev) — never from `@/src/...`.

**Decision.**
Create the prompt/schema scaffolds under **`src/prompts/`** and **`src/schemas/`** exactly as the spec names them (imported as `@/src/prompts/*`, `@/src/schemas/*`). Keep all other foundation code — the Claude wrapper, routing, repository, db client, guardrails, domain value map — under **`lib/`** (`lib/ai/`, `lib/repos/`, `lib/domain/`, `lib/dev/`), matching both the SUB-TASK FORMAT lines and the `@/lib/...` import paths the acceptance stubs already assume.

**Rationale.**
- Zero conflict with the alias: `@/*` → repo root means a `src/` subtree resolves naturally; the CLAUDE.md "there is no `src/`" line is a *current-state* statement, reconciled by this story (TD-DOC-01), not a prohibition.
- Prompts/schemas in `src/` keeps long prompt text out of `lib/` business logic (P7) and matches the spec verbatim, minimizing reviewer surprise.
- Wrapper/repo/guardrails in `lib/` match the consumer import paths the authored tests use (`@/lib/...`), so the ported tests resolve.

**Alternatives considered.**
- *Put prompts/schemas under `lib/ai/prompts` + `lib/ai/schemas`* (avoid `src/` entirely): rejected — deviates from the explicit `src/prompts/` naming in Page 02, SUB-TASK-2, and CLAUDE.md; no benefit.
- *Put everything under `src/`*: rejected — breaks the `@/lib/...` imports the acceptance stubs assume and the SUB-TASK FORMAT (`lib/ai/claude.ts`, `lib/repos/skill.ts`).

**Trade-offs.** Gain: spec-faithful layout, both import conventions satisfied. Give up: a mild two-roots layout (`src/` for prompt/schema text, `lib/` for logic) — intentional and documented.

**Impact.** Directory layout only; reconciles the stale CLAUDE.md "no `src/`" note (TD-DOC-01). No code-behavior change.

**Evidence.** Page 02 §2.4/2.5; SUB-TASK-2 FORMAT; CLAUDE.md Conventions + Claude API usage; `tsconfig.json` paths; acceptance stubs' `@/lib/...` imports.

---

## TACTICAL-ADR-03 — Add `tsx` as the seed's TypeScript executor and run the seed through Prisma v7's native `migrations.seed` runner

**Status:** Accepted (tactical) · **Added:** iteration 2 (resolves reviewer finding F-01)

**Context.**
SUB-TASK-1 specifies a TypeScript seed at `prisma/seed.ts`, and the plan's earlier discovery asserted `pnpm seed` would run it with "no installs needed." That claim was wrong: a verification scan found **no TypeScript executor** anywhere in the target repo — `tsx`, `ts-node`, and `@swc-node` are absent from `package.json`, `pnpm-lock.yaml`, and `node_modules/.bin/`. The existing `seed` script is a stub (`echo … && exit 1`). Next.js 16 compiles app code via SWC, but that does not provide a standalone runner for a Node script executed outside the Next build. Prisma v7 is installed (`7.8.0`) and its CLI runs a configured seed command on `prisma db seed`, reading `migrations.seed` from `prisma.config.ts` (the build emits the hint "add a `seed` property to the `migrations` section of your Prisma config", with example `seed: 'bun ./prisma/seed.ts'` — `node_modules/prisma/build/index.js:631,640`). The repo has no `bun`.

**Decision.**
Add **`tsx`** as a devDependency and run the seed through the **Prisma v7 native runner**: set `migrations.seed: "tsx prisma/seed.ts"` in `prisma.config.ts`, and make the `seed` npm script `prisma db push && prisma db seed`. The disposable-test-DB globalSetup (F-02 mechanism, see Non-deviations) invokes the same seed path with an overridden `DATABASE_URL`.

**Rationale.**
- `tsx` is the lightest ESM-first TS runner, requires zero config against the repo's `"type": "module"` + TS 5 setup, and needs no Next/SWC integration for a standalone script.
- Routing through `prisma db seed` (not a bare `tsx prisma/seed.ts` in the npm script) keeps the seed invocation Prisma-managed — it picks up the same datasource/env resolution as the rest of the Prisma CLI and is the documented v7 path, avoiding a divergent ad-hoc invocation.
- Corrects the inaccurate "no installs needed" discovery claim — the file checklist and diff budget now reflect the `tsx` devDependency.

**Alternatives considered.**
- *`ts-node`*: rejected — heavier, weaker native-ESM ergonomics under `"type": "module"`, more config.
- *Bare `tsx prisma/seed.ts` in the npm script (skip `prisma db seed`)*: workable but bypasses the Prisma-managed seed entrypoint and the v7 config hint; rejected to keep one Prisma-managed seed path.
- *Compile the seed to JS / ship a `.js` seed*: rejected — diverges from the SUB-TASK-1 `prisma/seed.ts` TS deliverable and adds a build step.

**Trade-offs.** Gain: a real, runnable TS seed via the documented v7 mechanism. Give up: one small devDependency (`tsx`) — acceptable, dev-only, no runtime/bundle impact.

**Impact.** `package.json` (+`tsx` devDependency, `seed` script rewrite), `prisma.config.ts` (+`migrations.seed`). No schema or runtime-dependency change.

**Evidence.** `package.json:36-50` + `node_modules/.bin/` scan (no TS executor); `node_modules/prisma/build/index.js:631,640` (Prisma v7 seed-runner hint); SUB-TASK-1 FORMAT (`prisma/seed.ts`).

---

## Non-deviations (scanned, no ADR needed)

- **SQLite string-enums, deferred migrations, demo-local files, `db:push`** — already covered by strategic ADR-002/006; explicitly in-scope, not a deviation.
- **`reconcilePending` as a non-persisted flag for SKILL-1** — Page 03 §3.4 describes the behavior; no column named in the ERD (MISSING_IN_ARCH). Implementing it as a returned/log flag (no write path needs persistence in SKILL-1) is a *documented gap*, not a deviation; recorded in the plan's OPEN-ITEMS. Persisting it is a later reconcile-pass concern.
- **Injectable Claude client** — Page 02 §2.1 wrapper anatomy plus the test-helpers contract both require a single boundary; making the client injectable is a refinement of ADR-003, not a deviation.
- **Disposable test-DB via Vitest `globalSetup` `DATABASE_URL` override + explicit runtime `datasourceUrl` (F-02, corrected)** — Two URL paths must not be conflated. The **Prisma CLI** (`db push`/`db seed`/`studio`) resolves its URL from `prisma.config.ts:11-13` (`datasource.url: process.env["DATABASE_URL"]`), so spawning the CLI with `DATABASE_URL` set in its `env` covers CLI operations. The **generated runtime client**, however, gets **no URL from the schema** — `prisma/schema.prisma:9-11` declares `datasource db { provider = "sqlite" }` with **no `url` and no `env()`**, and `prisma.config.ts` is CLI-scope only (it does not configure the runtime client). Therefore `lib/repos/db.ts` MUST construct the singleton as `new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })` (Prisma v7 constructor override) so the runtime client honors the `globalSetup` override; without this the in-test client would have no datasource at all. The `globalSetup` overrides `process.env.DATABASE_URL` to a per-run temp file before any test imports `lib/repos/db.ts`, pushes+seeds it via the CLI, guards (in `tests/setup/db.ts`) that the active URL is set and is not `dev.db`, and deletes it in teardown. This is the standard Vitest test-isolation pattern made correct for this repo's schema (which lacks a datasource `url`) — a test-harness implementation detail, not an architecture deviation. No new ADR needed.
