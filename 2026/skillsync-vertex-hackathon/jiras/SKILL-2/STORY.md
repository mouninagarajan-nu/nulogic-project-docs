# SKILL-2 — Certificate parsing → verified skills (the innovation hero)

## Metadata

| Field | Value |
|---|---|
| **Story ID** | SKILL-2 |
| **Epic** | EPIC-1 — Foundation & The Hero Loop |
| **Roadmap Phase** | Phase 2 (Certificate Parsing) |
| **Story Points** | 5 |
| **T-shirt** | L |
| **Estimated LOC** | ~380 |
| **Impact** | HIGH (P0 hero risk; data-integrity write path) |
| **Priority** | Highest |
| **Component** | Upload service, Claude integration, Profile & Skill (upsert+promote) |
| **Target Repository** | ai-nu-skillsync |
| **Gaps Closed** | TD-CERT-01, TD-DATA-01 (verify path), TD-DATA-05 (cert idempotency) |
| **Owner** | mouninagarajan-nu |
| **Started At** | 2026-06-07T17:05:00Z |
| **Status** | In Progress |

## User Story

**As an** Employee (Practitioner) on the Upskilling Tracker,
**I want** to upload a certificate and have my skill extracted automatically and added to my profile as *verified* after I confirm it,
**so that** my completed learning becomes trustworthy proof that staffing can rely on — without manual data entry, and without a bad scan ever corrupting my profile.

## Business Context

**Problem.** Today completed upskilling has no proof and never reaches the skill record. Manually re-typing skills is error-prone and untrustworthy. This is also the **riskiest** capability in the build (CLAUDE.md build order) and the **innovation hero** — the certificate → verified-skill step is what makes the whole loop credible.

**Value.** A certificate upload that Claude parses into a structured, validated skill — confirmed by the employee, then written as the highest-trust `verified` state on the **same canonical record** — turns learning into trustworthy capability data instantly. The graceful-failure discipline (never write garbage) protects the profile and the demo.

## Business Rules

| BR | Description |
|---|---|
| BR-01 | A skill reaches `verified` (`source=certificate`) only when Claude extracted it from an uploaded certificate and the employee confirmed it. |
| BR-02 | A failed / low-confidence / invalid-JSON parse never writes a skill; the item stays in-progress. |
| BR-09 | Certificate parsing is a Claude API call returning JSON validated (Zod) before use — no regex/keyword extraction. |
| BR-18 | The verified write promotes the one canonical skill record in place (`self-reported`/`manager-approved` → `verified`); never duplicates the row. |
| BR-19 | Double-submit of the same certificate is idempotent — DB-enforced `@@unique([employeeId, contentHash])`; converges to one result, no duplicate promotion. |

## AC Mapping

| AC | Description |
|---|---|
| AC-01 | Certificate parsing via Claude (happy path) → confirmed skill written `verified`, `source=certificate`; item becomes `done`. |
| AC-02 | Multi-skill / unusual certificate — all extracted skills returned in validated JSON; ambiguous optional fields don't break the write. |
| AC-03 | Parse failure / low confidence — no skill written, item stays in-progress, spec'd error message shown. |
| AC-22 | One canonical skill identity; cert verify promotes the same record in place (cert side). |
| AC-23 | Idempotent double-submit of a cert upload (cert side). |

## Technical Architecture

- **Transport (Next.js 16, ADR-004/006):** `POST /api/uploads/certificate` Route Handler (multipart streaming + size limits at the request edge). Mutations elsewhere are Server Actions; this upload + the confirm step are split: parse → Zod → confirm → write.
- **Flow (Page 02 §4.1):** handler computes `contentHash`, checks the app-layer idempotency fast-path; on a new file calls the Claude wrapper with `parse-certificate` (Sonnet) → `CertParseResult` → confidence gate → returns `{uploadId, extracted}` for the employee to confirm.
- **Confirm + write:** `confirmCertExtraction(uploadId, confirmedSkills[])` Server Action (own profile only) routes each confirmed skill through `resolveCanonicalSkill` → `upsertAndPromoteSkill(..., targetState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED)`. The skill-identity de-dupe is a **merge advisor, not a gate** — on failure the write falls back to deterministic `canonicalKey` create-new + `reconcilePending` (TS-002); the verified write never blocks/corrupts.
- **Idempotency:** DB `@@unique([employeeId, contentHash])` on `Certificate` is the race-safe backstop; the app-layer "seen before?" check is the fast path. Client guards the submit affordance against double-click.
- **NFRs:** validate-before-write; no write on failure; idempotent under concurrency; call-boundary logging.

