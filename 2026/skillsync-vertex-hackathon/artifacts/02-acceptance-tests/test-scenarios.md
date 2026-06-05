# Acceptance Test Scenarios — SkillSync

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 02-acceptance-tests · **Version:** v1
**Source:** `artifacts/01-intent/prd.v1.md`, `acceptance-criteria.v1.json` (27 ACs), `business-rules.v1.md` (23 BRs)
**State:** RED — all executable tests FAIL (no implementation exists yet). This is TDD test-first.

> **Branding:** NULogic. **Data:** Synthetic only — never real names, emails, or PII.
>
> **Intelligence boundary rule:** Every "smart" feature (cert parse, resume parse, match/rank, catalog de-dupe/tag/enrich/recommend, progress summary) MUST be a Claude API call returning JSON that is **Zod-validated before use**. These scenarios assert the **call boundary + validation + graceful failure** — they do NOT assert hardcoded keyword/regex logic, and a passing implementation must NOT fake the intelligence.

These scenarios are human-reviewable (Product Owner / QA review the **logic and intent**, not implementation details). Each maps to one or more ACs and the executable stub file that exercises it.

---

## Coverage map (scenario → AC → test file)

| Scenario | ACs | Priority | Test file |
|---|---|---|---|
| S-01 Cert parse happy path | AC-01 | P0 | `cert-parsing.test.ts` |
| S-02 Cert parse multi-skill / unusual | AC-02 | P1 | `cert-parsing.test.ts` |
| S-03 Cert parse failure / low confidence | AC-03 | P0 | `cert-parsing.test.ts` |
| S-04 Availability-aware ranked match | AC-04 | P0 | `staffing-matcher.test.ts` |
| S-05 Hard match — closest people + gaps | AC-05 | P1 | `staffing-matcher.test.ts` |
| S-06 Partial-quantity fulfillment | AC-21 | P1 | `staffing-matcher.test.ts` |
| S-07 Staffing search failure | AC-06 | P1 | `staffing-matcher.test.ts` |
| S-08 The loop — cert sharpens next match | AC-07 | P0 | `hero-loop.test.ts` |
| S-09 Catalog de-dupe / normalize | AC-08 | P1 | `catalog-intelligence.test.ts` |
| S-10 Catalog auto-tag + enrich (+ degrade) | AC-09 | P2 | `catalog-intelligence.test.ts` |
| S-11 Per-employee recommendations | AC-10 | P2 | `catalog-intelligence.test.ts` |
| S-12 Role-based data scoping | AC-11 | P1 | `roles-scoping.test.ts` |
| S-13 Team progress summary (+ empty) | AC-12 | P2 | `roles-scoping.test.ts` |
| S-14 Synthetic-data / no-PII / env-secrets | AC-13 | P0 | `data-guardrails.test.ts` |
| S-15 Google sign-in — NULogic only | AC-14 | P1 | `auth-oauth.test.ts` |
| S-16 Non-NULogic / unmapped rejected | AC-15 | P0 | `auth-oauth.test.ts` |
| S-17 Baseline current skills on profile | AC-16 | P0 | `profile-skills.test.ts` |
| S-18 Employee self-service skill add/update | AC-17 | P1 | `profile-skills.test.ts` |
| S-19 Manager approval of self-reported skills | AC-18 | P1 | `profile-skills.test.ts` |
| S-20 Resume upload + Claude extraction | AC-19 | P1 | `resume-parsing.test.ts` |
| S-21 Resume parse failure degrades | AC-20 | P1 | `resume-parsing.test.ts` |
| S-22 One canonical skill identity + promotion | AC-22 | P0 | `profile-skills.test.ts` |
| S-23 Idempotent double-submit (cert + resume) | AC-23 | P1 | `idempotency.test.ts` |
| S-24 Expired session redirects / graceful | AC-24 | P1 | `auth-oauth.test.ts` |
| S-25 Admin assigns / overrides role | AC-25 | P2 | `roles-scoping.test.ts` |
| S-26 Upskilling plan validation gate | AC-26 | P1 | `plan-validation.test.ts` |
| S-27 Manager 'endorsed' catalog flag | AC-27 | P2 | `catalog-intelligence.test.ts` |

All 27 ACs covered. No uncovered ACs.

---

## Certificate parsing (UC-1 · BR-01/02/09/10/18/19)

