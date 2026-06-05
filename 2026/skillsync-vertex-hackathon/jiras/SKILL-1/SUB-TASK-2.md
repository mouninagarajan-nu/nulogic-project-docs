# SKILL-1 / SUB-TASK-2 — Claude client wrapper, prompts/schemas scaffold & upsert+promote repository path

**Parent:** SKILL-1 · **Component:** Claude integration layer + repository · **Repo:** ai-nu-skillsync
**Gaps:** TD-AI-01, TD-AI-02, TD-DATA-01

## Pseudocode

1. **Build the single Claude client wrapper** `callClaude<T>(input)` (Page 02 §2.1):
   - `input = { promptName, variables, schema, complexity, cacheableContext }`.
   - `model = route(complexity)` where `route("routine") → Sonnet id`, `route("hard") → Opus id`; model ids read from config/env (never hardcoded in business logic) — BR-12.
   - `messages = renderPrompt(promptName, variables)` from `src/prompts/`.
   - `system = withCacheControl(systemPrompt, cacheableContext)` — mark the system prompt + serialized profile dataset as cacheable; keep per-request query outside the breakpoint (Page 02 §2.3).
   - `response = anthropic.messages.create({ model, system, messages })`; `raw = extractStructuredBlock(response)` (tolerate prose around JSON).
   - `result = schema.safeParse(raw)`; `log({ requestId, promptName, model, cacheRead, ok: result.success })` (no PII — synthetic ids/skill names only).
   - `if !result.success → return Failure(promptName, requestId)` (NEVER persist raw text). Else `return Ok(result.data)`.
   - **Guardrail:** if a real call is awkward to wire (file→base64 plumbing), stub the boundary with a `TODO` that returns `Failure` — never fake parsed data (BR-09).
2. **Scaffold `src/prompts/`** as named template exports (each returns a message array given typed variables), one stub per Page 02 §2.4 prompt: `parse-certificate`, `parse-resume`, `match-staffing`, `catalog-dedupe`, `catalog-enrich`, `recommend-items`, `summarize-progress`, `skill-identity`. **Scaffold `src/schemas/`** Zod skeletons per §2.5: `CertParseResult`, `ResumeParseResult`, `MatchResult`, `DedupeDecision`, `CatalogEnrichment`, `Recommendations`, `ProgressSummary`, `SkillIdentityDecision`.
3. **Implement `resolveCanonicalSkill(rawSkillName)`** (Page 03 §3.4) — two layers:
   - Layer 1 (deterministic, always runs): `key = deterministicCanonicalKey(raw)` (lowercase/trim/collapse punctuation+whitespace); `find Skill by canonicalKey == key`; if found return its id.
   - Layer 2 (Claude `skill-identity` merge advisor): `decision = callClaude(skill-identity, ...)`; if `decision.ok && decision.sameAs` return it. On `Failure` → `markReconcilePending(key)` and fall through.
   - Create-new keyed by `canonicalKey` (idempotent under races via `@unique`); return new `Skill.id`.
4. **Implement `upsertAndPromoteSkill(profileId, skillNameOrId, targetState, source, origin)`** (Page 03 §3.2): resolve canonical id → find `EmployeeSkill` by `(profileId, canonicalSkillId)` → if none insert at `targetState`; else if `order(targetState) > order(existing.trustState)` promote (set `trustState`, `promotedAt`) else no-op. Return the single record.

## Implementation Contract

- **GOAL:** One enforceable Claude call boundary (Zod-before-write, routing, caching, logging), the prompt/schema scaffolding, and the single skill upsert+promote path all later stories reuse.
- **CONSTRAINTS:**
  - Per **ADR-003 / BR-09 / P2**, every model output passes `safeParse` before any use; there is exactly one boundary; a failure returns a typed `Failure` and writes nothing. No regex/keyword/hardcoded substitute; awkward calls stubbed with `TODO` returning `Failure`.
  - Per **BR-12 / ADR-003 §2.2–2.3**, Sonnet default / Opus only for `match-staffing`; cache system prompt + serialized dataset; model ids from config.
  - Per **ADR-007 / BR-18 / TS-001 / TS-002**, all skill writes route through `upsertAndPromoteSkill`; identity via two-layer `resolveCanonicalSkill`; a Claude de-dupe failure NEVER blocks the write (deterministic `canonicalKey` + `reconcilePending` fallback).
  - Per **P3 / NFR Observability**, log requestId/model/cache/validation; never log PII.
- **FORMAT:** `lib/ai/claude.ts` (wrapper) + `lib/ai/route.ts`; `src/prompts/*.ts`; `src/schemas/*.ts`; `lib/repos/skill.ts` (`resolveCanonicalSkill`, `upsertAndPromoteSkill`, `order`).

## Data Models

- **Zod schemas (`src/schemas/`):** per Page 02 §2.5 shapes.
- **Prompt templates (`src/prompts/`):** the 8 named templates in Page 02 §2.4.
- **Repository functions:** `resolveCanonicalSkill`, `upsertAndPromoteSkill`, `order(trustState)`, `markReconcilePending`.
- **Prisma entities touched:** `Skill` (canonicalKey), `EmployeeSkill` (trustState/origin/promotedAt).

## Error Handling

1. **Model returns prose-wrapped or partial JSON:** `extractStructuredBlock` recovers the JSON block; if none is recoverable → `safeParse` fails → typed `Failure`, nothing persisted.
2. **`safeParse` fails / confidence below threshold:** return `Failure(promptName, requestId)`; the caller surfaces the spec'd user message; NO write (AC-03/06/20 substrate).
3. **Anthropic SDK throws (network / 5xx / rate limit):** caught at the boundary, mapped to `Failure`; never bubbles raw to a write path; logged with requestId.
4. **`skill-identity` (Layer 2) fails/unreachable during `resolveCanonicalSkill`:** fall back to deterministic `canonicalKey` create-new + `markReconcilePending(key)` (TS-002); the verified write still completes.
5. **Concurrent create-new for the same `canonicalKey`:** the `@unique` constraint rejects the loser, which re-reads the winner's `Skill.id` (single-record under races).

## Failure Conditions (testable defects)

1. A wrapper returns model data that did NOT pass `safeParse` (e.g. on a thrown SDK error it returns partial text) → BR-09/P2 violation.
2. `match-staffing` is routed to Sonnet (or any prompt reads a hardcoded model id in business logic) → BR-12 violation.
3. Calling `upsertAndPromoteSkill` with a lower `targetState` than the existing record **demotes** the row → BR-18 monotonic-promotion violation.
4. Two calls to `resolveCanonicalSkill("TypeScript")` and `resolveCanonicalSkill("TS")` return different `Skill.id`s when a seeded alias mapping exists → de-dupe seam broken.
5. A `skill-identity` failure causes `confirmCertExtraction` (downstream) to throw/hang instead of falling back → TS-002 violation (the P0 write must never block).
