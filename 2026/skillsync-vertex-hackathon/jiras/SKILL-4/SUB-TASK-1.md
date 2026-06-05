# SKILL-4 / SUB-TASK-1 — Hero loop orchestration: gap → recommend → cert promote → re-run match

**Parent:** SKILL-4 · **Component:** Loop orchestration + Claude integration · **Repo:** ai-nu-skillsync
**Gaps:** TD-LOOP-01

## Pseudocode

1. **Capture the BEFORE baseline** (`lib/loop/runLoopBefore.ts`): a Manager runs `POST /api/match` (SKILL-3) → record candidate X's `{matchPercent, rankIndex}` for the surfaced query, and extract X's gap list from the `MatchResult.results[].gaps` (Page 02 §4.3). Persist nothing — this is a read.
2. **Drive the recommendation** (`recommend-items`): call `callClaude({ promptName:"recommend-items", complexity:"routine" /* → Sonnet */, schema: Recommendations, variables:{ profile, gaps } })` to suggest a `CatalogItem` for X's gap (e.g. "AWS"). Surface it on the tracker (endorsed items preferred). The employee adds it to a finalized plan (SUB-TASK-3 gate) and completes it.
3. **Promote on the SAME record + re-run** (`lib/loop/runLoopAfter.ts`):
   - Reuse SKILL-2's `confirmCertExtraction(uploadId, confirmedSkills)` → `resolveCanonicalSkill` → `upsertAndPromoteSkill(X.id, "AWS", targetState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED)` (Page 03 §3.2) — promotes the **one** `EmployeeSkill` row, never inserts a second.
   - Assert the row invariant: exactly one `EmployeeSkill` for `(X.id, canonical AWS skillId)` (the duplicate-row failure signature guard, ADR-007).
   - Re-run the **same** `POST /api/match` query. Because the dataset serialization is deterministic (SKILL-3), the cached dataset is reused and differs by exactly the promoted record (Page 02 §2.3/§4.3).
   - Compute the delta: AFTER `matchPercent`/`rankIndex` for X vs the BEFORE baseline; assert improvement is driven by the promoted trust state.

## Implementation Contract

- **GOAL:** A reproducible hero-loop path that records a BEFORE match, drives a Claude recommendation for the gap, promotes the single skill record via the SKILL-2 cert write, re-runs the same search, and proves the candidate's rank improves with no duplicate row.
- **CONSTRAINTS:**
  - Per **ADR-007 / BR-18**, the loop MUST reuse `upsertAndPromoteSkill` keyed by `(profileId, canonicalSkillId)` — never a blind insert; the before/after compares the SAME row.
  - Per **ADR-003 / BR-09**, `recommend-items` is a Claude call (Sonnet) Zod-validated against `Recommendations`; no hardcoded recommendation list.
  - Per **Page 02 §2.3 / BR-12**, the re-run reuses the cached, deterministically serialized dataset (SKILL-3); the dataset changes by exactly one promoted record.
  - Per **ADR-006 / TS-003**, the match re-run is the read-only `POST /api/match` handler — never a mutation.
- **FORMAT:** `lib/loop/runLoopBefore.ts`, `lib/loop/runLoopAfter.ts`; reuses `confirmCertExtraction` (SKILL-2), `POST /api/match` + `buildMatchDataset` (SKILL-3), `upsertAndPromoteSkill` + `resolveCanonicalSkill` (SKILL-1), `src/prompts/recommend-items.ts`, `src/schemas/recommendations.ts`.

## Data Models

- **Prompt:** `recommend-items` (Sonnet) → `Recommendations { items: [{ catalogItemId, name, rationale, endorsed? }] }` (Page 02 §2.4/§2.5).
- **Reused write:** `upsertAndPromoteSkill(profileId, skillNameOrId, targetState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED)` (Page 03 §3.2).
- **Prisma reads/writes:** read `EmployeeSkill` (`trustState`) + `Skill` for the before/after; write via the reused upsert+promote only (no new write path). `MatchResult` (Page 02 §2.5) for before/after.
- **No new endpoint** — composes `POST /api/match` (SKILL-3) + `confirmCertExtraction` (SKILL-2).

## Error Handling

1. **`recommend-items` returns `Failure`** (invalid JSON / unreachable): surface a typed failure on the recommendation surface; the loop can still proceed manually (employee picks an item) — never fabricate a recommendation (BR-09).
2. **Cert parse/confirm fails** (SKILL-2 path): the promote never happens; the BEFORE baseline stands; no partial promotion is recorded — the loop simply does not advance.
3. **Duplicate-row signature detected** (two `EmployeeSkill` rows for the canonical skill after promote): hard test failure — this is the highest-impact demo defect (ADR-007); never silently tolerate.
4. **Re-run match returns `Failure`** (AC-06): show the matcher retry message; do NOT compute a fabricated AFTER delta.
5. **AFTER rank ≤ BEFORE rank despite a successful VERIFIED promotion:** flag — either the dataset wasn't refreshed (stale cache) or the matching weight isn't honoring trust state; investigate, don't assert success.

## Failure Conditions (testable defects)

1. The loop's promote inserts a second `EmployeeSkill` row instead of promoting the existing one → BR-18/ADR-007 violation; before/after comparison broken.
2. The recommendation is produced by hardcoded/keyword logic rather than the `recommend-items` Claude call → BR-09 violation.
3. The re-run match rebuilds a non-deterministic dataset (cache miss), so the before/after differs by more than the promoted record → loop integrity / BR-12 violation.
4. After a successful cert promotion to VERIFIED, X's match %/rank does not improve → hero AC-07 failure.
5. The match re-run is implemented as a Server Action (mutation) rather than the read-only `/api/match` handler → ADR-006/TS-003 violation.
