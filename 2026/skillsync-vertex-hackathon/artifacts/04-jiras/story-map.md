# Story Map — SkillSync (Vertex Hackathon)

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 04-jira-creation · **Mode:** local-only
**Branding:** NULogic · **Data:** Synthetic only — no real PII · **Generated:** 2026-06-05

3 Epics → 6 Stories → 27 Acceptance Criteria. All "intelligence" routes through the Claude API (cert/resume parse, matching/ranking, catalog de-dupe/tag/enrich/recommend, summarization), Zod-validated before any write.

---

## Epics → Stories → ACs

| Epic | Roadmap phases | Story | Story title | ACs owned |
|---|---|---|---|---|
| **EPIC-1** — Foundation & The Hero Loop | P1 Foundation, P2 Cert, P3 Matcher, P4 Loop | SKILL-1 | Foundation: synthetic data, trust-state persistence & the Claude boundary | AC-13, AC-16 (data) |
| | | SKILL-2 | Certificate parsing → verified skills | AC-01, AC-02, AC-03, AC-22 (cert), AC-23 (cert) |
| | | SKILL-3 | Staffing Matcher: availability-aware ranked shortlist | AC-04, AC-05, AC-06, AC-21 |
| | | SKILL-4 | The Hero Loop + Catalog Intelligence (loop portion) | AC-07, AC-22 (loop), AC-23 (loop) |
| **EPIC-2** — Profile Spine & Catalog Intelligence | P5 Profile Spine, P6 Catalog & Plan | SKILL-5 | Profile Spine: baseline, self-service, approval, resume | AC-16 (UI), AC-17, AC-18, AC-19, AC-20, AC-22 (profile), AC-23 (resume) |
| | | SKILL-4 | The Hero Loop + Catalog Intelligence (catalog portion) | AC-08, AC-09, AC-10, AC-26, AC-27 (logic) |
| **EPIC-3** — Authentication, Roles & NULogic UI | P7 Auth & Roles, P8 UI & Polish | SKILL-6 | Auth, Roles, Progress Summary & NULogic UI | AC-11, AC-12, AC-14, AC-15, AC-24, AC-25, AC-27 (UI) |

> SKILL-4 spans EPIC-1 (the hero loop) and EPIC-2 (catalog & plan), per the roadmap phase mapping (P4 + P6). It is filed under EPIC-1 (its primary, hero-loop home) in its metadata.

---

## Capability map (user journey → story)

| User journey (capability) | Owning story | Phase |
|---|---|---|
| Living profile substrate, trust-state schema, Claude boundary, synthetic seed | SKILL-1 | P1 |
| Upload certificate → Claude extract → confirm → verified skill | SKILL-2 | P2 |
| Plain-English availability-aware ranked staffing search | SKILL-3 | P3 |
| **The loop:** gap → recommendation → cert promote → re-run match improves | SKILL-4 | P4 |
| Catalog add / de-dupe / tag / enrich / recommend / endorse | SKILL-4 | P6 |
| Upskilling-plan finalize gate (≥2 items incl. ≥1 AI-enabled) | SKILL-4 | P6 |
| Baseline skills, self-service add/update, manager approval | SKILL-5 | P5 |
| Resume upload → Claude extraction → pre-populate profile | SKILL-5 | P5 |
| Google OAuth (nulogic.io), identity mapping, session gate | SKILL-6 | P7 |
| Role scoping, Admin role assignment, Claude progress summary | SKILL-6 | P7 |
| NULogic-branded screens + role view-switcher demo aid | SKILL-6 | P8 |

---

## Critical path (must not slip)

`SKILL-1 → SKILL-2 → SKILL-3 → SKILL-4` (the hero loop). SKILL-5 hangs off SKILL-1; SKILL-6 hangs off SKILL-1 + SKILL-5. See `dependency-graph.md`.

## P0 (demo-critical) AC coverage

P0 ACs (AC-01, AC-03, AC-04, AC-07, AC-13, AC-15, AC-16, AC-22) are all owned by SKILL-1/2/3/4/6 — the hero loop + guardrails complete before lower-risk surface.
