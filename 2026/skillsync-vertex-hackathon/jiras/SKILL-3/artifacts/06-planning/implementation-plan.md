# Implementation Plan — SKILL-3: Staffing Matcher (availability-aware ranked shortlist)

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 06-implementation-planning · **Iteration:** 3
**Repo:** `ai-nu-skillsync` · **Branch:** `feature/SKILL-3-staffing-matcher`
**Author:** nulogic-implementation-planner · **Date:** 2026-06-08
**Upstream built_from:** PRD v1, target-state-architecture v1, acceptance-tests v1, dependency-report (2026-06-08)
**Branding:** NULogic · **Data:** Synthetic only — no real PII.

> **Iteration-3 revision note.** The clean-slate reviewer confirmed all six iteration-2 findings RESOLVED, then raised two new findings — both re-verified against the actual repo and resolved here:
> - **F-01 (CRITICAL)** — model-output shape vs `MatchResult`. `callClaude` runs `schema.safeParse(raw)` INTERNALLY (`lib/ai/claude.ts:132`) BEFORE the core maps `results→shortlist`. The authored test scripts the Claude double with a **bare array** (AC-04 `staffing-matcher.test.ts:66-87`, AC-05 `:127-136`) and a **`shortlist`-keyed object** (AC-21 `:152-158`); `makeClaudeClientSpy` (`test-helpers.ts:27-32`) JSON.stringifies them verbatim, so a plain `z.object({results:[…]})` would reject them and AC-04/05/21 could never go GREEN. FIX: `MatchResult` is now a `z.preprocess(coerceModelShape, z.object({…}))` that canonicalizes `array | {shortlist,…} | {results,…}` → `{results,…}` BEFORE object validation (entry-level validation incl. `matchPercent 0..100` UNCHANGED; BR-09 intact). New **TACTICAL-ADR-S3-05**. Updated §2.5, Phase 1 (S3-P1-01), Phase 3 (S3-P3-*), Wiring Trace, SUB-TASK-3 presumption.
> - **F-02 (LOW)** — internal LOC drift (§1 said ~378, §8/output said 385 for the same 8 files). Reconciled to a single number (**~392** — the prior 385 plus the ~7-LOC `coerceModelShape` preprocess added for F-01) propagated throughout (§1, §8, output JSON, this banner).
>
> **Iteration-2 revision note (retained — all six RESOLVED).** Revised to resolve six implementation-reviewer findings, each re-verified against the actual repo:
> - **F-01** — the authored test imports `loadModule` + `SYNTHETIC_PROFILES` from `./setup/test-helpers`, which the repo file does NOT export (only the three `makeClaudeClient*` doubles). `tests/setup/test-helpers.ts` is now a **MODIFY** (add `loadModule` + `SYNTHETIC_PROFILES`). The SKILL-2 cert test used a *local* `loadCertModule()` + `@/tests/setup/...` alias, so "adapt like SKILL-2" did NOT close this gap.
> - **F-02** — reconciled the canonical **core input record** so the authored test's profile shape (`{id,handle,currentProject,allocationPct,freeFrom,skills:[{canonicalSkillId,name,level}]}`) and `buildMatchDataset`'s output (`{profileId,seniority,timezone,allocation,freeFrom,skills:[{name,trustState}]}`) both map onto it without dropping `trustState`/seniority/timezone (TACTICAL-ADR-S3-04).
> - **F-03** — the **ranking-rules system prompt + dataset** are passed via `cacheableContext` (the cached `system` breakpoint, `claude.ts:118`); only the per-request query is in the rendered user turn — matching arch §2.3. The earlier plan wrongly put ranking rules in the template (uncached user turn).
> - **F-04** — `HR` is not a role token (`schema.prisma:15` = `ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE`). HR responsibilities map to **MANAGER/ADMIN**. All `MANAGER|HR|ADMIN` references corrected.
> - **F-05** — AC-24 stale-session redirect is **out-of-scope (deferred to SKILL-6**, where real auth lands); the only current seam is hardcoded `getCallerEmployeeId() → "p-001"`.
> - **F-06** — Phase 0 relabeled (authored-test adaptation + clearly-marked **additive** scenarios); `tests/setup/test-helpers.ts` added to the File Checklist + `files_modified`; LOC updated.

> **Persona note (Solution Architect).** This story's dominant structural risk is a **set of seams between the authored acceptance test and the arch/sub-task design** — and getting every one of them right BEFORE any code is written:
> 1. **Call signature** — test drives `runStaffingSearch({query,profiles,claude})` (pure, injected); sub-tasks describe `runMatch(queryText,session)` (session-driven). Reconciled via a pure core + route-side composition (TACTICAL-ADR-S3-01).
> 2. **Result shape** — test asserts `rank`/`inRequestedWindow` that §2.5 omits (TACTICAL-ADR-S3-02). **Output ENCODING** — the test scripts the Claude double with a bare array (AC-04/05) and a `shortlist`-keyed object (AC-21); since `callClaude` validates `raw` internally (`claude.ts:132`), `MatchResult` must `z.preprocess`-coerce these into `{results,…}` before object validation, or the binding test cannot go GREEN (TACTICAL-ADR-S3-05, F-01).
> 3. **Profile RECORD shape** (F-02) — the test injects `{id,handle,currentProject,allocationPct,freeFrom,skills:[{canonicalSkillId,name,level}]}` while `buildMatchDataset` emits `{profileId,seniority,timezone,allocation,freeFrom,skills:[{name,trustState}]}`. Both must map onto one **canonical core input record** without dropping trust/seniority/timezone (TACTICAL-ADR-S3-04).
> 4. **Test-helper imports** (F-01) — the authored test imports `loadModule` + `SYNTHETIC_PROFILES` that the repo helper file does NOT export; the binding RED suite cannot import until `tests/setup/test-helpers.ts` is extended.
> 5. **Cache breakpoint** (F-03) — `callClaude` caches the `system` arg only; ranking rules + dataset must go in `cacheableContext`, query stays in the user turn.
>
> The acceptance test is the contract the test-creator turns GREEN and the code-writer must satisfy; the sub-tasks describe the arch-aligned wiring around it. The plan **reconciles every seam** (TACTICAL-ADR-S3-01/02/03/04/05) rather than picking one side. Get these contracts right up front and the rest is mechanical.

---

## 1. Executive Summary

SKILL-3 adds the **Staffing Matcher**: a plain-English staffing query → a deterministic, role-scoped profile dataset → an **Opus** Claude call (**ranking-rules system prompt + serialized dataset** marked cacheable via `cacheableContext`, the per-request query alone in the rendered user turn) → a Zod-validated `MatchResult` → four response branches (happy ranked shortlist, hard-match closest+ramp-up, partial-quantity + shortfall note, graceful failure). It is **hero risk #2** and the read half of the SKILL-4 loop.

