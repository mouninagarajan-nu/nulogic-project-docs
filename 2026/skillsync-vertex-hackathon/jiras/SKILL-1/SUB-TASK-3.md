# SKILL-1 / SUB-TASK-3 — Vitest harness, single-file test command & foundation tests

**Parent:** SKILL-1 · **Component:** Test harness · **Repo:** ai-nu-skillsync
**Gaps:** TD-TEST-01, TD-GUARD-01

## Pseudocode

1. **Create `vitest.config.ts`** (Vitest is already a dependency): node test environment, include `**/*.test.ts` and the authored acceptance stubs under `artifacts/02-acceptance-tests/e2e-tests/`-equivalent locations in the repo (`tests/` or co-located). Add a `test` script and a **single-file test command** (e.g. `pnpm test <file>`) to `package.json` so a developer can run one parse test in isolation (CLAUDE.md requirement).
2. **Wire a test DB lifecycle:** before the suite, point Prisma at a disposable `dev.db` (or `:memory:`), `db:push`, and run the synthetic seed; after, dispose. Tests must never touch a real/shared DB.
3. **Foundation tests** (these are GREEN gates for SKILL-1, not the full 27 ACs which land per-feature):
   - **Schema-invariant test:** resolve `"TypeScript"` and `"TS"` → assert one canonical `Skill.id`; assert a second `upsertAndPromoteSkill` for the same `(profile, skill)` does not create a second `EmployeeSkill` row (BR-18 / Scenario D).
   - **No-PII test (AC-13 / S-14):** scan all seeded `Employee.name`/`email` + fixture filenames for disallowed real-domain patterns; assert none; assert `.env.example` has placeholders only and no secret literal appears in source.
   - **Wrapper validation-gate test:** feed the wrapper a deliberately invalid model payload via a stub → assert it returns `Failure` and writes nothing; feed a valid payload → assert `Ok(typed)`.
   - **Baseline-skills test (AC-16 / S-17):** assert every seeded profile has ≥1 `origin=BASELINE` skill and a `freeFrom` + `allocation`.

## Implementation Contract

- **GOAL:** A runnable Vitest harness with a single-file command and the foundation tests that prove the substrate (schema invariant, no-PII, validate-before-write, baseline data) before any feature is built.
- **CONSTRAINTS:**
  - Per **CLAUDE.md**, provide a single-file test command for the cert-parsing tests that follow in SKILL-2.
  - Per **ADR-005 / AC-13**, the no-PII gate runs against seed + fixtures and fails the build on any real-looking PII.
  - Per **BR-09 / P2**, the wrapper test must prove a bad model output is rejected before any write.
  - Tests use the synthetic seed only; never a real Anthropic call in CI (stub the SDK at the boundary) — real-call parse evidence is shown in SKILL-2 against fixtures.
- **FORMAT:** `vitest.config.ts`; `package.json` `test` + single-file script; `tests/foundation/*.test.ts`.

## Data Models

- **Config:** `vitest.config.ts`.
- **Scripts:** `package.json` → `"test"`, single-file invocation.
- **Test fixtures consumed:** seeded synthetic profiles; `fixtures/certs/`, `fixtures/resumes/`.
- **Stubs:** SDK boundary stub returning canned valid/invalid payloads for the wrapper test.

## Error Handling

1. **Seed fails inside test setup:** the suite aborts with the seed error surfaced (not a misleading assertion failure); the disposable DB is still torn down.
2. **A test accidentally hits the real Anthropic API (missing stub):** detect a live `ANTHROPIC_API_KEY` use in unit tests and fail with a clear message; route real-call tests to the explicit fixtures suite only.
3. **Single-file command targets a non-existent path:** Vitest reports no tests found; the script surfaces a usage hint.
4. **No-PII scan throws on an unreadable fixture:** treat as a gate failure (cannot prove no-PII) rather than skipping.
5. **Flaky test ordering** (shared seeded state mutated by one test): each test resets/re-seeds or uses isolated rows; assert no cross-test leakage.

## Failure Conditions (testable defects)

1. `pnpm test` runs but the single-file command cannot run one test in isolation → CLAUDE.md requirement unmet.
2. The no-PII test passes while a real-domain email exists in the seed → gate is not actually scanning (false green).
3. The wrapper test asserts success when fed invalid JSON → validate-before-write not enforced.
4. The schema-invariant test passes while two `EmployeeSkill` rows exist for one canonical skill → BR-18 not enforced.
5. Tests pass against a stale/real DB instead of a freshly seeded disposable one → non-deterministic, environment-coupled suite.
