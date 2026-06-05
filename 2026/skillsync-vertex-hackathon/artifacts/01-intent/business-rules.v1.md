# Business Rules — SkillSync

**Initiative:** `skillsync-vertex-hackathon` · **Version:** v1 · **Stage:** 01-intent
**Source:** `docs/SPEC.md`, project `CLAUDE.md`, NULogic org instructions

Each rule: description · source reference · implementation impact.

---

### BR-01 — Verified skills come only from parsed certificates
**Description:** A skill may reach the highest trust state `verified` (`source=certificate`) only when it was extracted by Claude from an uploaded certificate and confirmed. Self-reported and resume-derived skills are NOT verified (see BR-14/BR-15 for the full state machine).
**Source:** SPEC §4 (Skills), §5A.4; UPDATE post-gate (skill state machine).
**Impact:** Profile write path must distinguish trust states (self-reported / manager-approved / verified); UI must surface the distinction; matching may weight by trust tier.

### BR-02 — A failed or low-confidence parse never writes a skill
**Description:** If Claude cannot reliably parse a certificate (error, low confidence, or invalid JSON), no skill is written and the item stays in-progress.
**Source:** SPEC §7 (validated before use), §10; PRD error handling.
**Impact:** Cert-parse flow gates the DB write behind successful Zod validation + confidence threshold; user sees a recoverable error.

### BR-03 — Role hierarchy & data scope (layered on real auth)
**Description:** Everyone is an Employee; roles layer on top: **Admin > Manager/HR > Practice Lead > Employee**. Managers/HR/Admin see the whole org; a Practice Lead sees only their team and also acts as an Employee; an Employee sees only self and cannot access the Staffing Matcher. **UPDATED:** the role now layers on top of the REAL authenticated identity (see BR-13); role-based data scoping is still required. A role view-switcher MAY remain only as a demo/testing aid.
**Source:** SPEC §3; CLAUDE.md domain gotchas; UPDATE post-gate (real auth supersedes fake-auth-only).
**Impact:** Data queries filtered by the authenticated user's role; the role layer is decoupled from the auth mechanism.

### BR-04 — Matching must reason over availability, not skills alone
**Description:** Staffing matches must account for current allocation % and `freeFrom` date, reasoning over "free now" vs "free within N weeks," not just skill overlap.
**Source:** SPEC §4 (Availability), §5B.2, §7; CLAUDE.md domain gotchas.
**Impact:** Profile schema needs allocation % + freeFrom; the matching Claude call receives availability and must factor it into ranking.

### BR-05 — Staffing results include match %, matched skills, gaps, availability, and a rationale
**Description:** Every shortlist entry returns a match %, matched skills, gaps, availability, and a one-line rationale; hard matches return closest people + gap/ramp-up analysis rather than an empty list.
**Source:** SPEC §5B.3–4, §9.2.
**Impact:** Defines the validated JSON shape for match results.

### BR-06 — Catalog de-duplication is semantic and Claude-driven
**Description:** On add, Claude normalizes/de-dupes against existing items (e.g. merges "AWS Solutions Architect" into "AWS Certified Solutions Architect"). No string-equality or regex matching.
**Source:** SPEC §5 Catalog.3, §7.
**Impact:** Add-item flow calls Claude before persisting; merges into the canonical entry.

### BR-07 — Catalog items are auto-tagged and auto-enriched by Claude
**Description:** Each item is tagged (skill area, level, role relevance, AI-enabled?) and enriched from its name (description, typical duration, provider, prerequisites). Enrichment failure does not block adding.
**Source:** SPEC §5 Catalog.4–5.
**Impact:** Tagging/enrichment are Claude calls; item persists with enrichment-pending flag on failure.

### BR-08 — Recommendations are personalized by Claude
**Description:** Claude recommends catalog items per employee from role, team, current skills, and matcher-surfaced gaps.
**Source:** SPEC §5 Catalog.6, §6.
**Impact:** Recommendation endpoint feeds the loop; consumes profile + gap context.

### BR-09 — All intelligence goes through the Claude API; outputs validated before use
**Description:** Certificate parsing, matching/ranking, availability reasoning, catalog de-dupe/tag/enrich/recommend, and progress summarization MUST be Claude API calls returning structured JSON, Zod-validated before use. Hardcoded logic, keyword matching, or regex substitutes are forbidden; if a call is awkward, stub the boundary with a `TODO`.
**Source:** CLAUDE.md non-negotiable rules; org instructions; SPEC §7.
**Impact:** Architectural constraint on every "smart" feature; no fallback fake logic.

