# SKILL-2 — Test Suite Review Report

**NULogic SkillSync · Team Vertex**
**Jira:** SKILL-2 · **Initiative:** skillsync-vertex-hackathon · **Stage:** 07-tests (reviewer)
**Reviewed by:** nulogic-test-reviewer · **Iteration:** 2 (clean-slate) · **Date:** 2026-06-08
**Status:** NEEDS REVISION — 7 findings (0 critical, 2 high, 3 medium, 2 low)

---

## Executive Summary

The iteration-2 test suite delivers 16 failing Vitest integration tests covering all 5 ACs (AC-01/02/03/22/23) and all 5 BRs (BR-01/02/09/18/19). RED state is confirmed: all 16 tests fail with "Cannot find package '@/lib/cert/parse-certificate'" — the correct meaningful RED reason. The TADR-S2-01 v2 spy payloads are correctly implemented. Most iteration-1 findings are genuinely resolved.

**No critical blockers remain.** The critical F-01 (TS-002 stub not a real test) is genuinely resolved — `layer2Client` is injected as a top-level option and the real `resolveCanonicalSkill(rawSkillName, { client })` seam is exercised. The three high-severity findings from iteration 1 (F-02 missing auth test, F-04 partial BR-02 coverage) are fully resolved.

**Remaining gaps (7 total):** 2 high (Phase-3 scenario IDs missing from excluded_scenarios; pyramid without TADR), 3 medium (AC-22 state leak between S2-P2-03 and S2-P2-04; weak toBeGreaterThanOrEqual(2) in S2-P1-02 DB assertion; reconcilePending Set is never reset between tests), 2 low (Gherkin body headings still use old S2-P1-01b/02b IDs; Gherkin overview count says 15 not 16).

---

## Step 2: AC → Test Mapping

| AC | Tests | Status |
|---|---|---|
| AC-01 | S2-P1-01 (parse routes through Claude), S2-P2-01 (confirm+write+done), S2-P3-06 (majority parse) | MAPPED |
| AC-02 | S2-P1-02 (multi-skill parse+confirm), S2-P2-02 (null-date/level focused), S2-P3-06 (majority parse) | MAPPED |
| AC-03 | S2-P1-03 (garbled), S2-P1-04 (low-confidence), S2-P1-03-sdk (SDK throw), S2-P1-06 (multi-skill sub-threshold), S2-P1-03-enrollment (enrollment stays in-progress) | MAPPED |
| AC-22 | S2-P2-03 (promotion in place), S2-P2-04 (re-assert no-op), S2-P2-05 (TS-002 fallback), S2-AUTH-01 (cross-profile rejection) | MAPPED |
| AC-23 | S2-P1-05 (idempotent double-submit), S2-P2-06 (idempotent re-confirm) | MAPPED |

**Result: ALL 5 ACs covered.**

---

## Step 3: Implementation Plan Scenario Coverage

