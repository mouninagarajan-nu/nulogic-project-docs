# SKILL-4 — The Hero Loop + Catalog Intelligence

## Metadata

| Field | Value |
|---|---|
| **Story ID** | SKILL-4 |
| **Epic** | EPIC-1 — Foundation & The Hero Loop (loop portion) + EPIC-2 — Profile Spine & Catalog Intelligence (catalog portion) |
| **Roadmap Phase** | Phase 4 (The Loop) + Phase 6 (Catalog & Plan) |
| **Story Points** | 8 |
| **T-shirt** | L |
| **Estimated LOC** | ~480 |
| **Impact** | HIGH (P0 hero — the product bet; before/after loop integrity; catalog de-dupe/enrich/recommend; plan compliance gate) |
| **Priority** | Highest |
| **Component** | Loop orchestration (recommend → cert promote → re-match), Catalog service, Upskilling Plan service, Claude integration |
| **Target Repository** | ai-nu-skillsync |
| **Gaps Closed** | TD-LOOP-01, TD-CAT-01, TD-CAT-02, TD-PLAN-01, TD-DATA-03 |
| **Owner** | -- |
| **Status** | Backlog |

## User Story

**As a** Manager/HR closing a staffing gap (and the Employee who fills it on the Upskilling Tracker),
**I want** a surfaced skill gap to drive a Claude recommendation, an employee to add learning to a validated upskilling plan, complete it, upload a certificate that promotes the *same* skill record, and the *same* staffing search to visibly improve — over a catalog that Claude keeps clean, tagged, enriched, and endorsed,
**so that** identified gaps actually drive learning and completed learning measurably sharpens staffing — the loop that is the entire reason the two modules share one profile.

> Business persona: Manager/HR + Employee (no engineering persona). This is **the hero capability** — protect it above all.

## Business Context

**Problem.** Today identified skill gaps never drive learning and completed learning never sharpens staffing — the two processes are disconnected. The catalog is a flat list with duplicate, untagged entries and no signal for which learning is org-preferred or AI-enabled, so recommendations and the compliance plan have nothing reliable to stand on.

**Value.** The loop is **the product bet**: a gap surfaced by the matcher (SKILL-3) drives a Claude recommendation, the employee assembles a validated plan and completes an item, a certificate upload (SKILL-2) promotes the **single canonical skill record** to `verified`, and re-running the **same** staffing search visibly raises the candidate's match %/rank — driven by the promoted trust state, never a duplicate row. Catalog intelligence (de-dupe, tag, enrich, recommend, endorse) is what makes the recommendation step trustworthy and the plan gate (≥2 items incl. ≥1 AI-enabled) is what makes upskilling compliance measurable.

## Business Rules

| BR | Description |
|---|---|
| BR-06 | Catalog de-duplication is semantic and Claude-driven (merge "AWS Solutions Architect" into the canonical item) — no string-equality/regex. |
| BR-07 | Catalog items are auto-tagged + auto-enriched by Claude; enrichment failure sets `enrichmentPending` and never blocks the add. |
| BR-08 | Recommendations are personalized by Claude from role/team/current skills/matcher-surfaced gaps — feeds the loop's recommendation step. |
| BR-09 | All intelligence (de-dupe, tag, enrich, recommend) is a Claude call, Zod-validated before use — no hardcoded substitute. |
| BR-11 | Upskilling plan must include ≥2–3 items, ≥1 AI-enabled; the finalize gate enforces it and ties to the §8 compliance metric. |
| BR-18 | One canonical skill record; the loop's cert upload **promotes** that single record (`self-reported`/`manager-approved` → `verified`) — never duplicates the row. |
| BR-19 | Idempotent uploads keep the loop's before/after comparison clean (no duplicate promotion from a double-submit). |
| BR-22 | Manager `endorsed` catalog flag (set/unset, manager-only) surfaced in catalog + recommendation views; flag only, no workflow. |

## AC Mapping

