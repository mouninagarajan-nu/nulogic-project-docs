# SKILL-2 — Implementation Plan: Certificate parsing → verified skills (the hero)

**Initiative:** `skillsync-vertex-hackathon` · **Jira:** SKILL-2 · **Iteration:** 2 (revision)
**Stage:** 06-implementation-planning · **Agent:** nulogic-implementation-planner
**Repo:** `ai-nu-skillsync` · **Branch:** `feature/SKILL-2-cert-parsing` (off `main`, full SKILL-1 foundation present)
**Stack:** Next.js 16.2.6 (App Router) · React 19.2 · TypeScript · Prisma v7 (SQLite) · Zod · Vitest
**Sizing budget:** L / ~380 LOC (Story estimate). **Branding:** NULogic. **Data:** synthetic only.

> **What this plan covers.** The P0 hero capability: upload a certificate → Claude parses it (Sonnet) → Zod-validated `CertParseResult` → confidence gate → content-hash idempotency → employee confirms → the single canonical `EmployeeSkill` record is promoted to `verified` in place → the catalog item becomes `done`. Three sub-tasks: SUB-TASK-1 (upload Route Handler + parse prompt + schema + gate + idempotency), SUB-TASK-2 (`confirmCertExtraction` Server Action + de-dupe-failure fallback + item→done), SUB-TASK-3 (cert-parsing tests against fixtures).

---

## 1. Executive Summary

SKILL-2 builds the certificate → verified-skill flow on top of the SKILL-1 foundation (the Claude wrapper, `resolveCanonicalSkill`/`upsertAndPromoteSkill`, `Certificate.contentHash` + `@@unique`, fixtures). The riskiest, highest-value capability in the build (CLAUDE.md build order). The architecture mandates three concerns held inviolate:

1. **BR-09 — Claude-only intelligence.** Parsing routes through the *existing* single boundary `callClaude<T>()` (`lib/ai/claude.ts`). No regex/keyword/hardcoded extraction. If a live file→base64 SDK call is awkward, the default client stays stubbed (`defaultClientThrows`) returning `Failure` — never fake parsed data.
2. **BR-02 / P2 — validate-before-write.** A parse `Failure`, sub-threshold `confidence`, or invalid JSON writes **nothing**; the item stays in-progress; the spec'd message is shown.
3. **BR-18 / AC-22 — single promotable record.** The verified write goes exclusively through the *existing* `upsertAndPromoteSkill` keyed by `(employeeId, canonicalSkillId)`; never a duplicate row; never a demotion. The Claude `skill-identity` de-dupe is a **merge advisor, not a gate** (TS-002): on failure, `resolveCanonicalSkill` already falls back to create-new + `markReconcilePending` — the P0 write never blocks.

**Reuse posture.** Heavy reuse. SKILL-1 already implements the Claude wrapper, model routing, the `parse-certificate` prompt slot + `CertParseResult` schema slot, the canonical-key normalizer, `resolveCanonicalSkill` (incl. the TS-002 fallback), `upsertAndPromoteSkill`, the trust-state domain map, the Prisma client, the seed, and the Vitest harness. SKILL-2 adds: a thin cert-parse **core module**, two **transport wrappers** (Route Handler + Server Action), a content-hash util, a confidence-threshold constant, and reworks two SKILL-1 *slots* (the `parse-certificate` prompt body + the `CertParseResult` schema shape) to the contract the ACs require.

**Two divergences from a literal reading of the source artifacts are documented in `tactical-adrs.md`** (TADR-S2-01 *v2*, TADR-S2-02) and reflected here: (a) the `CertParseResult` schema must change from SKILL-1's `skills: string[]` placeholder to a **`z.preprocess` normalizer** that accepts the THREE real shapes the binding acceptance test feeds the wrapper — a **flat single-skill object** (AC-01, top-level `confidence`), a **top-level array** of flat skill objects (AC-02, per-skill `confidence`, no top-level), and an already-canonical envelope — and emits a canonical `{ skills[], confidence }` with a **derived top-level `confidence`** (= the flat/envelope value, or `min(per-skill)` for the array) so `callClaude`'s direct `safeParse` + confidence gate (`lib/ai/claude.ts:132,139-144`) work unchanged for BOTH single- and multi-skill; (b) the authored acceptance test imports a **functional core** (`@/lib/cert/parse-certificate`) rather than the HTTP transport — so the plan factors a core module that both the AC test *and* the ADR-004 transport call into. SKILL-2's auth surface is **scoped to a caller-identity seam** (own-profile deny-by-default, `TODO(auth-story)`); `cookies()`/session/`proxy.ts`/AC-24 are deferred to the auth story (not in SKILL-2's AC set).

---

## 2. Discovery — Existing Codebase (evidence, file:line)

### 2.1 Foundation components to REUSE (verified by read)

| Component | File:line | What it gives SKILL-2 | Reuse decision |
|---|---|---|---|
| Claude call boundary `callClaude<T>` | `lib/ai/claude.ts:109-149` | route → render → injected client → extract JSON → Zod `safeParse` → confidence gate → `Ok`/`Failure`. Confidence gate already built (`:139-145`). Injected `client` arg (`:53`). | **IMPORT** |
| Model routing `route()` | `lib/ai/route.ts:14-19` | `"routine"`→Sonnet (cert parse). Ids from env, not hardcoded (BR-12). | **IMPORT** |
| `deterministicCanonicalKey` | `lib/ai/canonical-key.ts:9-15` | Layer-1 normalization key. | **IMPORT** (transitively via repo) |
| `resolveCanonicalSkill` | `lib/repos/skill.ts:49-103` | Two-layer identity; **TS-002 fallback already implemented** (`:85-88` `markReconcilePending`; `:93-102` create-new under race). Accepts `{ client }`. | **IMPORT** |
| `upsertAndPromoteSkill` | `lib/repos/skill.ts:122-160` | Monotonic promote on `(employeeId, skillId)`; no demote; no dup row (BR-18). Returns `{ state, createdNewRow }`. | **IMPORT** |
| `markReconcilePending` / `isReconcilePending` | `lib/repos/skill.ts:37-42` | TS-002 reconcile flag. | **IMPORT** |
| Trust-state domain map | `lib/domain/trust-state.ts` | `verified`/`certificate`/`acquired` → DB tokens; `order()`. | **IMPORT** |
| Prisma client singleton | `lib/repos/db.ts:24-30` | `prisma` bound to the per-run disposable test DB. | **IMPORT** |
| `parse-certificate` prompt slot | `src/prompts/parse-certificate.ts:4-11` | Named template registered in `system.ts:26-35`. **Body must be reworked** (singular `{skill}` → multi-skill envelope `{skills:[{skill,level?,date?,issuer?,confidence?}], issuer, confidence}`). Prompt variable is **`text`** (`:7`). | **EXTEND** |
| `CertParseResult` schema slot | `src/schemas/CertParseResult.ts:4-8` | Registered in `src/schemas/index.ts:2`. **Shape must change** to a `z.preprocess` normalizer accepting flat-object \| top-level-array \| envelope and emitting canonical `{skills:[{skill, level?, date?, issuer?, confidence?}], issuer?, confidence}` with a derived top-level `confidence`. See TADR-S2-01 v2. | **EXTEND** |
| Vitest harness | `vitest.config.ts`, `tests/setup/db.ts`, `tests/setup/global-db.ts` | Per-run disposable seeded SQLite; `@/`-alias; node env; `fileParallelism:false`. Single-file run: `pnpm test tests/<file>`. | **IMPORT** |
| Claude-client doubles | `tests/setup/test-helpers.ts:27-48` | `makeClaudeClientSpy/Garbled/ThatThrows` — the injected-client contract `{ createMessage(args)->{content:[{type:"text",text}]} }`. | **IMPORT** |
| Seed | `prisma/seed.ts` | 22 synthetic profiles; **employee #1 (`synthetic-handle-001`) always has TypeScript baseline (`:153-156`)** → SUB-TASK-3 promotion fixture (the mirror uses #1's **cuid** id). Catalog items are **named** (`:59-74`, e.g. "AWS Solutions Architect Associate") with **cuid** ids — there are **no `cat-*` ids and no `p-001`** in the seed. **No `Enrollment` rows seeded.** | **IMPORT** + per-test setup (see F-04 reconciliation §2.4) |
| Fixtures | `fixtures/certs/aws-saa-valid.pdf`, `multi-skill-bootcamp.pdf`, `not-a-cert.png` | Cert-parse test inputs. | **IMPORT** |

