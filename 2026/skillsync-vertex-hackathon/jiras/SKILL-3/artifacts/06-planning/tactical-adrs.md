# Tactical ADRs — SKILL-3: Staffing Matcher

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 06-implementation-planning · **Iteration:** 3
**Repo:** `ai-nu-skillsync` · **Author:** nulogic-implementation-planner · **Date:** 2026-06-08
**Scope:** Tactical deviations from the target-state architecture (Pages 02/03/05) detected during implementation planning for SKILL-3. Strategic ADRs (ADR-001..007) are unchanged.

> **Deviation Scan summary (iteration 3 — re-run against the revised plan).** Target-state arch provided (`context.target_arch_path`). Ran PASS 1 (standards-scannable against the local stub `architecture-principles/` — "no constraints beyond defaults for this learning run", per Page 05 Council/Deviation Notes) and PASS 2 (judgment-based). The strategic decisions (single Claude boundary, Opus routing, prompt caching, read-only Route Handler, Zod-before-use) are all **honored, not deviated**. **Five** tactical deviations are now recorded — all at the **contract/identifier/record/output-encoding** level where the **authored acceptance test** (the binding RED contract the test-creator turns GREEN) differs from Page-02 §2.5 / the sub-task pseudocode. ADR-S3-05 is NEW in iteration 3 (the F-01 output-shape normalization: the model's bare-array / `shortlist`-keyed encodings vs the §2.5 `{results}` object, reconciled by a `z.preprocess` coercion that runs BEFORE — and does not weaken — the entry-level object validation). None touches a NULogic architecture-council trigger (no production data platform, multi-tenant, networking, compliance, vendor, or cost-impact change). No CI/CD or pipeline gate affected. No prior ADR is superseded — all five remain Accepted.

| Tactical ADR | Trigger | Decision | Status |
|---|---|---|---|
| TACTICAL-ADR-S3-01 | T-contract (API/identifier divergence) | Reconcile via a functional core matching the authored test, wrapped by the arch's role-scoped dataset builder + read-only route | Accepted |
| TACTICAL-ADR-S3-02 | T-schema (output contract superset) | `MatchResult` is the §2.5 shape PLUS optional `rank` / `inRequestedWindow` the authored test asserts | Accepted |
| TACTICAL-ADR-S3-03 | T14-adjacent (in-repo breaking change) | Rewrite the SKILL-1 `MatchResult` stub + extend the `match-staffing` prompt stub (replace placeholder shapes) | Accepted |
| TACTICAL-ADR-S3-04 | T-contract (input record-shape divergence) — NEW iteration 2 (F-02) | One canonical `CoreProfileRecord` + `toCoreRecord` normalizer reconciles the authored test's profile shape with `buildMatchDataset`'s output without dropping trustState/seniority/timezone | Accepted |
| TACTICAL-ADR-S3-05 | T-schema (output-encoding divergence) — **NEW iteration 3 (F-01)** | `MatchResult` is a `z.preprocess(coerceModelShape, z.object({…}))` that canonicalizes the model's `array \| {shortlist,…} \| {results,…}` encodings into `{results,…}` BEFORE the (unchanged) entry-level object validation — required because `callClaude` validates `raw` internally (`claude.ts:132`) | Accepted |

---

## TACTICAL-ADR-S3-01 — Matcher entry point: functional core (`runStaffingSearch`) reconciled with the arch's `runMatch`/`buildMatchDataset` wiring

**Status:** Accepted

**Context.**
The **authored acceptance test** `artifacts/02-acceptance-tests/e2e-tests/staffing-matcher.test.ts` (lines 17–26, 88–94) is the binding RED contract for SKILL-3. It drives:
- module path `@/lib/match/run-staffing-search`
- signature `runStaffingSearch({ query, profiles, claude })` — **profiles and the Claude client are injected arguments**; there is **no session, no DB read, no role scoping** inside the tested core
- return `{ ok: true; shortlist; shortfallNote? } | { ok: false; userMessage }`

The **sub-tasks + Page-02 design** describe a different surface:
- `runMatch(queryText, session)` in `lib/match/run-match.ts` (SUB-TASK-2)
- `buildMatchDataset(session)` in `lib/match/dataset.ts` (SUB-TASK-1) — role-scoped DB read
- `POST /api/match` Route Handler (Page 02 §3.2a / TS-003)

These cannot both be the single entry point as-written: the test's core is pure (injected profiles, no session) while the sub-task service is session-driven (builds its own dataset). Picking only the test surface would drop the BR-03 role scoping + read-only transport the arch requires; picking only the sub-task surface would leave the authored RED test unsatisfiable.

**Decision.**
Implement **two cooperating layers** and make the authored test's surface the **functional core**:
1. `lib/match/run-staffing-search.ts` — `runStaffingSearch({ query, profiles, claude })`, the pure, injected-dependency core the authored test drives. It normalizes `profiles` to `CoreProfileRecord` (TACTICAL-ADR-S3-04), serializes deterministically, assembles `cacheableContext = RANKING_RULES_PROMPT + dataset` (F-03), routes through `callClaude` (Opus), Zod-validates `MatchResult`, and maps `results → shortlist` with `shortfallNote`/failure handling.
2. `lib/match/dataset.ts` — `buildMatchDataset(session)`, the role-scoped (MANAGER/ADMIN→org, PRACTICE_LEAD→team, EMPLOYEE→Denied; no `HR` token — F-04), deterministic DB projection (BR-03) emitting `CoreProfileRecord[]`, plus `serializeDataset`.
3. `app/api/match/route.ts` — the read-only transport (TS-003) that re-derives role, denies Employee, calls `buildMatchDataset(session)`, then delegates to `runStaffingSearch` with the scoped profiles + an injected (TODO-stubbed) live Claude client.

The sub-task `runMatch(queryText, session)` name becomes the **route-side composition** (dataset build + core call) rather than a separate third module — it is satisfied by the route handler composing layers 1+2, avoiding a redundant module.

**Rationale.**
- The authored test is the contract the pipeline turns GREEN; the core MUST match it exactly.
- Separating the pure core (testable with injected profiles) from the session/role layer mirrors the **SKILL-2 cert precedent** (`lib/cert/parse-certificate.ts` core + thin `app/api/uploads/certificate/route.ts` transport) — proven, consistent, DIP-clean.
- Role scoping (BR-03) and read-only transport (TS-003) are preserved in layers 2+3; nothing in the arch is dropped.
- A pure core also serves SKILL-4's loop (re-run before/after) and SKILL-6's UI directly.

**Alternatives Considered.**
- *Only the sub-task surface (`runMatch(queryText, session)` reads its own dataset):* leaves the authored RED test unsatisfiable without rewriting the acceptance test; rejected (the acceptance test is authoritative).
- *Only the test surface (no dataset builder / no route):* drops BR-03 role scoping and the TS-003 read-only transport the arch mandates; rejected.
- *Have the route do everything inline (no core):* duplicates business logic at the edge, violates the cert-precedent thin-transport pattern and SRP; rejected.

**Trade-offs.**
- *Gain:* satisfies the binding test exactly, preserves BR-03/TS-003, matches the established cert pattern, reusable by SKILL-4/6.
- *Give up:* one extra small module (dataset builder) vs a single function — worth it for the role-scope seam.

**Impact.** *Technical:* `lib/match/{run-staffing-search,dataset,config}.ts` + `app/api/match/route.ts`. *Risk:* low — the core is unit-testable in isolation; the route is thin. *Loop (SKILL-4):* the deterministic serialization makes before/after cache-reusable.

**Evidence.** `staffing-matcher.test.ts:17-26,88-94`; SUB-TASK-1; SUB-TASK-2; Page 02 §3.2a/§4.2; cert precedent `lib/cert/parse-certificate.ts:56`, `app/api/uploads/certificate/route.ts:14`.

---

## TACTICAL-ADR-S3-02 — `MatchResult` is the Page-02 §2.5 shape PLUS optional `rank` / `inRequestedWindow`

**Status:** Accepted

**Context.**
Page-02 §2.5 specifies `MatchResult.results[]` with `{ profileId, matchPercent, matchedSkills, gaps, availability, rationale }` and optional `requested` / `shortfallNote`. The **authored acceptance test** additionally asserts two fields on each entry to *prove availability (not skills) drove the ranking*:
- `rank` (`staffing-matcher.test.ts:80,98,116`) — used to assert the in-window candidate is ranked above the equally-skilled out-of-window one.
- `inRequestedWindow` (`staffing-matcher.test.ts:84,118,120`) — boolean flag the test checks on both candidates.

Page-02 §2.5 is silent on these two fields. Per the planner contract this is normally a `MISSING_IN_ARCH` → P0 escalation.

**Decision.**
Treat `rank` and `inRequestedWindow` as an **additive, optional superset** of the §2.5 schema — NOT a blocking `MISSING_IN_ARCH`. `MatchResult.results[]` is defined as the §2.5 fields (all required) **plus** `rank?: number` and `inRequestedWindow?: boolean` (optional). The schema remains a strict superset of §2.5, so any §2.5-conformant consumer (SKILL-4/6) is unaffected.

**Rationale.**
- The additions are **optional** and **additive**; they do not change or remove any §2.5 field, so they are not a contract break against the arch — they refine it.
- The authored acceptance test is the **binding GREEN contract**; omitting the fields would make AC-04's ordering proof unverifiable.
- The fields are exactly the BR-04 differentiator made observable (availability-driven ordering) — they serve the arch's intent (§4.2: "ranking … reasons over availability … not skill overlap alone"), not contradict it.
- Escalating a P0 for two optional, intent-aligned fields would block a hackathon story on a non-issue; the deviation is recorded here for visibility instead.

**Alternatives Considered.**
- *Escalate as MISSING_IN_ARCH (P0):* over-strict for additive optional fields that the binding test requires and that match the arch's stated ranking intent; rejected, recorded as a tactical ADR instead.
- *Drop the fields and assert ordering only by array index:* the authored test explicitly asserts both `rank` and `inRequestedWindow`; rejected (would fail the RED contract).

**Trade-offs.**
- *Gain:* AC-04's availability-driven ordering is provable; arch consumers unaffected (superset).
- *Give up:* a small drift from the literal §2.5 field list — documented and intentional.

**Impact.** *Technical:* `src/schemas/MatchResult.ts` adds two optional fields. *Arch feedback:* recommend a one-line §2.5 note in a future arch revision that `rank`/`inRequestedWindow` are optional ranking-observability fields. *Risk:* none — superset.

**Evidence.** Page 02 §2.5; `staffing-matcher.test.ts:78-121`; STORY Scenario A / BR-04.

---

## TACTICAL-ADR-S3-03 — Rewrite the SKILL-1 `MatchResult` stub and extend the `match-staffing` prompt stub

**Status:** Accepted

**Context.**
SKILL-1 landed placeholder slots so the foundation compiled:
- `src/schemas/MatchResult.ts:4-13` = `{ matches: [{ handle, score (0..1), rationale, gaps }] }` — matches **neither** Page-02 §2.5 **nor** the authored test.
- `src/prompts/match-staffing.ts:4-11` = a one-line stub taking `{ query }` and returning `Return JSON { matches }` — no dataset, no availability/trust rules, no §2.5 output contract.
The dependency-report (rec #2) even flagged the `score` field as a likely Zod mismatch. SKILL-3 must replace both placeholders with the real contract.

**Decision.**
- **Rewrite** `src/schemas/MatchResult.ts` to the §2.5 + TACTICAL-ADR-S3-02 shape (`requested?`, `results[]{profileId,matchPercent,matchedSkills,gaps,availability,rationale,rank?,inRequestedWindow?}`, `shortfallNote?`). Keep the export name `MatchResult` and the `src/schemas/index.ts:4` barrel entry unchanged.
- **Extend** `src/prompts/match-staffing.ts` to render `{ queryText, datasetJson }` into a ranking prompt that (a) instructs ranking over `allocation`+`freeFrom` ("free now"/"free in ~N weeks") NOT skills alone (BR-04), (b) weights `trustState` `VERIFIED > MANAGER_APPROVED > SELF_REPORTED` (Page 03 §3), (c) states the §2.5 output contract, and (d) places the serialized dataset in the cacheable system context with the per-request query outside it (Page 02 §2.3). Keep the export name + `system.ts:29` registry entry.

**Rationale.**
- The SKILL-1 shapes are explicitly placeholders ("the only `hard`/Opus call" comment) intended to be filled by SKILL-3 — extending them is the intended path, not a deviation from intent.
- Recorded as a tactical ADR because it is an **in-repo breaking change** to two existing exports (T14-adjacent): the old `{matches:[{handle,score}]}` shape disappears. The identifier delta sweep (plan §11) confirms no other consumer depends on the old shape (only the barrel re-export + the stub prompt, both updated in the same phase), so the break is contained.
- Aligns the schema with §2.5 and supersedes the dependency-report's `score` note — the field is `matchPercent` (0..100) per the arch, not `score` (0..1).

**Alternatives Considered.**
- *Keep the SKILL-1 shape and adapt the matcher to it:* would contradict both Page-02 §2.5 and the authored test (`matchPercent`, `matchedSkills`, `availability` absent); rejected.
- *Add a second schema/prompt and leave the stubs:* dead code + two `MatchResult`s = confusion and import ambiguity; rejected (Simplicity First).

**Trade-offs.**
- *Gain:* one correct schema/prompt matching arch + test; no dead placeholders.
- *Give up:* the SKILL-1 stub shape (intended to be replaced; no real consumer).

**Impact.** *Technical:* modify `src/schemas/MatchResult.ts`, `src/prompts/match-staffing.ts`; `src/schemas/index.ts` + `system.ts` registry unchanged. *Risk:* low — contained break, swept for consumers. *Pipeline:* none.

**Evidence.** `src/schemas/MatchResult.ts:4-13`; `src/prompts/match-staffing.ts:4-11`; `src/schemas/index.ts:4`; `src/prompts/system.ts:29`; Page 02 §2.5/§2.2/§2.3; Page 03 §3; dependency-report rec #2 (superseded).

---

## TACTICAL-ADR-S3-04 — One canonical `CoreProfileRecord` reconciles the authored-test profile shape with `buildMatchDataset` output (F-02)

**Status:** Accepted (NEW — iteration 2)

**Context.**
The functional core `runStaffingSearch({ query, profiles, claude })` is fed `profiles` by **two producers with different record shapes**:
- the **authored acceptance test** injects literal profiles shaped `{ id, handle, currentProject, allocationPct, freeFrom, skills:[{ canonicalSkillId, name, level }] }` (`staffing-matcher.test.ts:37-60`);
- `buildMatchDataset(session)` (SUB-TASK-1) emits the role-scoped DB projection `{ profileId, seniority, timezone, allocation, freeFrom, skills:[{ name, trustState }] }`.

The keys diverge: `id` vs `profileId`, `allocationPct` vs `allocation`; and `trustState`/`seniority`/`timezone` exist only on the dataset path while `level`/`handle`/`currentProject`/`canonicalSkillId` exist only on the test path. If the core consumed either shape verbatim, the other producer's data would be silently dropped — and on the production (route) path the **trust-weighted ranking** that Page-02 §2.3 + Page-03 §3 (VERIFIED > MANAGER_APPROVED > SELF_REPORTED) require could not be presented. This was reviewer finding F-02.

**Decision.**
Define ONE canonical input record, `CoreProfileRecord`, and a core-owned `toCoreRecord(raw)` normalizer that maps EITHER producer's shape onto it:

```text
CoreProfileRecord { profileId, seniority|null, timezone|null, allocation, freeFrom|null,
                    skills:[{ name, trustState|null }] }
```
- test path: `id→profileId`, `allocationPct→allocation`; `seniority`/`timezone`/`trustState` → `null`; `handle`/`currentProject`/`canonicalSkillId`/`level` dropped (not part of the ranking surface, and `handle`/`currentProject` are deliberately excluded to keep the serialized dataset PII-safe).
- dataset path: 1:1 (it already produces the canonical fields, including `trustState`/`seniority`/`timezone`).

`buildMatchDataset` is specified to OUTPUT `CoreProfileRecord[]` directly; the core applies `toCoreRecord` defensively so both paths converge on the identical serialized form.

**Rationale.**
- The core gets a SINGLE input contract (SRP); neither producer's data is dropped.
- The **production** path always carries `trustState`/seniority/timezone (from the DB), so the trust-weighted, `profileId`-keyed dataset §2.3/§3 require is fully present in a real run. The test path nulls them ON PURPOSE to isolate the *availability* differentiator (BR-04) — the normalizer tolerates their absence rather than fabricating values.
- Keeping the normalizer in the core (not the test) means the GREEN implementation — not the test fixture — owns the mapping, so it is exercised by the binding suite.

**Alternatives Considered.**
- *Make the core consume the authored shape verbatim and have the route translate dataset→test-shape:* would push trust/seniority/timezone through `level`-less fields and risk dropping them; rejected — the canonical record makes the carried fields explicit.
- *Two core entry points (one per shape):* duplicates the ranking logic; rejected (SRP / Simplicity First).
- *Escalate as MISSING_IN_ARCH:* the arch is not silent on the fields — it specifies the dataset record (§2.4) and the trust weighting (§2.3/§3); the gap is purely the test fixture's lighter shape. A normalizer reconciles it without an arch change; recorded here for visibility.

**Trade-offs.**
- *Gain:* single core contract; no field loss; trust-weighted ranking provable on the production path; PII-safe serialization.
- *Give up:* ~7 LOC for the `toCoreRecord` normalizer.

**Impact.** *Technical:* `lib/match/run-staffing-search.ts` (`CoreProfileRecord` + `toCoreRecord`); `lib/match/dataset.ts` outputs `CoreProfileRecord[]`. *Risk:* low — pure mapping, covered by S3-P2-03 (determinism) + S3-P3-01 (the test-shape path). *Pipeline:* none.

**Evidence.** `staffing-matcher.test.ts:37-60,127-136,152-158`; SUB-TASK-1 Data Models; Page 02 §2.3/§2.4; Page 03 §3; implementation-plan §2.4a.

---

## TACTICAL-ADR-S3-05 — `MatchResult` normalizes the model's output ENCODING (bare array / `shortlist` key) before validation (F-01)

**Status:** Accepted (NEW — iteration 3)

**Context.**
`callClaude` runs `schema.safeParse(raw)` **internally** (`lib/ai/claude.ts:132`) on the JSON the injected client emits, BEFORE the matcher core ever maps `results → shortlist`. The schema we pass IS what runs against `raw`. The **authored acceptance test** scripts the Claude double with THREE real model encodings of an otherwise-valid result:
- a **bare array** of result entries — AC-04 (`staffing-matcher.test.ts:66-87`) and AC-05 (`:127-136`);
- an object keyed **`shortlist`** (not `results`) plus `shortfallNote` — AC-21 (`:152-158`);
- (the canonical `{results,…}` object is what Page-02 §2.5 specifies and what S3-P3-06 scripts).

`makeClaudeClientSpy` (`test-helpers.ts:27-32`) `JSON.stringify`s the scripted argument verbatim into a single text block, so `raw` is EXACTLY that shape. A plain `z.object({ results:[…] })` (the iteration-2 schema) would **reject** the bare array AND the `{shortlist}` object → `callClaude` returns `{ ok:false, reason:"parse" }`. AC-04/05/21 assert `res.ok === true` and read `res.shortlist`, so as designed those three ACs **could not turn GREEN**. TACTICAL-ADR-S3-02 only adds optional `rank`/`inRequestedWindow` to the *entries* — it does not address the **top-level** output-shape divergence. This was reviewer finding F-01 (CRITICAL).

**Decision.**
Define `MatchResult` as a `z.preprocess(coerceModelShape, z.object({ requested?, results:[…], shortfallNote? }))`. `coerceModelShape(raw)` canonicalizes the model's equivalent encodings BEFORE the inner object validation:
- a **bare array** → `{ results: <array> }`;
- an object with a top-level **`shortlist`** key → `{ results: <shortlist>, …rest }` (preserving `shortfallNote` / `requested`);
- an object with **`results`** → passed through unchanged (Page-02 §2.5 canonical);
- anything else → passed through, so the inner `z.object()` then fails → a typed `parse` Failure (the AC-06 graceful path is unaffected).

The inner `z.object()` — including `matchPercent` `0..100`, the required entry fields `profileId/matchedSkills/gaps/availability/rationale`, and the optional `rank`/`inRequestedWindow` (S3-02) — runs AFTER coercion and is **unchanged**. The matcher core therefore always receives validated `{results,…}` on `Ok` and maps `results → shortlist` exactly as before (TACTICAL-ADR-S3-01).

**Rationale.**
- The coercion canonicalizes only the **encoding** of a structurally-equivalent result; it does NOT weaken entry-level validation (an out-of-range `matchPercent`, a missing `profileId`, etc. still fail). So **BR-09 is intact** — this is real Zod validation that tolerates the model's equivalent encodings, NOT a fake/bypass and NOT keyword/regex substitution for the model.
- The validation is internal to `callClaude` (the schema is what runs against `raw`), so the normalization MUST live in the schema — the core cannot intercept `raw` before `safeParse`. A `z.preprocess` is the minimal, in-schema place for it.
- The authored acceptance test is the **binding GREEN contract**; without this coercion AC-04/05/21 are unsatisfiable. Page-02 §2.5 is silent on the model's encoding latitude, so this is a documented additive tactical deviation, not a `MISSING_IN_ARCH` P0 (the result CONTENT is fully §2.5-conformant after coercion).

**Alternatives Considered.**
- *Weaken the schema to a permissive `z.any()`/passthrough and validate in the core:* would move validation out of the single boundary, violate BR-09 / ADR-003 (Zod-before-use at the boundary), and lose entry-level guarantees; rejected.
- *Rewrite the authored acceptance test to emit only `{results}`:* the acceptance test is authoritative and must not be rewritten to fit the implementation; rejected.
- *Map encodings in the injected client/test double:* hides the real model-shape tolerance from the GREEN implementation and would not exercise the production path; rejected — the schema (the thing that actually runs in `callClaude`) must own it.
- *Escalate as MISSING_IN_ARCH (P0):* over-strict — the coerced result is fully §2.5-conformant and entry validation is unchanged; recorded as a tactical ADR for visibility instead.

**Trade-offs.**
- *Gain:* AC-04/05/21 can go GREEN against the real internal-validation path; entry-level validation and BR-09 preserved; the model is free to emit any of the three equivalent encodings.
- *Give up:* ~7 LOC for `coerceModelShape`; a small, documented tolerance beyond the literal §2.5 `{results}` object shape.

**Impact.** *Technical:* `src/schemas/MatchResult.ts` becomes `z.preprocess(coerceModelShape, z.object({…}))`. *Arch feedback:* recommend a one-line §2.5 note that the validator tolerates a bare-array / `shortlist`-keyed encoding (canonicalized to `results`). *Risk:* low — pure pre-validation mapping, covered by S3-P1-01 (both coercions + the legacy/invalid rejections) and exercised end-to-end by S3-P3-01/02/03. *Pipeline:* none.

**Evidence.** `lib/ai/claude.ts:132` (internal `safeParse`); `tests/setup/test-helpers.ts:27-32` (verbatim `JSON.stringify`); `staffing-matcher.test.ts:66-87,127-136,152-158`; Page 02 §2.5; implementation-plan §2.5 / Phase 1 / Wiring Trace.

---

## Non-deviations (explicitly confirmed in-line with the arch — no ADR needed)

| Decision | Arch source | Confirmation |
|---|---|---|
| Single Claude boundary (`callClaude`) for all ranking | ADR-003, BR-09 | reused unchanged (`lib/ai/claude.ts:109`) |
| Opus for `match-staffing` via `complexity:"hard"` | Page 02 §2.2, BR-12 | reused unchanged (`lib/ai/route.ts:14`) |
| Prompt caching: **ranking-rules system prompt AND dataset cacheable, query outside** (F-03 fix) | Page 02 §2.3, BR-12 | `cacheableContext = RANKING_RULES_PROMPT + serialized dataset` → `system` arg (`claude.ts:118`); query in `messages` user turn (`renderPrompt`, `claude.ts:117`). Iteration-1's "dataset-only in cache, rules in template" was corrected — rules in the template would have landed in the UNCACHED user turn. |
| Read-only `POST /api/match`, no DB writes | Page 02 §3.2a, TS-003, ADR-006 | route is read-only; dataset builder read-only |
| Zod-before-use, typed failure (no partial ranking) | ADR-003, AC-06 | `MatchResult` gate (now `z.preprocess(coerceModelShape, z.object({…}))` — coercion canonicalizes encoding only, entry-level validation unchanged, S3-05); `{ok:false,userMessage}` on parse failure |
| Availability reasoning in the cacheable ranking prompt, not code | BR-04, BR-09 | no date arithmetic in code; `RANKING_RULES_PROMPT` instructs it |
| Role-scoped dataset, Employee denied (roles `ADMIN/MANAGER/PRACTICE_LEAD/EMPLOYEE`, no `HR` — F-04) | BR-03, AC-11, `schema.prisma:15` | `buildMatchDataset` scope rule (MANAGER/ADMIN→org, PL→team) + Denied marker |
| Persistence Prisma+SQLite, read-only here | ADR-002 | dataset builder reads via `lib/repos/db.ts` |
| Synthetic-only, no PII in dataset/logs | ADR-005, P3, Page 02 §2.6 | profileIds + skill names only |
