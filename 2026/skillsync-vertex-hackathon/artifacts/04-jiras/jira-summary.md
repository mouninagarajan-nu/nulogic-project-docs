# Jira Summary — SkillSync (Vertex Hackathon)

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 04-jira-creation · **Mode:** local-only (no remote Jira sync)
**Generated:** 2026-06-05 · **Repo:** ai-nu-skillsync (LOCAL-ONLY)

3 Epics · 6 Stories · 18 Sub-tasks · 42 story points · 27/27 ACs covered.

---

## Stories

| ID | Title | Epic | Points | T-shirt | Priority | # Sub-tasks |
|---|---|---|---|---|---|---|
| SKILL-1 | Foundation: synthetic data, trust-state persistence & the Claude boundary | EPIC-1 | 8 | L | Highest | 3 |
| SKILL-2 | Certificate parsing → verified skills (the innovation hero) | EPIC-1 | 5 | L | Highest | 3 |
| SKILL-3 | Staffing Matcher: availability-aware ranked shortlist | EPIC-1 | 5 | L | Highest | 3 |
| SKILL-4 | The Hero Loop + Catalog Intelligence | EPIC-1 (+EPIC-2 catalog) | 8 | L | Highest | 3 |
| SKILL-5 | Profile Spine: baseline skills, self-service, approval & resume | EPIC-2 | 8 | L | High | 3 |
| SKILL-6 | Auth, Roles, Progress Summary & NULogic UI | EPIC-3 | 8 | XL | High | 3 |

**Totals:** 42 story points · 18 sub-tasks.

---

## Epics

| Epic | Title | Phases | Stories | File |
|---|---|---|---|---|
| EPIC-1 | Foundation & The Hero Loop | P1–P4 | SKILL-1, SKILL-2, SKILL-3, SKILL-4 (loop) | `epics/EPIC-1-foundation-and-hero-loop.md` |
| EPIC-2 | Profile Spine & Catalog Intelligence | P5–P6 | SKILL-5, SKILL-4 (catalog) | `epics/EPIC-2-profile-spine-and-catalog.md` |
| EPIC-3 | Authentication, Roles & NULogic UI | P7–P8 | SKILL-6 | `epics/EPIC-3-auth-roles-and-ui.md` |

---

## Per-story sub-tasks

| Story | Sub-task | Focus |
|---|---|---|
| SKILL-1 | SUB-TASK-1/2/3 | Schema+seed+fixtures+no-PII gate · Claude wrapper+prompts+schemas+upsert/promote · Vitest+foundation tests |
| SKILL-2 | SUB-TASK-1/2/3 | Cert upload handler+parse+schema+idempotency · confirm+promote to verified · cert-parse tests |
| SKILL-3 | SUB-TASK-1/2/3 | Role-scoped dataset+match-staffing(Opus)+MatchResult+caching · runMatch branches · matcher tests |
| SKILL-4 | SUB-TASK-1/2/3 | Loop orchestration (recommend→promote→re-match) · catalog add/de-dupe/enrich/endorse · plan gate+tests |
| SKILL-5 | SUB-TASK-1/2/3 | Self-service+approval actions · resume upload+parse+confirm · profile-spine tests |
| SKILL-6 | SUB-TASK-1/2/3 | Auth+hd check+identity mapping+session gate · role scoping+assignRole+progress summary · UI+view-switcher+tests |

---

## Sizing rationale (LOC → points, agile-standards)

| Story | Est. LOC | Points | Drivers |
|---|---|---|---|
| SKILL-1 | ~700 | 8 | New infra; data model; security/PII guardrail; multiple net-new modules |
| SKILL-2 | ~380 | 5 | Upload + parse + write path; data-integrity discipline |
| SKILL-3 | ~360 | 5 | Opus ranking; caching; role-scoped dataset |
| SKILL-4 | ~480 | 8 | Hero loop integration + catalog (de-dupe/enrich/recommend) + plan gate |
| SKILL-5 | ~460 | 8 | Self-service + approval + resume parse (mirrors cert discipline) |
| SKILL-6 | ~520 | 8 (XL) | New auth infra; security boundary; all UI screens + freeze |

---

## Coverage

- **ACs:** 27 / 27 covered (see `traceability-matrix.md`).
- **Business rules:** all 23 BRs (BR-01..BR-22 incl. BR-13a) referenced by ≥1 story.
- **Jira sync:** skipped (`jira_creation_mode = local_only`). No remote tickets created.
