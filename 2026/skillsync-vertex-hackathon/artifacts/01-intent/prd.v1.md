# PRD — SkillSync (Team Vertex, NULogic AI Hackathon 2026)

**Initiative:** `skillsync-vertex-hackathon`
**Stage:** 01-intent · **Version:** v1 · **Mode:** CREATE
**Source one-pager:** `C:/Users/mouni.nagarajan/workspace/nulogic/ai-nu-skillsync/docs/SPEC.md`
**Status:** Draft (pending user review by orchestrator)

> **Branding:** NULogic. **Data:** Synthetic only — never real names, emails, or PII.

> **⚠️ REVISION — v1 (iteration 3, 2026-06-05): reviewer findings PRD-R2-001..003 resolved.** (1) BR-11 (upskilling plan must contain ≥2–3 items incl. ≥1 AI-enabled) now has a validating AC (AC-26) the §8 compliance metric depends on. (2) The plan-validation user flow + error path is documented in UC-1 (non-conforming plan rejected with a specific message; remove/swap-item flow) and mirrored in the §10 error-handling table. (3) The optional manager "endorsed" catalog flag is specified (set/unset by managers only; endorsed items surfaced) and tested via AC-27 + BR-22.

> **⚠️ REVISION — v1 (iteration 2, 2026-06-05): reviewer findings PRD-R1-001..007 resolved.** (1) Skill identity/trust-state model made precise — one canonical record per profile, state PROMOTES in place (never duplicates); hero loop compares the same promoted record (§4, UC-3, BR-18, AC-22). (2) Deterministic OAuth→synthetic-profile mapping keyed by a synthetic handle (UC-6, BR-13a, AC-14). (3) Session expiry / re-auth mid-flow added (UC-6b, BR-20, AC-24). (4) Idempotent/de-duped cert & resume uploads (BR-19, AC-23). (5) Minimal Admin role management in-scope (UC-10, BR-21, AC-25; broader config deferred). (6) Partial-quantity staffing fulfillment (AC-21). (7) Resume-parse success metric added to §8.

> **⚠️ UPDATE — v1 (post-gate, 2026-06-05): New MVP requirements added.** The approved product owner introduced five requirements at the approval gate: (1) **real Google OAuth sign-in/sign-up restricted to NULogic accounts**, (2) **baseline current-skill capture per employee**, (3) **employee self-service skill management**, (4) **manager approval workflow for self-reported skills**, and (5) **resume upload + Claude extraction**. These are integrated below.
> **AUTHENTICATION OVERRIDE NOTICE:** The new Google OAuth requirement **supersedes** the fake-auth-only stance in `SPEC.md §2 (non-goals)` and `§8`, and the `CLAUDE.md` domain note *"fake auth with a role/view switcher — do not build real auth."* The MVP now ships **real authentication** (Google OAuth, hosted-domain restricted to `nulogic.io`). The role hierarchy (Admin > Manager/HR > Practice Lead > Employee) still layers **on top of** the authenticated identity, and a role view-switcher MAY be retained purely as a demo/testing aid. **No real user PII is committed:** authenticated identities map to synthetic profiles; only synthetic data lives in the repo/DB/fixtures.

---

## 1. Problem Statement

NULogic is a ~150-person services company with many concurrent client engagements. Two operational processes are painfully manual and disconnected today:

1. **Staffing** — Managers/HR pick people for projects from memory and stale resumes. There is no fast, reliable way to ask "who has skill X *and* is available within two weeks?" Bad or slow staffing decisions cost billable time and client confidence.
2. **Upskilling** — Every employee must complete 2–3 certs/courses per year, but this is tracked in spreadsheets with **no proof** and no link to actual skill records. Skill data goes stale the moment it's entered.

**Who is affected:** every employee (upskilling), every Manager/HR/Practice Lead (staffing + compliance visibility).

**Business cost of inaction:** time-to-staff stays in *days* instead of *minutes*; skill data is untrustworthy; the two processes never inform each other, so identified skill gaps never drive learning, and completed learning never sharpens staffing.

**Core insight (the product bet):** one **living employee skill profile** feeding two modules — an **Upskilling Tracker** and a **Staffing Matcher** — connected by a **loop** where a staffing gap drives a learning recommendation, a completed certificate updates the profile as *verified*, and the next staffing search visibly improves.

