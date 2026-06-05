# EPIC-2 — Profile Spine & Catalog Intelligence

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 04-jira-creation
**Roadmap phases:** Phase 5 (Profile Spine) · Phase 6 (Catalog & Plan)
**Stories:** SKILL-5 (profile spine) · SKILL-4 (catalog & plan portion)
**Sprint estimate:** ~2 sprints · **Branding:** NULogic · **Data:** Synthetic only — no real PII

---

## Problem Statement

A staffing match is only as good as the profile behind it. Today there is no way for an employee to capture the skills they already have, no way for a manager to vouch for a self-reported skill, and no fast way to pre-populate a profile from a resume. Likewise the learning catalog is a flat list with duplicate entries and no intelligence — duplicates multiply, items are untagged, and nobody knows which learning is org-preferred or AI-enabled.

This epic delivers the **profile capabilities that feed matching** (baseline skills, employee self-service, manager approval, resume extraction) and the **catalog intelligence** (de-dupe, tag, enrich, recommend, endorse) plus the **upskilling-plan validation gate** that the compliance metric depends on.

## Business Value

- **Profiles reflect real, current capability** the moment an employee adds a skill or uploads a resume, feeding sharper matches.
- **Managers can trust self-reported skills** via a single lightweight approval, without building an approval bureaucracy.
- **The catalog stays clean and useful** — Claude merges duplicates, tags and enriches items, and recommends the right learning per employee, feeding the loop's recommendation step.
- **Upskilling compliance becomes measurable** — a validated plan (at least two items, at least one AI-enabled) is the gate the live compliance percentage depends on.

## Product Requirements (business capabilities)

- Baseline/current skills on every profile, distinct from upskilling-acquired verified skills, with current project and availability.
- Employee self-service skill add/update (self-reported) with inline validation.
- Manager approval that promotes a self-reported skill to manager-approved, gated to authorized managers.
- Resume upload + Claude extraction that pre-populates the profile after confirmation, degrading gracefully on failure, idempotent on double-submit.
- Catalog add-by-name with Claude de-dupe/merge, auto-tag, and auto-enrich; per-employee recommendations; manager-only endorsed flag surfaced to users.
- Upskilling-plan finalize gate enforcing the minimum-items and AI-enabled rule, with specific rejection messages and a remove/swap path.

## Business Rules Coverage

BR-06, BR-07, BR-08, BR-09, BR-11, BR-14, BR-15, BR-16, BR-17, BR-18, BR-19, BR-22

## Acceptance Criteria Coverage

AC-16, AC-17, AC-18, AC-19, AC-20, AC-23 (resume), AC-08, AC-09, AC-10, AC-26, AC-27

## Business Risks

- **Approval-workflow sprawl** — scope creep into multi-step review chains and notifications; capped at a single self-reported → manager-approved transition.
- **Resume parsing over-investment** — chasing every real-world layout; capped at synthetic fixtures with the same discipline as cert parsing.
- **Catalog feature sprawl** — endorsement workflows; capped at the single endorsed flag.
- **A resume/self-service write under low confidence corrupts the profile** — mitigated by validate-before-write and confirm steps.

## Success Criteria

- Baseline skills, self-service edits, manager approval, and resume extraction all pass their scenarios; resume parsing succeeds on a majority of fixtures; unauthorized approval is denied; nothing is written on resume parse failure.
- Catalog de-dupe merges near-duplicates; enrichment failure never blocks an add; non-conforming plans are rejected with the right message; a non-manager endorse is denied.

## Cross-Epic Dependencies

- **Blocked by** EPIC-1 (reuses the Claude wrapper, the upsert+promote skill path, and the seeded data/catalog).
- **Blocks** EPIC-3's progress summary (consumes plan/compliance state) and EPIC-1's loop recommendation step (consumes catalog recommendations).