| AC | Description |
|---|---|
| AC-07 | Close the loop (hero, e2e) — cert upload promotes the SAME skill record and the re-run search visibly improves; no duplicate row. |
| AC-08 | Catalog de-dupe / normalize on add — near-duplicate merges into the canonical item via Claude. |
| AC-09 | Catalog auto-tag + auto-enrich; enrichment failure → `enrichmentPending`, add never blocked. |
| AC-10 | Claude recommends catalog items to an employee from role/team/skills/gaps. |
| AC-26 | Upskilling-plan validation gate (≥2 items incl. ≥1 AI-enabled) — accept / specific rejection / remove-swap re-validate. |
| AC-27 | Manager `endorsed` catalog flag set/unset + surfacing; non-manager denied. |
| AC-22 | One canonical skill identity; the loop's promotion is on the same record (loop side; cert-write half in SKILL-2). |
| AC-23 | Idempotent uploads keep the loop clean (loop reuse of the idempotency guard). |

## Technical Architecture

- **The loop orchestration (Page 02 §4.3):** ties SKILL-2 (cert → verified promote) and SKILL-3 (`POST /api/match`) into the hero path: matcher surfaces a gap for candidate X → `recommend-items` (Sonnet) suggests a catalog item for the gap → employee adds it to a plan, completes it, uploads the cert (`confirmCertExtraction` → `upsertAndPromoteSkill(targetState=VERIFIED)`) → re-run the **same** query → X's rank improves. The before/after delta is driven **only** by the promoted trust state of the one canonical `EmployeeSkill` row.
- **Catalog service (Page 02 §4.5):** `addCatalogItem(name)` Server Action → `catalog-dedupe` (Sonnet) → merge into canonical `CatalogItem` or create new → `catalog-enrich` (Sonnet) sets `tagsJson`, `aiEnabled`, `description`, `provider`, `typicalDuration`; on enrich failure set `enrichmentPending=true` (never block the add). `setEndorsed` Server Action (Manager/HR/Admin only) toggles `endorsed`; surfaced in catalog + recommendation views.
- **Recommendations (Page 02 §4.5 / §2.4):** `recommend-items` (Sonnet) over profile + gaps → `Recommendations` schema (Zod). Endorsed items are surfaced/preferred in this view (BR-22).
- **Plan validation gate (Page 02 §4.6):** `finalizePlan(itemIds[])` Server Action counts `PlanItem`s and checks ≥1 `aiEnabled=true` (from the catalog tag). `<2` ⇒ stays `DRAFT` + *"Pick at least 2 items for your plan."*; `0 AI-enabled` ⇒ *"Your plan needs at least one AI-enabled item."*; conforming ⇒ `FINALIZED`, counts toward §8 compliance. A **constraint, not new intelligence** (reuses the Claude `aiEnabled` tag).
- **NFRs:** loop before/after must compare the same row (Reliability/P4); enrichment failure degrades gracefully (Resilience); deterministic dataset reuse so the re-run hits the cache (Cost efficiency); call-boundary logging (Observability); no PII (Privacy).

## Architecture References

- **Service design (Page 02):** the loop sequence (§4.3); catalog intelligence sequence (§4.5); plan finalize gate (§4.6); Server Actions `addCatalogItem`, `setEndorsed`, `finalizePlan`, `confirmCertExtraction` (§3.1); `POST /api/match` re-run (§3.2a); prompt templates `catalog-dedupe`/`catalog-enrich`/`recommend-items` (§2.4); schemas `DedupeDecision`/`CatalogEnrichment`/`Recommendations`/`MatchResult` (§2.5); model routing — all Sonnet here, Opus on the re-run match (§2.2).
- **Data model (Page 03):** `CatalogItem` (`aiEnabled`, `endorsed`, `enrichmentPending`, `tagsJson`, enrichment fields — §4.4); `UpskillingPlan` + `PlanItem` (`@@unique([employeeId])`, §4.5); `EmployeeSkill` trust-state promotion on the single record (§3.2); `resolveCanonicalSkill` two-layer + reconcile fallback (§3.4, TS-001/TS-002).
- **ADRs (Page 05):** ADR-007 (single promotable record — the loop invariant), ADR-003 (Claude wrapper + Zod gate + routing/caching), ADR-002 (data store), ADR-004 (upload idempotency reused by the loop), ADR-006 (Next.js 16: Server Actions for mutations; `POST /api/match` read-only on the re-run).
- **Roadmap:** Phase 4 deliverables + exit criteria + Phase 6 deliverables + exit criteria (Page 04 §2); risk register "Duplicate skill row breaks before/after", "Claude invalid JSON".
- **Pseudocode functions:** `upsertAndPromoteSkill(...)` (Page 03 §3.2), `resolveCanonicalSkill(...)` (§3.4), `callClaude<T>` (Page 02 §2.1).

