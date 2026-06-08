# Implementation Review Report — SKILL-3 (Staffing Matcher)

**Reviewer:** nulogic-implementation-reviewer · **Iteration:** 2 · **Date:** 2026-06-08
**Status:** `needs_revision` · **next_stage_ready:** `false`
**Findings:** 1 critical, 0 high, 0 medium, 1 low · **Tactical ADRs approved:** No (one deviation undocumented)
**Persona:** adversarial · **Run:** local-only hackathon

> Clean-slate review. All six iteration-1 findings (F-01..F-06) were re-verified against the actual repo and are RESOLVED. One NEW critical contract mismatch surfaced, plus one low internal count drift.

---

## 1. Executive Summary

The iteration-2 plan is structurally strong: the F-03 caching wiring now matches `claude.ts:118` exactly, role tokens match `schema.prisma`, the reuse audit is complete and per-file-correct, phase ordering is a clean TDD DAG, the RBAC matrix is present, and the canonical `CoreProfileRecord`/`toCoreRecord` reconciliation (S3-04) genuinely closes the iteration-1 record-shape seam.

However, the single most load-bearing seam in this story — **the shape the model actually returns vs the schema the code validates it against** — is unreconciled and will break the binding RED acceptance test. The plan validates ALL model output through `MatchResult = z.object({ results: [...] })`, but the authored test scripts the Claude double with a **bare array** (AC-04, AC-05) and a **`{ shortlist, shortfallNote }` object** (AC-21) — neither has a `results` key, so `safeParse` fails and `runStaffingSearch` returns `{ ok:false }`, contradicting the tests' `res.ok===true`. This is a CRITICAL spec-contract mismatch and an undocumented deviation (no tactical ADR covers the top-level output shape).

---

## 2. Prior-Findings Verification (iteration 1 → 2)