## Architecture References

- **API contracts (Page 02):** `POST /api/uploads/certificate` (§3.2), `confirmCertExtraction` Server Action (§3.1), cert flow sequence (§4.1), de-dupe-failure note (TS-002).
- **Data model (Page 03):** `Certificate` (+ `contentHash`, `@@unique([employeeId, contentHash])`), `EmployeeSkill` trust-state promotion (§3), `resolveCanonicalSkill` (§3.4), `upsertAndPromoteSkill` (§3.2).
- **Schemas / prompts:** `CertParseResult` (Page 02 §2.5), `parse-certificate` (Sonnet, §2.2/§2.4), `skill-identity` (advisor).
- **ADRs:** ADR-004 (uploads: Route Handlers + content-hash idempotency + parse→confirm→write), ADR-003 (Claude wrapper + Zod gate), ADR-007 (single promotable record), ADR-006 (Next.js 16 conventions).
- **Roadmap:** Phase 2 deliverables + exit criteria (Page 04 §2); risk register "Claude invalid JSON" / "Duplicate skill row".

## Acceptance Criteria (Gherkin)

### Scenario A — Cert parse happy path (AC-01, S-01)
```gherkin
GIVEN an authenticated Employee on the Upskilling Tracker with an in-progress catalog item and fixtures/certs/aws-saa-valid.pdf
WHEN the employee uploads the certificate
THEN the Claude API call boundary is invoked exactly once with the parse-certificate prompt (Sonnet)
AND Claude returns {skills[], issuer, date?, confidence} that is Zod-validated against CertParseResult
AND the extracted skill is shown for confirmation
AND on confirm the skill is written via upsert+promote with trustState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED on a single record
AND the catalog item status becomes done.
```

### Scenario B — Multi-skill / unusual certificate (AC-02, S-02)
```gherkin
GIVEN fixtures/certs/multi-skill-bootcamp.pdf listing multiple skills or an uncommon issuer
WHEN the employee uploads it
THEN Claude returns ALL extracted skills in Zod-validated JSON
AND each confirmed skill is written verified
AND ambiguous or missing optional fields (e.g. date) do not break the write for well-formed entries.
```

### Scenario C — Parse failure / low confidence (AC-03, S-03)
```gherkin
GIVEN fixtures/certs/not-a-cert.png OR Claude returns invalid JSON / confidence below threshold
WHEN the employee uploads it
THEN no skill is written to the profile
AND the catalog item remains in-progress
AND the user sees "We couldn't reliably read this certificate. Check it's a clear PDF or image and try again, or add the skill manually."
```

### Scenario D — Promotion on the same record, no duplicate (AC-22 cert side, S-22)
```gherkin
GIVEN the employee already holds "TypeScript" as a self-reported (or manager-approved) skill
WHEN a certificate for "TypeScript" is parsed, confirmed, and written
THEN the existing single EmployeeSkill record is promoted in place to verified (raising matching weight)
AND no duplicate skill row is created
AND a certificate for an equal-or-lower trust is a no-op (never demotes).
```

### Scenario E — Idempotent double-submit (AC-23 cert side, S-23)
```gherkin
GIVEN the same certificate file is submitted twice (double-click / retry / re-send)
WHEN the redundant submission is processed
THEN the @@unique([employeeId, contentHash]) constraint (and app-layer fast path) cause the second submit to return the prior uploadId without re-parsing
AND no duplicate Certificate, no duplicate skill record, and no duplicate verified promotion are created.
```

## Dependencies

- **blocks:** SKILL-4 (the loop reuses the verified-promotion write path).
- **blocked_by:** SKILL-1 (Claude wrapper, `CertParseResult` schema, `Certificate.contentHash`, `upsertAndPromoteSkill`, fixtures).

## Sub-Tasks

- **SUB-TASK-1** — Upload Route Handler + `parse-certificate` prompt + `CertParseResult` schema + confidence gate + content-hash idempotency.
- **SUB-TASK-2** — `confirmCertExtraction` Server Action: upsert+promote to `verified`, de-dupe-failure fallback, item→done.
- **SUB-TASK-3** — Cert-parsing tests against `fixtures/certs/` (happy / multi-skill / failure / promotion / idempotency).

## UX/Design

Status: Awaiting UX designs (final screens in SKILL-6). Required states for this flow: upload control with in-flight disable (idempotency guard); an extracted-skills confirmation panel; the failure message inline with the item staying in-progress; empty-state copy "You haven't picked any learning yet…". NULogic branding.

## Definition of Done