## Acceptance Criteria (Gherkin)

### Scenario A — Close the loop, hero end-to-end (AC-07, S-08)
```gherkin
GIVEN a Manager runs a staffing query that surfaces candidate X with a gap "AWS"
AND X holds "AWS" as self-reported (or does not yet hold it)
AND the matcher result (match % / rank for X) is recorded as the BEFORE baseline
WHEN Claude (recommend-items) suggests a catalog item for the AWS gap
AND X adds it to a finalized plan, completes it, and uploads fixtures/certs/aws-saa-valid.pdf which is parsed, confirmed, and written via upsert+promote to VERIFIED on the SAME EmployeeSkill record
AND the manager re-runs the SAME query (cached dataset, now changed by exactly one promoted record)
THEN X's match % and/or rank visibly improves versus the BEFORE baseline
AND the improvement is driven by the promoted trust state of the one canonical skill record
AND NO duplicate skill row was created (the before/after compares the same row).
```

### Scenario B — Catalog de-dupe on add (AC-08, S-09)
```gherkin
GIVEN the catalog already contains "AWS Certified Solutions Architect"
WHEN a user adds "AWS Solutions Architect"
THEN catalog-dedupe (Claude) returns isDuplicateOf the canonical item
AND the new entry is merged into the existing canonical CatalogItem
AND no duplicate catalog row is created.
```

### Scenario C — Catalog auto-tag/enrich with graceful degradation (AC-09, S-10)
```gherkin
GIVEN a user adds a brand-new catalog item by name only
WHEN the item is saved
THEN catalog-enrich (Claude) sets tagsJson (skillArea/level/roleRelevance), aiEnabled, description, provider, typicalDuration
AND if the enrich call fails or fails Zod validation the item is saved with enrichmentPending=true
AND the add is never blocked.
```

### Scenario D — Recommendations to an employee (AC-10, S-11)
```gherkin
GIVEN an employee with a role, team, current skills, and matcher-surfaced gaps
WHEN they view recommendations (e.g. the tracker empty-state)
THEN recommend-items (Claude) returns Zod-validated catalog items relevant to that employee's role/team/skills/gaps
AND endorsed items are surfaced/preferred in the view.
```

### Scenario E — Plan validation gate (AC-26, S-26)
```gherkin
GIVEN an employee assembling an upskilling plan from the catalog
WHEN they finalize a plan with fewer than 2 items
THEN the plan stays DRAFT and they see "Pick at least 2 items for your plan."
WHEN they finalize a plan of 2+ items but none is aiEnabled
THEN the plan stays DRAFT and they see "Your plan needs at least one AI-enabled item."
WHEN they remove/swap to reach ≥2 items including ≥1 aiEnabled and re-finalize
THEN the plan is FINALIZED and counts toward the §8 compliance metric.
```

### Scenario F — Manager endorsed flag, non-manager denied (AC-27, S-27)
```gherkin
GIVEN a Manager/HR/Admin and a catalog item, plus a non-manager (Employee / PL outside authority)
WHEN the manager toggles endorsed on then off via setEndorsed
THEN the item is marked endorsed and can be un-endorsed, and endorsed state is surfaced in catalog + recommendation views
AND a non-manager attempting setEndorsed is denied (toggle unavailable/rejected)
AND no endorsement workflow (review chains, notifications) exists — only the flag.
```