| Scenario ID | Title | Test | Status |
|---|---|---|---|
| S2-P0-01 | Foundation suites stay green | Excluded (existing suite, justified) | EXCLUDED |
| S2-P0-02 | RED for right reason | Excluded (import structure IS the proof, justified) | EXCLUDED |
| S2-P1-01 | Cert parse happy path | S2-P1-01 test | SCENARIO_IMPLEMENTED |
| S2-P1-02 | Multi-skill cert; null date/level tolerated | S2-P1-02 test | SCENARIO_IMPLEMENTED |
| S2-P1-03 | Garbled JSON → failure, no write | S2-P1-03 test | SCENARIO_IMPLEMENTED |
| S2-P1-04 | Sub-threshold confidence → failure | S2-P1-04 test | SCENARIO_IMPLEMENTED |
| S2-P1-05 | Idempotent double-submit | S2-P1-05 test | SCENARIO_IMPLEMENTED |
| S2-P1-06 | Multi-skill sub-threshold gate | S2-P1-06 test | SCENARIO_IMPLEMENTED |
| S2-P2-01 | Confirm writes one VERIFIED skill; item→done | S2-P2-01 test | SCENARIO_IMPLEMENTED |
| S2-P2-02 | Each multi-skill entry written verified, incl. null-date | S2-P2-02 test | SCENARIO_IMPLEMENTED |
| S2-P2-03 | Promotion in place on same canonical record; no dup | S2-P2-03 test | SCENARIO_IMPLEMENTED |
| S2-P2-04 | Re-assert at equal-or-lower trust is a no-op | S2-P2-04 test (state-leak caveat — G2-03) | SCENARIO_DIVERGENT |
| S2-P2-05 | De-dupe advisor failure does not block write | S2-P2-05 test | SCENARIO_IMPLEMENTED |
| S2-P2-06 | Idempotent re-confirm of already-promoted upload | S2-P2-06 test | SCENARIO_IMPLEMENTED |
| S2-P3-01 | S-01 happy path e2e against aws-saa-valid.pdf | Not in test_inventory or excluded_scenarios | SCENARIO_UNTESTED (G2-01) |
| S2-P3-02 | S-02 multi-skill e2e against multi-skill-bootcamp.pdf | Not in test_inventory or excluded_scenarios | SCENARIO_UNTESTED (G2-01) |
| S2-P3-03 | S-03 failure path against not-a-cert.png | Not in test_inventory or excluded_scenarios | SCENARIO_UNTESTED (G2-01) |
| S2-P3-04 | S-22 promotion: same record promoted, re-confirm no-op | Not in test_inventory or excluded_scenarios | SCENARIO_UNTESTED (G2-01) |
| S2-P3-05 | S-23 idempotency: same file twice | Not in test_inventory or excluded_scenarios | SCENARIO_UNTESTED (G2-01) |
| S2-P3-06 | Section-8 majority-parse metric | S2-P3-06 test | SCENARIO_IMPLEMENTED |

**Note:** S2-P3-01–05 are covered by Phase 1/2 tests (per implementation-plan §2.3 executable-mirror consolidation) but are not listed in excluded_scenarios, causing a manifest audit gap.

---

## Step 5: Test Quality Findings

| Test | Issue | Finding |
|---|---|---|
| S2-P2-03 / S2-P2-04 | AC-22 describe uses beforeAll (not beforeEach); S2-P2-03 promotes TypeScript leaving S2-P2-04's "first confirm" as a no-op — the SELF_REPORTED→VERIFIED transition is not exercised in isolation | STATE_LEAK (G2-03) |
| S2-P1-02 DB assertion | expect(dbSkills.length).toBeGreaterThanOrEqual(2) — exact count should be 2; 4 rows would pass | TRIVIAL_ASSERTION (G2-04) |
| S2-P2-05 | reconcilePending Set in lib/repos/skill.ts never reset between tests; isReconcilePending(key) could return true from a different test run | GLOBAL_STATE_COLLISION (G2-05) |
| Gherkin doc | Body headings still use S2-P1-01b / S2-P1-02b (old pre-F-03 IDs) | NAME_SCENARIO_DRIFT (G2-06) |
| Gherkin doc | Overview says "15 executable Vitest tests" — iteration 2 has 16 | COUNT_DRIFT (G2-07) |

---

## Step 6: Mock Accuracy

All 16 tests use the correct doubles from `tests/setup/test-helpers.ts`:
- `makeClaudeClientSpy` — returns `{ content:[{type:"text", text:JSON.stringify(scriptedResponse)}] }` (TADR-S2-01 v2 binding payloads)
- `makeClaudeClientGarbled` — returns invalid JSON text
- `makeClaudeClientThatThrows` — throws from createMessage

AC-01 spy payload: flat single-skill object `{skill, issuer, date, level, confidence:0.96}` — matches TADR-S2-01 v2 ground truth.
AC-02 spy payload: top-level array `[{...}, {date:null, level:null}]` — matches ground truth.

All: MOCK_ACCURATE.

---

## Step 7: Business Rule Coverage