| Prior | Verdict | Evidence |
|---|---|---|
| F-01 (loadModule/SYNTHETIC_PROFILES missing) | RESOLVED | `grep` confirms neither exists in repo (only cert's local `loadCertModule`). Plan marks `tests/setup/test-helpers.ts` MODIFY + adds both as additive exports (§3, Phase 0, §11, `files_modified`). |
| F-02 (profile record-shape seam) | RESOLVED | §2.4a `CoreProfileRecord` + `toCoreRecord` + TACTICAL-ADR-S3-04 map both producers without dropping `trustState`/seniority/timezone. |
| F-03 (caching wiring) | RESOLVED | `claude.ts:118` wires `system: cacheableContext`; `renderPrompt`→`messages`. Plan puts `RANKING_RULES_PROMPT`+dataset in `cacheableContext`, query in user turn. `SYSTEM_PROMPT` (system.ts:17) is NOT auto-passed; output contract carried in `RANKING_RULES_PROMPT`. |
| F-04 (HR token) | RESOLVED | `schema.prisma:15` = `ADMIN\|MANAGER\|PRACTICE_LEAD\|EMPLOYEE`. Plan/scenarios/ADRs use only real tokens. |
| F-05 (AC-24 scope) | RESOLVED | AC-24 deferred to SKILL-6 (no session lifecycle; only seam = hardcoded `getCallerEmployeeId()→"p-001"`). Removed from in-scope claims, no orphan test. |
| F-06 (additive label + checklist) | RESOLVED | S3-P3-05 labeled additive; test-helpers in checklist/`files_modified`; counts reconciled (15 scenarios / 8 files). |

---

## 3. AC Coverage Matrix

| AC | Phase | Test | File | Verdict |
|---|---|---|---|---|
| AC-04 | 1,3 | S3-P3-01, S3-P3-06, S3-P1-02 | run-staffing-search.ts, MatchResult.ts, match-staffing.ts | COVERED (but blocked by F-01 schema mismatch) |
| AC-05 | 3 | S3-P3-02 | run-staffing-search.ts | COVERED (blocked by F-01) |
| AC-06 | 3,4 | S3-P3-04, S3-P3-05(additive), S3-P4-02 | run-staffing-search.ts, config.ts, route.ts | COVERED |
| AC-21 | 1,3 | S3-P3-03 | MatchResult.ts, run-staffing-search.ts | COVERED (blocked by F-01) |
| AC-11/BR-03 | 2,4 | S3-P2-01, S3-P2-02, S3-P4-01 | dataset.ts, route.ts | COVERED |
| AC-24 | — | — | — | OUT OF SCOPE (SKILL-6) — legitimate |

No scope creep. The only additive scenario (S3-P3-05 garbled JSON) is correctly labeled additive.

---

## 4. Architecture / Pattern / Structural Findings

- **Caching (F-03 fix):** ALIGNED — verified against `claude.ts:117-120`.
- **Role tokens (F-04 fix):** ALIGNED — verified against `prisma/schema.prisma`.
- **Model-output shape vs `MatchResult` schema:** **SPEC_CONTRACT_MISMATCH (critical)** — see Finding F-01.
- **Structural (SOLID):** core takes injected `claude` (DIP clean); dataset builder is the sole Prisma reader; route is thin transport; single `callClaude` per search (no N+1); read-only (no atomicity/soft-delete/TTL concerns). PASS.
- **Reuse:** per-file audit table complete; all BUILD-NEW analogs (cert core, cert config, cert route) verified real; `callClaude`/`route`/`renderPrompt` IMPORT verified; no uncited >60% overlap. PASS.
- **Wiring trace:** every new identifier has a cited consumer. PASS.
- **Phase ordering:** P0 helpers → P1 schema → P2 dataset → P3 core → P4 route; test-first DAG, no cycles. PASS.

---

## 5. Tactical ADR Decisions

| ADR | Decision |
|---|---|
| TACTICAL-ADR-S3-01 (core vs runMatch reconciliation) | APPROVED — ≥2 real alternatives, trade-offs, cert-precedent evidence. |
| TACTICAL-ADR-S3-02 (rank/inRequestedWindow optional superset) | APPROVED — additive optional fields, not a §2.5 break. NOTE: does NOT cover the top-level output-shape divergence (F-01). |
| TACTICAL-ADR-S3-03 (rewrite SKILL-1 stub schema/prompt) | APPROVED — contained in-repo break, swept for consumers. |
| TACTICAL-ADR-S3-04 (canonical CoreProfileRecord) | APPROVED — closes the F-02 seam; production path carries trust/seniority/timezone. |
| (missing) Output top-level shape (array \| {shortlist} \| {results}) | **ADR_MISSING (critical)** — new deviation breaking the binding test; no ADR. See F-01. |

---

## 6. Diff Budget / Reconciliation

- **Budget:** ~385 LOC vs ~360 story estimate — OVER_BUDGET_ADVISORY (~25 LOC), justified by reviewer-finding scaffolding; not blocking.
- **Count reconciliation:** scenarios (15) and files (8) agree across plan §4/§8/§11, test-scenarios.json, and planner output. The ONLY drift is internal LOC prose: §1 says "~378" while §8 + planner output say "385" (Finding F-02, low).

---

## 7. Remediation Summary

| ID | Sev | Remediation |
|---|---|---|
| F-01 | critical | Make the validated schema/normalizer accept the three scripted shapes (bare array, `{shortlist,...}`, `{results,...}`) — lift them to one internal `results[]` BEFORE `safeParse` (which runs inside `callClaude`); record a new/extended tactical ADR for the output-shape divergence; update §2.5, S3-P1-01, Phase 3, Wiring Trace. |
| F-02 | low | Align plan §1 LOC prose (378) with §8 table + planner output (385). |

**Gate:** total_findings = 2 (> 0) and one tactical deviation undocumented → `next_stage_ready: false`. Feed back to the planner.
