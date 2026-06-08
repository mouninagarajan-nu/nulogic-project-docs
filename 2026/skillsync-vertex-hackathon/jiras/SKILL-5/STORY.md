# SKILL-5 — Profile Spine: baseline skills, self-service, manager approval & resume extraction

## Metadata

| Field | Value |
|---|---|
| **Story ID** | SKILL-5 |
| **Epic** | EPIC-2 — Profile Spine & Catalog Intelligence (profile spine portion) |
| **Roadmap Phase** | Phase 5 (Profile Spine) |
| **Story Points** | 8 |
| **T-shirt** | L |
| **Estimated LOC** | ~460 |
| **Impact** | HIGH (feeds the matcher and the loop; data-integrity write path; resume parse mirrors the cert hero discipline) |
| **Priority** | High |
| **Component** | Profile & Skill service (self-service + approval), Upload service (resume), Claude integration (resume parse) |
| **Target Repository** | ai-nu-skillsync |
| **Gaps Closed** | TD-PROFILE-01, TD-RESUME-01, TD-APPROVE-01, TD-DATA-02 |
| **Owner** | -- |
| **Status** | Backlog |

## User Story

**As an** Employee (Practitioner) — and the Manager/HR who vouches for them —
**I want** to see my baseline current skills, add/update my own skills as self-reported, have a manager promote a self-reported skill to manager-approved, and upload my resume so Claude pre-populates my profile,
**so that** the profile behind every staffing match reflects my real, current capability the moment I capture it — without manual re-typing and without a bad parse ever corrupting my profile.

> Business persona: Employee + Manager/HR (no engineering persona). The profile spine is what feeds sharper matches and the loop.

## Business Context

**Problem.** A staffing match is only as good as the profile behind it. Today there is no way for an employee to capture skills they already have, no way for a manager to vouch for a self-reported skill, and no fast way to pre-populate a profile from a resume. Profiles go stale and matches suffer.

**Value.** Baseline/current skills (distinct from upskilling-acquired verified skills) let the matcher and the loop reason over real capability + availability. Employee self-service add/update (self-reported) and a single lightweight manager approval (self-reported → manager-approved) raise trust without an approval bureaucracy. Resume upload → Claude extraction pre-populates the profile after confirmation — the same validate-before-write discipline as cert parsing, so a bad parse never writes garbage. All four flows route through the **one** `upsertAndPromoteSkill` path, so they can never diverge into duplicate rows.

## Business Rules

| BR | Description |
|---|---|
| BR-14 | Employees self-manage their own skills — written `source=self-reported, state=self-reported`; blank/invalid rejected, no garbage written. |
| BR-15 | Skill trust-state machine + manager approval authority: `self-reported → manager-approved` only by a manager/HR with authority over the employee. |
| BR-16 | Baseline/current skills (`origin=BASELINE`) distinguished from upskilling-acquired skills; on every profile with current project + allocation/availability. |
| BR-17 | Resume parsing is a Claude call, Zod-validated; fails gracefully (writes nothing); extracted skills are `self-reported` (self-attested). |
| BR-18 | One canonical skill record; self-service add, approval, and resume extraction all promote/no-op the single record — never duplicate. |
| BR-19 | Idempotent resume uploads — DB-enforced `@@unique([employeeId, contentHash])`; double-submit converges to one pre-population. |
| BR-09 | Resume parsing is Claude-only, validated before use — no regex/keyword extraction. |

## AC Mapping

| AC | Description |
|---|---|
| AC-16 | Baseline current skills present + readable on the profile (UI/self-service half; data-present half in SKILL-1). |
| AC-17 | Employee self-service skill add/update (`source=self-reported, state=self-reported`); blank/invalid rejected inline. |
| AC-18 | Manager approval promotes `self-reported → manager-approved`; unauthorized actor denied. |
| AC-19 | Resume upload + Claude extraction (Zod-validated) pre-populates the profile after confirm; baseline skills `self-reported`. |
| AC-20 | Resume parse failure / low confidence → nothing written, profile unchanged, spec'd message. |
| AC-22 | One canonical skill identity; approval/self-service promote the same record (profile side). |
| AC-23 | Idempotent double-submit of a resume upload (resume side). |

## Technical Architecture