## Dependencies

- **blocks:** none (final hero integration; SKILL-6 surfaces these flows in the UI but does not block this story's logic).
- **blocked_by:** SKILL-1 (Claude wrapper, schemas, `upsertAndPromoteSkill`, `CatalogItem` flags, `UpskillingPlan`/`PlanItem`), SKILL-2 (verified-promotion cert write path the loop reuses), SKILL-3 (`POST /api/match` + dataset builder the loop re-runs).

## Sub-Tasks

- **SUB-TASK-1** — Loop orchestration: gap → `recommend-items` → cert promote (reuse SKILL-2) → re-run `POST /api/match`; before/after comparison guarded against the duplicate-row failure signature.
- **SUB-TASK-2** — Catalog service: `addCatalogItem` (`catalog-dedupe` → merge/create → `catalog-enrich` → `enrichmentPending` on fail), `setEndorsed` (authority-gated), `recommend-items`.
- **SUB-TASK-3** — Plan validation gate `finalizePlan` (≥2 items, ≥1 AI-enabled, specific messages, remove/swap re-validate) + loop/catalog/plan tests.

## UX/Design

Status: Awaiting UX designs (final branded screens in SKILL-6). Required states: a recommendation surface (tracker empty-state + gap-driven suggestion, endorsed badge); catalog add-by-name with a merged-into-canonical indication and an `enrichmentPending` badge; the plan builder with the two specific rejection messages and a remove/swap affordance; the hero loop demo path showing a BEFORE match, the cert upload, and an AFTER match with the visible rank delta. NULogic branding.

## Definition of Done

- The loop runs end-to-end: a surfaced gap → recommendation → completed item → cert promote on the same record → re-run match visibly improves X's rank, with no duplicate row (AC-07).
- `addCatalogItem` de-dupes via Claude (merge, no duplicate), enriches, and sets `enrichmentPending` on enrich failure without blocking the add (AC-08/09).
- `recommend-items` returns validated recommendations; endorsed items surfaced (AC-10/27).
- `finalizePlan` enforces ≥2 items + ≥1 AI-enabled with the spec'd messages and a remove/swap re-validate path; conforming plans count toward compliance (AC-26).
- `setEndorsed` is manager-gated; non-manager denied (AC-27).
- Loop/catalog/plan tests green; before/after evidence shown. Typecheck + lint clean.

## Risks & Assumptions

- **Risk:** a duplicated skill row (instead of a promotion) breaks the before/after comparison — the highest-impact demo failure. **Mitigation:** the loop reuses `upsertAndPromoteSkill` keyed by `(profileId, canonicalSkillId)` (BR-18/ADR-007); a loop test asserts exactly one row and a positive rank delta.
- **Risk:** `catalog-dedupe` mis-merges distinct items or fails to merge a true duplicate. **Mitigation:** Claude de-dupe (BR-06) with the canonical-item merge confirmed; thin cases logged, not silently dropped.
- **Risk:** enrichment failure blocks the add. **Mitigation:** `enrichmentPending=true` path (BR-07/AC-09) — the add always completes.
- **Risk:** the re-run match doesn't hit the cache, making the loop feel slow. **Mitigation:** deterministic dataset serialization (SKILL-3); the dataset changes by exactly the promoted record.
- **Assumption:** SKILL-2's `confirmCertExtraction` and SKILL-3's `POST /api/match` are stable and reused as-is; the plan gate is a constraint reusing the Claude `aiEnabled` tag (not a new model call).

## Progress Log

| Timestamp | Actor | Note |
|---|---|---|
| 2026-06-05T00:00:00Z | nulogic-jira-creator | Story created from PRD + target-state architecture (Phase 4 loop + Phase 6 catalog/plan). Local-only run. |
