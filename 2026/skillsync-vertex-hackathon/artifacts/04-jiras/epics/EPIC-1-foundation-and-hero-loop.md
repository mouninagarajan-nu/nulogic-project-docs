# EPIC-1 — Foundation & The Hero Loop

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 04-jira-creation
**Roadmap phases:** Phase 1 (Foundation) · Phase 2 (Certificate Parsing) · Phase 3 (Staffing Matcher) · Phase 4 (The Loop)
**Stories:** SKILL-1, SKILL-2, SKILL-3, SKILL-4 (loop portion)
**Sprint estimate:** ~3 sprints (critical path) · **Branding:** NULogic · **Data:** Synthetic only — no real PII

---

## Problem Statement

NULogic staffs client engagements from memory and stale resumes, and tracks mandatory upskilling in spreadsheets with no proof and no link to real skill records. The two processes never inform each other: identified skill gaps never drive learning, and completed learning never sharpens staffing. There is no fast, trustworthy way to ask "who has skill X *and* is available within two weeks?", and skill data goes stale the moment it is entered.

This epic delivers the **substrate and the hero capability**: the living employee skill profile on a trust-state data model, the Claude-only intelligence boundary, certificate parsing that writes *verified* skills, availability-aware staffing match, and **the loop** that visibly connects them — upload a certificate, the profile updates, re-run a staffing search and the ranking improves.

## Business Value

- **Time-to-staff** drops from days (manual, from memory) to minutes (a single Claude-ranked search).
- **Skill data becomes trustworthy** — verified skills come only from parsed certificates and appear immediately.
- **The loop is the product bet** — it is the single most important demo path and the reason the two modules share one profile. Everything in this epic protects it.

## Product Requirements (business capabilities)

- A living employee skill profile with baseline skills, availability, and a single canonical record per skill whose trust state only promotes.
- Certificate upload that extracts skills via Claude, with employee confirmation before any write, and graceful failure that never corrupts the profile.
- Plain-English, availability-aware staffing search returning a ranked shortlist with match %, matched skills, gaps, availability, and a one-line rationale.
- The end-to-end loop: a surfaced gap drives a recommendation, a completed certificate promotes the same skill record, and the re-run search visibly improves.
- Synthetic-data-only guardrail with no real PII anywhere, and all intelligence routed through the Claude API validated before use.

## Business Rules Coverage

BR-01, BR-02, BR-04, BR-05, BR-06, BR-07, BR-08, BR-09, BR-10, BR-11, BR-12, BR-16, BR-18, BR-19, BR-22

## Acceptance Criteria Coverage

AC-13, AC-16, AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-21, AC-07, AC-22, AC-23 (cert), AC-08, AC-09, AC-10, AC-26, AC-27

## Business Risks

- **The loop's before/after comparison breaks** if a skill duplicates into two rows instead of promoting one — this is the highest-impact demo failure. Mitigated by the single-canonical-record data invariant.
- **Claude returns invalid or garbled output** and corrupts the profile — mitigated by validating every model output before any write and never writing on failure.
- **Real PII leaks** into the repo, DB, or fixtures — a non-negotiable org/PRD violation — mitigated by synthetic-only seed data and a pre-commit review gate.
- **Claude API unavailable at demo time** — mitigated by graceful "temporarily unavailable" messaging that never crashes.

## Success Criteria

- The three demo scenarios (clean match, hard match, close-the-loop) run cleanly end to end.
- A majority of certificate fixtures parse to valid, validated extractions; failed parses write nothing and show the specified message.
- A re-run staffing search after a certificate upload visibly raises the candidate's match % / rank, driven by the promoted single record — with no duplicate row.
- Zero real PII in seed data, DB, or fixtures.

## Cross-Epic Dependencies

- **Blocks** EPIC-2 (Profile Spine — reuses the upsert+promote skill path and the Claude wrapper) and EPIC-3 (Auth & Roles — scopes the matcher dataset).
- **Blocked by** nothing — this is the critical-path foundation.
