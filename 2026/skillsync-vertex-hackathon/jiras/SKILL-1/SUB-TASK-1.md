# SKILL-1 / SUB-TASK-1 — Extend Prisma schema, synthetic seed, fixtures & no-PII gate

**Parent:** SKILL-1 · **Component:** Data layer (Prisma/SQLite) · **Repo:** ai-nu-skillsync
**Gaps:** TD-DATA-01, TD-DATA-02, TD-DATA-03, TD-DATA-04, TD-DATA-05, TD-SEED-01, TD-SEED-02, TD-GUARD-01, TD-DOC-01

## Pseudocode

1. **Extend `prisma/schema.prisma` (do NOT replace the starter — ADR-002).**
   - `Employee`: add `seniority String` (value set `JUNIOR|MID|SENIOR`), `timezone String` (e.g. `IST`), and the `IdentityMapping` back-relation. Keep synthetic `name`/`email`, `allocation`, `freeFrom`, `role`, `leadId` self-relation.
   - `Skill`: add `canonicalKey String @unique` (TS-001). Keep `name @unique`, `category`.
   - `EmployeeSkill`: add `trustState String` (`SELF_REPORTED|MANAGER_APPROVED|VERIFIED`), `origin String` (`BASELINE|ACQUIRED`), `promotedAt DateTime?`. Keep `source`, `proficiency`, and `@@unique([employeeId, skillId])` (the BR-18 key).
   - `CatalogItem`: add `aiEnabled Boolean @default(false)`, `endorsed Boolean @default(false)`, `enrichmentPending Boolean @default(false)`, `description String?`, `typicalDuration String?`, `provider String?`; keep `tagsJson`.
   - New models: `UpskillingPlan` (`employeeId @unique`, `status DRAFT|FINALIZED`, `finalizedAt`), `PlanItem` (`planId`, `catalogItemId`), `Resume` (`employeeId`, `fileName`, `contentHash`, `parsedJson`, `uploadedAt`, `@@unique([employeeId, contentHash])`), `IdentityMapping` (`syntheticHandle @unique`, `employeeId`).
   - `Certificate`: add `contentHash String`, `@@unique([employeeId, contentHash])`.
2. **Apply with `pnpm db:push`** (migration history deferred, TD-DATA-06) and regenerate the client to `lib/generated/prisma`. Verify the six starter models still exist and their `@@unique` keys are intact.
3. **Implement `prisma/seed.ts`** (replace the `TODO` stub): generate ~20–25 synthetic employees using a fixed RNG seed for determinism — synthetic names/emails (e.g. `Engineer-07` / `engineer07@example.test`), each with 3–6 baseline skills (`origin=BASELINE`, `trustState=SELF_REPORTED`, `source=SELF`), an `allocation` (0–100), a `freeFrom` (mix of past / +2wk / future), `seniority`, `timezone` (include some `IST`). Resolve every seeded skill name through `resolveCanonicalSkill` so aliases collapse. Create a starter catalog (~12–20 items) with `aiEnabled` deliberately set (some true). Create one `IdentityMapping` per employee keyed by a synthetic handle (`handle-<n>`, never real email). Set a few employees' `leadId` to form Practice-Lead teams.
4. **Create fixtures:** `fixtures/certs/aws-saa-valid.pdf`, `fixtures/certs/multi-skill-bootcamp.pdf`, `fixtures/certs/not-a-cert.png`; `fixtures/resumes/synthetic-engineer.pdf` (+ an edge resume). All synthetic, no PII.
5. **No-PII review gate:** a small script/test that scans seed output + fixtures filenames/metadata for disallowed patterns (real-looking emails outside `*.test`/`example.*`); fail loudly if found. Reconcile `CLAUDE.md` "Current state" drift (TD-DOC-01).

## Implementation Contract

- **GOAL:** Deliver the target Prisma schema (Page 03), a deterministic synthetic seed (~20–25 profiles + catalog + identity mappings), synthetic fixtures, and a no-PII gate — the substrate for every later story.
- **CONSTRAINTS:**
  - Per **ADR-002**, EXTEND the starter schema; preserve `EmployeeSkill @@unique([employeeId, skillId])` and the Practice-Lead self-relation. Do not introduce a state-history table (ADR-007 — promotion mutates in place).
  - Per **ADR-005 / BR-10 / AC-13**, synthetic data only; real PII never generated or committed; secrets only as placeholders in `.env.example`.
  - Per **Page 03 §6.1 / TS-001 / TS-004**, declare `Skill.canonicalKey @unique`, `EmployeeSkill @@unique`, `Certificate`/`Resume @@unique([employeeId, contentHash])`, `UpskillingPlan @@unique([employeeId])`, `IdentityMapping.syntheticHandle @unique`.
  - Per **ADR-006**, SQLite string-enums (no native enums); document value sets in comments.
- **FORMAT:** Prisma DSL models matching Page 03 §2; a TypeScript seed at `prisma/seed.ts`; fixtures under `fixtures/certs/` and `fixtures/resumes/`.

## Data Models

- **Prisma models:** `Employee`, `Skill`, `EmployeeSkill`, `CatalogItem`, `Enrollment` (retained), `UpskillingPlan`, `PlanItem`, `Certificate`, `Resume`, `IdentityMapping`.
- **Value sets:** `Employee.role ∈ {ADMIN, MANAGER, PRACTICE_LEAD, EMPLOYEE}`; `EmployeeSkill.trustState ∈ {SELF_REPORTED, MANAGER_APPROVED, VERIFIED}`; `EmployeeSkill.origin ∈ {BASELINE, ACQUIRED}`; `EmployeeSkill.source ∈ {SELF, CERTIFICATE, RESUME, CATALOG}`; `UpskillingPlan.status ∈ {DRAFT, FINALIZED}`.
- **Scripts:** `pnpm db:push`, `pnpm seed`.

## Error Handling

1. **`db:push` fails on a constraint conflict** (e.g. existing rows violate a new `@unique`): drop/recreate the disposable `dev.db` and re-seed; never hand-edit data to satisfy a constraint.
2. **Seed RNG produces a duplicate synthetic email/handle:** detect collision and re-roll; the `@unique` constraints must hold without truncating the dataset below ~20.
3. **A seeded skill alias fails to resolve to a canonical id** (resolveCanonicalSkill unavailable during seed): fall back to deterministic `canonicalKey` create-new (TS-002) so the seed never blocks; flag `reconcilePending` if applicable.
4. **A fixture file is missing/zero-byte:** seed/test setup logs the missing path and fails the no-PII/foundation gate rather than silently continuing.
5. **Real-looking PII detected in seed/fixtures:** the no-PII gate fails the run with the offending value redacted to `[REDACTED]` in the message.

## Failure Conditions (testable defects)

1. After seed, querying `EmployeeSkill` for one employee + the canonical "TypeScript" id returns **more than one** row → BR-18 single-record violation.
2. A seeded `Employee.email` matches a real-domain pattern (not `*.test`/`example.*`) → AC-13 PII violation.
3. Two seeded catalog items that are obvious aliases both persist as separate rows with no canonical merge → de-dupe substrate broken (note: catalog de-dupe itself is SKILL-4, but seed must not pre-create dupes).
4. `Certificate`/`Resume` lack the `@@unique([employeeId, contentHash])` constraint → idempotency (AC-23) cannot be DB-enforced downstream.
5. Seed completes but `aiEnabled` is `false`/null on **every** catalog item → the plan-gate (AC-26) can never be satisfied downstream.