| BR | Tests | Status |
|---|---|---|
| BR-01 | S2-P2-01, S2-P2-02 (verified write with source=CERTIFICATE, origin=ACQUIRED) | BR_TESTED |
| BR-02 | S2-P1-03 (no Certificate + no EmployeeSkill), S2-P1-04, S2-P1-06, S2-P1-03-enrollment | BR_TESTED |
| BR-09 | S2-P1-01 (claude.createMessage called exactly once), all parse tests | BR_TESTED |
| BR-18 | S2-P2-03 (same row id promoted), S2-P2-04 (no-op), S2-P2-06 (toBe(1) exact count) | BR_TESTED |
| BR-19 | S2-P1-05 (one Certificate, one createMessage call), S2-P2-06 (one EmployeeSkill) | BR_TESTED |

---

## Step 8: Negative Testing

| Scenario | Test | Status |
|---|---|---|
| Garbled JSON from Claude | S2-P1-03 | NEGATIVE_PRESENT |
| Low-confidence gate | S2-P1-04 | NEGATIVE_PRESENT |
| Multi-skill sub-threshold (min semantics) | S2-P1-06 | NEGATIVE_PRESENT |
| SDK throw boundary-catch | S2-P1-03-sdk | NEGATIVE_PRESENT |
| Cross-profile write rejection | S2-AUTH-01 | NEGATIVE_PRESENT |

---

## Step 10: Coverage Prediction + Pyramid

| Metric | Target | Predicted | Status |
|---|---|---|---|
| Overall | 40% | 54% | COVERAGE_MET |
| New code | 45% | 62% | COVERAGE_MET |
| Branch | 40% | 50% | COVERAGE_MET |
| Critical paths | 75% | 82% | COVERAGE_MET |
| Pyramid | ~70/20/10 | 0/100/0 | PYRAMID_VIOLATION (G2-02) |

Coverage targets (hackathon-relaxed) are met. Pyramid imbalance is a blocker per testing standards: requires TADR, not a manifest note (F-09 was only partially resolved).

---

## Step 11: Failing State Verification

Run: `pnpm test tests/cert-parsing.test.ts` (2026-06-08)
- 16 tests / 0 passed / 16 failed
- Failure: `Error: Cannot find package '@/lib/cert/parse-certificate'`
- Failure location: `tests/cert-parsing.test.ts:184 (loadCertModule())`
- No syntax errors, no silent skips, no imports-that-work
- All: PROPERLY_FAILING

---

## Step 12: Manifest Reconciliation

| Source | Count |
|---|---|
| test-manifest.json test_inventory | 16 |
| tests/cert-parsing.test.ts (it() count) | 16 |
| test_statistics.total_tests | 16 |
| test-scenarios-gherkin.md Scenario Coverage Map | 16 |
| Gherkin overview header | 15 (wrong — G2-07) |

Counts agree except the Gherkin header. Status: MANIFEST_DRIFT (minor — G2-07).

---

## Step 13: Scenario-to-Test Set Diff

```
set(test_scenarios.json) = {S2-P0-01, S2-P0-02, S2-P1-01..06, S2-P2-01..06, S2-P3-01..06}
set(test_inventory + excluded_scenarios) = {S2-P0-01, S2-P0-02, S2-P1-01..06, S2-P2-01..06, S2-P1-03-sdk, S2-P1-03-enrollment, S2-AUTH-01, S2-P3-06}
Difference = {S2-P3-01, S2-P3-02, S2-P3-03, S2-P3-04, S2-P3-05}
```

5 Phase-3 IDs unaccounted for. Status: SCENARIO_UNTESTED (G2-01 high).

---

## Step 14: Fixture-vs-Contract Diff

Fixtures: `fixtures/certs/aws-saa-valid.pdf`, `multi-skill-bootcamp.pdf`, `not-a-cert.png`.
Contract source: implementation-plan §2.1, test-scenarios.json harness.fixtures.
Tests reference fixtures via CERT_FIXTURES constants — paths match the harness declaration.
All: FIXTURE_ACCURATE.

---

## Step 15: Test-vs-Stub Semantic Check

All tests assert on results returned by `parseCertificate` or `confirmAndWriteSkill` after calling those functions via `loadCertModule()`. No test asserts on a setup variable or fixture constant as the subject. The TS-002 test (S2-P2-05) asserts `isReconcilePending(key)` which traces to a call into production code (`markReconcilePending` inside `resolveCanonicalSkill` → `confirmAndWriteSkill`). Structural concern captured as G2-05.