---

## 2. User Personas & Use Cases

> Personas are **synthetic role archetypes** for this hackathon MVP — no real individuals.

| Persona | Role | Key Action | Frequency | Current Pain |
|---|---|---|---|---|
| **Employee** ("Practitioner") | Employee (everyone) | Sign in with NULogic Google account; upload resume to pre-populate profile; maintain own baseline/current skills (self-reported); pick 2–3 catalog items (incl. ≥1 AI-enabled), mark progress, upload certificate | Few times/year; progress updates monthly | Spreadsheet tracking, no proof, skills never reflected in staffing |
| **Manager / HR** | Org-wide staffing & compliance | Sign in with NULogic Google account; plain-English search by skill + availability; review ranked shortlist + gaps; **review & approve employee self-reported skills**; view org progress | Weekly (staffing); monthly (compliance) | Staffs from memory/old resumes; can't query "skilled AND available" quickly; no trustworthy way to vet self-reported skills |
| **Practice Lead** | Owns one team/practice; also an Employee | See their team's profiles & progress; staff from their team; act as Employee for own upskilling | Weekly | No single view of team skill coverage or who is behind on upskilling |
| **Admin** | Platform owner | Everything above + **assign/override a user's role** (minimal in-scope role management; broader config deferred to roadmap) | Rare | N/A (demo-only role) |

**Primary use cases:**
- **UC-1 Upskill with proof:** Employee chooses catalog items, uploads a certificate, Claude extracts skills, profile updates as *verified*.
- **UC-2 Find available talent:** Manager/HR searches in plain English; Claude returns an availability-aware ranked shortlist with rationale and gaps.
- **UC-3 Close the loop (hero):** A staffing search surfaces a gap → Claude recommends a catalog item → employee completes & uploads cert → profile updates → re-run search improves the ranking.
- **UC-4 Team progress / compliance:** Manager/Practice Lead views a Claude-summarized progress view (on track / behind / thin coverage).
- **UC-5 Catalog intelligence:** Anyone adds a catalog item by name; Claude de-dupes, tags, and enriches it; Claude recommends items per employee.
- **UC-6 Sign in (real auth):** A NULogic employee signs in/up with Google; non-NULogic accounts are rejected; on success the session maps to a (synthetic) employee profile and role.
- **UC-7 Baseline & self-service skills:** Employee captures/edits the skills they already have (baseline/current, `source=self-reported`), plus current project and allocation/availability.
- **UC-8 Manager approval of skills:** Manager/HR reviews an employee's self-reported skills and approves (or leaves pending); approval is a distinct state from cert-verified.
- **UC-9 Resume upload + extraction:** Employee uploads a resume (PDF/doc/image); Claude parses it to structured JSON (Zod-validated) and pre-populates the profile (current project, baseline skills) feeding matching; parse failure degrades gracefully.
- **UC-10 Admin role assignment (NEW):** Admin assigns or overrides a (synthetic) user's role within the hierarchy; their data access re-scopes accordingly. Broader platform config is out of scope for the MVP.

---

## 3. User Journeys

