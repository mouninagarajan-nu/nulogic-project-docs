# Target State — Page 05: Strategic ADRs

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 03-architecture / target-state · **Version:** v1
**Mode:** TARGET-STATE · **Classification:** GREENFIELD · **Evidence:** `direct_scan`
**Branding:** NULogic. **Data:** Synthetic only — no real PII.
**Zero-code policy:** Mermaid + generic pseudo-code only.

> **What this page is.** The strategic Architecture Decision Records for SkillSync. Each ADR follows the template: **Status · Context · Decision · Rationale · Alternatives Considered · Trade-offs · Impact · Evidence.** Every choice is biased toward **demo-pragmatic and loop-protecting** (P5/P8), never over-engineered.

**ADR index:**
| ID | Decision | Status |
|---|---|---|
| ADR-001 | Auth library: Auth.js (NextAuth) Google provider + `hd` restriction | Accepted |
| ADR-002 | Persistence: Prisma + SQLite (extend starter) | Accepted |
| ADR-003 | Claude call patterns: single wrapper, Zod-before-write, model routing, prompt caching | Accepted |
| ADR-004 | File/upload handling: Route Handlers + content-hash idempotency + parse→confirm→write | Accepted |
| ADR-005 | Synthetic-data strategy: seeded synthetic profiles + fixtures + synthetic-handle identity | Accepted |
| ADR-006 | Single Next.js app (no service split); Next.js 16 conventions (`proxy.ts`, async APIs) | Accepted |
| ADR-007 | Skill trust as a single promotable record (upsert + monotonic promotion) | Accepted |

---

## ADR-001 — Authentication: Auth.js (NextAuth) Google provider with `nulogic.io` hosted-domain restriction

**Status:** Accepted

**Context.** The post-gate PRD revision makes **real Google OAuth in-scope**, superseding the earlier fake-auth-only stance (PRD auth-override notice; BR-13). Requirements: sign-in restricted to `nulogic.io` Workspace accounts (AC-15), deterministic mapping of the authenticated identity to a **synthetic** profile with **no real PII persisted** (BR-13a, AC-14), graceful session-expiry handling (AC-24), and OAuth secrets from env (AC-13). The app is Next.js 16 App Router. No auth dependency exists today (current-state TD-AUTH-01..04). Scope explicitly caps auth: no SSO beyond Google, no multi-IdP, no RBAC hardening (`scope-boundary.v1.md`).

