# SKILL-5 / SUB-TASK-3 — Profile-spine tests

**Parent:** SKILL-5 · **Component:** Test harness · **Repo:** ai-nu-skillsync
**Gaps:** TD-PROFILE-01, TD-RESUME-01, TD-APPROVE-01

## Pseudocode

1. **Baseline read tests** (`__tests__/profile-skills.test.ts`): seed a synthetic profile; assert `origin=BASELINE` skills are returned distinct from `origin=ACQUIRED` verified skills, and that `currentProject`/`allocation`/`freeFrom` are present and serializable by the matcher dataset builder (AC-16).
2. **Self-service + approval tests:**
   - `addOrUpdateSelfSkill` writes a single record `source=SELF, trustState=SELF_REPORTED, origin=BASELINE`; a blank name is rejected with no row written (AC-17).
   - `approveSkill` by an authorized Manager/HR promotes the SAME record `self-reported → manager-approved`; by an Employee or a PL outside their team is denied (AC-18). Assert exactly one `EmployeeSkill` row throughout (BR-18).
3. **Resume tests** (`__tests__/resume-parsing.test.ts`): against `fixtures/resumes/`:
   - happy: a valid synthetic resume parses to Zod-valid `ResumeParseResult`; on confirm, profile pre-populates and baseline skills are `self-reported` (AC-19);
   - failure: `not-a-resume.png` / low-confidence → nothing written, profile unchanged, spec'd message (AC-20);
   - idempotency: the same resume submitted twice yields one `Resume` row + one pre-population (AC-23).
   - Stub the Claude boundary with deterministic fixtures where a live call is awkward (BR-09 stub discipline).

## Implementation Contract

- **GOAL:** A test suite proving baseline-skill read, self-service add/validation, manager approval + authority boundary, and resume happy/failure/idempotency — all on synthetic data with shown evidence.
- **CONSTRAINTS:**
  - Per **CLAUDE.md / Page 04 §7**, show evidence (test output), not assertions; integration ACs are tested, the no-PII constraint is reviewed.
  - Per **BR-10 / AC-13**, fixtures and seeded data are synthetic only — assert no real PII appears in any fixture used.
  - Per **BR-09**, where a live Claude call is awkward, the wrapper boundary is stubbed with a `TODO` returning a deterministic `ResumeParseResult` or `Failure` — never fake business logic substituting for the model.
  - Per **BR-18**, every skill-write test asserts the single-record invariant (one `EmployeeSkill` per `(profileId, canonicalSkillId)`).
- **FORMAT:** `__tests__/profile-skills.test.ts`, `__tests__/resume-parsing.test.ts` (or co-located). Reuses SKILL-1's `vitest.config.ts` + single-file test command.

## Data Models

- **Fixtures:** `fixtures/resumes/synthetic-resume-valid.pdf`, `fixtures/resumes/multi-skill-resume.pdf`, `fixtures/resumes/not-a-resume.png` (synthetic, from SKILL-1).
- **Schemas under test:** `ResumeParseResult` (Page 02 §2.5).
- **Functions under test:** `addOrUpdateSelfSkill`, `approveSkill`, `POST /api/uploads/resume`, `confirmResumeExtraction`, `upsertAndPromoteSkill`.

## Error Handling

1. **A test depends on a live Claude call that is rate-limited/unreachable:** use the stubbed wrapper boundary (deterministic fixture) so the suite is hermetic and reproducible (BR-09 stub).
2. **A fixture accidentally contains PII-shaped data:** the no-PII review assertion fails the suite (AC-13) — fix the fixture, don't skip the check.
3. **The seed DB isn't reset between tests:** use a fresh re-seedable SQLite DB per run so the single-record assertions aren't polluted by prior state.
4. **Idempotency test races the unique constraint:** assert the second submit returns the prior `uploadId` and that the row count is exactly one (AC-23).
5. **Approval test grants authority incorrectly:** assert both the authorized (promotes) and unauthorized (denied) branches, not just the happy path.

## Failure Conditions (testable defects)

1. The baseline-read test passes while verified and baseline skills are indistinguishable → AC-16 coverage gap.
2. The self-service test passes while a blank name writes a row → AC-17 defect uncaught.
3. The approval test omits the unauthorized (denied) branch → AC-18 authorization coverage gap.
4. The resume failure test passes while profile data was written on a low-confidence parse → AC-20/BR-17 defect uncaught.
5. The idempotency test passes while two `Resume` rows exist after a double-submit → AC-23/BR-19 defect uncaught.