### 2.2 Per-file analog scan for proposed NEW files (MANDATORY)

| Proposed new file | Closest analog searched | Decision + reason |
|---|---|---|
| `lib/cert/parse-certificate.ts` (core: `parseCertificate`, `confirmAndWriteSkill`) | `lib/repos/skill.ts` (skill core), `lib/ai/claude.ts` (boundary). No cert-flow orchestration module exists (Glob `lib/cert/**` → empty; Grep `parseCertificate` in repo → none). | **BUILD-NEW.** No analog orchestrates cert parse→confirm→promote. It composes the imports above. This is the module the **authored AC test imports** (`cert-parsing.test.ts:37` `@/lib/cert/parse-certificate`). |
| `app/api/uploads/certificate/route.ts` (Route Handler) | No `app/api/**` exists yet (Glob → empty). | **BUILD-NEW** (ADR-004 mandates a Route Handler for multipart upload). Thin: parse FormData → call core. |
| `app/actions/cert.ts` (Server Action `confirmCertExtraction`) | No `app/actions/**` exists yet. | **BUILD-NEW** (Page 02 §3.1 mandates a Server Action for the confirm mutation). Thin: session/own-profile gate → call core. |
| `lib/hash.ts` (`contentHash`) | No hash util exists (Grep `sha256`/`createHash` → none). | **BUILD-NEW.** Single-purpose Node `crypto` wrapper; SUB-TASK-1 FORMAT names it. |
| `lib/cert/config.ts` (or constant in core) | No config module. `route.ts` reads model ids from env — same pattern. | **BUILD-NEW** (tiny) — `CONFIDENCE_THRESHOLD` constant, env-overridable (`CERT_CONFIDENCE_THRESHOLD`). Assumption in STORY "configurable + documented". |
| `tests/cert-parsing.test.ts` | `tests/foundation/*.test.ts` (same harness, same doubles). | **BUILD-NEW** (SUB-TASK-3). Mirrors the authored stub scenarios; co-located under `tests/`. |

### 2.3 Interface reads confirmed (no invented API surface)

- `callClaude` signature/behaviour: `lib/ai/claude.ts:46-66, 109-149` — uses `{ promptName, variables, schema, complexity, confidenceThreshold?, client? }`; returns discriminated `Ok<T> | Failure`. ✔
- `resolveCanonicalSkill(raw, { client? })` → `Promise<string>` (canonical `Skill.id`): `lib/repos/skill.ts:49-52`. ✔
- `upsertAndPromoteSkill(employeeId, skillId, targetState, source, origin)` → `{ state, createdNewRow }`, domain tokens `"verified"`/`"certificate"`/`"acquired"`: `lib/repos/skill.ts:122-128`, `lib/domain/trust-state.ts:13,47,57`. ✔
- Injected-client shape (what tests pass as `claude`): `tests/setup/test-helpers.ts:22-32`; the authored AC stub passes the **same shape** under key `claude` (`cert-parsing.test.ts:30-39`). The core must accept the client and forward it to `callClaude` under `{ client }`. ✔
- **Spy serialization (binding payload ground truth):** `makeClaudeClientSpy(scriptedResponse)` returns `{ content:[{ type:"text", text: JSON.stringify(scriptedResponse) }] }` (`test-helpers.ts:27-32`). `callClaude` `JSON.parse`s that block and runs `schema.safeParse(raw)` **directly, with no normalization** (`lib/ai/claude.ts:126-132`). So the schema must validate **exactly** what the spy serializes: AC-01 a **flat object** `{skill,issuer,date,level,confidence}` (`cert-parsing.test.ts:30-36`); AC-02 a **top-level array** `[{...},{...}]` (`:57-60`). The iteration-1 object-only schema fails both → drove TADR-S2-01 v2. ✔
- Prisma models `Certificate` (`@@unique([employeeId, contentHash])`), `Enrollment` (`@@unique([employeeId, catalogItemId])`, `status`), `EmployeeSkill`: `prisma/schema.prisma:61-141`. ✔
- `upsertAndPromoteSkill` does `employeeSkill.findUnique({ employeeId_skillId })` then `create({ employeeId })` (`lib/repos/skill.ts:131-145`) — so the `employeeId` (=`profileId`) passed in **must reference a real `Employee` row**, or the create FK fails. This is why the authored `p-001`/`cat-*` ids require explicit setup (§2.4). ✔

---

### 2.4 Authored-test fixture identity reconciliation (F-04 — MANDATORY)

The authored `cert-parsing.test.ts` hard-codes `profileId:"p-001"` (`:44,74`) and `catalogItemId:"cat-aws-saa"|"cat-kubernetes"|"cat-docker"` (`:45,71`). **None of these exist in `prisma/seed.ts`:** employees are created with cuid ids + `synthetic-handle-NNN` handles (`seed.ts:127,135-147`); catalog items are **named** with cuid ids (`seed.ts:59-74,108-121`); and **no `Enrollment` rows are seeded** (`reset()` deletes them; nothing recreates them — `seed.ts:84,108-172`). Left unreconciled, `confirmAndWriteSkill({ profileId:"p-001", … })` fails the `Employee`/`Enrollment`/`EmployeeSkill` FK lookups (`upsertAndPromoteSkill` `:131-145`).

**Reconciliation (how the authored test is turned green by the test-creator):** the authored suite's own `beforeEach`/setup MUST materialize the exact ids it references against the per-run disposable DB:

