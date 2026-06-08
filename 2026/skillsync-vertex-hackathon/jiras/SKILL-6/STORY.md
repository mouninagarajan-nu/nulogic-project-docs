# SKILL-6 — Auth, Roles, Progress Summary & NULogic UI

## Metadata

| Field | Value |
|---|---|
| **Story ID** | SKILL-6 |
| **Epic** | EPIC-3 — Authentication, Roles & NULogic UI |
| **Roadmap Phase** | Phase 7 (Auth & Roles) + Phase 8 (UI & Polish) |
| **Story Points** | 8 |
| **T-shirt** | XL |
| **Estimated LOC** | ~520 |
| **Impact** | HIGH (new auth infrastructure; security boundary; no-PII identity mapping; final demo surface + freeze gate) |
| **Priority** | High |
| **Component** | Auth & Identity service (Auth.js + `proxy.ts`), Role scoping, Role Admin, Progress/Summary (Claude), NULogic-branded UI + view-switcher |
| **Target Repository** | ai-nu-skillsync |
| **Gaps Closed** | TD-AUTH-01, TD-AUTH-02, TD-AUTH-03, TD-AUTH-04, TD-ROLE-01, TD-ADMIN-01, TD-PROG-01, TD-UI-01, TD-UI-02, TD-UI-03 |
| **Owner** | -- |
| **Status** | Backlog |

## User Story

**As a** NULogic Employee, Practice Lead, Manager/HR, and Admin,
**I want** to sign in with my NULogic Google account, see only the data my role permits, have an Admin assign roles, read a Claude-summarized progress view for my team, and use a clean NULogic-branded interface,
**so that** access is gated to NULogic with no real PII stored, each role sees the right data, and the hero loop can be demoed credibly end-to-end.

> Business persona: Employee / Practice Lead / Manager-HR / Admin (no engineering persona). This is the final delivery surface and the feature-freeze gate.

## Business Context

**Problem.** The MVP must gate access to NULogic employees and present role-appropriate views without ever storing real personal data. Without auth the app can't restrict access or scope by role; without role scoping a Practice Lead would see the whole org and an Employee could run staffing searches. Without a clean, branded interface the hero loop can't be demoed credibly.

**Value.** Real Google sign-in restricted to `nulogic.io`, with the authenticated identity mapped deterministically to a **synthetic** profile by an opaque handle (the real email used only for the hosted-domain check, then discarded), gates the app while honoring the non-negotiable no-PII rule. Role scoping (PL = team; Employee blocked from the matcher), a minimal Admin role-assignment action, and a Claude-summarized role-scoped progress view give each role the right surface. The minimal NULogic-branded screens plus a retained role view-switcher tie the loop together and de-risk the demo if OAuth isn't wired by demo time.

## Business Rules

| BR | Description |
|---|---|
| BR-03 | Role hierarchy + data scope (Admin > Manager/HR > Practice Lead > Employee); PL = team; Employee blocked from the matcher. |
| BR-13 | Auth is real Google OAuth restricted to NULogic accounts; non-NULogic rejected with no session. |
| BR-13a | Deterministic OAuth-identity → synthetic-profile mapping keyed by a synthetic handle (never real email/PII); real email discarded after the hd check. |
| BR-20 | Session expiry / re-auth: expired session redirects to sign-in; no protected data served; no stale-identity write. |
| BR-21 | Admin may assign/override a user's role (the only in-scope Admin capability); the action is itself authorization-gated. |
| BR-09 | Progress summarization is a Claude call, Zod-validated before use. |
| BR-10 | Synthetic data only; no real PII anywhere; OAuth secrets from env, never committed. |
| BR-12 | Token-efficient Claude usage (Sonnet for the progress summary; scoped cohort). |
| BR-22 | Endorsed catalog flag is surfaced in the branded catalog + recommendation screens (UI surfacing). |

## AC Mapping

| AC | Description |
|---|---|
| AC-14 | Google sign-in restricted to NULogic accounts; deterministic synthetic-handle → same profile/role; no real PII persisted. |
| AC-15 | Non-NULogic / unauthorized account rejected — no session, spec'd message. |
| AC-24 | Expired session redirects to sign-in; no protected data served; no stale-identity write; graceful re-auth. |
| AC-11 | Role-based data scoping — PL sees own team; Manager/HR/Admin see org; Employee blocked from the matcher. |
| AC-25 | Admin assigns/overrides a user's role; non-Admin denied; broader config out of scope. |
| AC-12 | Role-scoped team progress / compliance summary via Claude; PL with no team sees the empty state. |
| AC-27 | UI surfacing of the manager endorsed flag in catalog + recommendation views (logic in SKILL-4). |

## Technical Architecture

