# EPIC-3 — Authentication, Roles & NULogic UI

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 04-jira-creation
**Roadmap phases:** Phase 7 (Auth & Roles) · Phase 8 (UI & Polish)
**Stories:** SKILL-6
**Sprint estimate:** ~2 sprints · **Branding:** NULogic · **Data:** Synthetic only — no real PII

---

## Problem Statement

The MVP must gate access to NULogic employees and present role-appropriate views, but it must do so without ever storing real personal data. Without authentication the app cannot restrict access or scope data by role; without role scoping a Practice Lead would see the whole org and an Employee could run staffing searches. And without a clean, branded interface the hero loop cannot be demoed credibly.

This epic delivers **real Google sign-in restricted to NULogic accounts**, the **role hierarchy and data scoping** layered on the authenticated identity, the **minimal Admin role-assignment** capability, the **Claude-summarized team-progress view**, and the **minimal NULogic-branded screens** that surface every capability — then a feature freeze and polish of the end-to-end demo.

## Business Value

- **Access is gated to NULogic** with no real PII persisted — authenticated identities map to synthetic profiles by design.
- **Each role sees the right data** — managers see the org, Practice Leads see their team, employees manage their own profile and learning.
- **Managers get an at-a-glance compliance picture** via a Claude summary of who is on track, behind, or thin on coverage.
- **The demo is credible** — a clean, NULogic-branded interface ties the loop together.

## Product Requirements (business capabilities)

- Sign-in/sign-up via Google, restricted to NULogic accounts; non-NULogic accounts rejected with no session.
- Deterministic resolution of an authenticated identity to the same synthetic profile and role every time, keyed by a synthetic handle (never real email/PII).
- Expired-session handling that redirects to sign-in and never serves protected data or writes under a stale identity.
- Role-based data scoping (Practice Lead = team; Employee blocked from the matcher) and a minimal Admin assign/override-role action.
- Claude-summarized, role-scoped team-progress / compliance view with an empty state.
- All product screens (sign-in, profile, tracker, resume upload, matcher, approval queue, progress, admin, catalog) with NULogic branding, plus a role view-switcher retained as a demo/testing aid.

## Business Rules Coverage

BR-03, BR-09, BR-10, BR-12, BR-13, BR-13a, BR-20, BR-21, BR-22

## Acceptance Criteria Coverage

AC-14, AC-15, AC-24, AC-11, AC-25, AC-12 (plus UI surfacing of AC-11 / AC-27)

## Business Risks

- **Auth gold-plating** — expanding into full RBAC, SSO/multi-IdP, account provisioning, or production session hardening; capped at Google sign-in, NULogic-domain restriction, and role layered on identity.
- **OAuth not wired by demo time** — mitigated by retaining the role view-switcher as a fallback so role journeys still demo.
- **Real PII leaking through the auth path** — mitigated by discarding the real email after the domain check and persisting only the synthetic handle.
- **Polishing dashboards at the expense of the loop** — capped at "Claude summary"; freeze features ~Day 6–7 and polish only the loop demo.

## Success Criteria

- A non-NULogic account is rejected with no session; an expired session redirects with no stale write; no real PII is persisted.
- Role scoping holds (Practice Lead sees only their team; Employee cannot access the matcher); Admin can re-scope a user by assigning a role; a non-Admin is denied.
- The three demo scenarios run cleanly end to end on the branded UI; typecheck and lint are clean.

## Cross-Epic Dependencies

- **Blocked by** EPIC-1 (foundation/seed/data, the matcher dataset it scopes) and EPIC-2 (profile + plan/compliance state the progress view and screens surface).
- **Blocks** nothing — this is the final delivery surface and freeze gate.