| Authored id | Setup action (in the test's own fixture/`beforeEach`) |
|---|---|
| `Employee id = "p-001"` | `prisma.employee.create({ data:{ id:"p-001", … synthetic fields … } })` — explicit id (Prisma allows setting the cuid-defaulted `id`). |
| `CatalogItem id = "cat-aws-saa" / "cat-kubernetes" / "cat-docker"` | `prisma.catalogItem.create({ data:{ id:"cat-aws-saa", name:"AWS Solutions Architect Associate", kind:"CERT", … } })` (and the two others), with explicit ids. |
| in-progress `Enrollment` for `(p-001, each catalog id)` | `prisma.enrollment.create({ data:{ employeeId:"p-001", catalogItemId:"cat-aws-saa", status:"IN_PROGRESS" } })` — so `confirmAndWriteSkill` has a row to flip to `COMPLETED` and the AC-03 "stays in-progress" assertion is observable. |

This setup is part of **SUB-TASK-3's deliverable** (the cert-parsing test file the test-creator authors mirrors the upstream `cert-parsing.test.ts` AND carries this fixture setup). The **SUB-TASK-3 executable-mirror scenarios** (S2-P3-*) use the **same `p-001`/`cat-*` ids** as the authored test so the mirror proves the authored test passes — except **S2-P3-04 (promotion)** which intentionally targets the **seeded** `synthetic-handle-001` cuid (the only employee with a deterministic TypeScript baseline, `seed.ts:153-156`); that divergence is documented inline in the scenario. The file checklist (§14) records `tests/cert-parsing.test.ts` as carrying this setup.

---

## 3. Reuse Strategy (per-file decision table)

| File | Decision | Evidence / reason |
|---|---|---|
| `lib/ai/claude.ts` | **IMPORT** | The single boundary; cert parse calls `callClaude` (`:109`). No change. |
| `lib/ai/route.ts` | **IMPORT** | `"routine"`→Sonnet for cert parse. No change. |
| `lib/repos/skill.ts` | **IMPORT** | `resolveCanonicalSkill` + `upsertAndPromoteSkill` + TS-002 fallback already exist. No change. |
| `lib/domain/trust-state.ts` | **IMPORT** | Domain tokens for the verified write. No change. |
| `lib/repos/db.ts` | **IMPORT** | Prisma client. No change. |
| `src/prompts/parse-certificate.ts` | **EXTEND** | Rework the prompt body to instruct the multi-skill **envelope** JSON contract (`{skills:[{skill,level?,date?,issuer?,confidence?}], issuer, confidence}`); keep the named-export registration and the **`text`** variable (`:7`). ~10 LOC. |
| `src/prompts/system.ts` | **IMPORT** (no edit) | Registry already includes `parse-certificate`. No change. |
| `src/schemas/CertParseResult.ts` | **EXTEND** | Replace body with a `z.preprocess` normalizer (flat-object \| top-level-array \| envelope → canonical `{skills[], issuer?, confidence}` with derived top-level `confidence`); per-skill `{skill, level?, date?, issuer?, confidence?}` (`.nullish()` for AC-02 null entry). See TADR-S2-01 v2. ~28 LOC. |
| `src/schemas/index.ts` | **IMPORT** (no edit) | Barrel already re-exports `CertParseResult`. No change. |
| `lib/cert/parse-certificate.ts` | **BUILD-NEW** | Core: `parseCertificate`, `confirmAndWriteSkill` (the AC-test contract) + an internal `confirmCertExtraction` orchestration used by the Server Action. |
| `lib/hash.ts` | **BUILD-NEW** | `contentHash(bytes)` via Node `crypto`. |
| `lib/cert/config.ts` | **BUILD-NEW** | `CONFIDENCE_THRESHOLD` constant (env-overridable). |
| `app/api/uploads/certificate/route.ts` | **BUILD-NEW** | ADR-004 multipart Route Handler; thin over the core. |
| `app/actions/cert.ts` | **BUILD-NEW** | Page 02 §3.1 Server Action; thin over the core. |
| `tests/cert-parsing.test.ts` | **BUILD-NEW** | SUB-TASK-3 suite. |
| `.env.example` | **EXTEND** | Add `CERT_CONFIDENCE_THRESHOLD` placeholder + comment (documents the assumption). ~1 LOC. |

> **Granularity note.** The core module substantially composes existing modules rather than duplicating them — every piece of intelligence and every write delegates to a SKILL-1 import. The transport files are intentionally thin (transport + auth/scope only), per ADR-004/Page-02 §3.1 (uploads are handlers, mutations are actions, no business logic at the edge).

---

## 4. Spec Contracts Inventory (verbatim from target-state arch)

Every externally-visible identifier the plan must honor. Source = Page 02 / Page 03 / sub-tasks.

| Contract | Exact identifier / shape | Source |
|---|---|---|
| Upload endpoint | `POST /api/uploads/certificate` (multipart) | Page 02 §3.2; SUB-TASK-1 |
| Upload success response | `{ uploadId, extracted }` (+ `deduped?: true` on idempotent re-submit) | Page 02 §3.2; SUB-TASK-1 §Data Models |
| Upload failure response | typed failure carrying `userMessage`, HTTP non-2xx | SUB-TASK-1 §Error Handling |
| Confirm action | `confirmCertExtraction({ uploadId, confirmedSkills[] }) → { promotedSkills[] }` | Page 02 §3.1; SUB-TASK-2 |
| Confirm auth scope | **SKILL-2 scope:** own profile only via a **caller-identity seam** (`getCallerEmployeeId()`, `TODO(auth-story)`, deny cross-profile by default); assert `certificate.employeeId === caller`. **OUT OF SCOPE (deferred to auth story):** `cookies()`/session re-derivation, `proxy.ts`, AC-24 stale-session redirect — not in SKILL-2's AC set. See TADR-S2-02 Auth Scope (F-06). | Page 02 §3.1; SUB-TASK-2; TADR-S2-02 |
| **§2.5 verbatim (strategic, representative)** | `CertParseResult { skills: [{ skill: string, level?: string }] (≥1); issuer: string (REQUIRED); date?: string (TOP-LEVEL); confidence: number (0..1) }` | Page 02 §2.5 (`02-…api-contracts.md:182-187`) |
| **Cert parse schema (this story — divergence from §2.5, recorded)** | `z.preprocess`-normalized canonical `{ skills: [{ skill, level?, date?, issuer?, confidence? }] (≥1), issuer?: string, confidence: number (0..1) }`. **Divergence A:** `date`/`issuer`/`confidence` are also **per-skill** (the binding test shape) and top-level `issuer` is **optional**, vs §2.5's top-level `date?` + required `issuer`. Justified: §2.5 is a representative pseudo-schema; the authored test is the executable contract (evidence hierarchy). See TADR-S2-01 v2 (F-01/F-05). | AC-01/02 test payloads (`cert-parsing.test.ts:30-36,57-60`); reconciled to §2.5 |
| Prompt template | `parse-certificate` (Sonnet / `complexity:"routine"`); single variable `text` (`src/prompts/parse-certificate.ts:7`) | Page 02 §2.2/§2.4 |
| Confidence gate | `parsed.data.confidence < CONFIDENCE_THRESHOLD` ⇒ failure (write nothing), read top-level (`lib/ai/claude.ts:139-144`). **Multi-skill (AC-02) semantics (F-02):** the array carries no top-level `confidence`; the normalizer derives top-level `confidence = min(per-skill confidence)` so the gate fires deterministically and a single sub-threshold skill fails the whole cert (conservative, BR-02). Flat/envelope: `confidence` as-is. | Page 02 §2.5; SUB-TASK-1; TADR-S2-01 v2 |
| Cert spec'd message | `"We couldn't reliably read this certificate. Check it's a clear PDF or image and try again, or add the skill manually."` | STORY Scenario C; test-scenarios.md S-03 |
| Idempotency key | `Certificate @@unique([employeeId, contentHash])` (DB backstop) + app-layer fast path | Page 03 §4.6/§6.1; `prisma/schema.prisma:140` |
| Skill write | `upsertAndPromoteSkill(employeeId, canonicalSkillId, targetState="verified", source="certificate", origin="acquired")` | Page 02 §4.1; Page 03 §3.2; SUB-TASK-2 |
| Persisted trust tokens | `EmployeeSkill.trustState="VERIFIED"`, `source="CERTIFICATE"`, `origin="ACQUIRED"` (DB UPPERCASE) | Page 03 §2; `lib/domain/trust-state.ts` |
| Item-done write | linked `Enrollment.status = "COMPLETED"` (domain "done") | Page 03 §4.5; `prisma/schema.prisma:103` |
| De-dupe resilience | `skill-identity` is advisor; failure ⇒ create-new keyed by `canonicalKey` + `markReconcilePending` (TS-002) | Page 02 §4.1; Page 03 §3.4 |

> **`MISSING_IN_ARCH` note (resolved, not P0):** The arch describes the transport (handler/action) but the authored AC test (`cert-parsing.test.ts`) asserts a **module shape** (`parseCertificate`/`confirmAndWriteSkill`) and a **flattened skill payload** (`{source:"certificate", state:"verified", verified:true}`, `itemStatus:"done"`) that the DB/domain layer expresses as UPPERCASE tokens + `Enrollment.status`. Reconciliation: the core module returns the **domain-shaped** object the AC test asserts (`source:"certificate"`, `state:"verified"`, `verified:true`, `itemStatus:"done"`), translating to DB tokens internally via `lib/domain/trust-state.ts`. Documented in TADR-S2-02; not a blocking gap.

---

## 5. Wiring Trace (every new field/param/identifier → consumer)

| New/changed identifier | Producer | Consumer (file:line target) |
|---|---|---|
| `CertParseResult` normalizer (preprocess: flat-object/array/envelope → `{skills[], confidence}`) + per-skill `.skill`/`.level?`/`.date?`/`.issuer?`/`.confidence?` | reworked schema `src/schemas/CertParseResult.ts` | `callClaude` `safeParse(raw)` (`lib/ai/claude.ts:132`) + confidence gate (`:139-144`); core `parseCertificate` return (`lib/cert/parse-certificate.ts`); AC test `cert-parsing.test.ts:46,67-68` |
| top-level `confidence` derived for the array case = `min(per-skill confidence)` | `CertParseResult` preprocess | confidence gate `lib/ai/claude.ts:139-144` (F-02) |
| `parse-certificate` prompt body (multi-skill envelope JSON instruction) | `src/prompts/parse-certificate.ts` | `renderPrompt` in `callClaude` (`lib/ai/claude.ts:117`) |
| **`file` (string path) → prompt variable `text`** (F-07) | core `parseCertificate({ file })` derives `text` from a real file read; passes `variables:{ text }` | prompt template consumes `variables.text` (`src/prompts/parse-certificate.ts:7`). **BR-09:** never fabricate/hardcode cert text; live `file→text` (PDF/image extraction) is a deferred boundary returning `Failure` until wired (TODO); spy-driven tests bypass file reading. SUB-TASK-1's `fileRef` is reconciled to **`text`**. |
| `contentHash(bytes)` | `lib/hash.ts` | Route Handler dedupe (`app/api/uploads/certificate/route.ts`); core idempotency fast path |
| `CONFIDENCE_THRESHOLD` | `lib/cert/config.ts` | passed to `callClaude({ confidenceThreshold })` in core; reads `CERT_CONFIDENCE_THRESHOLD` env |
| `getCallerEmployeeId()` caller-identity seam (`TODO(auth-story)`, deny cross-profile) | `app/actions/cert.ts` | own-profile assertion `certificate.employeeId === caller` before delegating to core (F-06) |
| `parseCertificate({ file, claude })` → `{ ok:true, skills[] } \| { ok:false, userMessage }` | `lib/cert/parse-certificate.ts` | AC test `cert-parsing.test.ts:39,63,96`; Route Handler |
| `confirmAndWriteSkill({ profileId, catalogItemId, skill })` → `{ skill:{source,state,verified}, itemStatus }` | `lib/cert/parse-certificate.ts` | AC test `cert-parsing.test.ts:43,74` |
| `confirmCertExtraction({ uploadId, confirmedSkills[] })` → `{ promotedSkills[] }` | `app/actions/cert.ts` (thin) → core orchestration | UI confirm step (SKILL-6); SUB-TASK-3 idempotency/promotion tests |
| `{ uploadId, extracted, deduped? }` | Route Handler | UI upload step (SKILL-6); idempotency test |
| `Certificate.parsedJson` (Zod-validated extraction) | core persist | idempotency fast-path re-read; audit/demo |

---

## 6. AC Mechanism Map (literal mechanism word → phase)

| AC | Literal mechanism (from STORY/test-scenarios) | Phase implementing |
|---|---|---|
| AC-01 | "Claude API call boundary invoked exactly once with `parse-certificate` (Sonnet)"; Zod-validated `CertParseResult`; on confirm `upsert+promote` `trustState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED`; item `done` | Phase 1 (core parse) + Phase 2 (confirm/promote) |
| AC-02 | "Claude returns ALL extracted skills in Zod-validated JSON" (top-level **array** payload normalized via `z.preprocess`); ambiguous/`null` optional `date`/`level` do not break the parse or write | Phase 1 (preprocess normalizer + prompt) + Phase 2 (per-skill write) |
| AC-03 | parse `Failure` / `confidence < threshold` / invalid JSON ⇒ no write; item in-progress; exact message string. For multi-skill the gate uses the derived `min(per-skill confidence)` top-level value (F-02). | Phase 1 (gate) |
| AC-22 | `upsertAndPromoteSkill` keyed by `(profileId, canonicalSkillId)`; promote same row in place; no duplicate; equal-or-lower = no-op (never demote) | Phase 2 (reuses repo) |
| AC-23 | `@@unique([employeeId, contentHash])` DB backstop + app-layer fast path ⇒ second submit returns prior `uploadId`, no re-parse, no dup `Certificate`/skill/promotion | Phase 1 (idempotency) + Phase 2 (idempotent re-confirm) |

> Substitutes ≠ implementation: parsing **must** be the `callClaude` boundary (BR-09), the write **must** be `upsertAndPromoteSkill` (BR-18) — no alternate path.

---

## 7. Business Rule Cross-Reference (every BR → code path)

| BR | Statement (abbrev) | Planned code path | Phase |
|---|---|---|---|
| BR-01 | `verified` only via confirmed parsed cert (`source=certificate`) | `confirmAndWriteSkill`/`confirmCertExtraction` are the only callers that pass `targetState="verified", source="certificate"` for the cert flow | 2 |
| BR-02 | failed/low-confidence/invalid-JSON ⇒ no skill written | core `parseCertificate` returns `{ ok:false, userMessage }` on `callClaude` `Failure`; no `Certificate` row, no skill write reachable. Multi-skill: the normalizer's derived top-level `min(per-skill confidence)` feeds the same gate so a sub-threshold entry fails the whole cert (F-02). | 1 |
| BR-09 | parsing is a Claude call, Zod-validated, no regex/keyword | core delegates to `callClaude({ promptName:"parse-certificate", schema:CertParseResult })`; test asserts `claude.createMessage` called exactly once | 1, 3 |
| BR-18 | verified write promotes the one canonical record in place; never duplicates | `confirmAndWriteSkill` → `resolveCanonicalSkill` → `upsertAndPromoteSkill` (monotonic; `(employeeId,skillId)` unique) | 2 |
| BR-19 | double-submit idempotent (DB `@@unique`); converges to one result | Route Handler dedupe fast path + DB constraint race backstop; re-confirm of promoted upload is a no-op | 1, 2 |

No BR is uncovered. No BR conflicts an AC.

---

## 8. Phase Breakdown

> Each phase has GOAL / CONSTRAINTS / FORMAT / FAILURE CONDITIONS / TEST SCENARIOS. Phase 0 establishes the RED baseline.

### Phase 0 — Baseline (RED) tests run; foundation green

**GOAL:** Confirm the harness and the SKILL-1 foundation are green, and the SKILL-2 scenarios are RED for the right reason (missing `lib/cert/parse-certificate` + reworked schema), before writing any SKILL-2 code.
**CONSTRAINTS:** Use the existing harness (`vitest.config.ts`); do not modify `tests/setup/*`. Single-file run command: `pnpm test tests/cert-parsing.test.ts`.
**FORMAT:** Run `pnpm test` (foundation suites green) and confirm a placeholder `tests/cert-parsing.test.ts` fails on the missing import.
**FAILURE CONDITIONS:** Foundation suites RED (env not set up) ⇒ stop; the disposable-DB guard (`tests/setup/db.ts:58-69`) must hold.
**TEST SCENARIOS:** `S2-P0-01` (foundation green), `S2-P0-02` (cert suite RED on missing module).

### Phase 1 — SUB-TASK-1: parse core + prompt + schema + gate + idempotency

**GOAL:** Receive a certificate, dedupe by content hash, parse via Claude into a validated `CertParseResult`, gate on confidence, and return the extraction for confirmation — writing nothing on failure.
**CONSTRAINTS:**
- BR-09/ADR-003: parsing is the *single* `callClaude` boundary with the Zod gate. The core accepts an injected `claude` client and forwards it under `{ client }` (so tests drive it; live default stays `defaultClientThrows` per the guardrail — never fake data).
- BR-02/P2: on `callClaude` `Failure` (extract/parse/sdk/confidence) ⇒ return `{ ok:false, userMessage: CERT_FAILURE_MESSAGE }`; persist **no** `Certificate`, write **no** skill.
- ADR-004/Next.js 16: the Route Handler is multipart (`request.formData()`), derives the owning `employeeId` server-side via the **caller-identity seam** `getCallerEmployeeId()` (never trusts a client-sent id; `TODO(auth-story)` — real session/`cookies()` deferred to the auth story per F-06/TADR-S2-02). Computes `contentHash` and checks the idempotency fast path before parsing.
- BR-19/TS-004: persist `Certificate(employeeId, fileName, contentHash, parsedJson)` only on a valid parse; rely on `@@unique([employeeId, contentHash])` as the race backstop (catch unique violation → re-read winner).
- BR-12: model id from `route("routine")` (env) — never hardcoded.
**FORMAT:**
- `src/schemas/CertParseResult.ts` (EXTEND): a `z.preprocess` normalizer (per TADR-S2-01 v2) accepting **(A)** a top-level array of skill objects, **(B)** an already-canonical `{skills:[…]}` envelope, **(C)** a flat single-skill object — emitting canonical `{ skills: array(CertSkill).min(1), issuer: nullish, confidence: number(0..1) }` where `CertSkill = { skill: string.min(1), level: nullish, date: nullish, issuer: nullish, confidence: number(0..1).optional() }`; for case (A) the top-level `confidence = min(per-skill confidence)`. The inner top-level `confidence` is **required** so the gate (`claude.ts:139-144`) always reads a scalar.
- `src/prompts/parse-certificate.ts` (EXTEND): instruct extraction of the envelope `{ skills:[{skill, level?, date?, issuer?, confidence?}], issuer, confidence }`; multi-skill allowed; confidence 0..1; single JSON object, no prose. Variable is `text` (unchanged).
- `lib/hash.ts` (NEW): `contentHash(bytes: Uint8Array|Buffer): string` (sha256 hex).
- `lib/cert/config.ts` (NEW): `CONFIDENCE_THRESHOLD = Number(process.env.CERT_CONFIDENCE_THRESHOLD ?? 0.6)`.
- `lib/cert/parse-certificate.ts` (NEW, partial): `parseCertificate({ file, claude })` → derives the prompt variable `text` from a **real file read** of `file` (NEVER fabricates/hardcodes cert text — BR-09; live PDF/image→text extraction is a deferred boundary returning `Failure` until wired, TODO), calls `callClaude({ promptName:"parse-certificate", variables:{ text }, schema:CertParseResult, complexity:"routine", confidenceThreshold:CONFIDENCE_THRESHOLD, client:claude })`, returns `{ ok:true, skills: data.skills }` or `{ ok:false, userMessage:CERT_FAILURE_MESSAGE }`. (Spy-driven tests bypass the file read; they exercise schema/gate/return.)
- `app/api/uploads/certificate/route.ts` (NEW): `POST` — FormData → bytes → hash → dedupe fast path → `parseCertificate` → on Ok persist `Certificate` + return `{ uploadId, extracted }`; on Fail return non-2xx `{ userMessage }`.
- `.env.example` (EXTEND): add `CERT_CONFIDENCE_THRESHOLD` placeholder.
**FAILURE CONDITIONS (testable defects):** a low-confidence/invalid parse persists a `Certificate` or any skill (BR-02); a second identical upload creates a second `Certificate` (BR-19); a multi-skill cert returns only the first skill (AC-02); the handler trusts a client-sent `employeeId` (authz); the model id is hardcoded (BR-12).
**TEST SCENARIOS:** `S2-P1-01` (happy parse, boundary called once, Zod-valid), `S2-P1-02` (multi-skill all returned + null date/level tolerated), `S2-P1-03` (garbled JSON ⇒ failure + exact message, no write), `S2-P1-04` (sub-threshold confidence ⇒ failure), `S2-P1-05` (idempotent double-submit ⇒ one `Certificate`, prior `uploadId`, no re-parse), `S2-P1-06` (multi-skill cert with one per-skill confidence below threshold ⇒ derived `min(per-skill)` top-level confidence fires the gate ⇒ failure, nothing written — BR-02 multi-skill gate, F-02).

### Phase 2 — SUB-TASK-2: confirm → upsert+promote to verified, item→done

**GOAL:** Persist verified skills only after employee confirmation, via the single upsert+promote path, with a resilient de-dupe fallback so the most-protected write never blocks.
**CONSTRAINTS:**
- ADR-007/BR-18/AC-22: every write goes through `upsertAndPromoteSkill(employeeId, canonicalSkillId, "verified", "certificate", "acquired")` keyed by `(employeeId, canonicalSkillId)`; monotonic; never dup; never demote.
- TS-002: `resolveCanonicalSkill(skill.skill, { client })` already encapsulates the advisor + fallback (`lib/repos/skill.ts:49-103`); the core must **not** re-implement de-dupe or gate the write on it. A de-dupe failure must not throw out of the confirm path.
- BR-01: `verified` reached only here (confirmed cert).
- **Auth scope (F-06 / TADR-S2-02):** the Server Action derives the caller's `employeeId` from the **caller-identity seam** `getCallerEmployeeId()` (`TODO(auth-story)`, defaults to denying cross-profile writes — own-profile only) and asserts `certificate.employeeId === caller`. `cookies()`/session re-derivation, `proxy.ts`, and the **AC-24 stale-session redirect are OUT OF SCOPE for SKILL-2** (owned by the later auth story; AC-24 is not in SKILL-2's AC set). The testable authz failure-condition: a confirm whose upload-owner ≠ caller is **denied (no write)** — asserted at the action/core layer without a real session. Idempotent re-confirm of an already-promoted upload returns existing promoted skills (no second promotion).
- Mark the linked `Enrollment` `COMPLETED` (domain `done`).
**FORMAT:**
- `lib/cert/parse-certificate.ts` (NEW, complete): add `confirmAndWriteSkill({ profileId, catalogItemId, skill })` → `resolveCanonicalSkill` → `upsertAndPromoteSkill` → set `Enrollment.status="COMPLETED"` → return `{ skill:{ source:"certificate", state:"verified", verified:true }, itemStatus:"done" }`. Add `confirmCertExtraction({ uploadId, confirmedSkills[] })` orchestration (loads `Certificate`, loops skills through the above, idempotent on re-confirm) → `{ promotedSkills[] }`.
- `app/actions/cert.ts` (NEW): `"use server"`; `confirmCertExtraction` thin wrapper — derive caller via `getCallerEmployeeId()` (caller-identity seam, `TODO(auth-story)`), assert `certificate.employeeId === caller` (deny otherwise — no write), delegate to core. No `cookies()`/redirect (deferred — F-06).
**FAILURE CONDITIONS (testable defects):** confirming a cert for an already-self-reported skill creates a SECOND `EmployeeSkill` row (BR-18/AC-22 — the hero-loop failure signature); a `skill-identity` failure makes confirm throw/hang and the verified skill is never written (TS-002); `verified` written without a confirmed `Certificate` (BR-01); re-confirming the same `uploadId` promotes/duplicates twice (idempotency); the action trusts a client-supplied `profileId` (authz).
**TEST SCENARIOS:** `S2-P2-01` (confirm happy: one VERIFIED row, item done), `S2-P2-02` (multi-skill: each written verified, null-date entry written), `S2-P2-03` (promotion: pre-seeded self-reported TypeScript promoted in place, same row id, no dup), `S2-P2-04` (re-confirm/re-assert verified = no-op, never demote), `S2-P2-05` (de-dupe advisor failure ⇒ write still completes, reconcilePending flagged), `S2-P2-06` (idempotent re-confirm of an already-promoted upload).