**Decision.** Use **Auth.js (NextAuth) with the Google OIDC provider**, mounted as a Route Handler at `/api/auth/[...]`. Enforce the `nulogic.io` **hosted-domain (`hd`) check** in the sign-in callback; reject non-matching accounts with no session. Resolve the authenticated identity to a synthetic profile via the seeded **`IdentityMapping`** table (synthetic handle derived from OIDC `sub`); **discard the real email/name** after the `hd` check. Gate protected routes with **`proxy.ts`** (Next.js 16's renamed middleware).

**Rationale.**
- Auth.js is the de-facto App-Router-native auth library with first-class Google OIDC and a callback hook ideal for the `hd` check and identity-mapping — minimal code, maximal fit (P8).
- The `hd` claim is exactly the NULogic-domain gate AC-15 requires; enforcing it in the callback means **no session is ever created** for non-NULogic accounts.
- Mapping in the callback lets us **discard real PII immediately** (P3, BR-13a) — the synthetic handle is the only persisted identity key.

**Alternatives Considered.**
- **Hand-rolled OIDC** (raw Google OAuth + custom session): full control but more code, more failure surface, slower to demo; rejected (over-engineering, P8).
- **Clerk / Auth0 (hosted auth SaaS):** fast UI but adds an external dependency, a vendor account, and tends to store user PII in the vendor — conflicts with the no-PII rule and adds a demo-time dependency; rejected.
- **Keep fake auth only:** explicitly superseded by the product-owner gate (BR-13); not an option.

**Trade-offs.**
- *Gain:* native Next.js fit, the `hd` gate, an identity-mapping seam, fast build, secrets-from-env discipline.
- *Give up:* token-refresh/remember-me machinery and RBAC hardening — **intentionally** deferred (`scope-boundary.v1.md`); minimal session handling only.

**Impact.** *Technical:* new auth dep, `/api/auth` handler, `proxy.ts` gate, seeded `IdentityMapping`. *Team:* a Google OAuth client (id/secret in env). *Business:* gates the app to NULogic and keeps PII out by design. *Risk:* if OAuth isn't wired by demo, the **role view-switcher fallback** keeps role journeys demoable (P6/P8).

**Evidence.** PRD §UC-6/6b, BR-13/13a/20, AC-14/15/24; current-state TD-AUTH-01..04; Next.js 16 `proxy.md` (middleware renamed) and async `cookies()`/`headers()` (`version-16.md`) verified in `node_modules/next/dist/docs/`.

---

## ADR-002 — Persistence: Prisma + SQLite, extending the existing starter schema

**Status:** Accepted

**Context.** A starter Prisma schema (SQLite, verified at `prisma/schema.prisma` this run) already exists with 6 models, `db:push` wired (`package.json:15`), and the client generated to `lib/generated/prisma`. The PRD needs profile reads/writes for the loop, the trust-state machine, catalog, plans, uploads, and identity mapping (current-state TD-DATA-01..06). Data volume is ~20–25 synthetic profiles. Production deployment/scaling is out of scope.

**Decision.** Keep **Prisma + SQLite** and **extend** the starter schema per Page 03 (do not replace it). Preserve the starter's `@@unique` keys (notably `EmployeeSkill @@unique([employeeId, skillId])` — the BR-18 single-record key). Continue using `db:push`; defer migration history (TD-DATA-06, acceptable for MVP).

**Rationale.**
- SQLite is a single disposable file — **zero infra**, instant re-seed, perfect for a hackathon demo (P8).
- Prisma gives type-safe reads/writes consumed by the repository layer, and the starter already wires generation + push.
- Extending (vs replacing) preserves the load-bearing unique key and the Practice-Lead self-relation, reducing risk.

**Alternatives Considered.**
- **Postgres (Docker/managed):** production-grade, real enums, but adds infra/setup against zero scaling benefit at this volume; rejected (P8).
- **In-memory / JSON files:** even simpler but loses query ergonomics and the unique-constraint guarantees the loop integrity depends on; rejected.
- **Replace the schema from scratch:** discards the verified starter and its keys for no gain; rejected (Artifact Preservation).

**Trade-offs.**
- *Gain:* zero infra, fast iteration, type safety, preserved invariants.
- *Give up:* native enums (SQLite stores role/state as strings — ordering enforced in app layer), concurrency/scale (irrelevant at demo size), migration history (deferred).

**Impact.** *Technical:* schema extensions (Page 03), repository functions, seed implementation. *Team:* `DATABASE_URL` from env (already in `.env.example`). *Risk:* low — disposable DB.

**Evidence.** `prisma/schema.prisma` (lines 9–11 sqlite, 59 unique key, 24–25 allocation/freeFrom), `prisma.config.ts`, `package.json:15`; current-state TD-DATA-01..06; PRD §7 dependencies.

---

## ADR-003 — Claude call patterns: one wrapper, Zod-before-write, model routing, prompt caching

**Status:** Accepted

**Context.** **All** intelligence must go through the Claude API with structured JSON validated before use (BR-09, NFR Reliability); no regex/keyword/hardcoded substitutes; awkward calls are stubbed with `TODO`, never faked. Token efficiency matters: Sonnet for routine, Opus for hard ranking, cache the profile dataset/system prompt (BR-12). `@anthropic-ai/sdk` and `zod` are installed but unused (current-state TD-AI-01/02). The matcher re-runs the same dataset across queries and twice in the loop.

**Decision.** Route every Claude call through **one client wrapper** that (1) selects the model (**Sonnet** default / **Opus** for staffing ranking), (2) assembles the prompt from named templates in **`src/prompts/`** with **prompt caching** applied to the system prompt + serialized profile dataset, (3) calls the SDK, (4) extracts the structured block, (5) **`safeParse`s with a per-call Zod schema** (`src/schemas/`), and (6) logs `requestId`/model/cache/validation outcome. A `safeParse` failure **or** sub-threshold confidence returns a typed failure and **writes nothing**.

**Rationale.**
- A single boundary makes BR-09 and P2 **architecturally enforceable** — there is exactly one place a model output can enter the system, and it cannot bypass Zod.
- Named templates keep long prompts out of business logic (P7) and make prompts reviewable/testable.
- Model routing + caching directly satisfy BR-12; caching the dataset is the biggest token lever for the matcher and the loop's before/after.
- A typed-failure return (not a throw) makes graceful degradation (AC-03/06/20) natural.

**Alternatives Considered.**
- **Inline SDK calls per feature:** scatters prompts and validation, invites a fake-logic shortcut, hard to enforce BR-09; rejected.
- **A generic LLM abstraction over multiple providers:** over-engineering for a single-provider hackathon; rejected (P8).
- **Skip Zod, trust the model:** violates P2/BR-02/BR-17 (would corrupt the DB and break the loop); rejected outright.

**Trade-offs.**
- *Gain:* one enforceable guardrail, token efficiency, graceful failure, reviewable prompts, observability.
- *Give up:* a little indirection vs inline calls — worth it for the guardrail.

**Impact.** *Technical:* `src/prompts/`, `src/schemas/`, the wrapper, model-id config. *Team:* `ANTHROPIC_API_KEY` from env. *Business:* lower token cost; reliable demo. *Risk:* if Claude is unreachable, the typed failure + "temporarily unavailable" UX keeps the app from crashing; the boundary may be stubbed with `TODO`.

**Evidence.** CLAUDE.md "Claude API usage" + non-negotiables; BR-09/BR-12; NFR Reliability/Cost/Observability; AC-03/06/20; `package.json:21,34` (sdk + zod installed, unused); current-state TD-AI-01/02.

---

## ADR-004 — File/upload handling: Route Handlers + content-hash idempotency + parse→confirm→write

**Status:** Accepted

**Context.** Certificates and resumes (PDF/doc/image) are uploaded and parsed by Claude (UC-1, UC-9). Constraints: never write on parse failure (BR-02/BR-17), **idempotent double-submit** (BR-19, AC-23), confirm-before-write (employee reviews extraction), and demo-only file storage (file-storage hardening explicitly out of scope). No upload handling exists today (TD-CERT-01, TD-RESUME-01, TD-DATA-05).

**Decision.** Handle uploads via **Route Handlers** (`/api/uploads/certificate`, `/api/uploads/resume`) using multipart. Compute a **content hash** per file; key idempotency on `(employeeId, contentHash)` so a re-submit returns the prior result without re-parsing (AC-23). Run **parse → Zod-validate → return extraction for user confirm → persist on confirm**. Store the file reference + `parsedJson` in `Certificate`/`Resume`; uploaded bytes live in demo-local storage only. Guard the submit affordance against double-click in the client (BR-19).

**Rationale.**
- Route Handlers (not Server Actions) are the right place for multipart streaming + size limits at the request edge (P9).
- The **parse→confirm→write** split makes "never write garbage" (P2) explicit and gives the employee the confirmation step the AC require (AC-01/19).
- Content-hash idempotency keeps the **loop's before/after comparison clean** — a double-submit can't create a duplicate promotion (P5).

**Alternatives Considered.**
- **Server Action with `FormData`:** viable for small files but mixes file edge concerns with mutations; the handler split is cleaner and keeps idempotency/streaming explicit; chosen handlers instead.
- **Direct write on parse (no confirm):** faster but violates the confirm step and risks writing low-confidence data; rejected.
- **External blob storage (S3/etc.):** out of scope; demo-local only.

**Trade-offs.**
- *Gain:* clean failure handling, idempotency, confirm step, loop integrity.
- *Give up:* durable/secure file storage (intentionally out of scope).

**Impact.** *Technical:* two Route Handlers, hash util, `contentHash` columns (Page 03). *Risk:* low; the confirm step + hash guard are the integrity backbone of the loop.

**Evidence.** PRD §UC-1/UC-9/§10; BR-02/17/19; AC-01/03/19/20/23; current-state TD-CERT-01/RESUME-01/DATA-05; Next.js 16 route handler conventions (`route.md`).

---

## ADR-005 — Synthetic-data strategy: seeded synthetic profiles + fixtures + synthetic-handle identity

**Status:** Accepted

**Context.** Org and project rules forbid any real PII in repo/DB/fixtures — **including for authenticated real Google users** (BR-10, AC-13, P3). The demo needs ~20–25 profiles with baseline skills, allocation, `freeFrom`; synthetic certs (`fixtures/certs/`) and resumes (`fixtures/resumes/`); and deterministic, testable auth on synthetic data (BR-13a, AC-14). Today the seed is a `TODO` stub and fixtures are absent (TD-SEED-01/02, TD-GUARD-01).

**Decision.** Implement a **synthetic seed generator** producing ~20–25 profiles (synthetic names/emails, baseline `origin=BASELINE` skills, allocation, `freeFrom`, seniority, timezone), a starter catalog (with `aiEnabled` set), and seeded **`IdentityMapping`** entries keyed by synthetic handles. Provide synthetic cert/resume fixtures spanning happy + edge (multi-skill, unusual issuer). Authenticated Google identities resolve to these synthetic profiles via the mapping; the real email is used only for the `hd` check and **discarded**. A **PII review gate** runs before any commit.

**Rationale.**
- Seeded, deterministic data makes the matcher, the loop, and **AC-14 deterministically testable** without touching real PII (P3).
- The synthetic-handle mapping is the mechanism that lets real auth coexist with the no-PII rule.
- Edge-spanning fixtures de-risk the cert/resume parse ACs (AC-02/19).

**Alternatives Considered.**
- **Anonymize real data:** risk of residual PII; forbidden (BR-10); rejected.
- **Map by real email:** would persist PII; violates BR-13a; rejected — handle-keyed mapping instead.
- **Generate fixtures at test time only:** loses demo-stable narrative; seed + committed synthetic fixtures preferred.

**Trade-offs.**
- *Gain:* zero PII risk, deterministic tests/demo, real-auth compatibility.
- *Give up:* realism of real resumes/certs — capped to synthetic fixtures intentionally (scope-creep guard).

**Impact.** *Technical:* `seed` script, `fixtures/`, `IdentityMapping` seed, review gate. *Business:* satisfies the non-negotiable PII rule. *Risk:* thin fixture variety weakens edge ACs — mitigated by seeding varied synthetic certs/resumes.

**Evidence.** CLAUDE.md non-negotiables; BR-10/13a; AC-13/14; NFR Security/Privacy; current-state TD-SEED-01/02, TD-GUARD-01, TD-AUTH-02; `.env.example` (placeholders only).

---

## ADR-006 — Single Next.js app (no service split); Next.js 16 conventions

**Status:** Accepted

**Context.** SkillSync is one app over one data store with one consumer (the browser). The team is small, the timeline is a hackathon, and the loop must be trivially demoable. Next.js 16 has breaking changes vs training-data assumptions (CLAUDE.md / AGENTS.md), verified in `node_modules/next/dist/docs/`.

**Decision.** Build a **single Next.js 16 App Router (RSC) application** — no microservices, no separate API tier, no message bus. Use **Server Actions** for mutations, **Route Handlers** for uploads + the OAuth callback, **RSC** for role-scoped reads, and **`proxy.ts`** for the session gate. Treat the Next.js 16 facts as binding: `middleware`→`proxy.ts`; `cookies()`/`headers()`/`params`/`searchParams` are **async-only**; Turbopack default; Node 20.9+, React 19.2.

**Rationale.**
- One app = one deployable, one mental model, fastest path to a working loop (P8).
- Server Actions + Route Handlers cover every mutation/upload need without a bespoke API layer.
- Honoring the Next.js 16 conventions prevents the most likely build breakage (training-data drift, P9).

**Alternatives Considered.**
- **Separate backend service (Node/Express, etc.):** network boundary, more wiring, zero benefit at this size; rejected.
- **Assume pre-16 conventions from memory (`middleware.ts`, sync `cookies()`):** would break under Next.js 16; rejected — verified the docs instead.

**Trade-offs.**
- *Gain:* simplicity, speed, single deployable, correct framework usage.
- *Give up:* independent scaling/deployment of modules (irrelevant for the demo).

**Impact.** *Technical:* module-based separation inside one app; `proxy.ts`; awaited dynamic APIs. *Risk:* low — aligned to verified docs.

**Evidence.** Next.js 16 `version-16.md` (async Request APIs breaking change; Turbopack default; Node 20.9+), `proxy.md` (middleware renamed); `package.json` (`next 16.2.6`, `react 19.2.4`); CLAUDE.md/AGENTS.md Next.js 16 warning.

---

## ADR-007 — Skill trust as a single promotable record (upsert + monotonic promotion)

**Status:** Accepted

**Context.** The hero loop's before/after comparison must operate on the **same** skill record: a cert upload promotes that record's trust state (raising matching weight), and a duplicated row would be the failure signature (BR-18, AC-07/22). Self-service add, manager approval, resume extraction, and cert verification all touch skills. The starter `EmployeeSkill` has only a flat `source` string and a `@@unique([employeeId, skillId])` key (verified, lines 49–60).

**Decision.** Model skill trust as a **single `trustState` field** on one `EmployeeSkill` row, written exclusively through an **upsert keyed by `(profileId, canonicalSkillId)`** with **monotonic promotion** (`self-reported → manager-approved → verified`; never demote, never duplicate). Skill identity for "is this the same skill?" is resolved by a **Claude `skill-identity` call** (BR-18/BR-06 discipline), not string equality. Re-assert at equal/lower trust is a no-op.

**Rationale.**
- This is the **data invariant the loop depends on** (P4) — one place enforces "one record, promotes in place."
- Reusing the starter's existing `@@unique` key means the invariant is also enforced at the DB level.
- Claude-driven identity resolution keeps de-dupe consistent with the catalog discipline (no regex; BR-09).
- A single write path means cert/self-service/approval/resume cannot diverge into duplicate rows.

**Alternatives Considered.**
- **One row per (skill, source/state) — append-only history:** would create duplicates the loop comparison forbids and complicate matching; rejected (violates BR-18/AC-22).
- **String-equality skill matching:** would split "TypeScript" self-reported from a "TypeScript" cert into two rows; rejected (BR-18 requires semantic identity via Claude).
- **A separate state-transition audit table:** approval-workflow sprawl, out of scope (`scope-boundary.v1.md`); rejected (P8).

**Trade-offs.**
- *Gain:* clean loop comparison, simple matching weight, enforced single identity.
- *Give up:* trust-state change history (not needed for MVP; promotion mutates in place).

**Impact.** *Technical:* `EmployeeSkill` gains `trustState`/`origin`/`promotedAt`; one repository upsert function; a Claude `skill-identity` call. *Business:* the hero loop works reliably. *Risk:* mis-resolved skill identity could mis-merge — mitigated by the confirm step before cert writes (ADR-004).

**Evidence.** BR-18/BR-15/BR-16; AC-07/17/18/22; `prisma/schema.prisma:49-60` (EmployeeSkill + unique key); current-state TD-DATA-01; Page 03 §3.

---

## Council / Deviation Notes
This is a greenfield hackathon MVP with local stub architecture-principles (`architecture-principles/README.md` — "no constraints beyond defaults for this learning run"). No NULogic architecture-council triggers (production data platform, multi-tenant, networking, compliance) apply at MVP scope; all deviations from defaults (SQLite over Postgres, string-enums, deferred migrations, demo-local file storage, minimal session handling) are **deliberate, scope-bounded** choices recorded above and in `scope-boundary.v1.md` Out-of-Scope.

## Cross-References
- **Page 01** — principles P1–P9 these ADRs realize.
- **Page 02** — the Claude wrapper (ADR-003), auth flow (ADR-001), upload flow (ADR-004), single-app shape (ADR-006).
- **Page 03** — the schema realizing ADR-002/005/007.
- **Page 04** — phasing that sequences these decisions.