### S-01 — Certificate parsing via Claude (happy path)  `AC-01` · P0 · integration
- **GIVEN** an authenticated Employee on the Upskilling Tracker has selected a catalog item and a valid synthetic certificate (`fixtures/certs/aws-saa-valid.pdf`) for an item that is *in-progress*
- **WHEN** the employee uploads the certificate
- **THEN** the file is sent to the **Claude API** (the call boundary is invoked exactly once), Claude returns structured JSON `{skill, issuer, date, level, confidence}`, the JSON is **Zod-validated**, and on the employee's confirmation the skill is written to the profile with `verified=true`, `source=certificate`, `state=verified`, and the catalog item status becomes `done`.
- **Edge/assert:** parsing must be a Claude call — NOT regex/keyword. Confidence above threshold. One skill record written.

### S-02 — Multi-skill / unusual certificate (edge)  `AC-02` · P1 · integration
- **GIVEN** a synthetic certificate (`fixtures/certs/multi-skill-bootcamp.pdf`) listing multiple skills or an uncommon issuer/format
- **WHEN** the employee uploads it
- **THEN** Claude returns **all** extracted skills in Zod-validated JSON, each confirmed skill is written `verified`, and ambiguous/missing optional fields do not break the write (the write still succeeds for well-formed entries).

### S-03 — Cert parse failure / low confidence (error)  `AC-03` · P0 · integration
- **GIVEN** an unreadable, non-certificate, or low-confidence file (`fixtures/certs/not-a-cert.png`) — or Claude returns invalid JSON / confidence below threshold
- **WHEN** the employee uploads it
- **THEN** **no skill is written**, the item remains *in-progress*, and the user sees *"We couldn't reliably read this certificate. Check it's a clear PDF or image and try again, or add the skill manually."*

---

## Staffing matcher (UC-2 · BR-04/05/09)

### S-04 — Availability-aware ranked match (happy path)  `AC-04` · P0 · integration
- **GIVEN** a Manager/HR user and ~20–25 synthetic profiles carrying skills, allocation %, and `freeFrom` dates
- **WHEN** the manager submits *"2 mid-level React + Node devs, free now or within 2 weeks, IST overlap"*
- **THEN** the **Claude API** is called and returns a **Zod-validated** ranked shortlist where each entry has `matchPercent`, `matchedSkills[]`, `gaps[]`, `availability`, and a one-line `rationale`; the ranking demonstrably reasons over availability (free now / within 2 weeks), not skill overlap alone.

### S-05 — Hard match, no perfect fit → closest + gaps (edge)  `AC-05` · P1 · integration
- **GIVEN** a query for a niche skill where no profile is a perfect fit
- **WHEN** the manager submits the query
- **THEN** Claude returns the **closest available people** with explicit gap and ramp-up analysis (e.g. *"~1 week of AWS ramp-up"*) rather than an empty result.

### S-06 — Partial-quantity fulfillment (edge)  `AC-21` · P1 · integration
- **GIVEN** a query requesting a specific count (*"3 mid-level React devs free within 2 weeks"*) but fewer than 3 qualify
- **WHEN** the manager submits the query
- **THEN** Claude returns the qualifying people (the fewer-than-requested results) **with an explicit shortfall note** (e.g. *"2 of 3 requested qualify"*) — not an empty result and not a silent drop.

### S-07 — Staffing search failure (error)  `AC-06` · P1 · integration
- **GIVEN** the Claude API is unreachable or returns output that fails Zod validation
- **WHEN** the manager submits a search
- **THEN** **no partial or garbled ranking** is shown and the user sees *"Search is temporarily unavailable — please retry."*

---

## The hero loop (UC-3 · BR-18 · protect above all)

### S-08 — Cert upload sharpens the next match (hero)  `AC-07` · P0 · e2e
- **GIVEN** a staffing search surfaced a skill gap for a candidate, Claude recommended a catalog item addressing it, and the candidate may already hold that skill as a `self-reported` or `manager-approved` record
- **WHEN** the employee completes the item, uploads the certificate (S-01 flow) so the **SAME** canonical skill record is **promoted** to `verified` (NOT duplicated, per BR-18), and the **SAME** staffing search is re-run
- **THEN** the candidate's `matchPercent` and/or rank **visibly improves** vs. the pre-upload result, the improvement is driven by the promoted trust state (raised matching weight) of the **one** canonical skill record, and **no duplicate skill row** is created.
- **Failure signature to guard against:** a duplicated skill row instead of an in-place promotion.

---

## Catalog intelligence (UC-5 · BR-06/07/08/22)

### S-09 — De-dupe / normalize on add (happy + edge)  `AC-08` · P1 · integration
- **GIVEN** the catalog contains *"AWS Certified Solutions Architect"*
- **WHEN** a user adds a near-duplicate *"AWS Solutions Architect"*
- **THEN** **Claude** de-dupes/normalizes the entry and it is **merged into the existing canonical item** — no duplicate created. De-dupe is a Claude call, NOT string-equality/regex.