### BR-10 — Synthetic data only; never real PII; secrets from env
**Description:** No real names, emails, or any PII may be generated, stored, or committed. Use `[REDACTED]` if real data ever appears. Certificates are synthetic (`fixtures/certs/`). `ANTHROPIC_API_KEY` is read from the environment, never hardcoded or committed.
**Source:** CLAUDE.md non-negotiable rules; org data-protection instructions; SPEC §10.
**Impact:** Seed generator and fixtures produce only synthetic data; review gate before any commit.

### BR-11 — Upskilling plan must include at least 2–3 items, ≥1 AI-enabled
**Description:** An employee's yearly plan must contain at least 2–3 chosen catalog items, of which at least one is AI-enabled.
**Source:** SPEC §4 (Upskilling plan), §5A.1.
**Impact:** Plan validation enforces minimum count and the AI-enabled requirement; ties to the §8 compliance metric. **Validated by AC-26** (PRD-R2-001): finalizing a plan is gated — a conforming plan (≥2 items incl. ≥1 AI-enabled) is accepted and counts toward compliance; a non-conforming plan is rejected with a specific message and not marked complete, and the employee may remove/swap an item to reach conformance. The AI-enabled determination reuses the catalog AI-enabled tag (Claude-tagged, BR-07); the count + AI-enabled check is a plan-validation constraint (not new intelligence). See PRD §3 UC-1 plan-validation flow and §10 error-handling row.

### BR-12 — Token-efficient Claude usage; appropriate model per call
**Description:** Use prompt caching, cache the profile dataset/system prompt across match queries, default to Sonnet for routine calls, and reach for Opus only where reasoning quality matters (e.g. tricky ranking).
**Source:** SPEC §12; CLAUDE.md Claude API usage.
**Impact:** Influences how Claude calls are structured (caching, model selection); a cost/perf NFR, not user-facing behavior.

---

> **UPDATE — v1 (post-gate, 2026-06-05): BR-13..BR-17 added for the new MVP requirements.** The Google-auth rule (BR-13) **supersedes** the fake-auth-only stance in SPEC §2/§8 and CLAUDE.md ("do not build real auth").
>
> **REVISION — v1 (iteration 2, 2026-06-05): added BR-13a, BR-18, BR-19, BR-20, BR-21** to resolve reviewer findings PRD-R1-001 (skill identity/trust-state promotion on one record), PRD-R1-002 (deterministic OAuth→synthetic-profile mapping), PRD-R1-003 (session expiry / re-auth), PRD-R1-004 (idempotent/de-duped uploads), and PRD-R1-005 (minimal Admin role management). BR-15 refined to reference the single-identity promotion rule.
>
> **REVISION — v1 (iteration 3, 2026-06-05): added BR-22 (manager 'endorsed' catalog flag) and clarified BR-11's enforcement** to resolve reviewer findings PRD-R2-001 (BR-11 now has a validating AC, AC-26), PRD-R2-002 (plan-validation user flow + error path added to PRD §3 UC-1 / §10), and PRD-R2-003 (manager 'endorsed' catalog flag specified + tested via AC-27).

### BR-13 — Authentication is real Google OAuth, restricted to NULogic accounts *(NEW)*
**Description:** Sign-in/sign-up is via Google OAuth and is **restricted to NULogic accounts** (hosted-domain / `nulogic.io` Google Workspace). Non-NULogic or otherwise unauthorized accounts are rejected with no session created. This **supersedes** the prior fake-auth-only non-goal (SPEC §2/§8, CLAUDE.md). The role hierarchy (BR-03) layers on the authenticated identity; a role view-switcher may remain only as a demo/testing aid. Authenticated identities map to synthetic profiles — **no real user PII is persisted or committed** (reinforces BR-10).
**Source:** Product owner gate decision (UPDATE), overriding SPEC §2/§8 + CLAUDE.md.
**Impact:** Adds an OAuth provider/library and hosted-domain enforcement; OAuth client ID/secret read from env, never committed; session→synthetic-profile mapping (see BR-13a); rejection path for non-nulogic accounts.

