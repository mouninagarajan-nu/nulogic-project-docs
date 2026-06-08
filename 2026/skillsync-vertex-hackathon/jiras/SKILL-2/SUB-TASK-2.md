# SKILL-2 / SUB-TASK-2 — confirmCertExtraction: upsert+promote to verified with de-dupe fallback

**Parent:** SKILL-2 · **Component:** Profile & Skill (Upload confirm) · **Repo:** ai-nu-skillsync
**Gaps:** TD-CERT-01, TD-DATA-01

## Pseudocode

1. **Implement `confirmCertExtraction(uploadId, confirmedSkills[])`** Server Action (own profile only):
   - Re-derive session + role server-side (await `cookies()`); assert the upload belongs to the calling employee. On a stale session → redirect to sign-in (composed with `proxy.ts`, AC-24).
   - Load the `Certificate` by `uploadId`; if already fully promoted (idempotent re-confirm) → return the existing promoted skills (no duplicate work).
2. **For each confirmed skill:**
   - `canonicalSkillId = resolveCanonicalSkill(skill.skill)` — Layer 1 deterministic `canonicalKey`; Layer 2 Claude `skill-identity` **merge advisor**.
   - **De-dupe failure fallback (TS-002):** if the `skill-identity` call fails/unreachable/invalid → fall back to deterministic `canonicalKey` create-new + `markReconcilePending(key)`; the write continues — never blocks/corrupts the P0 verified write.
   - `upsertAndPromoteSkill(profileId, canonicalSkillId, targetState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED)` → promotes the single record (`self-reported`/`manager-approved` → `verified`) or no-ops if already verified; sets `promotedAt`.
3. **Mark the linked catalog item / enrollment `done`** and return `{ promotedSkills[] }`. The before/after match (SKILL-4) will compare this **same** record.

## Implementation Contract

- **GOAL:** Persist verified skills only after employee confirmation, via the single upsert+promote path, with a resilient de-dupe fallback so the most-protected write never blocks.
- **CONSTRAINTS:**
  - Per **ADR-007 / BR-18 / AC-22**, all writes go through `upsertAndPromoteSkill` keyed by `(profileId, canonicalSkillId)`; monotonic promotion; never a duplicate row; never a demotion.
  - Per **TS-002**, the `skill-identity` Claude call is a merge *advisor*, not a gate; on failure fall back to deterministic `canonicalKey` create-new + `reconcilePending`.
  - Per **BR-01**, `verified` is reached only via a confirmed parsed certificate (`source=CERTIFICATE`).
  - Per **Page 02 §3.1 Server Action discipline**, re-derive session/role server-side; never trust a client-sent role/profileId; stale session ⇒ redirect (AC-24).
- **FORMAT:** `app/actions/cert.ts` (`confirmCertExtraction`); reuses `lib/repos/skill.ts` from SKILL-1.

## Data Models

- **Server Action:** `confirmCertExtraction({ uploadId, confirmedSkills[] }) → { promotedSkills[] }` or redirect/denied.
- **Repository:** `resolveCanonicalSkill`, `upsertAndPromoteSkill(targetState=VERIFIED)`, `order(trustState)`.
- **Prisma:** `EmployeeSkill` (promote `trustState`, set `promotedAt`, `source=CERTIFICATE`, `origin=ACQUIRED`), `Enrollment`/plan item → `done`.

## Error Handling

1. **`uploadId` not owned by the caller:** denied; no write; logged (authorization).
2. **`skill-identity` de-dupe call fails:** TS-002 fallback to deterministic key create-new + `reconcilePending`; verified write completes.
3. **Re-confirm of an already-promoted upload (double-click):** idempotent — returns existing promoted skills; no second promotion (AC-23 composes with BR-18).
4. **Confirmed skill already `verified`:** `upsertAndPromoteSkill` no-ops (no demotion, no duplicate) (AC-22).
5. **Stale session at confirm time:** redirect to sign-in; nothing written under the stale identity (AC-24).

## Failure Conditions (testable defects)

1. Confirming a cert for an already-self-reported skill creates a SECOND `EmployeeSkill` row instead of promoting the existing one → BR-18/AC-22 violation (the hero-loop failure signature).
2. A `skill-identity` failure causes the confirm action to throw/hang and the verified skill is never written → TS-002 violation.
3. `verified` is written without an associated confirmed `Certificate` (e.g. via self-service path) → BR-01 violation.
4. Re-confirming the same `uploadId` promotes/duplicates twice → idempotency violation.
5. The action trusts a client-supplied `profileId` and writes to another employee → authorization violation.