All: TEST_REAL.

---

## Step 16: Classification Audit

All 16 tests are correctly classified as integration: they call production code functions (`parseCertificate`, `confirmAndWriteSkill`) that interact with the injected Claude client double and the real Prisma client against the disposable test SQLite database. No tests are misclassified as unit that actually have DB dependencies.

All: CLASSIFICATION_OK.

---

## Step 17: Cross-Test Global-State Collision

- `reconcilePending` Set in `lib/repos/skill.ts` — module-level mutable state, never reset. Captured as G2-05.
- `seedCertTestProfile` uses deleteMany + create (idempotent) in beforeEach for AC-01/02/03/AUTH/AC-23 blocks. ISOLATED.
- AC-22 describe block uses beforeAll for employee ID lookup; EmployeeSkill rows not reset between S2-P2-03 and S2-P2-04. Captured as G2-03.

---

## Step 18: TADR Compliance

| Test Infrastructure | Compliance |
|---|---|
| Claude doubles (makeClaudeClientSpy/Garbled/ThatThrows) | TADR_COMPLIANT — exactly as TADR-S2-01 v2 specifies |
| Zod validation via callClaude/CertParseResult | TADR_COMPLIANT |
| DB isolation (disposable SQLite per-run, no dev.db) | TADR_COMPLIANT |
| Pyramid (100% integration) | TADR_VIOLATION — pyramid deviation documented in manifest note, but TADR required (G2-02) |

---

## Prior Findings Resolution Status

| Finding | Iteration-1 Severity | Resolution Status |
|---|---|---|
| F-01 TS-002 stub not a real test | CRITICAL | CONFIRMED_RESOLVED (layer2Client top-level injection confirmed) |
| F-02 Missing cross-profile auth test | HIGH | CONFIRMED_RESOLVED (S2-AUTH-01 added) |
| F-03 Manifest ID drift | HIGH | PARTIALLY_RESOLVED (manifest corrected; Gherkin body headings not updated — G2-06) |
| F-04 BR-02 partial coverage | HIGH | CONFIRMED_RESOLVED (both Certificate and EmployeeSkill rows asserted in S2-P1-03) |
| F-05 Weak toBeGreaterThanOrEqual(1) | MEDIUM | PARTIALLY_RESOLVED (S2-P2-01 and S2-P2-06 fixed; S2-P1-02 DB assertion still weak — G2-04) |
| F-06 Tautological writes.length assertion | MEDIUM | CONFIRMED_RESOLVED |
| F-07 beforeAll state leak in AC-23 | MEDIUM | CONFIRMED_RESOLVED (changed to beforeEach) |
| F-08 SDK-throw scenario mislabeled | LOW | CONFIRMED_RESOLVED |
| F-09 Pyramid without documentation | LOW | PARTIALLY_RESOLVED (manifest note added; TADR not added — G2-02) |

---

## Remediation Checklist

| Priority | Finding | Action |
|---|---|---|
| HIGH | G2-01 | Add S2-P3-01..05 to excluded_scenarios[] in test-manifest.json with consolidation justification |
| HIGH | G2-02 | Add TADR-S2-03 to tactical-adrs.md justifying 100% integration pyramid |
| MEDIUM | G2-03 | Add beforeEach to AC-22 block to reset EmployeeSkill state between S2-P2-03 and S2-P2-04 |
| MEDIUM | G2-04 | Change S2-P1-02 DB assertion from toBeGreaterThanOrEqual(2) to toBe(2) |
| MEDIUM | G2-05 | Export clearReconcilePending() from lib/repos/skill.ts; call in beforeEach/afterEach in TS-002 block |
| LOW | G2-06 | Update Gherkin body headings S2-P1-01b→S2-P2-01, S2-P1-02b→S2-P2-02 |
| LOW | G2-07 | Update Gherkin overview header from "15 executable Vitest tests" to "16" |

---

**Generated by:** nulogic-test-reviewer · **Version:** 2.0