### Phase 3 — SUB-TASK-3: cert-parsing tests against fixtures (the evidence)

**GOAL:** Prove cert parsing end-to-end against synthetic fixtures: happy, multi-skill, failure, single-record promotion, idempotency — with evidence (test output).
**CONSTRAINTS:**
- CLAUDE.md: run against `fixtures/certs/`; provide single-file invocation; show test output as evidence.
- BR-09: assert the Claude boundary is invoked (spy `createMessage`), not a keyword substitute; a failed parse writes nothing.
- Forced-failure / invalid-JSON cases use the SDK double (`makeClaudeClientGarbled`); happy/multi-skill use `makeClaudeClientSpy` with scripted structured responses (or a live call where `ANTHROPIC_API_KEY` is set) — never a faked extraction passed off as real intelligence.
- §8 metric: a majority of cert fixtures parse to valid validated JSON.
- **Fixture identity (F-04):** the authored ids `p-001` / `cat-aws-saa` / `cat-kubernetes` / `cat-docker` are **not seeded** — the suite's `beforeEach`/setup MUST create them explicitly (`employee.create({ id:"p-001", … })`, `catalogItem.create({ id:"cat-aws-saa", name:"AWS Solutions Architect Associate", … })` ×3) plus an **in-progress `Enrollment`** for each `(p-001, cat-*)` so `confirmAndWriteSkill` has a row to flip to `COMPLETED` and AC-03's "stays in-progress" is observable (see §2.4). The promotion scenario (S2-P3-04) instead uses the **seeded** `synthetic-handle-001` cuid (the only deterministic TypeScript baseline, `seed.ts:153-156`) — documented divergence.
- DB isolation: rely on the disposable per-run seeded DB; create the ids + enrollment above; assert on counts scoped to the test's employee.
**FORMAT:** `tests/cert-parsing.test.ts` — uses `prisma` from `tests/setup/db`, doubles from `tests/setup/test-helpers`, fixtures `fixtures/certs/*`. **Mirrors the authored `cert-parsing.test.ts` payloads EXACTLY** — AC-01 a flat single-skill object, AC-02 a top-level array (NOT rewritten into `{skills:[…]}`) — and carries the §2.4 fixture setup. Mirrors S-01/02/03 + adds S-22/S-23.
**FAILURE CONDITIONS (testable defects):** happy test passes while impl used regex/keyword (assert boundary invocation); failure test passes but an `EmployeeSkill` was written; promotion test passes while a duplicate row exists; idempotency test passes while two `Certificate` rows exist; fewer than a majority of fixtures parse to valid JSON.
**TEST SCENARIOS:** `S2-P3-01`..`S2-P3-06` (see test-scenarios.json — these are the executable mirror of the authored S-01/02/03 + S-22/S-23 + the §8 majority-parse metric).

