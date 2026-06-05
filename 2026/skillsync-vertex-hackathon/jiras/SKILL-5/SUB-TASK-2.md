# SKILL-5 / SUB-TASK-2 — Resume upload + Claude extraction + confirm pre-populate

**Parent:** SKILL-5 · **Component:** Upload service (resume) + Claude integration · **Repo:** ai-nu-skillsync
**Gaps:** TD-RESUME-01, TD-DATA-02

## Pseudocode

1. **`POST /api/uploads/resume` Route Handler** (`app/api/uploads/resume/route.ts`, Page 02 §3.2/§4.4, ADR-004):
   - Receive multipart resume (PDF/doc/image) with size limits at the request edge. Compute `contentHash` of the bytes.
   - **Idempotency fast path:** if a `Resume` exists for `(caller.id, contentHash)` → return the prior `{uploadId, extracted}` without re-parsing (AC-23). The DB `@@unique([employeeId, contentHash])` is the race-safe backstop.
   - On a new file: `callClaude({ promptName:"parse-resume", complexity:"routine" /* → Sonnet */, schema: ResumeParseResult, variables:{ resumeRef } })`.
   - **Confidence/validation gate:** `safeParse` fail OR `confidence < threshold` → return failure → spec'd message; write nothing (AC-20). Else persist a `Resume` row (`parsedJson`) and return `{uploadId, extracted}` for confirmation.
2. **`confirmResumeExtraction({uploadId, confirmedFields})` Server Action** (own profile only, Page 02 §3.1):
   - Pre-populate `Employee.currentProject`/`allocation` from confirmed fields; for each confirmed baseline skill → `resolveCanonicalSkill` → `upsertAndPromoteSkill(caller.id, skill, targetState=SELF_REPORTED, source=RESUME, origin=BASELINE)` (resume is self-attested — BR-17).
3. **Client guard:** disable the submit affordance while a resume upload is in flight (double-click guard, BR-19).

## Implementation Contract

- **GOAL:** A resume upload handler + `parse-resume` Claude call + confirm action that pre-populates the profile only after validation + employee confirmation, writes nothing on failure, and is idempotent on double-submit — mirroring the cert hero discipline.
- **CONSTRAINTS:**
  - Per **BR-17 / BR-09 / AC-19**, resume parsing is the `parse-resume` Claude call (Sonnet) Zod-validated against `ResumeParseResult` — NO regex/keyword extraction.
  - Per **BR-02 discipline / AC-20**, a failed/low-confidence/invalid parse writes nothing and shows the spec'd message; the profile is unchanged.
  - Per **ADR-004 / BR-19 / TS-004**, idempotency is DB-enforced `@@unique([employeeId, contentHash])` on `Resume`; the app-layer check is the fast path.
  - Per **BR-18**, confirmed baseline skills route through `upsertAndPromoteSkill` (single record) as `source=RESUME, origin=BASELINE, trustState=SELF_REPORTED`.
  - Per **BR-09 guardrail**, if file→base64 plumbing is awkward, stub the wrapper boundary with a `TODO` returning `Failure` — never fake parsed data.
- **FORMAT:** `app/api/uploads/resume/route.ts`, `lib/profile/confirmResumeExtraction.ts`; `src/prompts/parse-resume.ts`, `src/schemas/resume-parse-result.ts`. Reuses `callClaude` + content-hash util + `upsertAndPromoteSkill` (SKILL-1).

## Data Models

- **Prompt:** `parse-resume` (Sonnet) → `ResumeParseResult { currentProject?, allocation?(0..100), baselineSkills:[{skill, level?}], confidence }` (Page 02 §2.5).
- **Route Handler:** `POST /api/uploads/resume` (multipart) → `{uploadId, extracted}` (Page 02 §3.2).
- **Server Action:** `confirmResumeExtraction({uploadId, confirmedFields}) → {profile}` (Page 02 §3.1).
- **Prisma:** `Resume` (`fileName`, `contentHash`, `parsedJson`, `@@unique([employeeId, contentHash])`), `Employee` (`currentProject`/`allocation`), `EmployeeSkill` via upsert+promote (Page 03 §4.6/§3.2).

## Error Handling

1. **Invalid/low-confidence/non-resume file:** `safeParse` fail or `confidence < threshold` → typed failure → "We couldn't reliably read this resume. Try a clearer file, or add your details manually."; nothing written (AC-20).
2. **Double-submit of the same resume:** app-layer hash check returns the prior `uploadId`; under concurrency the `@@unique` constraint rejects the second insert and the loser reads back the winner's row — no duplicate `Resume`, no duplicate pre-population (AC-23).
3. **Claude unreachable / SDK error:** wrapper returns `Failure`; handler shows the spec'd message; no `Resume` row, no profile change.
4. **Confirm references an `uploadId` not owned by the caller:** denied (own-profile scope) — never pre-populate another profile.
5. **A confirmed baseline skill already verified on the profile:** `upsertAndPromoteSkill` no-ops (resume self-reported never demotes a verified skill).

## Failure Conditions (testable defects)

1. A failed/low-confidence parse writes profile data anyway → AC-20/BR-17 violation.
2. Resume parsing is done with regex/keyword extraction instead of the `parse-resume` Claude call → BR-09/BR-17 violation.
3. A double-submitted resume creates a second `Resume` row or duplicate pre-population → AC-23/BR-19 violation.
4. Resume-extracted skills are written `verified` (or `manager-approved`) instead of `self-reported` → AC-19/BR-17 trust-state violation.
5. The profile is written before the employee confirms the extraction → ADR-004 parse→confirm→write violation.