### BR-13a — Deterministic OAuth-identity → synthetic-profile mapping (no real PII persisted) *(NEW)*
**Description:** On successful Google sign-in (BR-13), the authenticated identity is resolved to a synthetic employee profile via a **stable, seeded mapping** so behavior is deterministic and testable. The mapping is keyed by a **stable synthetic handle** (e.g. a seeded mapping table entry / opaque key), **NOT** by the user's real Google email or any real PII — the real email/name is used only transiently to authorize the hosted-domain (`nulogic.io`) and is **never stored**. The same authenticated identity always resolves to the **same** synthetic profile across sessions (stable), so AC-14 is deterministically testable on synthetic data. An authenticated nulogic.io identity with **no mapping entry** is handled per the demo policy (mapped to a designated synthetic profile, or shown the restricted-access message) — but in all cases **only synthetic profile data is persisted**.
**Source:** Reviewer finding PRD-R1-002; BR-10 (no PII); BR-13.
**Impact:** A seeded `identity→synthetic-profile` mapping table (keyed by synthetic handle, not real email) makes AC-14 deterministic and buildable on synthetic data; real identity attributes are used only for the domain check and discarded, never written. No real PII in repo/DB/fixtures.

### BR-14 — Employees self-manage their own skills (source=self-reported) *(NEW)*
**Description:** An authenticated Employee may add/update skills on their OWN profile. Such skills are written `source=self-reported, state=self-reported` — NOT verified and NOT yet manager-approved. Invalid/blank entries are rejected; no garbage is written.
**Source:** Product owner gate decision (UPDATE).
**Impact:** Self-service edit path scoped to own profile; ties into the skill state machine (BR-15).

### BR-15 — Skill trust state machine & manager approval authority *(NEW)*
**Description:** A skill has a trust state: **`self-reported`** (employee- or resume-supplied) → **`manager-approved`** (a manager/HR with authority over that employee has reviewed and approved it) ; certificate-extracted skills are **`verified`** (highest trust, via BR-01). Approval (`self-reported → manager-approved`) is a **distinct state from cert-`verified`** and may ONLY be performed by a user with manager/HR approval authority over the employee (an Employee, or a Practice Lead acting outside their team, cannot approve). Matching may weight states: `verified` > `manager-approved` > `self-reported`. The state field is governed by the single-identity / promotion rule in BR-18 — promotion mutates the one skill record's state, never creates a second row.
**Source:** Product owner gate decision (UPDATE).
**Impact:** Profile schema carries a skill `state`; an authorization check gates the approval transition; matching consumes the trust tier.

### BR-18 — One canonical skill identity per profile; trust state PROMOTES on the same record *(NEW)*
**Description:** Within a single employee profile, a given skill has exactly **ONE canonical identity** (one record). Its **trust state is a single field on that record** that only ever **promotes** along the ordered ladder **`self-reported` → `manager-approved` → `verified`** (never demotes, never duplicates the skill into a second row). Concretely:
- Re-acquiring or re-asserting an already-present skill **promotes (or no-ops) the existing record** — it does NOT insert a duplicate. Examples: an employee re-adds a skill they already hold (no-op or stays self-reported); a manager approves a self-reported skill (`self-reported → manager-approved`, same record); a certificate is parsed for a skill already on the profile (the existing record is promoted to `verified`, regardless of its prior state — `self-reported`/`manager-approved` → `verified` on the SAME row).
- Skill identity for the de-dupe decision (is this "the same skill"?) is determined by Claude-driven semantic normalization (consistent with BR-06's catalog de-dupe discipline) — **not** raw string equality/regex — so e.g. "TypeScript" self-reported and a "TypeScript" certificate resolve to the same canonical skill record and promote it.
- The promotion only ever **raises trust** (and therefore matching weight, per BR-15); it never lowers a skill below a state it has already reached.
**Source:** Reviewer finding PRD-R1-001; product owner gate decision (UPDATE); BR-01/BR-06/BR-15.
**Impact:** Profile-skill write path is an **upsert keyed by (profileId, canonicalSkillId)** with a monotonic-promotion state transition — never a blind insert. The **hero loop (BR & AC-07) compares the SAME skill record before/after**: the cert upload promotes that record's state (e.g. self-reported/manager-approved → verified), which raises its matching weight and the candidate's rank; the before/after match must NOT see a duplicated skill row. Cert-parse, self-service add, manager-approval, and resume-extraction all route through this single upsert+promote path.

### BR-19 — Idempotent / de-duplicated upload handling (certificates and resumes) *(NEW)*
**Description:** Uploads of the same certificate or resume must be **idempotent / de-duplicated** so a double-submit (double-click, retry, network re-send) does not corrupt the profile or the loop. The same file submitted twice MUST NOT create duplicate skill records, duplicate verified-skill promotions, or duplicate resume pre-populations; the system either ignores the redundant submission or converges to the same single result. This composes with BR-18 (skill upsert) but is broader: it also guards the *upload action itself* (e.g. an in-flight submit is guarded against re-submission, and a re-uploaded identical file resolves to the same outcome rather than a second parse-and-write).
**Source:** Reviewer finding PRD-R1-004; BR-02/BR-18 (data integrity), protect-the-hero-loop.
**Impact:** Upload handlers guard against double-submit (disable/lock the submit affordance while in flight) and dedupe redundant uploads (e.g. by content/identity) so repeated submits converge to one record. Applies to cert upload (UC-1) and resume upload (UC-9). Keeps the loop's before/after comparison clean.

### BR-20 — Session expiry / re-auth mid-flow handling *(NEW)*
**Description:** Because authentication is now real (BR-13), an **expired or invalid session** must be handled gracefully: a request made with an expired session **redirects the user to sign-in** rather than erroring opaquely, and **in-flight unsaved work is handled gracefully** (the user is not silently dropped into a broken state; on re-auth they return to a sensible place and unsaved input is not written under a stale identity). No protected data or action is served on an expired session.
**Source:** Reviewer finding PRD-R1-003; BR-13 (real auth in scope).
**Impact:** Auth middleware checks session validity on protected routes/actions; expiry → redirect to sign-in; mid-flow expiry preserves a graceful UX (re-auth then resume / discard, no garbage write under a stale session). Scoped minimally for the demo — no token-refresh/remember-me machinery.

### BR-21 — Admin may assign/override a user's role (minimal role management) *(NEW)*
**Description:** The **Admin** role has one explicit in-scope management capability for the MVP: **assign or override a user's role** within the hierarchy (Admin > Manager/HR > Practice Lead > Employee). Broader platform configuration (catalog policy, org settings, provisioning, audit, etc.) is **deferred to roadmap** and is NOT part of the MVP. The Admin role-assignment action is itself authorization-gated (only Admin may perform it).
**Source:** Reviewer finding PRD-R1-005; SPEC §3 (Admin persona); scope decision (UPDATE).
**Impact:** A single Admin-only action sets a user's role field (re-scopes that user's data access via BR-03). Operates on synthetic profiles only (no real PII). Everything beyond role assignment is explicitly out of scope (see scope-boundary).