### S-10 — Auto-tag + auto-enrich on add (happy + degrade)  `AC-09` · P2 · integration
- **GIVEN** a user adds a brand-new catalog item by name only
- **WHEN** the item is saved
- **THEN** Claude **auto-tags** it (skill area, level, role relevance, `aiEnabled`) and **enriches** it (description, duration, provider, prerequisites). If enrichment fails the item is saved with `enrichmentPending=true` and the add is **never blocked**.

### S-11 — Personalized recommendations (happy path)  `AC-10` · P2 · integration
- **GIVEN** an employee with role, team, current skills, and matcher-surfaced gaps
- **WHEN** the employee views recommendations (e.g. tracker empty-state)
- **THEN** **Claude** returns recommended catalog items relevant to that employee's role/team/skills/gaps, in Zod-validated JSON.

### S-27 — Manager 'endorsed' catalog flag (happy + unauthorized)  `AC-27` · P2 · integration
- **GIVEN** a Manager/HR (or Admin) and a catalog item, plus a non-manager (Employee / Practice Lead outside authority)
- **WHEN** the manager toggles `endorsed` (set, then unset)
- **THEN** the item is marked endorsed (and can be un-endorsed), endorsed items are **surfaced/indicated** in catalog + recommendation views, and a **non-manager is denied** the toggle. Only the flag exists — no endorsement workflow.

---

## Roles, scoping & admin (UC-4/UC-10 · BR-03/21)

### S-12 — Role-based data scoping (happy + unauthorized)  `AC-11` · P1 · integration
- **GIVEN** an authenticated session resolved to a **Practice Lead** role
- **WHEN** they open profiles and the progress view
- **THEN** **only their team's** profiles/progress are shown; Manager/HR and Admin see the whole org; an **Employee cannot access the Staffing Matcher**.