- **Self-service (Page 02 §3.1):** `addOrUpdateSelfSkill({skillName, level})` Server Action (own profile only) → reject blank/invalid inline (AC-17) → `resolveCanonicalSkill` → `upsertAndPromoteSkill(targetState=SELF_REPORTED, source=SELF, origin=BASELINE)`. Routes through the single write path (BR-18).
- **Manager approval (Page 02 §3.1 / §4.6):** `approveSkill({employeeId, skillRecordId})` Server Action → authority check (Manager/HR org-wide; PL only own team; Employee denied — BR-15/BR-03) → `upsertAndPromoteSkill(targetState=MANAGER_APPROVED)` promoting the **same** record. Unauthorized ⇒ denied (AC-18).
- **Baseline display (Page 03 §3.3 / §4.1):** profile read surfaces `origin=BASELINE` skills distinct from `origin=ACQUIRED` verified skills, plus current project, allocation, `freeFrom` — the data SKILL-1 seeds; the matcher dataset builder already consumes them (AC-16).
- **Resume upload (Page 02 §4.4 / ADR-004):** `POST /api/uploads/resume` Route Handler (multipart + content-hash idempotency) → `parse-resume` (Sonnet) → `ResumeParseResult` (Zod, confidence gate) → returns `{uploadId, extracted}` → `confirmResumeExtraction({uploadId, confirmedFields})` Server Action pre-populates profile; baseline skills written `source=self-reported, origin=BASELINE` (resume is self-attested). Parse failure ⇒ write nothing + spec'd message (AC-20). DB `@@unique([employeeId, contentHash])` on `Resume` is the race-safe idempotency backstop (AC-23).
- **NFRs:** validate-before-write (Reliability); no write on failure; idempotent under concurrency; inline input validation; call-boundary logging; no PII.

## Architecture References

- **Service design (Page 02):** Server Actions `addOrUpdateSelfSkill`, `approveSkill`, `confirmResumeExtraction` (§3.1); Route Handler `/api/uploads/resume` (§3.2); resume flow (§4.4 — mirrors §4.1); approval (§4.6); prompt `parse-resume` (Sonnet, §2.2/§2.4); schema `ResumeParseResult` (§2.5); validation gate (§2.5 gate behavior, AC-20).
- **Data model (Page 03):** `EmployeeSkill` trust-state machine (`SELF_REPORTED → MANAGER_APPROVED → VERIFIED`, §3.1) + `origin` BASELINE/ACQUIRED (§3.3); `upsertAndPromoteSkill` (§3.2); `resolveCanonicalSkill` two-layer + reconcile fallback (§3.4, TS-001/TS-002); `Resume` (new, `contentHash`, `@@unique([employeeId, contentHash])`, §4.6); `Employee` `allocation`/`freeFrom`/`seniority`/`timezone` (§4.1).
- **ADRs (Page 05):** ADR-007 (single promotable record — self-service/approval/resume all use it), ADR-004 (uploads: Route Handlers + content-hash idempotency + parse→confirm→write), ADR-003 (Claude wrapper + Zod gate), ADR-005 (synthetic resume fixtures), ADR-006 (Next.js 16: Server Actions for mutations; Route Handler for upload).
- **Roadmap:** Phase 5 deliverables + exit criteria (Page 04 §2); risk register "Claude invalid JSON", "Real PII leak", "Fixture variety too thin".
- **Pseudocode functions:** `upsertAndPromoteSkill(...)` (Page 03 §3.2), `resolveCanonicalSkill(...)` (§3.4), `callClaude<T>` (Page 02 §2.1).

## Acceptance Criteria (Gherkin)

### Scenario A — Baseline skills present and readable on the profile (AC-16, S-17)
```gherkin
GIVEN a seeded synthetic employee profile
WHEN the employee opens their profile (and the matcher reads its dataset)
THEN baseline/current skills (origin=BASELINE) are shown distinct from cert-verified (origin=ACQUIRED) skills
AND the current project, allocation, and freeFrom are shown
AND staffing matches can reason over the baseline skills.
```

### Scenario B — Employee self-service skill add/update (AC-17, S-18)
```gherkin
GIVEN an authenticated Employee viewing their own profile
WHEN they add a skill "GraphQL"
THEN it is written via upsert+promote with source=SELF, trustState=SELF_REPORTED, origin=BASELINE on a single record
AND a blank or invalid entry is rejected inline with no garbage written.
```

### Scenario C — Manager approval, with authority boundary (AC-18, S-19)
```gherkin
GIVEN an employee has a self-reported skill and a Manager/HR with authority over that employee
WHEN the manager approves the self-reported skill
THEN the SAME EmployeeSkill record is promoted self-reported → manager-approved (raising matching weight)
AND an Employee, or a Practice Lead outside their team, attempting to approve is denied/unavailable.
```