---

## 9. LOC Envelope (budget L / ~380 LOC)

| Phase | Files | Est. LOC |
|---|---|---|
| 1 | `CertParseResult.ts` (preprocess normalizer, ~28 net), `parse-certificate.ts` prompt (+10), `lib/hash.ts` (12), `lib/cert/config.ts` (4), `lib/cert/parse-certificate.ts` (parse portion ~50), `route.ts` (~50), `.env.example` (+2) | ~156 |
| 2 | `lib/cert/parse-certificate.ts` (confirm portion ~68), `app/actions/cert.ts` + `getCallerEmployeeId()` seam (~48) | ~116 |
| 3 | `tests/cert-parsing.test.ts` (incl. §2.4 fixture setup) | ~105 |
| **Total** | | **~377** |

Within the ~380 LOC L budget. The iteration-2 schema growth (+~20 for the `z.preprocess` normalizer vs the iteration-1 plain object) is absorbed by tightening the parse/route portions and the test file (the authored stub + §2.4 setup is the contract floor; trim redundant assertions, not scenarios, if Phase 3 runs long). No split required.

---

## 10. Release Strategy

- **Single app, single local/demo environment** (Page 04 §6). No canary/blue-green (out of scope).
- **Feature flag:** none required. The cert flow is additive (new routes/action + reworked unused SKILL-1 slots) and is exercised only by the new tests and the (future SKILL-6) UI; it cannot regress an existing user-facing surface (none exists yet). Per `release-strategy.md` default-false-when-upstream-pending: the only upstream (SKILL-1) is **merged/deployed**, so no gating flag is warranted. Documented inline rather than introducing an unused flag (Simplicity First).
- **Default client stays stubbed** (`defaultClientThrows`) until a live SDK call is wired; tests inject doubles. This is the loop-protecting fallback (risk register: "Claude API unavailable").