### S-13 — Team progress / compliance summary (happy + empty)  `AC-12` · P2 · integration
- **GIVEN** a Manager or Practice Lead opens the progress view
- **WHEN** the view loads
- **THEN** **Claude** summarizes who is on track / behind / where coverage is thin (scoped to the viewer's permission); a Practice Lead with no team sees *"No team members assigned yet."*

### S-25 — Admin assigns / overrides a role (happy + unauthorized)  `AC-25` · P2 · integration
- **GIVEN** an authenticated Admin, a target synthetic user, and a non-Admin user
- **WHEN** the Admin assigns/overrides the target's role within the hierarchy
- **THEN** the target's role updates and their data access re-scopes (per AC-11/BR-03); a **non-Admin is denied**; broader platform config is NOT available.

---

## Guardrails (BR-09/10)

### S-14 — Synthetic-data / no-PII / env-secrets (constraint)  `AC-13` · P0 · review
- **GIVEN** the seeded profile dataset (~20–25), cert fixtures, and resume fixtures
- **WHEN** the repo, DB, and fixtures are inspected
- **THEN** **no real names/emails/PII** are present (all synthetic), `ANTHROPIC_API_KEY` and OAuth client secrets are read from the environment, and **no secrets are hardcoded or committed**.

---

## Authentication (UC-6 / UC-6b · BR-13/13a/20)

### S-15 — Google sign-in restricted to NULogic (happy path)  `AC-14` · P1 · integration
- **GIVEN** an unauthenticated visitor with a valid NULogic Google Workspace account (hosted-domain `nulogic.io`) for which a seeded **synthetic-handle** mapping exists
- **WHEN** they sign in via Google OAuth
- **THEN** authentication succeeds, the identity resolves via the stable seeded mapping **keyed by a synthetic handle (NOT real email/PII)** to the **same** synthetic profile + role every time, the user lands on their role-appropriate home, and **no real PII is persisted** (real email used transiently for the domain check, then discarded).

### S-16 — Non-NULogic / unmapped account rejected (error)  `AC-15` · P0 · integration
- **GIVEN** a visitor with a non-NULogic Google account (wrong hosted domain) or no mapped profile
- **WHEN** they complete the OAuth flow
- **THEN** **no session is created** and the user sees *"Sign-in is restricted to NULogic accounts. Please use your @nulogic.io Google account."*

### S-24 — Expired session redirect / graceful in-flight (error)  `AC-24` · P1 · integration
- **GIVEN** an authenticated user whose session has expired/become invalid while a protected page/action is open, possibly with unsaved work
- **WHEN** they request a protected route or submit an action
- **THEN** **no protected data/action** is served on the expired session, the user is **redirected to Google sign-in**, and in-flight unsaved work is handled gracefully (not silently written under a stale identity; re-auth returns the user to a sensible place).

---

## Profile & skill state machine (UC-7/UC-8 · BR-14/15/16/18)

### S-17 — Baseline current skills present (P0)  `AC-16` · P0 · integration
- **GIVEN** a seeded synthetic employee profile
- **WHEN** the profile is inspected (by the employee or via the matcher dataset)
- **THEN** it carries **baseline/current skills** (held BEFORE upskilling) distinct from cert-`verified` skills, plus current project and allocation/availability, and matches can reason over the baseline skills.

### S-18 — Employee self-service skill add/update (happy + invalid)  `AC-17` · P1 · integration
- **GIVEN** an authenticated Employee viewing their own profile
- **WHEN** they add or update a skill
- **THEN** the skill is written `source=self-reported`, `state=self-reported` (NOT verified, NOT manager-approved); a **blank/invalid** entry is rejected inline with **no garbage written**.

### S-19 — Manager approval of self-reported skills (happy + unauthorized)  `AC-18` · P1 · integration
- **GIVEN** an employee with `state=self-reported` skills and a Manager/HR with approval authority over that employee
- **WHEN** the manager reviews and approves a skill
- **THEN** the state transitions `self-reported → manager-approved` (distinct from cert-`verified`), matching may weight manager-approved above unapproved self-reported, and a user **without authority** (Employee, or Practice Lead outside their team) **cannot approve** — the action is denied/unavailable.

### S-22 — One canonical skill identity + promotion (edge)  `AC-22` · P0 · integration
- **GIVEN** a profile already carries a skill (e.g. *"TypeScript"*) in state `self-reported` (or `manager-approved`)
- **WHEN** the same skill is re-asserted via a higher-trust source — manager approval, or a parsed certificate for that same skill (resolved by **Claude semantic de-dupe**, not string equality)
- **THEN** the existing single record is **promoted in place** along `self-reported → manager-approved → verified` (raising matching weight), **no duplicate row** is created, and re-asserting at equal-or-lower trust is a no-op that **never demotes**.

---

## Resume parsing (UC-9 · BR-17/09/18)

### S-20 — Resume upload + Claude extraction (happy path)  `AC-19` · P1 · integration
- **GIVEN** an authenticated Employee and a valid synthetic resume (`fixtures/resumes/synthetic-engineer.pdf`)
- **WHEN** the employee uploads it
- **THEN** the resume is sent to the **Claude API** which returns structured JSON (e.g. `{currentProject, allocation, baselineSkills[]}`), the JSON is **Zod-validated**, and on the employee's confirmation the extracted details pre-populate the profile (baseline skills written `source=self-reported`) and feed matching. Resume parsing is a Claude call — NOT regex/keyword.

### S-21 — Resume parse failure degrades gracefully (error)  `AC-20` · P1 · integration
- **GIVEN** an unreadable/non-resume/low-confidence file, or Claude returns invalid JSON
- **WHEN** the employee uploads it
- **THEN** **nothing is written** (never garbage), the profile is unchanged, and the user sees *"We couldn't reliably read this resume. Try a clearer file, or add your details manually."*

---

## Idempotency (UC-1/UC-9 · BR-19)

### S-23 — Idempotent double-submit of cert or resume upload (edge)  `AC-23` · P1 · integration
- **GIVEN** an authenticated Employee uploads a certificate (S-01) or resume (S-20) and the upload is submitted twice (double-click / retry / network re-send of the same file)
- **WHEN** the redundant submission is processed
- **THEN** the profile converges to a **single result** — no duplicate skill record, no duplicate verified-skill promotion, no duplicate resume pre-population — the redundant submit is ignored or resolves to the same single outcome.

---

## Upskilling plan validation (UC-1 · BR-11)

### S-26 — Plan validation gate (happy + non-conforming + remove/swap)  `AC-26` · P1 · integration
- **GIVEN** an authenticated Employee assembling their yearly upskilling plan from the catalog (items carry the Claude-assigned `aiEnabled` tag)
- **WHEN** they attempt to finalize the plan
- **THEN**
  - a **conforming** plan (≥2 items incl. ≥1 AI-enabled) is **accepted**, marked complete, and counts toward the §8 compliance metric;
  - a **non-conforming** plan (<2 items, OR zero AI-enabled) is **rejected**, **not marked complete**, and the employee sees the **specific** failed-rule message (*"Pick at least 2 items for your plan."* or *"Your plan needs at least one AI-enabled item."*);
  - the employee can **remove or swap** an item to reach conformance and re-attempt finalize.
- **Note:** the count + AI-enabled check is a plan-validation constraint (reuses the catalog `aiEnabled` tag), **not** new intelligence.