### Scenario D — Resume extraction pre-populates the profile (AC-19, S-20)
```gherkin
GIVEN an authenticated Employee and fixtures/resumes/synthetic-resume-valid.pdf
WHEN the employee uploads the resume
THEN the parse-resume Claude call (Sonnet) is invoked and returns {currentProject?, allocation?, baselineSkills[], confidence} Zod-validated against ResumeParseResult
AND the extraction is shown for confirmation
AND on confirm the profile is pre-populated and baseline skills are written source=self-reported, origin=BASELINE.
```

### Scenario E — Resume parse failure degrades gracefully (AC-20, S-21)
```gherkin
GIVEN fixtures/resumes/not-a-resume.png OR Claude returns invalid JSON / confidence below threshold
WHEN the employee uploads it
THEN nothing is written to the profile and the profile is unchanged
AND the user sees "We couldn't reliably read this resume. Try a clearer file, or add your details manually."
```

### Scenario F — Idempotent resume double-submit (AC-23 resume side, S-23)
```gherkin
GIVEN the same resume file is submitted twice (double-click / retry / re-send)
WHEN the redundant submission is processed
THEN the @@unique([employeeId, contentHash]) constraint (and app-layer fast path) cause the second submit to return the prior uploadId without re-parsing
AND no duplicate Resume and no duplicate pre-population occur.
```

## Dependencies

- **blocks:** SKILL-6 (auth/roles scope the profile + approval views; the progress summary consumes profile/skill state), SKILL-4 (the loop's recommendation acts on baseline skills/gaps fed by the profile spine).
- **blocked_by:** SKILL-1 (Claude wrapper, `ResumeParseResult` schema, `Resume` model + `contentHash`, `upsertAndPromoteSkill`, baseline-skill seed, fixtures).

## Sub-Tasks

- **SUB-TASK-1** — Self-service + approval Server Actions: `addOrUpdateSelfSkill` (own profile, inline validation), `approveSkill` (authority check, promote to manager-approved), both via `upsertAndPromoteSkill`.
- **SUB-TASK-2** — Resume upload + parse: `POST /api/uploads/resume` + `parse-resume` prompt + `ResumeParseResult` schema + confidence gate + content-hash idempotency + `confirmResumeExtraction`.
- **SUB-TASK-3** — Profile-spine tests (baseline read, self-service valid/invalid, approval authorized/denied, resume happy/failure/idempotency).

## UX/Design

Status: Awaiting UX designs (final branded screens in SKILL-6). Required states: a profile view showing baseline vs verified skills + current project/availability; a self-service add/update form with inline validation (blank rejected); a manager approval queue with an authorized/denied state; a resume upload control with in-flight disable (idempotency guard), an extracted-fields confirmation panel, and the failure message leaving the profile unchanged. NULogic branding.

## Definition of Done

- Profile surfaces baseline (`origin=BASELINE`) skills distinct from verified, plus current project + availability (AC-16).
- `addOrUpdateSelfSkill` writes self-reported on a single record; blank/invalid rejected inline (AC-17).
- `approveSkill` promotes the same record to manager-approved; unauthorized actor denied (AC-18).
- `POST /api/uploads/resume` parses via Claude (Sonnet) → `ResumeParseResult` (Zod + confidence gate); confirm pre-populates baseline self-reported skills; failure writes nothing with the spec'd message (AC-19/20).
- Resume double-submit idempotent (DB constraint + app fast path) (AC-23).
- Profile-spine tests green; evidence shown. Typecheck + lint clean.

## Risks & Assumptions

- **Risk:** a resume write under low confidence corrupts the profile. **Mitigation:** Zod + confidence gate → typed failure → spec'd message; nothing written (AC-20/BR-17).
- **Risk:** thin resume fixture variety weakens AC-19. **Mitigation:** seed varied synthetic resumes (SKILL-1/ADR-005).
- **Risk:** self-service / approval / resume diverge into duplicate skill rows. **Mitigation:** all route through the single `upsertAndPromoteSkill` keyed by `(profileId, canonicalSkillId)` (BR-18/ADR-007).
- **Risk:** an unauthorized actor approves a skill. **Mitigation:** server-side authority check in `approveSkill` (BR-15/BR-03); covered by the denied-case test.
- **Assumption:** `resolveCanonicalSkill`'s de-dupe-failure fallback (TS-002) keeps self-service/resume writes resilient; full role enforcement (PL team membership) lands in SKILL-6, which this story consumes from the session.

## Progress Log

| Timestamp | Actor | Note |
|---|---|---|
| 2026-06-05T00:00:00Z | nulogic-jira-creator | Story created from PRD + target-state architecture (Phase 5). Local-only run. |