**What we build (NEW files, reusing the SKILL-1 Claude boundary unchanged):**
- `lib/match/run-staffing-search.ts` — the **functional core** the authored acceptance test drives (`runStaffingSearch({ query, profiles, claude })`). Normalizes the injected `profiles` to the **canonical core record** (TACTICAL-ADR-S3-04), serializes deterministically, builds the cacheable context (ranking-rules system prompt + dataset), routes through `callClaude` (Opus) → `MatchResult` → typed `{ ok:true, shortlist, shortfallNote? } | { ok:false, userMessage }`.
- `lib/match/dataset.ts` — `buildMatchDataset(session)`: role-scoped (BR-03), deterministic, stably-ordered projection of in-scope profiles to the **canonical core record**; `serializeDataset()` for byte-identical cache reuse.
- `lib/match/config.ts` — the `MATCH_UNAVAILABLE_MESSAGE` constant (the AC-06 retry string) and the `RANKING_RULES_PROMPT` stable system text that goes in the cacheable breakpoint.
- `app/api/match/route.ts` — the **read-only** `POST /api/match` thin transport (TS-003 / ADR-006): re-derive role server-side (MANAGER/ADMIN → org; PRACTICE_LEAD → team; EMPLOYEE → denied), build scoped dataset, delegate to the core, return JSON. No DB writes.
- `src/schemas/MatchResult.ts` — **REWRITE** the SKILL-1 stub (`{matches:[{handle,score}]}`) to the Page-02 §2.5 + acceptance-test shape (`requested?`, `results[]{profileId,matchPercent,matchedSkills,gaps,availability,rationale,rank?,inRequestedWindow?}`, `shortfallNote?`), wrapped in a `z.preprocess(coerceModelShape, …)` that canonicalizes the model's equivalent output encodings (`bare array | {shortlist,…} | {results,…}`) into `{results,…}` BEFORE the object validation — because `callClaude` runs `schema.safeParse(raw)` internally (`claude.ts:132`) on the raw model JSON, and the authored test scripts a bare array (AC-04/05) and a `shortlist`-keyed object (AC-21). Entry-level validation (`matchPercent 0..100`, required fields) is unchanged (F-01 / TACTICAL-ADR-S3-05).
- `src/prompts/match-staffing.ts` — **EXTEND** the SKILL-1 stub to render **only the per-request `queryText`** into the user turn (the ranking rules + dataset live in the cacheable `system` context, NOT the template — F-03 / §2.3).
- `tests/setup/test-helpers.ts` — **MODIFY** (F-01): add `loadModule<T>(specifier)` (the dynamic-import RED helper the authored test imports) and a shared `SYNTHETIC_PROFILES` fixture in the **authored test's profile record shape**. The repo file currently exports ONLY `makeClaudeClientSpy/Garbled/ThatThrows`; the authored test imports `loadModule` + `SYNTHETIC_PROFILES` too, so the suite cannot even import without this change.
- `tests/staffing-matcher.test.ts` — adapt the authored acceptance test into the repo `tests/` harness, plus the role-scope + Opus-routing + determinism + additive garbled-JSON assertions the sub-tasks require (clearly marked additive — F-06).

**What we reuse unchanged:** `callClaude` (`lib/ai/claude.ts`), `route()` Opus routing (`lib/ai/route.ts`), `renderPrompt`/registry (`src/prompts/system.ts`), the three injected-client doubles already in `tests/setup/test-helpers.ts` (the file is reused-and-extended, not rewritten), the Vitest harness (`vitest.config.ts`), Prisma client (`lib/repos/db.ts`), trust-state ordering (`lib/domain/trust-state.ts`).

**LOC envelope:** ~392 LOC across 8 files (the STORY ~360 estimate + the iteration-2 test-helper/normalizer/constant additions ~25 + the iteration-3 `coerceModelShape` preprocess ~7). See §8.

---

## 2. Spec Contracts Inventory (verbatim from target-state arch + authored test)

> Every externally-visible identifier the plan touches. Source cited. Where the authored acceptance test and Page-02 differ, BOTH are recorded and reconciled in §3 / the tactical ADRs.

### 2.1 Transport contract — `POST /api/match` (Page 02 §3.2a / TS-003 / ADR-006)
| Field | Value | Source |
|---|---|---|
| Path | `/api/match` | Page 02 §3.2a |
| Method | **POST** (read-only; query in body) | Page 02 §3.2a (POST-as-read rationale) |
| Module | Matching | Page 02 §1.2, §3.2a |
| Auth scope | **MANAGER / ADMIN = org** (HR responsibilities map to these roles — there is no `HR` token); PRACTICE_LEAD = team; **EMPLOYEE denied** | Page 02 §3.2a, BR-03, AC-11, `schema.prisma:15` |
| Request body | `{ queryText: string }` | Page 02 §3.2a, SUB-TASK-2 |
| Response | `MatchResult` \| `{ error }` \| redirect/denied | Page 02 §3.2a, SUB-TASK-2 |
| Side effects | **None — no DB writes** | Page 02 §3.2a (TS-003), SUB-TASK-2 FC#4 |

### 2.2 Functional-core contract — `runStaffingSearch` (authored acceptance test — AUTHORITATIVE)
| Field | Value | Source |
|---|---|---|
| Module path | `@/lib/match/run-staffing-search` | `staffing-matcher.test.ts:88,137,159,174` |
| Signature | `runStaffingSearch({ query: string, profiles: unknown[], claude: unknown }) => Promise<Result>` | `staffing-matcher.test.ts:18-26` |
| Success | `{ ok: true; shortlist: Array<Record<string,unknown>>; shortfallNote?: string }` | `staffing-matcher.test.ts:23-25` |
| Failure | `{ ok: false; userMessage: string }` | `staffing-matcher.test.ts:25,177-179` |
| Failure message | `"Search is temporarily unavailable — please retry."` (exact) | `staffing-matcher.test.ts:177-179`, AC-06, STORY Scenario D |
| Claude assertion | `claude.createMessage` called exactly once | `staffing-matcher.test.ts:94` |

### 2.3 Service contract — `runMatch` (SUB-TASK-2, arch wiring)
| Field | Value | Source |
|---|---|---|
| Signature | `runMatch(queryText, session) => MatchResult | Failure` | SUB-TASK-2 Data Models |
| Composition | `buildMatchDataset(session)` → `callClaude(match-staffing, …)` | SUB-TASK-2 pseudocode |
| **Reconciliation** | `runMatch` is the **route-side composition**; it builds the scoped dataset then delegates to the SAME core as the test (`runStaffingSearch`). See TACTICAL-ADR-S3-01. | this plan |

### 2.4 Dataset builder contract (SUB-TASK-1 / Page 02 §4.2)
| Field | Value | Source |
|---|---|---|
| Function | `buildMatchDataset(session)` | SUB-TASK-1 |
| Scope rule | **MANAGER\|ADMIN → org**; PRACTICE_LEAD → `employees where leadId == caller.id`; EMPLOYEE → **Denied** marker | SUB-TASK-1 step 1, BR-03, `schema.prisma:15` |
| Output | `CoreProfileRecord[]` (the canonical record §2.4a) — NOT a separate ad-hoc shape | this plan (TACTICAL-ADR-S3-04) |
| Ordering | stable by `profileId`, skills by canonical name (byte-identical serialization) | SUB-TASK-1 step 1, Page 02 §2.3 |
| Prisma reads | `Employee(role, leadId, seniority, timezone, allocation, freeFrom)`, `EmployeeSkill(trustState)` ⋈ `Skill.name`. **No writes.** | SUB-TASK-1 Data Models |