### UC-1 — Upskill with proof (Employee)
- **Entry:** Employee opens the Upskilling Tracker (role switcher set to "Employee").
- **Actions:** Browse catalog → select items → **finalize the yearly plan** (validated, see below) → mark an item *in-progress* → upload a certificate (PDF/image).
- **Plan-validation flow (the BR-11 rule):** A finalized plan must contain **≥2–3 catalog items, of which at least one is AI-enabled** (AI-enabled comes from the catalog item's Claude-assigned tag, BR-07).
  - **Finalize a conforming plan** (≥2 items incl. ≥1 AI-enabled) → plan is accepted, marked complete, and **counts toward the §8 upskilling-compliance metric**.
  - **Finalize a non-conforming plan** → **rejected, not marked complete**, and the employee sees a **specific** message identifying the failed rule — *"Pick at least 2 items for your plan."* (too few) or *"Your plan needs at least one AI-enabled item."* (no AI-enabled item).
  - **Remove / swap an item:** before (or after a rejected) finalize, the employee can **remove an item or swap one for another** catalog item, then re-attempt finalize; the same validation re-runs. (See BR-11, AC-26 and the §10 error-handling row.)
- **Claude step:** Certificate is sent to the Claude API → returns structured JSON `{skill, issuer, date, level, confidence}` → validated with Zod.
- **Confirmation:** Extracted skill shown for the employee to confirm; on accept, item moves to *done* and the skill is added to the profile as `verified=true, source=certificate`.
- **Result:** Profile now carries a verified skill that staffing can use.
- **Error path (what the user SEES):** If parsing fails or confidence is low, show: *"We couldn't reliably read this certificate. Check it's a clear PDF or image and try again, or add the skill manually."* The item stays *in-progress*; no unverified skill is written from a failed parse. (Plan non-conformance error path is covered in the plan-validation flow above.)
- **Empty state (first time):** "You haven't picked any learning yet. Choose 2–3 items for the year (at least one AI-enabled) to get started." Show Claude-recommended items.

### UC-2 — Find available talent (Manager / HR)
- **Entry:** Manager opens the Staffing Matcher (role switcher set to "Manager/HR").
- **Actions:** Type a plain-English request, e.g. *"2 mid-level React + Node devs, free now or within 2 weeks, IST overlap."*
- **Claude step:** Profile dataset + query → Claude returns a ranked shortlist (match %, matched skills, gaps, availability, one-line rationale per person), validated with Zod.
- **Confirmation/Result:** Ranked shortlist rendered with per-person rationale and gap/ramp-up notes (e.g. *"Candidate is 88% there; ~1 week of AWS ramp-up"*).
- **Error path:** If Claude is unreachable or returns invalid JSON, show: *"Search is temporarily unavailable — please retry."* No partial/garbled ranking is shown.
- **Empty state:** If no candidate meets the bar, show the closest people with explicit gap analysis rather than an empty list (this is the "hard match" demo scenario).

### UC-3 — Close the loop (hero capability)
- **Entry:** From a UC-2 result where a gap was surfaced.
- **Actions:** Claude recommends a catalog item addressing the gap → employee completes it and uploads the certificate (UC-1 flow) → the **same canonical skill record is promoted to *verified*** (per BR-18; if the skill was previously self-reported or manager-approved it is promoted in place, not duplicated).
- **Result:** Re-running the **same** UC-2 search visibly moves that person up the ranking / raises match %, driven by the **promoted trust state (raised weight) of that one skill record** — the before/after comparison is of the same record, never a duplicate.
- **Error path:** Same as UC-1/UC-2.
- **Protection note:** This loop is the single most important demo path. Every dependency in it (cert parse → single-record promotion → re-match) must degrade gracefully, never crash the demo. Uploads are idempotent (BR-19) so a double-submit cannot create a duplicate skill and muddy the comparison.

### UC-4 — Team progress / compliance (Manager / Practice Lead)
- **Entry:** Open the progress view. Practice Lead sees only their team; Manager/HR/Admin sees the whole org.
- **Claude step:** Claude summarizes who's on track, who's behind, and where skill coverage is thin.
- **Empty state:** Practice Lead with no team members assigned sees "No team members assigned yet."

### UC-5 — Catalog intelligence (anyone)
- **Entry:** "Add catalog item" by name only.
- **Claude step:** Claude de-dupes/normalizes against existing items, auto-tags (skill area, level, role relevance, AI-enabled?), and enriches (description, typical duration, provider, prerequisites).
- **Manager "endorsed" flag (manager-only):** A Manager/HR (or Admin) may **set or unset** an optional `endorsed` flag on a catalog item; **a non-manager (Employee / Practice Lead outside authority) cannot.** Endorsed items are **visibly indicated / surfaced** in the catalog and recommendation views (org-preferred learning). Only the single flag is in scope — **no endorsement workflow** (review chains, notifications). See BR-22, AC-27.
- **Result:** A normalized, enriched catalog item; duplicates are merged into the canonical entry; managers may endorse items.
- **Error path:** If enrichment fails, item is saved with name + a flag that enrichment is pending; never blocks adding. A non-manager's attempt to toggle "endorsed" is unavailable/denied.

### UC-6 — Sign in / sign up with Google (real auth) — *NEW*
- **Entry:** Unauthenticated visitor lands on the app and sees a "Sign in with Google" action.
- **Actions:** User authenticates via Google OAuth. The flow is **restricted to NULogic accounts** (hosted-domain / `nulogic.io` Google Workspace).
- **Confirmation/Result:** On success, the identity is resolved via a **stable, seeded mapping keyed by a synthetic handle** (not the real email/PII) to the **same** synthetic employee profile + role every time (deterministic — see BR-13a); the user lands on their role-appropriate home (Employee tracker / Manager matcher). The real email is used only transiently for the hosted-domain check and is never stored.
- **Error path (what the user SEES):** A non-NULogic / unauthorized account (wrong hosted domain, or no mapped profile) is rejected with *"Sign-in is restricted to NULogic accounts. Please use your @nulogic.io Google account."* No session is created.
- **Session expiry / re-auth:** If a session expires mid-flow, a request to a protected route redirects the user back to Google sign-in; in-flight unsaved work is handled gracefully (not silently written under a stale identity; on re-auth the user returns to a sensible place). See UC-6b and BR-20.
- **Empty state:** First sign-in with no mapped profile → in the demo, the account is matched to a synthetic profile (or shown the same restricted-access message); real user PII is never persisted.
- **Note:** A role view-switcher MAY remain as a demo/testing aid layered on the authenticated session, but it does not replace auth.

### UC-6b — Session expiry / re-authentication (any authenticated user) — *NEW (iteration 2)*
- **Entry:** An authenticated user's session expires or becomes invalid while a protected page/action is open (possibly with unsaved input).
- **Actions:** The user issues a request to a protected route or submits an action.
- **Result / Error path (what the user SEES):** No protected data or action is served on the expired session; the user is **redirected to the Google sign-in flow** rather than seeing an opaque error. **In-flight unsaved work is handled gracefully** — it is not written under a stale identity, and on successful re-auth the user is returned to a sensible place.
- **Note:** Minimal demo scope (BR-20) — no token-refresh / remember-me machinery; just graceful redirect and no garbage write under a stale session.

### UC-7 — Baseline & self-service skill management (Employee) — *NEW*
- **Entry:** Employee opens their profile.
- **Actions:** View **baseline/current skills** (the skills they already had before any upskilling), current project, and allocation/availability. Add or update skills (e.g. "TypeScript — intermediate"); these are written `source=self-reported, state=self-reported` (NOT verified, NOT yet approved).
- **Result:** Profile reflects current capability immediately and feeds staffing matches (with the self-reported caveat carried through).
- **Error path:** Invalid/blank skill entry is rejected inline; no garbage written.
- **Empty state:** "No skills on your profile yet — add the skills you already have, or upload your resume to pre-populate them."

### UC-8 — Manager approval of self-reported skills (Manager/HR) — *NEW*
- **Entry:** Manager/HR opens an approval/review view for their scoped employees.
- **Actions:** Review each employee's `self-reported` skills and **approve** them (or leave pending). Approval transitions the skill state `self-reported → manager-approved`.
- **Result:** Approved skills are weighted more confidently in matching than unapproved self-reported ones; cert-derived skills remain the highest-trust `verified` state.
- **Error path:** A user without approval authority (Employee, or a Practice Lead acting outside their team) cannot approve; the action is unavailable/denied.
- **Empty state:** "No skills pending approval for your team."

### UC-9 — Resume upload + Claude extraction (Employee) — *NEW*
- **Entry:** Employee opens their profile and chooses "Upload resume."
- **Actions:** Upload a resume file (PDF/doc/image).
- **Claude step:** The resume is sent to the Claude API → returns structured JSON (e.g. `{currentProject, allocation, baselineSkills[], …}`) → **Zod-validated**, same discipline as certificate parsing. **No regex/keyword extraction.**
- **Confirmation:** Extracted details are shown for the employee to review/confirm before they pre-populate the profile; confirmed baseline skills are written `source=self-reported` (resume is self-attested, not third-party-verified like a cert).
- **Result:** Profile is pre-populated (current project, baseline skills, availability hints), reducing manual entry and feeding the matcher.
- **Error path (what the user SEES):** If parsing fails or returns invalid JSON, **nothing is written** ("never write garbage") and the user sees *"We couldn't reliably read this resume. Try a clearer file, or add your details manually."*
- **Idempotency:** Submitting the same resume twice (double-click/retry) converges to a single pre-population — no duplicate baseline skills (BR-19). Likewise for cert upload in UC-1.
- **Empty state:** N/A (entered from an existing profile).

### UC-10 — Admin assigns / overrides a user's role (Admin) — *NEW (iteration 2)*
- **Entry:** Admin opens a minimal role-management view.
- **Actions:** Select a (synthetic) user and assign/override their role in the hierarchy (Admin > Manager/HR > Practice Lead > Employee).
- **Result:** The target user's role updates and their data access re-scopes accordingly (per UC-4 / role scoping).
- **Error path:** A non-Admin attempting the action is denied; broader platform configuration is unavailable (out of scope — see scope-boundary).
- **Note:** Operates on synthetic profiles only; no real PII. Role assignment is the ONLY Admin management capability in the MVP (BR-21).

---

## 4. Proposed Solution (high-level)

A single Next.js application presenting two role-aware modules over one shared **Employee Skill Profile** data store, with **all intelligence delegated to the Claude API**:

- **Real authentication (Google OAuth, NULogic-restricted)** gates the app; the role hierarchy layers on top of the authenticated identity. *(NEW — supersedes the SPEC/CLAUDE.md fake-auth-only stance; see override notice at top.)*
- **Living Employee Skill Profile** capturing **baseline/current skills** (pre-upskilling), current project, and allocation/availability, distinct from upskilling-acquired (cert-verified) skills. *(NEW)*
- **Employee self-service skill management** (add/update own skills, `source=self-reported`) and a **manager approval workflow** that promotes self-reported skills to `manager-approved`. *(NEW)*
- **Resume upload + Claude extraction** to pre-populate the profile (current project, baseline skills), Zod-validated, degrading gracefully on failure. *(NEW)*
- **Upskilling Tracker** for employees: catalog selection, progress tracking, certificate upload, and Claude-driven certificate parsing that writes *verified* skills.
- **Staffing Matcher** for managers/HR/practice-leads: plain-English, availability-aware search returning a Claude-ranked shortlist with rationale and gap analysis, plus a Claude-summarized team progress view.
- **Shared Catalog** with Claude-driven de-dupe, tagging, enrichment, and per-employee recommendations.
- **The loop** stitches these together as the hero demo.

**Guardrails baked into the solution intent:**
- **All "intelligence" goes through the Claude API.** Certificate parsing, **resume parsing**, matching/ranking, availability reasoning, catalog de-dupe/tag/enrich/recommend, and progress summarization are Claude calls returning **structured JSON validated before use**. No hardcoded logic, keyword matching, or regex may substitute for these.
- **Real auth, real identity / synthetic data.** Authentication is real (Google OAuth restricted to NULogic accounts) and the role hierarchy (Admin > Manager/HR > Practice Lead > Employee) layers on top, with role-based data scoping. A role view-switcher MAY remain as a demo/testing aid. **Authenticated identities map to synthetic profiles** — no real user PII is stored or committed.
- **Three-tier skill trust model with single identity:** each skill has **ONE canonical record per profile** carrying a single trust-state field that only **promotes** along `self-reported` (employee/resume) → `manager-approved` (manager vetted) → `verified` (cert-derived, highest trust) — **never duplicating the skill row**. Re-acquiring/approving/verifying an existing skill promotes the same record (e.g. parsing a cert for a skill already self-reported promotes that record to `verified`). Matching may weight by trust tier. *(See BR-18.)*
- **Synthetic data only**, ~20–25 profiles; no real PII ever stored or committed (including for authenticated real Google users — only synthetic profile data is persisted).

*(Architecture, model selection per call, data schema, and prompt design are Stage 3 / engineering decisions and intentionally not specified here.)*

---

## 5. Acceptance Criteria

See `acceptance-criteria.v1.json` for the full GIVEN-WHEN-THEN set with IDs, priorities, and test types. Summary of coverage: certificate parsing (happy/edge/error), availability-aware ranked matching (happy/hard-match/**partial-quantity**/error), the loop, catalog intelligence (de-dupe/tag/enrich/recommend), role-scoped access, team-progress summarization, the synthetic-data / Claude-only guardrails, and the **NEW** capabilities — Google sign-in (happy + non-NULogic rejection, **deterministic synthetic-handle mapping**), **session expiry / re-auth**, baseline current-skills on the profile, **one canonical skill identity with trust-state promotion**, employee self-service skill edits, manager skill-approval flow, resume upload + Claude extraction (happy + parse-failure), **idempotent cert/resume uploads**, **Admin role assignment**, **upskilling-plan validation** (≥2–3 items incl. ≥1 AI-enabled — happy/non-conforming/remove-swap), and the **manager "endorsed" catalog flag** (set/unset + surfacing, non-manager denied).

---

## 6. Scope

In-scope and out-of-scope are detailed with justification in `scope-boundary.v1.md`. In brief — **IN:** the two modules, the shared catalog, the loop, ~20–25 synthetic profiles, a minimal clean NULogic-branded UI, and the **NEW** items — **real Google OAuth (NULogic-restricted)**, baseline current-skill capture, employee self-service skill management, manager approval workflow, and resume upload + Claude extraction. *(Real authentication moved IN from Out-of-Scope — supersedes SPEC §2/§8 and CLAUDE.md fake-auth note.)* **OUT:** real HRMS/Jira integration, production dashboards/reporting, org-wide forecasting/heatmaps, build-vs-hire guidance.

---

## 7. Dependencies

| Dependency | Type | What if not ready? |
|---|---|---|
| Anthropic Claude API + `@anthropic-ai/sdk` and `ANTHROPIC_API_KEY` | External | No intelligence works (incl. resume parsing). Stub the call boundary with a `TODO`; never substitute fake logic. Hero loop blocked — top priority to unblock. |
| **Google OAuth provider + auth library (e.g. NextAuth/Auth.js-style), Google client ID/secret, hosted-domain restriction to `nulogic.io`** *(NEW)* | External | No real sign-in; app can't gate access or restrict to NULogic. Fallback for demo continuity: retain the role view-switcher so role-scoped journeys still demo. OAuth secrets read from env, never committed. |
| Synthetic profile dataset (~20–25) + synthetic certificates in `fixtures/certs/` **+ synthetic resumes in `fixtures/resumes/`** *(NEW)* | Internal | Cert parsing, resume parsing, and matching cannot be demoed. Must be generated first (build-order step 1). |
| Prisma + SQLite data store (`prisma/`, `dev.db` present) | Internal | Profile reads/writes fail; loop cannot persist verified skills, baseline skills, or approval states. |
| Next.js 16 App Router conventions (read `node_modules/next/dist/docs/`) | Internal | Risk of using outdated App Router patterns from memory. |
| Role hierarchy / data scoping layered on the authenticated identity | Internal | Role-scoped journeys (Practice Lead team scope, manager approval authority) can't be demoed. A role view-switcher MAY remain as a demo/testing aid. |
| UX / Figma designs | Team | **In progress — not provided at PRD time.** Not a blocker; UI is "minimal clean." Downstream agents inherit "UX designs in progress." |

---

## 8. Success Metrics

| Metric | Baseline | Target | Measured By |
|---|---|---|---|
| Time-to-staff (per request) | Days (manual, from memory) | Minutes (single Claude-ranked search) | Demo timing of UC-2 |
| Loop improvement (hero) | N/A | Re-run match shows a measurable rank/match-% increase after cert upload | UC-3 before/after comparison in demo |
| Certificate parse success on fixtures | No baseline (new) | ≥ majority of `fixtures/certs/` parse to valid, Zod-validated JSON | Cert-parsing test run |
| Resume parse success on fixtures *(NEW)* | No baseline (new) | ≥ majority of `fixtures/resumes/` parse to valid, Zod-validated JSON that pre-populates the profile | Resume-parsing test run |
| Upskilling compliance visibility | Spreadsheet, no proof | Live % vs. 2–3/year target shown in progress view | UC-4 progress view; conformance gated by the plan-validation rule (BR-11 / AC-26) |
| Skill-data freshness | Stale | Verified skills appear immediately after cert acceptance | UC-1 → profile inspection |

> Targets are demo/MVP-scoped. Org-wide adoption/quality metrics are roadmap (no production baseline exists yet).

---

## 9. Non-Functional Requirements

| Category | Requirement | Target | Measured By |
|---|---|---|---|
| Performance | Staffing search returns a ranked shortlist within demo-acceptable latency | Interactive (no multi-minute hangs); show a loading state | Manual demo timing |
| Reliability | Claude returns structured JSON; invalid output never corrupts the data store | 100% of model outputs Zod-validated before any write | Code review + tests |
| Security / Privacy | Synthetic data only; no real names, emails, or PII stored or committed — **including for authenticated real Google users (identities map to synthetic profiles)** | Zero real PII in repo, DB, or fixtures | Review of seed data & fixtures |
| Security (auth) *(NEW)* | Real sign-in via Google OAuth, restricted to NULogic accounts (hosted-domain `nulogic.io`); non-NULogic / unauthorized accounts rejected with no session | Only `@nulogic.io` Workspace accounts authenticate | Auth happy-path + rejection tests |
| Security | API key read from `ANTHROPIC_API_KEY`; OAuth client ID/secret read from env; never hardcoded or committed | No secrets in source | Review / `.env.example` only |
| Authorization *(NEW)* | Skill approval restricted to users with manager/HR authority over the employee; role-based data scoping enforced on the authenticated identity | Unauthorized roles cannot approve or view out-of-scope data | UC-8 authorization test |
| Resilience | Each Claude-backed flow degrades gracefully (clear user-facing error, no crash) | All flows (cert parse / resume parse / match / catalog / summary) handle failure | Error-path tests |
| Data integrity | A failed/low-confidence cert OR resume parse never writes a skill / garbage profile data | No write on parse failure | UC-1 / UC-9 error-path tests |
| Data integrity *(NEW)* | A skill has one canonical record per profile; trust state promotes in place (never duplicates the row); double-submit of a cert/resume upload is idempotent | No duplicate skill rows / promotions / pre-populations on re-assert or double-submit | UC-1/UC-3/UC-9 + AC-22/AC-23 tests |
| Auth resilience *(NEW)* | Expired/invalid session redirects to sign-in; in-flight unsaved work handled gracefully; no protected data served on a stale session | Graceful re-auth, no garbage write under stale identity | UC-6b / AC-24 test |
| Accessibility | Minimal clean UI usable on a laptop browser for the demo | Readable, keyboard-operable core flows | Manual check |
| Cost efficiency | Token-efficient design (prompt caching, Sonnet for routine / Opus for hard reasoning, cache profile dataset across queries) | Caching applied to repeated profile/system context | Code review |
| Observability | Claude call boundaries log enough to diagnose parse/match failures during the demo | Each Claude call logs request id + validation outcome | Code review |

---

## 10. Error Handling & Edge Cases

| Flow | Failure | Timeout | Invalid input | Unauthorized | User sees |
|---|---|---|---|---|---|
| Cert parse (UC-1) | Model error / low confidence | Long parse | Non-cert / unreadable file | Employee uploads to own profile only | "We couldn't reliably read this certificate… try again or add manually." Item stays in-progress. |
| Staffing search (UC-2) | API unreachable / invalid JSON | Slow response | Empty / nonsensical query | Employee role can't access matcher | "Search is temporarily unavailable — please retry." / for no-fit: closest people + gaps. |
| Plan selection (UC-1) *(NEW)* | — | — | Non-conforming plan: <2 items, OR 0 AI-enabled items | Employee edits own plan only | Finalize rejected, plan not marked complete; specific message — "Pick at least 2 items for your plan." or "Your plan needs at least one AI-enabled item." Employee can remove/swap an item and re-finalize. |
| Catalog add (UC-5) | Enrichment fails | Slow enrich | Blank name | Anyone may add; "endorsed" toggle is manager-only | Item saved with enrichment-pending flag; never blocks. A non-manager's "endorsed" toggle is unavailable/denied. |
| Progress summary (UC-4) | Summary call fails | Slow | No team members | Practice Lead limited to own team | "Couldn't generate the summary — retry." Empty: "No team members assigned yet." |
| Role scope | Practice Lead views other team | — | — | Role scoping on authenticated identity | Practice Lead sees only their team's profiles/progress. |
| Sign-in (UC-6) *(NEW)* | OAuth provider error | Slow redirect | Malformed callback | Non-NULogic / unauthorized account | "Sign-in is restricted to NULogic accounts. Please use your @nulogic.io Google account." No session created. |
| Session expiry (UC-6b) *(NEW)* | Expired/invalid session on protected route | — | — | Stale session not honored | Redirect to Google sign-in; in-flight unsaved work handled gracefully (no write under a stale identity); no protected data served. |
| Staffing partial quantity (UC-2) *(NEW)* | — | — | Fewer than requested count qualify | — | Returns the fewer-than-requested qualifiers with a clear shortfall note (e.g. "2 of 3 requested qualify"), not an empty result. |
| Duplicate upload (UC-1/UC-9) *(NEW)* | Double-submit / retry of same file | — | — | Own profile only | Idempotent — converges to a single result; no duplicate skill record / promotion / pre-population. |
| Admin role assignment (UC-10) *(NEW)* | Write fails | — | — | Non-Admin denied | Role assignment available only to Admin; broader config unavailable (out of scope). |
| Resume parse (UC-9) *(NEW)* | Model error / invalid JSON | Long parse | Non-resume / unreadable file | Employee uploads to own profile only | "We couldn't reliably read this resume. Try a clearer file, or add your details manually." Nothing written. |
| Skill approval (UC-8) *(NEW)* | Write fails | — | — | Non-manager / out-of-team approver denied | Approve action unavailable/denied for unauthorized users; "No skills pending approval" when empty. |
| Self-service skill (UC-7) *(NEW)* | Write fails | — | Blank / invalid skill | Employee edits own profile only | Inline validation rejects bad input; no garbage written. |

**Edge cases to honor:** duplicate catalog entries with differing names (Claude merges); ambiguous availability ("free in 2 weeks" vs "free now"); certificate with multiple skills; **plan-validation gate** — finalizing a plan with <2 items or 0 AI-enabled items is rejected with a specific message and the employee can remove/swap an item to reach conformance; a conforming plan counts toward the §8 compliance metric (BR-11, AC-26); **manager "endorsed" catalog flag** — managers set/unset, non-managers denied, endorsed items surfaced, flag only (no workflow) (BR-22, AC-27); AI-enabled requirement (plan must include ≥1 AI-enabled item); **skill trust states** — `self-reported` (employee/resume) vs `manager-approved` vs cert-`verified`, surfaced distinctly and weightable in matching; **one canonical skill identity per profile** — re-asserting/approving/verifying an existing skill PROMOTES the same record (never a duplicate row), incl. cert-verifying an already self-reported skill (BR-18); **baseline vs upskilling-acquired** skills distinguished on the profile; **resume extracting multiple/ambiguous skills** (Claude returns all; ambiguous fields don't break the write; user confirms before pre-populating); **authenticated-but-unmapped Google account** in the demo (mapped to a synthetic profile or shown restricted-access); **deterministic identity→synthetic-profile mapping** keyed by a synthetic handle, not real email/PII (BR-13a); **session expiry mid-flow** (redirect to sign-in, in-flight work handled gracefully); **double-submit of a cert/resume upload** (idempotent — one result, no duplicates); **partial-quantity staffing** (fewer than requested qualify → return them with a clear note); **Admin role assignment** is the only Admin management action (broader config out of scope).

---

## 11. Related Work

- **One-pager / spec:** `docs/SPEC.md` (source intent).
- **Project guidance:** `CLAUDE.md`, `AGENTS.md` (Next.js 16 breaking-change warning; read `node_modules/next/dist/docs/` before writing Next.js code).
- **Repository discovery:** `repository-discovery.v1.json` (single greenfield app repo `ai-nu-skillsync`).
- **Architecture principles / business context:** local stubs at `architecture-principles/README.md`, `business-context/README.md` (no constraints beyond defaults for this learning run).
- **Downstream:** acceptance-test creation and architecture design (Stage 2/3); Jira creation is **Stage 4 — not part of this PRD**.
