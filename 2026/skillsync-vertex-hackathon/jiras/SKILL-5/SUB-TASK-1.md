# SKILL-5 / SUB-TASK-1 — Self-service skill add/update + manager approval

**Parent:** SKILL-5 · **Component:** Profile & Skill service · **Repo:** ai-nu-skillsync
**Gaps:** TD-PROFILE-01, TD-APPROVE-01

## Pseudocode

1. **`addOrUpdateSelfSkill({skillName, level})` Server Action** (`lib/profile/addOrUpdateSelfSkill.ts`, Page 02 §3.1, own profile only):
   - Re-derive session server-side; resolve caller `Employee`.
   - Validate input: reject blank / whitespace-only / over-length `skillName` inline with no write (AC-17/BR-14).
   - `canonicalSkillId = resolveCanonicalSkill(skillName)` (Page 03 §3.4) → `upsertAndPromoteSkill(caller.id, canonicalSkillId, targetState=SELF_REPORTED, source=SELF, origin=BASELINE)`. Equal/lower trust → no-op (never demotes an already-verified skill).
2. **`approveSkill({employeeId, skillRecordId})` Server Action** (Page 02 §3.1/§4.6):
   - Re-derive session + role server-side. **Authority check (BR-15/BR-03):** `MANAGER|HR` may approve any employee in scope; `PRACTICE_LEAD` only where `employee.leadId == caller.id`; `EMPLOYEE` denied; a PL outside their team denied.
   - Load the target `EmployeeSkill` (must belong to `employeeId`); call `upsertAndPromoteSkill(employeeId, skill.skillId, targetState=MANAGER_APPROVED, source=existing)` → promotes the **same** record `self-reported → manager-approved` (Page 03 §3.2). Re-approve is a no-op.
3. **Return** the updated skill (state + matching-weight tier) for optimistic UI; never expose another employee's data to an unauthorized actor.

## Implementation Contract

- **GOAL:** Two Server Actions — employee self-service (writes self-reported on the single record, rejects invalid input) and manager approval (promotes the same record to manager-approved, gated by authority) — both routed through the one upsert+promote path.
- **CONSTRAINTS:**
  - Per **ADR-007 / BR-18**, both actions use `upsertAndPromoteSkill` keyed by `(profileId, canonicalSkillId)` — never a blind insert; monotonic promotion only.
  - Per **BR-14 / AC-17**, self-service writes `source=SELF, trustState=SELF_REPORTED`; blank/invalid rejected inline with no garbage written.
  - Per **BR-15 / BR-03 / AC-18**, approval authority is re-derived server-side; an unauthorized actor (Employee, or PL outside their team) is denied.
  - Per **Page 02 §3.1 server-action discipline**, both await `cookies()` and re-derive role; a stale session redirects to sign-in (composed with `proxy.ts`, SKILL-6).
- **FORMAT:** `lib/profile/addOrUpdateSelfSkill.ts`, `lib/profile/approveSkill.ts`. Reuses `upsertAndPromoteSkill` + `resolveCanonicalSkill` (SKILL-1) and the session/role helper.

## Data Models

- **Server Actions:** `addOrUpdateSelfSkill({skillName, level}) → {skill} | {error}`; `approveSkill({employeeId, skillRecordId}) → {newState} | {denied}` (Page 02 §3.1).
- **Reused write:** `upsertAndPromoteSkill(profileId, skillNameOrId, targetState, source, origin)` (Page 03 §3.2); `resolveCanonicalSkill` (§3.4).
- **Prisma:** `EmployeeSkill` (`trustState`, `origin`, `source`, `promotedAt`, `@@unique([employeeId, skillId])`), `Skill` (`canonicalKey @unique`), `Employee` (`role`, `leadId`).

## Error Handling

1. **Blank/whitespace/over-length skill name:** rejected inline; no `EmployeeSkill` write (AC-17).
2. **Self-service on a skill already verified:** `upsertAndPromoteSkill` no-ops (equal/lower trust never demotes) — returns the existing verified record, not an error.
3. **Unauthorized approval** (Employee, or PL outside their team): denied server-side; no state change; the action is unavailable in the UI for them (AC-18).
4. **`skillRecordId` does not belong to `employeeId`:** reject (referential/authorization safety) — never promote a mismatched record.
5. **`resolveCanonicalSkill` Claude de-dupe fails (TS-002):** falls back to deterministic `canonicalKey` create-new + `reconcilePending`; the self-service/approval write still completes (never blocks).

## Failure Conditions (testable defects)

1. A self-service add inserts a second `EmployeeSkill` row for a skill the employee already holds → BR-18 violation.
2. A blank skill name writes a garbage `EmployeeSkill` row → AC-17/BR-14 violation.
3. A Practice Lead approves a skill for an employee outside their team → BR-15/BR-03 authorization violation.
4. Approval creates a new record instead of promoting the existing one to `manager-approved` → BR-18/AC-22 violation.
5. Self-service writes `trustState=VERIFIED` (or `MANAGER_APPROVED`) instead of `SELF_REPORTED` → AC-17 trust-state violation.
