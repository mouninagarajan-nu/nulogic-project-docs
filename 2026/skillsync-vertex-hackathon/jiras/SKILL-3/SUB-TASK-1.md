# SKILL-3 / SUB-TASK-1 — Role-scoped dataset builder + match-staffing prompt (Opus) + MatchResult schema + prompt caching

**Parent:** SKILL-3 · **Component:** Matching service + Claude integration (Opus + caching) · **Repo:** ai-nu-skillsync
**Gaps:** TD-MATCH-01, TD-DATA-04

## Pseudocode

1. **Build the role-scoped dataset builder** `buildMatchDataset(session)` (Page 02 §4.2):
   - Re-derive the session + role server-side (never trust client). Resolve the caller's `Employee` + `role`.
   - Scope the candidate set: `MANAGER|HR|ADMIN` → whole org; `PRACTICE_LEAD` → only employees where `leadId == caller.id`; `EMPLOYEE` → **deny** (matcher not accessible — return a `Denied` result, handled in SUB-TASK-2).
   - For each in-scope `Employee`, project a **deterministic, stably-ordered** record: `{ profileId, seniority, timezone, allocation, freeFrom, skills: [{ name, trustState }] }` ordered by `profileId` (and skills by canonical name) so the serialization is byte-identical across the loop's before/after runs (cache reuse, Page 02 §2.3).
   - Skill `trustState` is carried so the prompt can weight `VERIFIED > MANAGER_APPROVED > SELF_REPORTED` (Page 03 §3).
2. **Author the `match-staffing` prompt template** (`src/prompts/match-staffing.ts`) returning a message array given `{ queryText, datasetJson }`:
   - System prompt = ranking rules (reason over availability `allocation`+`freeFrom` → "free now"/"free in ~N weeks", NOT skills alone — BR-04; weight by trust state; required output contract) + the serialized dataset, BOTH marked `cache_control: ephemeral` (Page 02 §2.3).
   - The per-request `queryText` (and any candidate filters) sits **outside** the cache breakpoint so the cached dataset is reused.
3. **Define `MatchResult` Zod schema** (`src/schemas/match-result.ts`) per Page 02 §2.5: `requested?{count?,summary}`, `results[]{ profileId, matchPercent 0..100, matchedSkills[], gaps[], availability, rationale }`, `shortfallNote?`. Route the call through `callClaude({ promptName:"match-staffing", complexity:"hard" /* → Opus */, schema: MatchResult, cacheableContext: datasetJson })`.

## Implementation Contract

- **GOAL:** A deterministic, role-scoped dataset builder and a cached, Opus-routed `match-staffing` call that returns a Zod-validated `MatchResult` reasoning over availability — the read substrate the matcher (SUB-TASK-2) and the loop (SKILL-4) reuse.
- **CONSTRAINTS:**
  - Per **ADR-003 / BR-12 / Page 02 §2.2**, `match-staffing` routes to **Opus** (`complexity:"hard"`); model id from config, never hardcoded; Sonnet downgrade only if AC-04/AC-21 still pass.
  - Per **Page 02 §2.3 / BR-12**, mark the system prompt + serialized dataset cacheable; keep the per-request query outside the breakpoint; serialize the dataset **deterministically** (stable ordering) so the loop's before/after reuses the cache key.
  - Per **BR-04 / BR-09**, availability reasoning lives in the prompt — NO date arithmetic / keyword filtering in code substituting for the model.
  - Per **BR-03 / AC-11**, the dataset is scoped by the caller's role server-side; Employee is denied.
- **FORMAT:** `lib/match/dataset.ts` (`buildMatchDataset`); `src/prompts/match-staffing.ts`; `src/schemas/match-result.ts`. Reuses `lib/ai/claude.ts` + `route` from SKILL-1.

## Data Models

- **Dataset record (in-memory):** `{ profileId, seniority, timezone, allocation:int, freeFrom:ISO, skills:[{name, trustState}] }`, stable-ordered.
- **Prompt:** `match-staffing` (Opus); cacheable context = system prompt + `datasetJson`.
- **Zod schema:** `MatchResult` (Page 02 §2.5).
- **Prisma reads:** `Employee` (`role`, `leadId`, `seniority`, `timezone`, `allocation`, `freeFrom`), `EmployeeSkill` (`trustState`) joined to `Skill.name`. **No writes.**

## Error Handling

1. **Caller role is `EMPLOYEE`:** `buildMatchDataset` returns a `Denied` marker; the handler (SUB-TASK-2) maps it to a 403/denied state — never builds an org-wide dataset for an Employee (BR-03/AC-11).
2. **A Practice Lead has no team (`leadId` matches nobody):** dataset is empty; the call still runs and yields an empty `results[]` with a clear "no team members" outcome — never errors.
3. **Dataset serialization is non-deterministic** (e.g. map ordering): caught by a determinism check (same input → identical JSON string); otherwise the loop's cache reuse breaks — fail the test, not silently.
4. **`callClaude` returns `Failure`** (invalid JSON / unreachable): propagated as a typed failure to SUB-TASK-2 (no partial `MatchResult` ever constructed in code).
5. **Prompt accidentally inlines the query inside the cache breakpoint:** cache misses on every query — flagged by a cache-hit assertion on the loop's second run.

## Failure Conditions (testable defects)

1. `match-staffing` is dispatched to Sonnet (or a hardcoded model id) instead of Opus → BR-12 violation.
2. A Practice Lead's dataset includes employees outside their team (`leadId != caller.id`) → BR-03/AC-11 scoping violation.
3. Two identical match requests produce different serialized dataset strings (non-deterministic ordering) → cache reuse / loop before-after determinism broken.
4. The dataset omits `allocation`/`freeFrom`, so the model cannot reason over availability → BR-04 violation.
5. Code performs keyword/date filtering of candidates before the Claude call (substituting for the model's availability reasoning) → BR-09 violation.
