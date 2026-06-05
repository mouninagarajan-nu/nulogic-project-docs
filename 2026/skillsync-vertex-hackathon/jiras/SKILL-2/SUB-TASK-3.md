# SKILL-2 / SUB-TASK-3 — Certificate-parsing tests against fixtures

**Parent:** SKILL-2 · **Component:** Test harness · **Repo:** ai-nu-skillsync
**Gaps:** TD-CERT-01, TD-TEST-01

## Pseudocode

1. **`cert-parsing.test.ts`** (mirrors authored scenario stubs S-01/02/03) — set up: disposable seeded DB; pick an employee with an in-progress catalog item.
2. **Happy path (S-01/AC-01):** upload `fixtures/certs/aws-saa-valid.pdf` → assert the `parse-certificate` Claude boundary is invoked **exactly once**; assert the returned JSON passes `CertParseResult`; call `confirmCertExtraction`; assert ONE `EmployeeSkill` row with `trustState=VERIFIED, source=CERTIFICATE, origin=ACQUIRED`; assert the item is `done`.
3. **Multi-skill (S-02/AC-02):** upload `fixtures/certs/multi-skill-bootcamp.pdf` → assert ALL skills returned; confirm; assert each written verified; assert a missing optional `date` did not break the write.
4. **Failure (S-03/AC-03):** upload `fixtures/certs/not-a-cert.png` (and a stub forcing low confidence / invalid JSON) → assert NO `EmployeeSkill` written; item stays in-progress; the response carries the exact spec'd message.
5. **Promotion (S-22/AC-22):** pre-seed "TypeScript" as `self-reported`; upload a TypeScript cert; confirm → assert the SAME record promoted to `verified` (same row id), no duplicate; re-confirm → no-op.
6. **Idempotency (S-23/AC-23):** submit the same file twice → assert one `Certificate` row, one skill, one promotion.
7. Run real-call evidence against fixtures where feasible (CLAUDE.md "show evidence"); use the SDK stub for the forced-failure/invalid-JSON cases.

## Implementation Contract

- **GOAL:** Prove cert parsing end-to-end against synthetic fixtures: happy, multi-skill, failure, single-record promotion, idempotency — with evidence.
- **CONSTRAINTS:**
  - Per **CLAUDE.md**, run against `fixtures/certs/`; provide single-file invocation; show test output as evidence (don't just assert).
  - Per **BR-09**, the test asserts the Claude boundary is called (not a keyword/regex substitute) and that a failed parse writes nothing.
  - Per **§8 metric**, a majority of cert fixtures must parse to valid validated JSON.
  - Forced-failure cases stub the SDK; happy/multi-skill may use a real call or a recorded fixture response — never a faked extraction passed off as real intelligence.
- **FORMAT:** `tests/cert-parsing.test.ts` (or co-located); fixtures from SKILL-1.

## Data Models

- **Fixtures:** `fixtures/certs/aws-saa-valid.pdf`, `multi-skill-bootcamp.pdf`, `not-a-cert.png`.
- **Under test:** `POST /api/uploads/certificate`, `confirmCertExtraction`, `upsertAndPromoteSkill`.
- **Assertions on:** `EmployeeSkill.trustState/source/origin`, `Certificate` row count, item status, response message.

## Error Handling

1. **Real Claude call flakes in the happy test:** allow a recorded/cassette response or retry-once; never fall back to a hardcoded extraction that fakes the model.
2. **Fixture missing:** test fails with the missing path (not a misleading assertion).
3. **Threshold misconfig makes the failure test pass for the wrong reason:** assert the failure is due to low confidence/invalid JSON specifically, and that the message text matches exactly.
4. **DB state leaks between tests:** re-seed/reset per test; assert no cross-test skill rows.
5. **Stub leaks into the happy path:** guard so only the forced-failure cases use the stub.

## Failure Conditions (testable defects)

1. The happy test passes while the implementation used regex/keyword extraction instead of the Claude boundary → BR-09 violation (assert boundary invocation).
2. The failure test passes but an `EmployeeSkill` was written → AC-03 false green.
3. The promotion test passes while a duplicate `EmployeeSkill` row exists → AC-22 false green.
4. The idempotency test passes while two `Certificate` rows exist → AC-23 false green.
5. Fewer than a majority of cert fixtures parse to valid JSON → §8 metric unmet.
