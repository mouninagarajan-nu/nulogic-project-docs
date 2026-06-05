# Traceability Matrix — AC → Owning Story

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 04-jira-creation · **Generated:** 2026-06-05

Every one of the 27 acceptance criteria (AC-01 … AC-27) mapped to its owning story/stories. **Result: 27/27 covered, 0 uncovered.** Source of truth: `artifacts/01-intent/acceptance-criteria.v1.json` (27 ACs); cross-checked against the roadmap AC→phase table (`target-state/04-implementation-roadmap.md §4`).

---

## AC → Story

| AC | Title (abbrev) | Priority | Owning story | Notes |
|---|---|---|---|---|
| AC-01 | Cert parse happy path | P0 | SKILL-2 | — |
| AC-02 | Cert multi-skill / unusual | P1 | SKILL-2 | — |
| AC-03 | Cert parse failure / low confidence | P0 | SKILL-2 | — |
| AC-04 | Availability-aware ranked match | P0 | SKILL-3 | — |
| AC-05 | Hard match → closest + gaps | P1 | SKILL-3 | — |
| AC-06 | Staffing search failure | P1 | SKILL-3 | — |
| AC-07 | Close the loop (hero, e2e) | P0 | SKILL-4 | reuses SKILL-2 write + SKILL-3 match |
| AC-08 | Catalog de-dupe / normalize | P1 | SKILL-4 | — |
| AC-09 | Catalog auto-tag / enrich | P2 | SKILL-4 | — |
| AC-10 | Recommendations | P2 | SKILL-4 | — |
| AC-11 | Role-based data scoping | P1 | SKILL-6 | dataset builder in SKILL-3; full enforcement in SKILL-6 |
| AC-12 | Team progress summary | P2 | SKILL-6 | — |
| AC-13 | Synthetic / no-PII guardrail | P0 | SKILL-1 | — |
| AC-14 | Google sign-in + deterministic mapping | P1 | SKILL-6 | — |
| AC-15 | Non-NULogic rejection | P0 | SKILL-6 | — |
| AC-16 | Baseline skills on profile | P0 | SKILL-1 + SKILL-5 | data-present (SKILL-1) + UI/self-service (SKILL-5) |
| AC-17 | Employee self-service skill | P1 | SKILL-5 | — |
| AC-18 | Manager approval | P1 | SKILL-5 | — |
| AC-19 | Resume extraction | P1 | SKILL-5 | — |
| AC-20 | Resume parse failure | P1 | SKILL-5 | — |
| AC-21 | Partial-quantity match | P1 | SKILL-3 | — |
| AC-22 | One canonical skill / promotion | P0 | SKILL-2 + SKILL-4 (+ SKILL-5) | cert side (SKILL-2), loop side (SKILL-4), profile side (SKILL-5) |
| AC-23 | Idempotent uploads | P1 | SKILL-2 (cert) + SKILL-5 (resume) (+ SKILL-4 loop reuse) | — |
| AC-24 | Session expiry / re-auth | P1 | SKILL-6 | — |
| AC-25 | Admin role assign | P2 | SKILL-6 | — |
| AC-26 | Plan validation gate | P1 | SKILL-4 | — |
| AC-27 | Manager endorsed flag | P2 | SKILL-4 (logic) + SKILL-6 (UI surfacing) | — |

---

## Coverage by story

| Story | ACs owned (incl. shared) | Count |
|---|---|---|
| SKILL-1 | AC-13, AC-16 | 2 |
| SKILL-2 | AC-01, AC-02, AC-03, AC-22, AC-23 | 5 |
| SKILL-3 | AC-04, AC-05, AC-06, AC-21 | 4 |
| SKILL-4 | AC-07, AC-08, AC-09, AC-10, AC-22, AC-23, AC-26, AC-27 | 8 |
| SKILL-5 | AC-16, AC-17, AC-18, AC-19, AC-20, AC-22, AC-23 | 7 |
| SKILL-6 | AC-11, AC-12, AC-14, AC-15, AC-24, AC-25, AC-27 | 7 |

---

## Verification

- **Distinct ACs covered:** AC-01 … AC-27 = **27 / 27**.
- **Uncovered ACs:** **none**.
- **Shared ACs (intentional, by lifecycle stage):** AC-16 (data vs UI), AC-22 (cert / loop / profile write paths), AC-23 (cert / resume / loop reuse), AC-27 (logic vs UI surfacing) — each is fully owned end-to-end across its stories, not split-and-dropped.
- **Cross-check vs roadmap §4:** every roadmap AC→phase row has a corresponding owning story; no roadmap AC is left without a story.

> No AC required reassignment — the epic-driven story mapping already covered all 27.
