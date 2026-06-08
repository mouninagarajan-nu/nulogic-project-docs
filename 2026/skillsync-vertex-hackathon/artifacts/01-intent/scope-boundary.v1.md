# Scope Boundary — SkillSync

**Initiative:** `skillsync-vertex-hackathon` · **Version:** v1 · **Stage:** 01-intent
**Source:** `docs/SPEC.md` §8 (MVP vs later), §2 (non-goals)

> Guiding rule: **protect the hero loop above all** — prefer a working end-to-end demo over completeness.

> **⚠️ REVISION — v1 (iteration 2, 2026-06-05):** Reviewer findings PRD-R1-001..007 resolved. Scope-affecting decisions: **Admin role management is minimally IN-SCOPE** (assign/override a user's role only); broader Admin config is **explicitly deferred** (PRD-R1-005). Added to In-Scope: single-record skill-identity/promotion, deterministic synthetic-handle identity mapping, session-expiry/re-auth handling, and upload idempotency. Session-management hardening deferred.

> **⚠️ REVISION — v1 (iteration 3, 2026-06-05):** Reviewer findings PRD-R2-001..003 resolved. No new scope MOVED in/out. Clarifications: the **upskilling-plan validation gate** (≥2–3 items incl. ≥1 AI-enabled, BR-11) is an enforced In-Scope quality gate (now tested via AC-26); the **optional manager "endorsed" catalog flag** (already In-Scope) is reaffirmed as **flag-only** — managers set/unset + endorsed items surfaced (tested via AC-27/BR-22), while endorsement **workflows** remain a creep risk / OUT.

> **⚠️ UPDATE — v1 (post-gate, 2026-06-05):** Five new MVP requirements added at the approval gate. Most notably, **real authentication moves from Out-of-Scope to In-Scope.** **AUTH OVERRIDE NOTICE:** real Google OAuth (NULogic-restricted) **supersedes** `SPEC.md §2 (non-goals)`, `§8`, and the `CLAUDE.md` note *"fake auth with a role/view switcher — do not build real auth."* The role hierarchy still layers on the authenticated identity (role-based data scoping retained); a role view-switcher MAY remain only as a demo/testing aid.

---

## In Scope (MVP — hackathon)

### Features
- **One Employee Skill Profile** as the single shared record (identity, **baseline/current skills**, availability, current project + allocation, upskilling plan, org/role). *(baseline-skills capture is NEW)*
- **Real authentication — Google OAuth, NULogic-restricted** *(NEW — moved IN from Out-of-Scope; supersedes SPEC §2/§8 + CLAUDE.md fake-auth note):* sign-in/sign-up via Google, restricted to NULogic accounts (hosted-domain `nulogic.io`); non-NULogic / unauthorized accounts rejected; sessions map to synthetic profiles (no real PII persisted). Role hierarchy (Admin > Manager/HR > Practice Lead > Employee) layers on top with role-based data scoping.
- **Baseline & self-service skill management (employee)** *(NEW):* employee captures the skills they already have (baseline/current) and current project/allocation, and adds/updates own skills (`source=self-reported`).
- **Manager approval workflow** *(NEW):* manager/HR reviews and approves employee self-reported skills; `self-reported → manager-approved` is a distinct state from cert-`verified`. Skill identity is single-record: trust state PROMOTES on one canonical skill record per profile (never duplicates the row) — see BR-18.
- **Admin role assignment — minimal role management** *(NEW — iteration 2; PRD-R1-005):* Admin can **assign/override a user's role** in the hierarchy (re-scoping that user's data access). This is the ONLY Admin management capability in scope; broader platform configuration is explicitly OUT (see below). Operates on synthetic profiles only.
- **Session expiry / re-auth handling** *(NEW — iteration 2):* an expired/invalid session redirects to Google sign-in; in-flight unsaved work is handled gracefully; no protected data served on a stale session. Minimal demo scope (no token-refresh/remember-me).
- **Idempotent uploads** *(NEW — iteration 2):* double-submit / retry of the same certificate or resume converges to a single result (no duplicate skill records, promotions, or pre-populations), protecting data integrity and the loop.
- **Resume upload + Claude extraction** *(NEW):* employee uploads a resume (PDF/doc/image); Claude parses to Zod-validated structured JSON to pre-populate the profile (current project, baseline skills); failures degrade gracefully (no garbage written). Same Claude-only discipline as cert parsing.
- **Upskilling Tracker (employee):** browse catalog, pick ≥2–3 items (incl. ≥1 AI-enabled) with a **validated plan-finalize gate** (non-conforming plan rejected with a specific message; remove/swap-item flow; conforming plan counts toward compliance — BR-11, AC-26), mark progress (planned/in-progress/done), upload certificate, Claude-parsed verified skills, manual skill add.
- **Staffing Matcher (manager/HR/practice-lead):** plain-English skill + availability search, Claude ranked shortlist (match %, matched skills, gaps, availability, one-line rationale), gap & ramp-up analysis.
- **Shared Catalog:** anyone adds items; Claude de-dupe/normalize, auto-tag, auto-enrich; Claude per-employee recommendations; **optional manager "endorsed" flag** — manager/HR/Admin set/unset only (non-manager denied), endorsed items surfaced/indicated in catalog + recommendations; flag only, no endorsement workflow (BR-22, AC-27).
- **Team progress / compliance view:** Claude-summarized, scoped by role.
- **The loop (hero):** staffing gap → Claude recommendation → cert upload → profile update → improved re-match (3 demo scenarios: clean match, hard match, close-the-loop).
- **Role view-switcher (demo/testing aid only):** Admin > Manager/HR > Practice Lead > Employee — layered on the real authenticated session; no longer the auth mechanism.