### 2.4a Canonical core input record — `CoreProfileRecord` (F-02 reconciliation, TACTICAL-ADR-S3-04)
> The functional core (`runStaffingSearch`) is fed by TWO producers with DIFFERENT shapes: the **authored test** (injected literal profiles) and **`buildMatchDataset`** (the route's DB projection). Both MUST normalize to ONE canonical record the core serializes, so the trust-weighted, `profileId`-keyed dataset that §2.5 + Page-03 §3 require is presented on BOTH paths. The core owns a `toCoreRecord(raw)` normalizer that accepts either producer's shape.

```text
CoreProfileRecord {
  profileId: string        // test `id` → profileId ; dataset `profileId` (1:1)
  seniority: string|null   // dataset has it ; test omits → null (model tolerates absence)
  timezone:  string|null   // dataset has it ; test omits → null
  allocation: number       // test `allocationPct` → allocation ; dataset `allocation` (same int 0..100)
  freeFrom:  string|null    // both supply ISO date string
  skills: [{
    name: string           // both supply
    trustState: string|null // dataset supplies VERIFIED|MANAGER_APPROVED|SELF_REPORTED ;
                            //   test supplies `level` only → trustState null (un-trust-weighted candidate)
  }]
}
```
| Field | Test profile key | Dataset key | Mapping rule |
|---|---|---|---|
| `profileId` | `id` | `profileId` | rename `id`→`profileId` on the test path |
| `allocation` | `allocationPct` | `allocation` | rename `allocationPct`→`allocation` (same 0..100 int) |
| `freeFrom` | `freeFrom` (ISO) | `freeFrom` (ISO) | pass through |
| `seniority` | *(absent)* | `seniority` | dataset carries; test path → `null` |
| `timezone` | *(absent)* | `timezone` | dataset carries; test path → `null` |
| `skills[].name` | `skills[].name` | `skills[].name` | pass through |
| `skills[].trustState` | *(absent — only `level`)* | `skills[].trustState` | dataset carries trust for Page-03 §3 weighting; test path → `null` |
| *(dropped)* | `handle`, `currentProject`, `canonicalSkillId`, `level` | — | not part of the ranking surface; intentionally NOT serialized (PII-safe; `handle`/`currentProject` excluded) |

> The route path (real run) ALWAYS carries `trustState`/seniority/timezone (from `buildMatchDataset`), so the trust-weighted ranking §2.3 + Page-03 §3 require is fully present in production. The test path omits them only to prove the *availability* differentiator in isolation (BR-04) — the core normalizes both without dropping a producer's fields.

### 2.5 `MatchResult` Zod schema (Page 02 §2.5 + authored test fields + F-01 output-shape normalization)
```text
MatchResult = z.preprocess(coerceModelShape, z.object({              // F-01 — see below
  requested?: { count?: int, summary: string }          // Page 02 §2.5
  results: [{
    profileId: string,                                   // §2.5
    matchPercent: number (0..100),                       // §2.5  (entry-level validation UNCHANGED)
    matchedSkills: string[],                             // §2.5
    gaps: string[],                                      // §2.5
    availability: string,                                // §2.5  e.g. "free now"
    rationale: string,                                   // §2.5  one line
    rank?: number,                                       // authored test:80,98 (ordering proof)
    inRequestedWindow?: boolean                          // authored test:84,118,120 (availability proof)
  }]
  shortfallNote?: string                                 // §2.5  "2 of 3 requested qualify" (AC-21)
}))

// coerceModelShape(raw): canonicalize the model's equivalent encodings BEFORE object validation.
//   - bare ARRAY              -> { results: <array> }                 // authored test:66-87 (AC-04), 127-136 (AC-05)
//   - object with `shortlist` -> { results: <shortlist>, …rest }      // authored test:152-158 (AC-21)
//   - object with `results`   -> pass through unchanged                // Page-02 §2.5 canonical
//   - anything else           -> pass through (object validation then fails -> typed parse Failure)
// The inner z.object() (matchPercent 0..100, required entry fields, etc.) runs AFTER coercion — entry-level validation is NOT weakened.
```
> **F-01 (output-shape normalization — CRITICAL).** `callClaude` runs `schema.safeParse(raw)` INTERNALLY (`lib/ai/claude.ts:132`) on the JSON the injected client emits, BEFORE the core ever maps `results → shortlist`. The authored acceptance test scripts the Claude double with THREE real model encodings: a **bare array** (AC-04 `staffing-matcher.test.ts:66-87`, AC-05 `:127-136`) and an object keyed **`shortlist`** (AC-21 `:152-158`) — `makeClaudeClientSpy` (`test-helpers.ts:27-32`) JSON.stringifies the scripted arg verbatim, so `raw` is exactly that shape. A plain `z.object({ results:[…] })` would REJECT the bare array AND the `{shortlist}` object → `callClaude` returns `{ok:false}` → AC-04/05/21 (which assert `res.ok===true` and read `res.shortlist`) could not turn GREEN. Because validation is internal to `callClaude` (the schema we pass IS what runs against `raw`), the normalization MUST live in the schema: a `z.preprocess(coerceModelShape, …)` that wraps a bare array as `{results}`, renames a top-level `shortlist`→`results`, and passes `{results}` through, THEN validates the inner object. Recorded as **TACTICAL-ADR-S3-05** (additive coercion of the model's equivalent encodings — entry-level validation, incl. `matchPercent 0..100`, is unchanged; BR-09 stays intact: this is real Zod validation, just tolerant of equivalent encodings, NOT a fake/bypass).
> `rank` and `inRequestedWindow` are **OPTIONAL additions** the authored test asserts to prove ordering is driven by availability, not skills. Page-02 §2.5 is silent on them — recorded as TACTICAL-ADR-S3-02 (schema superset, not MISSING_IN_ARCH escalation: the additions are additive/optional and the test is the binding contract). The core maps the validated `results[]` to the test's `shortlist` field name (TACTICAL-ADR-S3-01).

### 2.6 Model routing + caching (Page 02 §2.2/§2.3 / BR-12 / ADR-003)
| Item | Value | Source |
|---|---|---|
| `match-staffing` complexity | `"hard"` → **Opus** (`route("hard")` → `CLAUDE_MODEL_HARD ?? "claude-opus-4-1"`) | `lib/ai/route.ts:14-18`, Page 02 §2.2, BR-12 |
| Cacheable context (`cacheableContext` → `system` arg) | **stable ranking-rules system prompt (`RANKING_RULES_PROMPT`) + serialized dataset**, concatenated into ONE string. `callClaude` wires this string to `system` (`claude.ts:118`) — the cached breakpoint. This is the **whole** stable context: §2.3 caches the ranking-rules system prompt AND the dataset, not the dataset alone. | Page 02 §2.3, `lib/ai/claude.ts:55-57,110,118` |
| Query placement | per-request `queryText` is the ONLY content in the rendered `messages` user turn (`renderPrompt("match-staffing", { queryText })`), OUTSIDE the cacheable `system` context | Page 02 §2.3, `lib/ai/claude.ts:117-120` |
| **F-03 note** | `callClaude` never passes the global `SYSTEM_PROMPT` constant (`system.ts:17`); it passes ONLY `cacheableContext` as `system` (`claude.ts:118`). The earlier plan put ranking rules in the `match-staffing` template → they would land in the UNCACHED user turn. Fixed: ranking rules move into `RANKING_RULES_PROMPT` (in the cacheable context), template renders query only. | `claude.ts:117-120`, `system.ts:17` |
| Determinism | dataset serialization stable-ordered → byte-identical across the loop's before/after | Page 02 §2.3, SUB-TASK-1 FC#3 |

### 2.7 Config / constants
| Key | Value / default | Type | Source |
|---|---|---|---|
| `MATCH_UNAVAILABLE_MESSAGE` | `"Search is temporarily unavailable — please retry."` | named constant (not inline) | AC-06, authored test:177-179 |
| `RANKING_RULES_PROMPT` | stable ranking-rules system text (availability-over-skills, trust weighting, §2.5 output contract) — goes in the cacheable `system` context, NOT the per-request user turn (F-03) | named constant | Page 02 §2.3, BR-04, Page 03 §3 |
| `REQUESTED_WINDOW_*` | none — **availability windows are interpreted by the model, NOT computed in code** (BR-04/BR-09) | n/a | BR-04, BR-09, SUB-TASK-1 FC#5 |
| `CLAUDE_MODEL_HARD` | `claude-opus-4-1` (env-overridable; never hardcoded in business logic) | env | `lib/ai/route.ts:12,16` |

---

## 3. Reuse Strategy (per-file decision — MANDATORY gate table)

| Candidate file | Decision | Evidence / closest analog | Creates new file? |
|---|---|---|---|
| `lib/ai/claude.ts` (`callClaude`) | **IMPORT** | `lib/ai/claude.ts:109` — the single Claude boundary; injected-client contract already supports `complexity:"hard"` + `cacheableContext`. No change. | No |
| `lib/ai/route.ts` (`route`) | **IMPORT** | `lib/ai/route.ts:14` — `route("hard")` already returns Opus from env. No change. | No |
| `src/prompts/system.ts` (`renderPrompt`, registry) | **IMPORT** | `system.ts:26-42` — `match-staffing` already registered; renderer unchanged. | No |
| `tests/setup/test-helpers.ts` (spies + `loadModule` + `SYNTHETIC_PROFILES`) | **EXTEND** (F-01) | `test-helpers.ts:27-48` — the three `makeClaudeClient*` doubles already exist and are reused unchanged. BUT the authored test ALSO imports `loadModule` + `SYNTHETIC_PROFILES` from `./setup/test-helpers` (`staffing-matcher.test.ts:10-15`) and the file exports NEITHER → the suite cannot import. Add `loadModule<T>(specifier)` (dynamic-import RED helper) + a shared `SYNTHETIC_PROFILES` fixture in the authored profile-record shape. Same file, additive exports. | No (modifies existing) |
| `lib/repos/db.ts` (`prisma`) | **IMPORT** | used by `lib/cert/parse-certificate.ts:24`. Dataset builder reads via this client. | No |
| `lib/domain/trust-state.ts` (`order`) | **IMPORT** | `trust-state.ts:33` — for any in-dataset trust ordering; the prompt does the weighting, code only orders deterministically. | No |
| `src/schemas/MatchResult.ts` | **EXTEND (rewrite body)** | `MatchResult.ts:4-13` is a SKILL-1 placeholder (`{matches:[{handle,score}]}`) that matches NEITHER Page-02 §2.5 NOR the authored test. Rewrite to §2.5+test shape. Same file, same export name. | No (modifies existing) |
| `src/prompts/match-staffing.ts` | **EXTEND** | `match-staffing.ts:4-11` is a SKILL-1 one-line stub taking `query`. Extend to `{ queryText, datasetJson }` + ranking-over-availability rules. Same file, same export. | No (modifies existing) |
| `lib/match/run-staffing-search.ts` | **BUILD-NEW** | Closest analog: `lib/cert/parse-certificate.ts:56` (functional core, injected `claude`, `{ok:true}|{ok:false,userMessage}` return). Reuse the *pattern*, not the file — cert parses+writes a single doc; matcher ranks N profiles read-only with a different result contract, and owns the `toCoreRecord` normalizer (§2.4a) + cacheable-context assembly. No file substantially overlaps. | **Yes** |
| `lib/match/dataset.ts` | **BUILD-NEW** | Closest analog: none — no role-scoped read projection exists. `lib/repos/skill.ts` is write-path. Searched `lib/repos/` + `lib/**` for a profile-read/projection module; none. | **Yes** |
| `lib/match/config.ts` | **BUILD-NEW** | Closest analog: `lib/cert/config.ts:7-11` (per-feature constants + user message). Same pattern, different feature constants. Thin (≤8 LOC) — justified to keep the AC-06 string out of business logic. | **Yes** |
| `app/api/match/route.ts` | **BUILD-NEW** | Closest analog: `app/api/uploads/certificate/route.ts:14` (thin Route Handler over a core). Reuse the *thin-transport pattern*; new route, new auth-scope/deny logic, read-only (no multipart). | **Yes** |
| `tests/staffing-matcher.test.ts` | **BUILD-NEW (adapt authored)** | Closest analog: `tests/cert-parsing.test.ts` (the SKILL-2 adaptation of an authored acceptance test into the repo harness). Adapt `artifacts/02-acceptance-tests/e2e-tests/staffing-matcher.test.ts` the same way. | **Yes** |

**Granularity check:** new files do not substantially duplicate existing modules — `run-staffing-search` is read-ranking (cert core is write-parse), `dataset.ts` is a read projection (no analog), `route.ts` is read-only deny-gated transport (cert route is multipart write). Reuse of `callClaude`/`route`/`renderPrompt` is at the boundary, satisfying BR-09/BR-12 architecturally. `tests/setup/test-helpers.ts` is EXTENDED (not duplicated) so the shared doubles + the new `loadModule`/`SYNTHETIC_PROFILES` live in one canonical helper file (consistent with the SKILL-1 single-source-of-truth comment, `test-helpers.ts:1-17`).

---

## 4. Phase Breakdown (test-driven)

### Phase 0 — Baseline (RED) tests + harness wiring + helper extension
- **GOAL:** Two coupled steps:
  1. **EXTEND `tests/setup/test-helpers.ts`** (F-01) so the authored suite can import its helpers. The authored test imports `{ loadModule, SYNTHETIC_PROFILES, makeClaudeClientSpy, makeClaudeClientThatThrows }` from `./setup/test-helpers` (`staffing-matcher.test.ts:10-15`); the repo file currently exports ONLY the three `makeClaudeClient*` doubles. Add `loadModule<T>(specifier): Promise<T>` (dynamic `import()` so the suite fails RED at runtime on the missing module, not at compile time) and `SYNTHETIC_PROFILES` (a small fixture array in the authored **profile record shape** `{ id, handle, currentProject, allocationPct, freeFrom, skills:[{canonicalSkillId,name,level}] }`, synthetic only). The three doubles are reused unchanged.
  2. **ADAPT the authored test** into `tests/staffing-matcher.test.ts` against the repo harness, confirming it FAILS RED at `loadModule("@/lib/match/run-staffing-search")` (meaningful RED). Wire `pnpm test tests/staffing-matcher.test.ts`.
- **NOTE on "adapt like SKILL-2":** the SKILL-2 cert suite used a *local* `loadCertModule()` + a `@ts-expect-error` static import via the `@/tests/setup/...` alias and did NOT use `loadModule`/`SYNTHETIC_PROFILES`. So the SKILL-2 precedent alone does NOT close this gap — the helper file MUST gain `loadModule` + `SYNTHETIC_PROFILES` (or the authored import line breaks). We add them to the shared helper rather than inline-localizing, keeping one canonical doubles file.
- **CONSTRAINTS:** Reuse the existing three doubles (no new double variants). Tests assert the **boundary + Zod + graceful failure + result relationships**, never keyword/date logic (intelligence-boundary rule, test-scenarios §intelligence_boundary_rule). No live Anthropic call. Synthetic profiles only (no real PII in `SYNTHETIC_PROFILES`).
- **FORMAT:** `tests/setup/test-helpers.ts` (additive exports `loadModule`, `SYNTHETIC_PROFILES`); `tests/staffing-matcher.test.ts` importing them + `@/lib/match/run-staffing-search` via `loadModule`.
- **FAILURE CONDITIONS:** the suite cannot import (`loadModule`/`SYNTHETIC_PROFILES` still missing — the F-01 regression); suite passes while the core module is absent (not a meaningful RED); a test asserts a hardcoded ranking instead of the boundary.
- **TEST SCENARIOS:** S3-P0-01 (helpers import resolves + suite fails RED on the missing core via `loadModule`).

### Phase 1 — Schema + prompt contract + ranking-rules constant (`MatchResult`, `match-staffing`, `RANKING_RULES_PROMPT`)
- **GOAL:** Rewrite `MatchResult` to the §2.5+test shape **wrapped in `z.preprocess(coerceModelShape, z.object({…}))`** (F-01) so the model's equivalent output encodings (`bare array | {shortlist,…} | {results,…}`) are canonicalized to `{results,…}` before object validation — required because `callClaude` runs `schema.safeParse(raw)` internally (`claude.ts:132`) on the raw model JSON and the authored test scripts a bare array + a `shortlist`-keyed object; extend `match-staffing` to render **only the per-request `queryText`** into the user turn; place the ranking-rules system text in `RANKING_RULES_PROMPT` (`lib/match/config.ts`) which the core concatenates with the serialized dataset into `cacheableContext` (F-03 / §2.3).
- **CONSTRAINTS:** `MatchResult.results[]` carries `profileId, matchPercent(0..100), matchedSkills[], gaps[], availability, rationale`; optional `rank`, `inRequestedWindow`; optional top-level `requested`, `shortfallNote`. `coerceModelShape` MUST: wrap a bare array as `{results:<array>}`; rename a top-level `shortlist` key to `results` (preserving `shortfallNote`/`requested`); pass a `{results}` object through unchanged; leave anything else to fail the inner object validation (→ typed `parse` Failure). The inner `z.object()` runs AFTER coercion — entry-level validation (`matchPercent 0..100`, required fields) is NOT weakened (BR-09 intact: real Zod, tolerant of equivalent encodings, no fake/bypass). `RANKING_RULES_PROMPT` MUST instruct availability reasoning (`allocation`+`freeFrom` → "free now"/"free in ~N weeks") and trust weighting (`VERIFIED > MANAGER_APPROVED > SELF_REPORTED`, Page 03 §3) and the §2.5 output contract — NO date arithmetic in code (BR-04/BR-09). The `match-staffing` template MUST NOT contain ranking rules or the dataset (those belong in the cacheable `system` context — `claude.ts:118`); it renders the query only. Model id from `route("hard")`, never hardcoded.
- **FORMAT:** `src/schemas/MatchResult.ts` (rewrite — `z.preprocess(coerceModelShape, z.object({…}))`), `src/prompts/match-staffing.ts` (extend — query-only user turn), `lib/match/config.ts` `RANKING_RULES_PROMPT`. Schema + prompt keep their export names + registry entry (`system.ts:29`).
- **FAILURE CONDITIONS:** schema accepts the old `{matches:[{handle,score}]}` shape; schema REJECTS a bare array or a `shortlist`-keyed object (the F-01 defect — AC-04/05/21 would never go GREEN); coercion weakens entry-level validation (e.g. lets `matchPercent` out of 0..100 through); ranking rules or dataset placed in the `match-staffing` template (uncached user turn — the F-03 defect); query inlined inside the cacheable context.
- **TEST SCENARIOS:** S3-P1-01 (MatchResult validates a `{results}` payload AND coerces a bare array + a `shortlist`-keyed object into the canonical shape, while rejecting the legacy `{matches}` shape and an entry-level-invalid payload), S3-P1-02 (the rendered user turn carries the query only; the ranking rules + serialized dataset are in the cacheable `system` context, NOT duplicated into the user turn).

### Phase 2 — Dataset builder (`lib/match/dataset.ts`)
- **GOAL:** `buildMatchDataset(session)` — role-scoped (BR-03), deterministic, producing `CoreProfileRecord[]` (§2.4a) stably-ordered; `serializeDataset()` byte-identical across runs; Employee → `Denied` marker; PL → team-only; empty PL team → empty dataset (not an error). Scope rule: **MANAGER/ADMIN → org; PRACTICE_LEAD → team; EMPLOYEE → Denied** (no `HR` token — F-04).
- **CONSTRAINTS:** Re-derive role from `session` server-side (never trust client) against the actual enum `ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE` (`schema.prisma:15`). Read-only Prisma. Output the canonical `CoreProfileRecord` (§2.4a) — MUST populate `trustState` (Page 03 §3), `seniority`, `timezone` from the DB (the production path is the trust-weighted one). Order by `profileId`, skills by canonical name. NO keyword/date filtering of candidates before the call (BR-09 — the model reasons over availability). NO read-then-write.
- **FORMAT:** `lib/match/dataset.ts` exporting `buildMatchDataset`, `serializeDataset`, and a `Denied` marker type; emits `CoreProfileRecord[]`.
- **FAILURE CONDITIONS:** PL dataset includes `leadId != caller.id` rows (BR-03/AC-11 violation); two identical inputs produce different serialized strings (cache/loop determinism broken); dataset omits `allocation`/`freeFrom`/`trustState`/`seniority`/`timezone` (BR-04 / Page-03 §3 violation); Employee receives a built dataset; scope rule references a non-existent `HR` token.
- **TEST SCENARIOS:** S3-P2-01 (PL scoped to team), S3-P2-02 (Employee → Denied), S3-P2-03 (determinism: same input → identical serialized string), S3-P2-04 (empty PL team → empty dataset, no throw).

### Phase 3 — Matching core (`lib/match/run-staffing-search.ts`) + branches
- **GOAL:** The authored-test core: `runStaffingSearch({ query, profiles, claude })` → `profiles.map(toCoreRecord)` (normalize either producer's shape to `CoreProfileRecord`, §2.4a) → `serializeDataset` → assemble `cacheableContext = RANKING_RULES_PROMPT + "\n\n" + datasetJson` → `callClaude({ promptName:"match-staffing", variables:{ queryText:query }, schema:MatchResult, complexity:"hard", cacheableContext, client:claude })`. `callClaude` runs `MatchResult.safeParse(raw)` INTERNALLY (`claude.ts:132`); the schema's `z.preprocess(coerceModelShape,…)` (F-01) canonicalizes the model's bare-array / `shortlist`-keyed / `results`-keyed encodings to `{results,…}` BEFORE the core ever sees the data, so on `Ok` the core ALWAYS receives validated `{results,…}` — it then maps `results→shortlist` (carry `shortfallNote`); on `Failure` return `{ ok:false, userMessage: MATCH_UNAVAILABLE_MESSAGE }`. Four branches: happy (AC-04), hard-match never-empty (AC-05), partial-quantity + shortfallNote (AC-21), failure (AC-06).
- **CONSTRAINTS:** Opus via `complexity:"hard"` (BR-12); **ranking rules + dataset** in `cacheableContext` (the cached `system` breakpoint — F-03/BR-12); `variables` carries the query ONLY (uncached user turn). `toCoreRecord` MUST NOT drop `trustState`/seniority/timezone when present (F-02). Never construct a partial/garbled ranking on failure (AC-06); never return an empty list for the hard-match path — surface closest people (AC-05); surface `shortfallNote` when fewer than requested qualify (AC-21). `callClaude` invoked **exactly once** per search (authored test:94). No date arithmetic / keyword ranking in code (BR-09).
- **FORMAT:** `lib/match/run-staffing-search.ts` exporting `runStaffingSearch` (+ `toCoreRecord`); `lib/match/config.ts` exporting `MATCH_UNAVAILABLE_MESSAGE` + `RANKING_RULES_PROMPT`.
- **FAILURE CONDITIONS:** failure path returns a partial/fabricated ranking (AC-06); hard-match returns empty (AC-05); partial-quantity drops shortfall silently (AC-21); the boundary rejects the test's bare-array (AC-04/05) or `shortlist`-keyed (AC-21) model output because the schema lacked the `coerceModelShape` preprocess → `res.ok===false` when the test expects `true` (the F-01 defect); ranking derived from code not the boundary (BR-09); >1 boundary call; ranking rules placed in the user turn instead of `cacheableContext` (F-03); `toCoreRecord` silently drops a producer's trust/seniority/timezone fields.
- **TEST SCENARIOS:** S3-P3-01 (AC-04 availability-driven ordering), S3-P3-02 (AC-05 closest+gaps, non-empty), S3-P3-03 (AC-21 shortfallNote + fewer results), S3-P3-04 (AC-06 throw → retry message, no results), **S3-P3-05 (AC-06 garbled JSON → retry message — ADDITIVE: not in the authored test; covers the second `callClaude` failure reason, `extract`/`parse`)**, S3-P3-06 (Opus routing + ranking-rules-and-dataset-in-cacheable-context assertion, BR-12).

### Phase 4 — Read-only transport (`app/api/match/route.ts`) + role gate
- **GOAL:** `POST /api/match` thin transport (TS-003/ADR-006): re-derive role server-side, deny Employee (BR-03/AC-11), build scoped dataset via `buildMatchDataset`, delegate to `runStaffingSearch`, return `MatchResult | { error } | denied`. No DB writes. Scope: **MANAGER/ADMIN → org; PRACTICE_LEAD → team; EMPLOYEE → denied** (no `HR` token — F-04).
- **CONSTRAINTS:** read-only — no mutation/Prisma write (TS-003); Employee denied before any dataset build or model call (BR-03/AC-11). The caller identity comes from the SKILL-2 caller-identity seam (`getCallerEmployeeId` is currently hardcoded → `"p-001"`). Inject the live Claude client at the edge with a `TODO` (cert-precedent `route.ts:30`) — never fake.
- **OUT OF SCOPE (F-05):** **AC-24 (stale-session → redirect) is DEFERRED to SKILL-6**, where real auth + `proxy.ts` land. SKILL-3 has no real session lifecycle — the only seam is the hardcoded `getCallerEmployeeId()`. AC-24 is therefore NOT claimed as in-scope for SKILL-3 and gets NO test here; it is tracked for SKILL-6. (It is removed from this story's AC-coverage claims.)
- **FORMAT:** `app/api/match/route.ts` `POST` handler.
- **FAILURE CONDITIONS:** handler performs a DB write (TS-003 violation); Employee receives results (BR-03/AC-11); business logic duplicated at the edge; scope references a non-existent `HR` token.
- **TEST SCENARIOS:** S3-P4-01 (Employee denied at the route — exercised via the dataset `Denied` marker path), S3-P4-02 (route returns the retry message shape on core failure). *(UI is deferred to SKILL-6; route behavior is asserted at the core + dataset level given no UI harness.)*

---

## 5. Wiring Trace (every new field/param/identifier → consumer)

| New/changed identifier | Producer | Consumer (file:line intent) |
|---|---|---|
| `MatchResult.results[].rank` | model output via `match-staffing` prompt | `tests/staffing-matcher.test.ts` ordering assertions (authored test:98,116-121) |
| `MatchResult.results[].inRequestedWindow` | model output | `tests/staffing-matcher.test.ts:118,120` (availability proof) |
| `MatchResult.shortfallNote` | model output | `lib/match/run-staffing-search.ts` (passes through to `shortlist` result); test:167 (`/2 of 3/`) |
| `MatchResult.requested` | model output | `lib/match/run-staffing-search.ts` (informational; partial-quantity context) |
| `coerceModelShape` (preprocess) | `src/schemas/MatchResult.ts` (NEW — wraps the object schema) | `callClaude` (`claude.ts:132` runs `MatchResult.safeParse(raw)`) — canonicalizes the model's bare-array (test:66-87,127-136) / `shortlist`-keyed (test:152-158) / `results`-keyed encodings to `{results,…}` before object validation (F-01) |
| `shortlist` (result field) | `run-staffing-search.ts` maps `MatchResult.results` (already canonicalized by the preprocess) | authored test:97-99,144,166 |
| `userMessage` | `run-staffing-search.ts` on Failure = `MATCH_UNAVAILABLE_MESSAGE` | authored test:177 |
| `MATCH_UNAVAILABLE_MESSAGE` | `lib/match/config.ts` | `lib/match/run-staffing-search.ts`, `app/api/match/route.ts` |
| `buildMatchDataset(session)` | `lib/match/dataset.ts` | `app/api/match/route.ts` (route composition); `runMatch` (SUB-TASK-2 wiring) |
| `serializeDataset(records)` | `lib/match/dataset.ts` | `run-staffing-search.ts` (datasetJson for cache + variables) |
| `Denied` marker | `lib/match/dataset.ts` | `app/api/match/route.ts` → 403/denied response |
| `queryText` prompt var (query only) | `run-staffing-search.ts` | `src/prompts/match-staffing.ts` renderer; `renderPrompt` (`system.ts:40`) → user turn |
| `loadModule<T>(specifier)` | `tests/setup/test-helpers.ts` (NEW export) | `tests/staffing-matcher.test.ts:13,88,137,159,174` (dynamic-import RED helper) |
| `SYNTHETIC_PROFILES` | `tests/setup/test-helpers.ts` (NEW export) | `tests/staffing-matcher.test.ts:12,140,162,175` (shared fixture, authored profile shape) |
| `CoreProfileRecord` / `toCoreRecord(raw)` | `lib/match/run-staffing-search.ts` | `run-staffing-search.ts` (normalizes injected `profiles`); `lib/match/dataset.ts` (emits `CoreProfileRecord[]`) — F-02 reconciliation |
| `RANKING_RULES_PROMPT` | `lib/match/config.ts` (NEW export) | `run-staffing-search.ts` (concatenated into `cacheableContext`) — F-03 |
| `complexity:"hard"` | `run-staffing-search.ts` | `callClaude` → `route("hard")` (`route.ts:15`) → Opus |
| `cacheableContext: RANKING_RULES_PROMPT + datasetJson` | `run-staffing-search.ts` | `callClaude` → `system` arg (`claude.ts:118`) — the cached breakpoint (F-03) |

---

## 6. AC Mechanism Map (literal mechanism → phase)

| AC | Literal mechanism (from STORY/test/arch) | Implementing phase | Evidence |
|---|---|---|---|
| **AC-04** | Opus `match-staffing` call with the **cached ranking-rules system prompt + serialized dataset** (both in `cacheableContext`/`system`), query in the user turn; Zod-validated `MatchResult`; ranking reasons over availability (free now / within 2 weeks) + seniority/timezone, NOT skills alone; each entry has matchPercent/matchedSkills/gaps/availability/rationale | Phase 1 (schema+prompt+`RANKING_RULES_PROMPT`), Phase 3 (core), Phase 3 test S3-P3-01 + S3-P3-06 | STORY Scenario A; test:28-122; Page 02 §4.2/§2.3 |
| **AC-05** | Claude returns closest available people + explicit gap/ramp-up; **never an empty list** (model output is a bare array — coerced by `MatchResult`'s `z.preprocess` so the internal `callClaude` validation passes, F-01) | Phase 1 (`coerceModelShape`), Phase 3 core branch; test S3-P3-02 | STORY Scenario B; test:125-148 |
| **AC-06** | On unreachable / Zod-fail → **no partial ranking**; exact message `"Search is temporarily unavailable — please retry."` | Phase 3 core failure branch + `config.ts`; tests S3-P3-04/05 | STORY Scenario D; test:171-181 |
| **AC-21** | Fewer-than-requested qualifiers returned WITH `shortfallNote` (e.g. "2 of 3 requested qualify"); neither empty nor silent drop (model output is `{shortlist,shortfallNote}` — `coerceModelShape` renames `shortlist→results`, preserving `shortfallNote`, before the internal validation, F-01) | Phase 1 (`shortfallNote` field + `coerceModelShape`), Phase 3 branch; test S3-P3-03 | STORY Scenario C; test:150-169 |
| **AC-11 / BR-03** | Role-scoped dataset server-side (**MANAGER/ADMIN → org; PRACTICE_LEAD → team; EMPLOYEE → denied** — no `HR` token, F-04); **Employee denied** | Phase 2 (dataset), Phase 4 (route deny); tests S3-P2-01/02, S3-P4-01 | STORY Scenario E; SUB-TASK-1 step 1; `schema.prisma:15` |
| **BR-12** | **Opus** routing (`complexity:"hard"`) + **ranking-rules-system-prompt-AND-dataset** in cacheable context (query in user turn) | Phase 1/3; test S3-P3-06 | SUB-TASK-3 step 1; Page 02 §2.2/2.3 |
| **AC-24** | *(stale-session → redirect)* — **OUT OF SCOPE for SKILL-3 (F-05); deferred to SKILL-6** (real auth + `proxy.ts`). No SKILL-3 mechanism, no test. | — (SKILL-6) | STORY Assumptions; F-05 |
| **BR-04** | Availability reasoning lives in the **prompt** (allocation+freeFrom), no code date arithmetic | Phase 1 prompt; asserted via S3-P3-01 boundary + S3-P2-03 determinism | SUB-TASK-1 FC#4/5 |
| **BR-09** | All ranking through the Claude boundary + Zod; no keyword/date substitute. The F-01 `coerceModelShape` preprocess only canonicalizes the model's equivalent ENCODINGS (array/`shortlist`/`results`) before the SAME object validation — entry-level checks (`matchPercent 0..100`, required fields) are unchanged; this is real Zod, NOT a fake/bypass | Phase 1 (`coerceModelShape`), Phase 3 (single `callClaude`); intelligence-boundary assertions | test-scenarios.md §9; ADR-003; TACTICAL-ADR-S3-05 |
| **BR-05** | Every shortlist entry returns matchPercent/matchedSkills/gaps/availability/rationale | Phase 1 schema; test:101-103 | STORY BR-05 |

---

## 7. Testing Strategy (coverage targets: overall ≥40%, new ≥45%, branch ≥40%, critical ≥75%)

- **Type:** integration tests at the functional-core boundary (the SKILL-2 pattern) using injected Claude doubles; no live API.
- **Critical paths (≥75%):** the four `run-staffing-search` branches (happy/hard/partial/failure) + the dataset role-scope + determinism — these are the hero-risk-#2 paths and the SKILL-4 loop substrate.
- **Intelligence-boundary rule:** every ranking assertion is on the **boundary call + validated shape + result relationship** (e.g. in-window ranked above equally-skilled out-of-window via `rank`/`inRequestedWindow`), never on a literal the mock scripted (authored test:113-121). A passing impl must not fake the ranking in code.
- **Matrix (RBAC role × access; roles per `schema.prisma:15` = `ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE`, no `HR`):** MANAGER/ADMIN → org dataset; PRACTICE_LEAD → team dataset; **EMPLOYEE → denied** (one scenario per cell; the denied cell is S3-P2-02/S3-P4-01; PL-team cell is S3-P2-01).
- **Determinism gate:** S3-P2-03 asserts byte-identical serialization for identical input (guards cache reuse + the loop's before/after — Page 02 §2.3).
- **Failure gate:** S3-P3-04 (in authored test) + **S3-P3-05 (additive — not in authored test)** assert zero exposed `results` + the exact retry string on throw AND on garbled JSON (two distinct `callClaude` failure reasons: `sdk` and `extract`/`parse`).
- **BR-12 gate:** S3-P3-06 asserts the boundary was invoked with `complexity:"hard"` AND the cacheable `system` context carried BOTH the ranking-rules prompt and the serialized dataset, while the per-request query is in the user turn (assert via the spy call args — `system` vs `messages` — F-03).

---

## 8. LOC Envelope

| Phase | File(s) | Est. LOC |
|---|---|---|
| 0 | `tests/setup/test-helpers.ts` (extend: `loadModule` + `SYNTHETIC_PROFILES`) | ~20 |
| 1 | `src/schemas/MatchResult.ts` (rewrite — `z.object` + `coerceModelShape` preprocess, F-01) | ~42 |
| 1 | `src/prompts/match-staffing.ts` (extend — query-only user turn) | ~18 |
| 2 | `lib/match/dataset.ts` | ~80 |
| 3 | `lib/match/run-staffing-search.ts` (+ `toCoreRecord` normalizer) | ~82 |
| 3 | `lib/match/config.ts` (`MATCH_UNAVAILABLE_MESSAGE` + `RANKING_RULES_PROMPT`) | ~20 |
| 4 | `app/api/match/route.ts` | ~45 |
| 0 | `tests/staffing-matcher.test.ts` (adapt+additive) | ~85 |
| **Total** | | **~392** (vs STORY ~360 budget) |

> **Over the STORY ~360 estimate by ~32 LOC**, driven by F-01..F-03 across iterations (the test-helper additions ~20, `RANKING_RULES_PROMPT` constant ~12, the `toCoreRecord` normalizer ~7, and the iteration-3 `coerceModelShape` preprocess ~7) — all forced by reviewer findings, not feature creep. The `match-staffing` template SHRINKS (~30→~18) since ranking rules move out of it into the cacheable constant. No phase split required: the overage is small, mechanical, and concentrated in test/config/schema scaffolding; the four core branches remain the bulk and stay within the per-file budget. **This single total (~392) is propagated to §1, the output JSON, and the iteration banner.**

---

## 9. Release Strategy

- **Feature flag:** none. Hackathon local-only run; SKILL-3 is on its own short-lived branch merged promptly to unblock SKILL-4 (dependency-report rec #3). No production rollout, no canary. The matcher is gated by **role** (Employee denied), not a flag.
- **Upstream state:** SKILL-1 + SKILL-2 merged to `main` (deployed). No `not_deployed`/`using_mocks`/`pending` upstream → no flag-default-false requirement applies.
- **Live Claude client:** the route injects a `TODO`-stubbed client that throws until a live client is wired (cert-precedent `app/api/uploads/certificate/route.ts:30`); tests inject doubles. This is the BR-09 "stub the boundary, never fake" discipline — not a feature flag.

## 10. Pipeline Impact

- **None.** No changes to `.github/workflows/*.yml`, Helm, K8s, or any `ci-cd.md` gate. Adds one Vitest file + `app`/`lib`/`src` source under existing `pnpm test`/`typecheck`/`lint`. No gate disabled or bypassed.

---

## 11. File Checklist

| File | Action | Phase | Reuse decision | Cross-PR overlap |
|---|---|---|---|---|
| `tests/setup/test-helpers.ts` | **MODIFY (F-01: add `loadModule` + `SYNTHETIC_PROFILES`)** | 0 | EXTEND | None (no open PRs; SKILL-3 is the only active branch — dependency-report §Merge Conflict) |
| `src/schemas/MatchResult.ts` | MODIFY (rewrite) | 1 | EXTEND | None |
| `src/prompts/match-staffing.ts` | MODIFY | 1 | EXTEND | None |
| `lib/match/dataset.ts` | CREATE | 2 | BUILD-NEW | None |
| `lib/match/run-staffing-search.ts` | CREATE | 3 | BUILD-NEW | None |
| `lib/match/config.ts` | CREATE | 3 | BUILD-NEW | None |
| `app/api/match/route.ts` | CREATE | 4 | BUILD-NEW | None |
| `tests/staffing-matcher.test.ts` | CREATE (adapt authored) | 0 | BUILD-NEW | None |

**Identifier delta sweep (renames/contract changes):**
- `MatchResult` shape change (`{matches:[{handle,score}]}` → `{results:[…]}`): consumers searched — only `src/schemas/index.ts:4` (barrel re-export, no shape dependency) and the SKILL-1 stub `src/prompts/match-staffing.ts` (rewritten in Phase 1). No other importer of `MatchResult` exists in `lib/`/`app/`. The dependency-report rec #2 (re: `score`) is **superseded** — the schema now follows Page-02 §2.5 (`matchPercent`), not the SKILL-1 stub's `score`.
- **`tests/setup/test-helpers.ts` additive exports** (`loadModule`, `SYNTHETIC_PROFILES`): the three existing `makeClaudeClient*` exports are unchanged, so the SKILL-2 cert suite (`tests/cert-parsing.test.ts:46-50`) that imports only those is unaffected. The new exports are purely additive — no rename, no signature change to existing exports. Verified the cert suite does NOT import `loadModule`/`SYNTHETIC_PROFILES` (it uses a local `loadCertModule()` and seeds its own DB), so there is no name collision.
- No topic/path/env-key renames.

---

## 12. Risk Mitigation

| Risk | Mitigation | Trace |
|---|---|---|
| Authored test vs sub-task contract divergence (signature, result shape, **profile record shape**) | Reconcile via core (`runStaffingSearch`) + route composition + canonical `CoreProfileRecord` (§2.4a); ADR-S3-01/02/04 | TACTICAL-ADR-S3-01/02/04 |
| Binding RED suite cannot import its helpers (F-01) | Extend `tests/setup/test-helpers.ts` with `loadModule` + `SYNTHETIC_PROFILES` in Phase 0 BEFORE adapting the test | §3, Phase 0 |
| Ranking rules cached in the wrong turn (F-03) | Ranking rules → `RANKING_RULES_PROMPT` in `cacheableContext`; template renders query only; S3-P1-02 + S3-P3-06 assert the split | §2.6, Phase 1/3 |
| Opus latency makes demo slow | loading state (SKILL-6 UI); dataset prompt-caching; Sonnet downgrade only if AC-04/AC-21 still pass | STORY Risks; Page 02 §2.2 |
| Model returns near-but-invalid JSON | `callClaude` Zod gate → typed Failure → retry message; never partial ranking | AC-06; `claude.ts:132-136` |
| Model emits an equivalent-but-differently-encoded valid result (bare array / `shortlist` key) and the internal `callClaude` validation rejects it → AC-04/05/21 cannot go GREEN (F-01) | `MatchResult` = `z.preprocess(coerceModelShape, z.object({…}))` canonicalizes the three encodings BEFORE the same object validation; entry-level checks unchanged (BR-09 intact); S3-P1-01 asserts both coercions + rejection of invalid/legacy shapes | TACTICAL-ADR-S3-05; `claude.ts:132`; test:66-87,127-136,152-158 |
| Non-deterministic serialization defeats caching + muddies loop before/after | stable ordering + determinism test S3-P2-03 | Page 02 §2.3; SUB-TASK-1 FC#3 |
| Role enforcement incomplete pre-SKILL-6 | SKILL-3 scopes dataset (MANAGER/ADMIN/PL) + denies Employee via the caller-identity seam (cert-precedent); **AC-24 stale-session redirect explicitly deferred to SKILL-6** (F-05), not claimed here; full PL-membership + view-switcher in SKILL-6 | STORY Assumptions; ADR-006; F-05 |

---

## 13. Standards Compliance

| Standard | Compliance |
|---|---|
| tech-stack (Next.js 16, pnpm, named ES exports, `@/*` alias) | Route Handler not Server Action (TS-003); named exports; `@/lib`/`@/src` imports; no new deps |
| api.md (read/write separation, POST-as-read) | `POST /api/match` read-only, no DB writes (Page 02 §3.2a) |
| architecture-patterns (single Claude boundary, Zod-before-use, prompt caching) | all ranking via `callClaude` + `MatchResult` gate (ADR-003, BR-09); ranking-rules prompt + dataset in the cached `system` breakpoint, query in the user turn (§2.3, F-03) |
| security (server-side role re-derivation, no PII, secrets from env) | role re-derived server-side against the actual `ADMIN/MANAGER/PRACTICE_LEAD/EMPLOYEE` enum (no `HR`, F-04); Employee denied; synthetic profiles only (`handle`/`currentProject` not serialized); `ANTHROPIC_API_KEY`/`CLAUDE_MODEL_HARD` from env |
| testing (coverage) | hackathon-relaxed targets; critical paths ≥75% via the four branches + dataset scope/determinism |
| release-strategy / ci-cd | no flag needed; no pipeline gate touched/disabled |

---

## 14. Validation Findings (internal checks)

- **Domain / data flow:** matches Page 02 §4.2 sequence. Read-only (TS-003) — no read-then-write, no deletes, no TTLs (no caching state owned by this code; prompt-cache is Anthropic-side, keyed by deterministic serialization). ✅
- **Structural integrity:** core takes injected `claude` (DIP — no infra type in the domain core); dataset builder is the only Prisma reader; route is thin transport (SRP); no class >6 deps (functional modules); both producers normalize to one `CoreProfileRecord` so the core has a single input contract (F-02). ✅
- **Performance:** single `callClaude` per search (no per-iteration external calls); ranking rules + dataset serialized once and reused as `cacheableContext` (Page 02 §2.3); deterministic ordering enables Anthropic prompt-cache reuse across the loop. No code-side cache TTL to jitter (not applicable). ✅
- **Cache correctness (F-03):** ranking-rules system prompt + dataset are in the cached `system` breakpoint (`claude.ts:118`), query in the user turn — re-verified against the actual `callClaude` wiring. ✅
- **Role token correctness (F-04):** scope rules use only `ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE` (`schema.prisma:15`); no `HR` token anywhere. ✅
- **Business rules:** BR-03/04/05/09/12 each mapped to a phase + test (see §6). ✅
- **Security:** role server-side; Employee denied before model call; no PII in dataset (synthetic profileIds + skill names only; `handle`/`currentProject` intentionally NOT serialized, §2.4a; Page 02 §2.6). ✅
- **Output-shape correctness (F-01, iteration 3):** `callClaude` validates `raw` internally (`claude.ts:132`); the authored test scripts a bare array (AC-04/05) and a `shortlist`-keyed object (AC-21). `MatchResult` is now `z.preprocess(coerceModelShape, z.object({…}))` so those encodings are canonicalized to `{results,…}` before validation — the binding test can go GREEN. Entry-level validation is unchanged; BR-09 intact (TACTICAL-ADR-S3-05). ✅
- **Gaps:** No P0 gaps. **P2 (documented):** Page-02 §2.5 is silent on `rank`/`inRequestedWindow` (the authored test adds them) — resolved as an additive schema superset (TACTICAL-ADR-S3-02). **P2 (documented):** Page-02 §2.5 is silent on the model emitting bare-array / `shortlist`-keyed encodings — resolved as additive coercion before the same object validation (TACTICAL-ADR-S3-05, F-01 iteration 3). **P2 (documented):** profile-record-shape seam between the authored test and `buildMatchDataset` — resolved via the canonical `CoreProfileRecord` + `toCoreRecord` normalizer (TACTICAL-ADR-S3-04, F-02 iteration 2). **Scope-narrowed (F-05):** AC-24 (stale-session redirect) is **deferred to SKILL-6** (no real session lifecycle in SKILL-3) — removed from this story's AC-coverage claims, NOT a gap.