---

## 11. Pipeline Impact

- **No** changes to `.github/workflows/*.yml`, Helm, K8s, or any `ci-cd.md`-listed gate.
- **No** gate disabled/bypassed.
- Adds `app/api/**` and `app/actions/**` directories (first in the repo) — standard Next.js 16 App Router files; no build-config change.
- Typecheck + lint must stay clean (CLAUDE.md) — the schema shape change is the one place that could ripple; §12 sweep confirms no current consumer depends on the old `string[]` shape.

---

## 12. Identifier / Shape-Change Delta Sweep (MANDATORY)

The one breaking change is the `CertParseResult` shape (`skills: string[]` → a `z.preprocess` normalizer emitting `skills: object[]` + derived top-level `confidence`). Sweep for every consumer of the old shape:

| Consumer found | File:line | Impact | Action |
|---|---|---|---|
| `CertParseResult` import | `src/schemas/index.ts:2` | re-export only | none (no shape coupling) |
| `CertParseResult` usage in product code | Grep `CertParseResult` across `lib/`, `app/`, `src/` | **none today** (SKILL-1 created the slot but no caller) | safe to change |
| `CertLike` ad-hoc schema in foundation test | `tests/foundation/wrapper-gate.test.ts:29-32,46` | a *local* `z.object({skill,confidence})` standing in — **not** the real schema; does not import `CertParseResult`; validates a flat `{skill,confidence}` payload (which the new normalizer's case (C) also accepts) | none (independent — unaffected) |
| `parse-certificate` prompt callers | Grep `parse-certificate` | only the registry (`src/prompts/system.ts:26`) + the (to-be) core; variable is `text` (`src/prompts/parse-certificate.ts:7`) | none beyond the EXTEND |
| AC test payloads through the schema | `cert-parsing.test.ts:30-36` (flat object), `:57-60` (top-level array) | the normalizer's cases (C) and (A) accept exactly these; `parsed.skills[0]` is an object (`:46,67`) | the normalizer is *derived from* these payloads (TADR-S2-01 v2) |

**Conclusion:** the shape change has no existing product consumer; the only readers are (a) the independent local `CertLike` (unaffected) and (b) the authored AC test payloads, from which the normalizer is derived. No hidden breakage. (TADR-S2-01 v2 records the deviation from SKILL-1's literal shape and from Page 02 §2.5.)

---

## 13. Testing Strategy (≥80% coverage)

- **Framework:** Vitest (node env), per-run disposable seeded SQLite, `@/` alias — all from SKILL-1; no harness change.
- **Boundary doubles:** inject `makeClaudeClientSpy` (structured), `makeClaudeClientGarbled` (invalid JSON), `makeClaudeClientThatThrows` (sdk fail / de-dupe-advisor fail) from `tests/setup/test-helpers.ts`. Tests assert `createMessage` call counts (BR-09 boundary proof).
- **Coverage of the 5 ACs:** AC-01 (S2-P3-01), AC-02 (S2-P3-02), AC-03 (S2-P3-03), AC-22 (S2-P3-04 promotion), AC-23 (S2-P3-05 idempotency). Plus the §8 majority-parse metric (S2-P3-06).
- **No RBAC × flag × resource matrix needed** here — the only auth dimension is own-profile ownership via the **caller-identity seam** on the confirm action. Positive: caller == upload owner (`p-001`) writes. Negative: caller ≠ upload owner is **denied (no write)** — asserted at the action/core layer (the seam returns a non-owner caller; the action rejects), with **no real session required** (F-06: session/`cookies()`/AC-24 deferred to the auth story). Cross-role scoping is a later surface.
- **Evidence:** capture `pnpm test tests/cert-parsing.test.ts` output for the PR (CLAUDE.md "show evidence").
- **Estimated coverage of new lines:** core + transport are fully exercised by the suite; ≥80% line coverage of `lib/cert/*` and the schema/prompt; the Route Handler's HTTP plumbing is partially covered (FormData path) — acceptable for demo scope, the core logic it delegates to is fully covered.

---

## 14. File Checklist

| File | Action | Sub-task | Cross-PR overlap | Notes |
|---|---|---|---|---|
| `src/schemas/CertParseResult.ts` | EXTEND | 1 | none (no open PRs; siblings in Backlog per dep-report §Merge Conflict Risk) | `z.preprocess` normalizer: flat-object \| array \| envelope (TADR-S2-01 v2) |
| `src/prompts/parse-certificate.ts` | EXTEND | 1 | none | multi-skill envelope JSON instruction; `text` variable |
| `lib/hash.ts` | NEW | 1 | none | sha256 hex |
| `lib/cert/config.ts` | NEW | 1 | none | `CONFIDENCE_THRESHOLD` |
| `lib/cert/parse-certificate.ts` | NEW | 1+2 | none | core: `parseCertificate`, `confirmAndWriteSkill`, `confirmCertExtraction` |
| `app/api/uploads/certificate/route.ts` | NEW | 1 | none | multipart Route Handler |
| `app/actions/cert.ts` | NEW | 2 | none | `confirmCertExtraction` Server Action (thin) + `getCallerEmployeeId()` caller-identity seam (`TODO(auth-story)`, F-06) |
| `.env.example` | EXTEND | 1 | none | `CERT_CONFIDENCE_THRESHOLD` placeholder |
| `tests/cert-parsing.test.ts` | NEW | 3 | none | SUB-TASK-3 suite; mirrors authored payloads EXACTLY + carries §2.4 fixture setup (`p-001`/`cat-*` + in-progress `Enrollment`) |

> Cross-PR overlap: dependency report (§Merge Conflict Risk) confirms **zero** in-flight Jiras touching these files; all siblings (SKILL-3..6) are Backlog. `gh pr list` not run (local-only run, `local_only:true`); risk LOW per dep-report.

**Counts (must agree across artifacts):** phases = **4** (Phase 0 + 3 build phases) · test scenarios = **20** (P0:2, P1:6, P2:6, P3:6 — see test-scenarios.json) · new files = **6** · modified files = **3** · tactical ADRs = **2**.

---

## 15. Risk Mitigation

| Risk | Mitigation (in this plan) |
|---|---|
| Claude returns invalid/garbled JSON | `callClaude` Zod gate (reused) ⇒ `Failure` ⇒ spec'd message, no write (Phase 1). Tested S2-P1-03. |
| Duplicate skill row breaks the loop | All writes via `upsertAndPromoteSkill` keyed by `(employeeId, canonicalSkillId)` (reused). Tested S2-P2-03 (same row id, no dup). |
| De-dupe advisor failure blocks the P0 write (TS-002) | `resolveCanonicalSkill` already falls back to create-new + `markReconcilePending`; the core never gates the write on the advisor. Tested S2-P2-05. |
| file→base64 SDK plumbing awkward (BR-09) | Default client stays `defaultClientThrows` (returns Failure); tests inject doubles; live wiring deferred without faking data. |
| Thin fixture variety weakens AC-02 | `multi-skill-bootcamp.pdf` exists; the multi-skill test scripts a 2-skill response incl. a null-date/level entry. |
| Seed has no Enrollment for "in-progress → done" | Tests create the in-progress `Enrollment` they assert on (documented Phase 3 constraint). |
| Schema shape change ripples | §12 sweep confirms no existing product consumer. |
| Next.js 16 drift (`request.formData()`, Route Handler signature) | Plan prescribes `request.formData()`, Route Handler `POST(request: Request)` per `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. `cookies()`/session deferred to the auth story (F-06) — no session API used in SKILL-2. |
| Authored test ids not seeded (F-04) | Test setup creates `p-001`/`cat-*` + in-progress `Enrollment` explicitly (§2.4); promotion scenario uses the seeded `synthetic-handle-001` cuid. |
| Schema can't validate the binding payloads (iteration-1 defect, F-01/F-02) | `CertParseResult` is a `z.preprocess` normalizer accepting the flat-object (AC-01) and top-level-array (AC-02) shapes and deriving a top-level `confidence` for the gate (TADR-S2-01 v2). |

---

## 16. Standards Compliance

- **tech-stack / architecture-patterns:** single Next.js 16 app, RSC; mutations = Server Actions, uploads = Route Handlers (ADR-004/006). ✔
- **DIP/SRP/ISP:** the core orchestrates and delegates intelligence to `lib/ai`, writes to `lib/repos`; the transport files carry only transport + auth (SRP). No domain file references infrastructure types directly (the repo layer is the persistence edge). ✔
- **Data & concurrency:** no read-then-write race on writes — `upsertAndPromoteSkill` uses a unique-key upsert; `Certificate` create catches the unique-violation race and re-reads the winner (no lock). No hard deletes. ✔
- **Config/constants:** `CONFIDENCE_THRESHOLD` externalized (env); model ids from `route()` (env); the failure message is a named constant. ✔
- **Performance:** no per-iteration external calls in loops beyond the unavoidable per-confirmed-skill `resolveCanonicalSkill` (bounded, ≤ a handful per cert); parsing is one Claude call per upload. ✔
- **Security:** own-profile authz derived server-side via the caller-identity seam (deny cross-profile by default); no client-sent `employeeId`/`profileId` trusted; secrets from env; no PII logged (the wrapper logs only ids/outcomes). Full session auth (cookies/`proxy.ts`/AC-24) is deferred to the auth story — explicitly out of SKILL-2 scope (F-06). ✔
- **api.md:** request/response shapes match Page 02 §3.1/§3.2 contracts (§4 inventory). ✔

---

## 17. Validation Checklist (internal)

- [x] All 5 ACs have phases + test scenarios (§6, §8, §13).
- [x] Every phase has GOAL/CONSTRAINTS/FORMAT/FAILURE CONDITIONS/TEST SCENARIOS.
- [x] Phase 0 baseline defined against the real harness.
- [x] Every BR mapped to a code path (§7); none uncovered; none conflicts an AC.
- [x] Reuse decisions made with evidence (§2, §3); BUILD-NEW justified per file.
- [x] Spec Contracts Inventory verbatim (§4); one `MISSING_IN_ARCH` reconciled (TADR-S2-02), not P0.
- [x] Wiring Trace for every new identifier (§5).
- [x] LOC within budget (§9).
- [x] Delta sweep for the schema shape change (§12) — no hidden breakage.
- [x] No P0 gaps. Two deviations → tactical ADRs (TADR-S2-01 v2 re-derived from the binding payloads; TADR-S2-02 amended), both non-blocking and presented for confirmation.
- [x] Iteration-2 reviewer findings resolved: F-01 (schema re-derived as a `z.preprocess` normalizer validating flat-object + array — TADR-S2-01 v2, §2.3/§4); F-02 (multi-skill confidence = derived top-level `min(per-skill)` — §4 gate row, §6, §7); F-03 (test-scenarios mirror the authored payloads exactly — §8 Phase 3, test-scenarios.json); F-04 (authored `p-001`/`cat-*` ids + in-progress `Enrollment` created in test setup — §2.4, §8 Phase 3); F-05 (§2.5 divergence recorded honestly — §4, TADR-S2-01 v2 Divergence A); F-06 (auth scoped to caller-identity seam; cookies/`proxy.ts`/AC-24 deferred — §4, Phase 1/2 CONSTRAINTS, TADR-S2-02); F-07 (`file → text` prompt-variable plumbing pinned, BR-09 no-fabrication — §5, Phase 1 FORMAT).
- [x] No pipeline gate disabled (§11).

**P1 notes (should-fix, not blocking):** (a) live SDK client remains stubbed — intentional per the BR-09 guardrail; (b) Route Handler HTTP-edge lines are partially covered — acceptable at demo scope.
**P2/P3 (documented follow-up):** `reconcilePending` is in-memory in SKILL-1 (`lib/repos/skill.ts:34`); a persisted reconcile pass is deferred (Page 03 §3.4 OPEN-ITEM) — out of SKILL-2 scope.

---

**Generated by:** nulogic-implementation-planner · **Version:** 2.2 · **Iteration:** 2 (revision — F-01..F-07 resolved) · **Built from:** prd v1 (via STORY), target_state_architecture v1, acceptance-tests v1