### Technical work
- ~20–25 synthetic profiles (with baseline/current skills + current project + allocation) + synthetic certificates in `fixtures/certs/` **+ synthetic resumes in `fixtures/resumes/`** *(NEW)*.
- **Google OAuth integration** *(NEW)* (e.g. NextAuth/Auth.js-style) with hosted-domain restriction to `nulogic.io`; client ID/secret read from env, never committed.
- **Skill state machine** *(NEW)*: single canonical skill record per profile (upsert keyed by `(profileId, canonicalSkillId)`) whose trust state PROMOTES in place `self-reported → manager-approved → verified` (never a duplicate row; BR-18), with role-gated approval authority.
- **Deterministic identity→synthetic-profile mapping** *(NEW — iteration 2)*: a seeded mapping table keyed by a synthetic handle (NOT real email/PII) resolves an authenticated nulogic.io identity to the same synthetic profile every time (BR-13a).
- **Upload idempotency / session-expiry handling** *(NEW — iteration 2)*: double-submit guard + dedupe on cert/resume uploads; auth middleware redirects expired sessions to sign-in with graceful in-flight handling.
- **Admin role-assignment action** *(NEW — iteration 2)*: a single Admin-only action that sets a user's role (re-scoping data access via the role hierarchy).
- Claude API integration (`@anthropic-ai/sdk`) for all intelligence (cert parsing, **resume parsing**, matching, catalog, summaries); structured JSON validated with Zod.
- Prisma + SQLite persistence for profiles/catalog/plans.
- Prompts kept in `src/prompts/` as named templates.
- Minimal clean **NULogic-branded** UI (Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui).
- Cert-parsing tests against fixtures; single-file test command.

### Quality gates
- All model outputs (cert + resume parsing, matching, catalog, summaries) Zod-validated before any data-store write; failed parses never write garbage.
- No real PII anywhere (repo, DB, fixtures) — **including for authenticated real Google users: identities map to synthetic profiles only.** Secrets (`ANTHROPIC_API_KEY`, Google OAuth client ID/secret) from env only.
- Auth restricted to NULogic accounts; non-NULogic/unauthorized rejected. Skill approval gated to authorized manager/HR roles.
- Each Claude-backed flow degrades gracefully with a clear user-facing message.
- **Upskilling plan finalize is validated** (≥2–3 items incl. ≥1 AI-enabled, BR-11); non-conforming plans are rejected (not marked complete) — the §8 compliance metric depends on this gate.
- Typecheck + lint clean before commit.

---

## Out of Scope (roadmap / excluded)

### Deferred to roadmap
- *(MOVED IN — was here in v1)* ~~Real authentication~~ — **now In-Scope** as Google OAuth (NULogic-restricted). What remains deferred: production-grade role enforcement/RBAC hardening, SSO beyond Google, multi-IdP, and account provisioning/de-provisioning.
- **Admin platform configuration beyond role assignment** *(NEW — iteration 2; PRD-R1-005 decision):* the MVP includes ONLY Admin role assign/override (In-Scope above). Broader Admin "manage config" — catalog policy/governance, org/tenant settings, feature flags, user provisioning/de-provisioning, audit logs — is **explicitly deferred to roadmap**.
- **Session-management hardening** *(NEW — iteration 2):* token refresh, remember-me, concurrent-session control, and idle-timeout policy beyond the minimal expiry→redirect handling are deferred.
- Full team dashboards and production-grade reporting.
- Compliance nudges/notifications.
- HRMS / Jira integration via MCP.
- Build-vs-hire guidance.
- Org-wide skills heatmap & forecasting.

### Explicitly excluded (MVP)
- Any real employee data / real PII.
- Hardcoded, keyword, or regex substitutes for Claude intelligence.
- Production deployment, scaling, multi-tenant concerns.
- File storage hardening beyond demo needs.

---

## Scope Creep Risks
- **Auth gold-plating** — now that real Google OAuth is in-scope, resist expanding into full RBAC, SSO/multi-IdP, account provisioning, or production session hardening. Cap at: Google sign-in, NULogic-domain restriction, role layered on identity. Keep the view-switcher as a fast demo/testing aid so auth issues never block the hero loop.
- **Approval workflow sprawl** — keep manager approval to a single `self-reported → manager-approved` transition; no multi-step review chains, audit trails, or notifications for MVP.
- **Resume parsing over-investment** — cover the synthetic resume fixtures; don't chase every real-world resume layout. Same discipline as cert parsing.
- **Polishing dashboards** — gold-plating the progress view at the expense of the loop. Cap at "Claude summary."
- **Catalog feature sprawl** (endorsement workflows) — keep to add + de-dupe + tag + enrich + recommend.
- **Substituting fake logic** when a Claude call is awkward — forbidden; stub the boundary with a `TODO` instead.
- **Over-investing in cert-format coverage** — cover the synthetic fixtures, not every real-world certificate.

## Scope Changes (process)
Any change to this boundary is raised to the team/PM, assessed for impact on the hero loop and demo timeline, and only accepted if it does not endanger the end-to-end demo. Feature freeze targeted ~Day 6–7, then polish only.