- **Auth (Page 02 §4.7 / ADR-001):** Auth.js (NextAuth) Google OIDC provider mounted as a Route Handler at `/api/auth/[...]`. The sign-in callback enforces the `hd == nulogic.io` hosted-domain check; non-matching ⇒ no session + spec'd message (AC-15). On success, resolve the identity via the seeded `IdentityMapping` table (synthetic handle derived from the OIDC `sub`) → synthetic `Employee` profile + role; the **real email/name is discarded** after the hd check (AC-14/BR-13a; Page 03 §5 no-PII flow). OAuth secrets from env (`.env.example` placeholders only).
- **Session gate (Page 02 §3.3 / ADR-006):** `proxy.ts` (Next.js 16 renamed middleware) matches protected paths (excluding `/api/auth`, static, sign-in); an expired/invalid session ⇒ redirect to sign-in, never serve protected data; awaited `cookies()`/`headers()`; no stale-identity write (AC-24/BR-20). No token-refresh/remember-me (scope cap).
- **Role scoping (Page 02 §5 / BR-03):** every action/read re-derives the session + role server-side (never trusts a client-sent role). PL reads scoped to `leadId == self`; Employee denied at `POST /api/match` (AC-11). The SKILL-3 dataset builder already consumes this scope; SKILL-6 fully enforces PL team membership + the Employee block.
- **Role admin (Page 02 §3.1 / BR-21):** `assignRole({userId, role})` Server Action, Admin-only; re-scopes the target's access (BR-03); non-Admin denied (AC-25). The only Admin management capability.
- **Progress summary (Page 02 §4 / §2.4):** Progress/Summary service builds a role-scoped cohort → `summarize-progress` (Sonnet) → `ProgressSummary` (Zod): on-track / behind / thin-coverage. PL with no team ⇒ "No team members assigned yet." (AC-12).
- **UI + branding (Page 04 Phase 8):** all product screens (sign-in, profile, tracker, resume upload, matcher, approval queue, progress, admin, catalog) via shadcn/ui (style `radix-lyra`, Tailwind v4 CSS-based config) with NULogic branding replacing scaffold copy; a **role view-switcher retained as a demo/testing aid** (fallback if OAuth isn't wired). Feature freeze ~Day 6–7, then polish the loop demo only.
- **NFRs:** no real PII persisted/logged (Privacy/Security); secrets from env; graceful session expiry (Resilience); Claude summary Zod-gated; demo-ready branded UI.

## Architecture References

- **Service design (Page 02):** auth + identity-mapping flow (§4.7); `/api/auth/[...]` Route Handler (§3.2); `proxy.ts` session gate (§3.3); `assignRole` Server Action (§3.1); authorization re-derivation (§5); prompt `summarize-progress` (Sonnet, §2.4); schema `ProgressSummary` (§2.5); model routing (§2.2).
- **Data model (Page 03):** `IdentityMapping` (`syntheticHandle @unique`, §4.7); the no-PII-by-design flow (§5); `Employee.role` + `leadId` self-relation for scoping (§4.1); seeded mapping for deterministic AC-14 (§6).
- **ADRs (Page 05):** ADR-001 (Auth.js Google + `hd` restriction + identity mapping), ADR-005 (synthetic-handle identity; discard real email; PII review gate), ADR-006 (single Next.js 16 app; `proxy.ts`; async `cookies()`/`headers()`; read-only `/api/match` the Employee block applies to), ADR-002 (data store seeding the mapping).
- **Roadmap:** Phase 7 deliverables + exit criteria + Phase 8 deliverables + freeze gate (Page 04 §2); risk register "OAuth not wired at demo" (view-switcher fallback), "Real PII leak", "Next16 API drift".
- **Pseudocode functions:** identity resolution `resolve(syntheticHandle(sub))` (Page 02 §4.7), `callClaude<T>` (§2.1).

## Acceptance Criteria (Gherkin)

### Scenario A — Google sign-in restricted to NULogic, deterministic mapping (AC-14, S-12)
```gherkin
GIVEN an unauthenticated visitor with a valid nulogic.io Google account for which a seeded IdentityMapping entry exists
WHEN they sign in via Google OAuth
THEN the hd==nulogic.io check passes and the identity resolves via the seeded mapping (keyed by a synthetic handle, NOT the real email) to the SAME synthetic Employee profile + role every time
AND they land on their role-appropriate home
AND no real user PII is persisted (the real email is used only for the hd check and discarded).
```

### Scenario B — Non-NULogic account rejected (AC-15, S-13)
```gherkin
GIVEN a visitor signing in with a non-nulogic.io Google account (or an account with no mapped profile)
WHEN they complete the Google OAuth flow
THEN no session is created
AND they see "Sign-in is restricted to NULogic accounts. Please use your @nulogic.io Google account."
```

### Scenario C — Expired session redirects, no stale write (AC-24, S-24)
```gherkin
GIVEN an authenticated user whose session has expired while a protected page/action is open
WHEN they issue a request to a protected route or submit an action
THEN proxy.ts serves no protected data and redirects to the Google sign-in flow
AND in-flight unsaved work is not written under the stale identity
AND on re-auth the user returns to a sensible place.
```

### Scenario D — Role-based data scoping (AC-11, S-25)
```gherkin
GIVEN a session resolved to a Practice Lead role (or via the view-switcher demo aid)
WHEN the Practice Lead opens profiles and the progress view
THEN only their team's (leadId==self) profiles and progress are shown
AND Manager/HR and Admin see the whole org
AND an Employee cannot access the Staffing Matcher (POST /api/match denied).
```

### Scenario E — Admin assigns a role, non-Admin denied (AC-25, S-28)
```gherkin
GIVEN an authenticated Admin and a target synthetic user, plus a non-Admin user
WHEN the Admin assigns/overrides the target user's role via assignRole
THEN the target's role is updated and their data access re-scopes per AC-11/BR-03
AND a non-Admin attempting the same action is denied
AND broader platform configuration is not available (out of scope).
```

### Scenario F — Team progress summary via Claude, empty state (AC-12, S-29)
```gherkin
GIVEN a Manager or Practice Lead opens the progress view
WHEN the view loads
THEN summarize-progress (Claude, Sonnet) returns a Zod-validated ProgressSummary of who is on track / behind / thin on coverage, scoped to the viewer's permission
AND a Practice Lead with no assigned team members sees "No team members assigned yet."
```

## Dependencies

- **blocks:** none (final delivery surface + freeze gate).
- **blocked_by:** SKILL-1 (seeded `IdentityMapping`, data store, Claude wrapper, `summarize-progress` schema), SKILL-5 (profile + skill/plan/compliance state the progress view and screens surface; the role scoping the profile/approval views rely on). UI surfacing of the endorsed flag depends on SKILL-4's catalog logic.

## Sub-Tasks

- **SUB-TASK-1** — Auth.js Google OIDC + `hd` check + deterministic synthetic-handle → profile mapping + `proxy.ts` session gate + expiry redirect (AC-14/15/24).
- **SUB-TASK-2** — Role scoping (PL=team, Employee blocked from matcher) + `assignRole` Admin action + `summarize-progress` Claude summary (AC-11/25/12).
- **SUB-TASK-3** — NULogic-branded screens (shadcn/ui) for all flows + role view-switcher demo aid + auth/role/progress tests + freeze/polish.

## UX/Design

Status: This story delivers the UI. Screens: sign-in (Google button, NULogic branding, restricted-access message); role-appropriate home; profile (baseline vs verified, availability); tracker + resume upload; matcher (query, loading, ranked shortlist, hard-match, shortfall, retry, Employee-denied); approval queue; progress summary (on-track/behind/thin + empty state); admin role-assignment; catalog (de-dupe/merged indicator, `enrichmentPending` badge, endorsed badge); a persistent **role view-switcher** as a demo/testing aid. shadcn/ui style `radix-lyra`, `lucide` icons, Tailwind v4 CSS-based config in `app/globals.css`. NULogic branding throughout. (Figma: none provided — `UX: Pending` for final visual designs.)

## Definition of Done

- Auth.js Google sign-in restricted to `nulogic.io`; non-NULogic rejected with no session + spec'd message; identity resolves deterministically via the seeded synthetic-handle mapping to the same profile/role; no real PII persisted (AC-14/15).
- `proxy.ts` redirects expired sessions to sign-in with no protected data served and no stale write (AC-24).
- Role scoping enforced (PL=team; Employee blocked from `/api/match`); `assignRole` is Admin-only, non-Admin denied (AC-11/25).
- `summarize-progress` returns a Zod-validated role-scoped summary with the PL empty state (AC-12).
- All product screens exist with NULogic branding; view-switcher retained; the three demo scenarios run end-to-end on the branded UI.
- Auth/role/progress tests green; evidence shown. Typecheck + lint clean. Feature freeze observed.

## Risks & Assumptions

- **Risk:** OAuth not wired by demo time blocks sign-in. **Mitigation:** retain the role view-switcher fallback so role journeys still demo (ADR-001/Page 04).
- **Risk:** real PII leaks through the auth path. **Mitigation:** discard the real email after the hd check; persist only the synthetic handle; PII review gate (BR-13a/ADR-005/Page 03 §5).
- **Risk:** auth gold-plating (full RBAC, multi-IdP, session hardening). **Mitigation:** cap at Google + `hd` + role-on-identity + minimal session handling (scope-boundary).
- **Risk:** polishing dashboards at the expense of the loop. **Mitigation:** cap the progress view at a Claude summary; freeze ~Day 6–7 and polish only the loop demo.
- **Risk:** Next.js 16 API drift (`middleware`→`proxy.ts`, async dynamic APIs). **Mitigation:** prescribe from `node_modules/next/dist/docs/` (ADR-006/P9).
- **Assumption:** SKILL-5 has delivered the profile/plan/compliance state the progress view and screens surface; SKILL-4's catalog logic exists for the endorsed-flag surfacing.

## Progress Log

| Timestamp | Actor | Note |
|---|---|---|
| 2026-06-05T00:00:00Z | nulogic-jira-creator | Story created from PRD + target-state architecture (Phase 7 auth/roles + Phase 8 UI). Local-only run. |