- `POST /api/uploads/certificate` parses via Claude (Sonnet) → `CertParseResult` (Zod) with a confidence gate.
- A majority of `fixtures/certs/` parse to valid JSON (§8 metric); failure/low-confidence writes nothing and shows the spec'd message; item stays in-progress.
- `confirmCertExtraction` writes only after confirm, promotes the single record to `verified`, sets item `done`.
- Double-submit is idempotent (DB constraint + app fast path); de-dupe-call failure falls back without blocking the write.
- Cert-parsing tests green against fixtures; evidence shown (test output). Typecheck + lint clean.

## Risks & Assumptions

- **Risk:** thin fixture variety weakens AC-02. **Mitigation:** seed a multi-skill + unusual-issuer fixture (SKILL-1).
- **Risk:** the `skill-identity` de-dupe call failing could block the P0 verified write. **Mitigation:** TS-002 fallback — it is a merge advisor, not a gate.
- **Risk:** file→base64 plumbing to the SDK is awkward. **Mitigation:** stub the boundary with a `TODO` returning `Failure` (BR-09); never fake parsed data.
- **Assumption:** the confidence threshold is configurable and documented; below-threshold is treated as failure (AC-03).

## Progress Log

| Timestamp | Actor | Note |
|---|---|---|
| 2026-06-05T00:00:00Z | nulogic-jira-creator | Story created from PRD + target-state architecture (Phase 2). Local-only run. |
| 2026-06-07T00:00:00Z | nulogic-dependency-checker | 05-dependencies | Dependencies cleared. SKILL-1 resolved (merged to main via PR #1), 0 merge conflict risks, Anthropic SDK wrapper validated. READY to proceed. |
| 2026-06-07T00:00:00Z | nulogic-implementation-planner | 06-implementation-planning | Plan created. 4 phases (Phase 0 baseline + parse/idempotency, confirm/promote, fixture tests), 17 test scenarios. Heavy reuse of SKILL-1 (callClaude, resolveCanonicalSkill, upsertAndPromoteSkill, TS-002 fallback). 2 tactical ADRs (CertParseResult object-skills shape; cert-flow core shared by AC test + ADR-004 transport). LOC ~378/380. 0 P0 gaps. |
| 2026-06-08T00:00:00Z | nulogic-implementation-planner | 06-implementation-planning | Iteration 3 — bookkeeping fix (F-08 COUNT_DRIFT): reconciled test-scenario total to 20 (P0:2, P1:6, P2:6, P3:6) across test-scenarios.json counts field, implementation-plan.md §14 and Phase 1 TEST SCENARIOS narrative (added S2-P1-06), and implementation-planner-output.json (artifact description, plan_complete event, counts field). No design or content changes. |
| 2026-06-08T00:00:00Z | nulogic-test-creator | 07-tests | Tests created (iteration 1): 15 failing Vitest integration tests. All 5 ACs covered. RED for correct reason (missing @/lib/cert/parse-certificate). |
| 2026-06-08T00:00:00Z | nulogic-test-reviewer | 07-tests | Review: 9 findings (1 critical, 3 high, 3 medium, 2 low). next_stage_ready=false. F-01 critical: TS-002 stub not a real test. F-02: missing cross-profile rejection. F-03: broken manifest IDs. F-04: garbled parse only checked skills, not Certificate row. F-05: inexact counts. F-06: tautological assertion. F-07: state leak via beforeAll. F-08: mislabeled scenario ID. F-09: no normalizer branch justification. |
| 2026-06-08T00:00:00Z | nulogic-test-creator | 07-tests | Iteration 2 revision: resolved all 9 findings. Total tests: 16 (added S2-AUTH-01). All 16 fail RED for correct reason. Staged on feature/SKILL-2-cert-parsing. |
| 2026-06-08T00:00:00Z | nulogic-test-creator | 07-tests | Iteration 3 revision: resolved all 7 reviewer findings (2 high, 3 medium, 2 low). G2-01: S2-P3-01..05 added to excluded_scenarios[] with consolidation justification. G2-02: TADR-S2-03 added (integration-only normalizer coverage); manifest references it. G2-03: AC-22 describe block beforeAll→beforeEach; resets SELF_REPORTED baseline before each test. G2-04: S2-P1-02 DB count toBe(2). G2-05: clearReconcilePending() exported from lib/repos/skill.ts; called in TS-002 beforeEach. G2-06: Gherkin headings S2-P1-01b→S2-P2-01, S2-P1-02b→S2-P2-02. G2-07: Gherkin overview count 15→16. Typecheck: PASS. RED run: 16/16 failed — Cannot find package '@/lib/cert/parse-certificate'. |