### BR-16 — Baseline/current skills distinguished from upskilling-acquired skills *(NEW)*
**Description:** Every employee profile captures their **baseline/current skills** — the skills they already had BEFORE any upskilling is initiated — alongside their current project and allocation/availability. Baseline skills are distinct from **upskilling-acquired** (cert-`verified`) skills so the profile and the demo loop can show capability growth over time.
**Source:** Product owner gate decision (UPDATE); CLAUDE.md domain gotchas (availability).
**Impact:** Profile schema flags baseline vs upskilling-acquired origin; seed data populates baseline skills; matching reasons over baseline skills + availability (the matcher depends on baseline being present — hence P0).

### BR-17 — Resume parsing goes through Claude and fails gracefully *(NEW)*
**Description:** Resume upload (PDF/doc/image) is parsed by the **Claude API** into structured JSON (e.g. current project, allocation, baseline skills), **Zod-validated** before use — the same discipline as certificate parsing. **No regex/keyword extraction.** On parse failure or invalid JSON, **nothing is written** (never write garbage profile data) and the user sees a recoverable error. Because a resume is self-attested, extracted skills are written `source=self-reported`, not `verified`.
**Source:** Product owner gate decision (UPDATE); SPEC §7 (validate before use); BR-09 (Claude-only).
**Impact:** Adds a resume-parse Claude call + Zod schema + graceful-failure gate; synthetic resume fixtures (`fixtures/resumes/`); extracted skills enter the state machine as self-reported.

### BR-22 — Manager 'endorsed' catalog flag (flag only, no workflow) *(NEW — iteration 3)*
**Description:** A catalog item carries an optional **`endorsed`** flag. A user with **manager/HR (or Admin) authority** may **set or unset** `endorsed` on a catalog item; an Employee (or a Practice Lead acting outside their authority) **cannot** set/unset it. Endorsed items are **visibly indicated / surfaced** to users in the catalog and recommendation views (signalling org-preferred learning). The MVP includes ONLY the single flag — **no endorsement workflow** (multi-step review, approval chains, notifications) is in scope (consistent with the scope-boundary creep-risk note on "endorsement workflows").
**Source:** SPEC §5 Catalog; PRD UC-5; reviewer finding PRD-R2-003; scope-boundary In-Scope ("optional manager endorsed flag").
**Impact:** Catalog item schema gains a boolean `endorsed` field; the set/unset action is authorization-gated to manager/HR/Admin; catalog + recommendation views surface/indicate endorsed items. Validated by AC-27. No workflow machinery beyond the flag.
