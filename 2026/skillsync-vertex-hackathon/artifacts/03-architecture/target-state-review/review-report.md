# Architecture Review Report — Target State (Iteration 1)

**Initiative:** `skillsync-vertex-hackathon` · **Agent:** `nulogic-arch-reviewer` · **Stage:** 03-architecture / target-state-review
**Scope:** target-state (current-state used as reference only) · **Mode:** clean-slate, full review
**Reviewed:** 2026-06-05 · **Branding:** NULogic · **Data:** Synthetic only — no real PII

---

## 0. Standards-availability caveat (read first)

The agent's standard inputs — `architecture-principles/*.md`, `adr-policy.md` (T1–T23 ADR triggers), and `arch-council-policy.md` (C-triggers) — **are not present in this environment** (verified by glob across `~/.claude/` and the project-docs tree; only `architecture-principles/README.md` stubs are referenced by the artifacts, and even those are not on disk here). Per the agent's Error Handling table this is normally a `blocked` condition. However, the task is explicit and self-contained, so the review **proceeds** against the *effective* standards baseline available in-repo:

- **CLAUDE.md non-negotiables** (Claude-only intelligence; synthetic-data/no-PII; NULogic branding; Next.js 16 caution).
- **NULogic org instructions** (data protection / no real secrets; synthetic data default; NULogic branding).
- **Current-state `03-tech-stack.md`** as the de-facto approved-stack baseline (the artifacts themselves note there is "no approved-stack catalogue to diff against").
- **Council-trigger heuristics** named in the task (new patterns, new tech stack, vendor lock-in — e.g. Auth.js, Anthropic SDK).

Two findings below (TS-007 council flag, and the general inability to clear ADR-policy trigger numbering) are a **direct consequence of this caveat**, not of the architecture. Re-run with real standards files to fully clear them.

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Pages reviewed | 5 (01 overview, 02 service/API, 03 data model, 04 roadmap, 05 ADRs) + current-state gap analysis (reference) |
| RED (must fix) | 0 |
| YELLOW (needs action) | 4 |
| GREEN (compliant, noted) | — (the bulk of the design) |
| CONSTRAINT (data-integrity / no-PII audit) | 0 violations |
| PRD mismatches | 0 |
| Phase violations | 0 |
| Council review required | **Yes (soft)** — 1 flag (Auth.js third-party auth dependency) |
| **next_stage_ready** | **true** (no RED, ≤5 YELLOW; YELLOWs are non-blocking and addressable in Phase 1; council reviews in parallel) |

**Verdict.** This is a **high-quality, well-traced target-state architecture**. All 32 current-state gaps and all 27 acceptance criteria are addressed and mapped to phases. The principles (P1–P9) are coherent and traced into every page; the hero-loop invariant (BR-18 single-record promotion) is correctly identified as the load-bearing data decision and is consistently realized across pages 01→02→03→05/ADR-007. The Claude-only-intelligence and synthetic-data/no-PII constraints are not just honored but made *architecturally enforceable* (single Claude wrapper + Zod gate; synthetic-handle identity mapping discarding real email). Next.js 16 breaking-change facts (`middleware`→`proxy.ts`, async Request APIs) were verified against `node_modules/next/dist/docs/` and the cited doc files **exist** (`proxy.md` confirmed). The findings are refinements, not blockers.

---

## 2. Flag Summary

| ID | Severity | Sub-state / Type | Area | Page | One-liner |
|---|---|---|---|---|---|
| TS-001 | YELLOW | Needs ADR / data-correctness | BR-18 single-record invariant | 03 §1, §3.2, §6.1 | The `@@unique([employeeId, skillId])` key only enforces single-record IF `skillId` always resolves to ONE canonical `Skill.id`; schema doesn't enforce canonical-Skill collapse (no unique `canonicalKey`, no defined Skill→canonical mapping). |
| TS-002 | YELLOW | Needs decision | Skill-identity Claude call on the hero path | 02 §4.1, 03 §3.2 | `resolveCanonicalSkill` is a **Claude call inside the cert-confirm write path** — a P0 loop step now has an extra synchronous model dependency with no specified failure/fallback behavior. |
| TS-003 | YELLOW | Needs clarification | `runMatch` transport ambiguity | 02 §3.1 | `runMatch` is listed as a Server Action but annotated "may be an action or a handler"; the contract is left undecided, and matcher reads should not be a mutation. |
| TS-004 | YELLOW | Needs ADR reference | Idempotency key strength for cert/resume | 02 §3.2, 03 §6.1, ADR-004 | Idempotency keyed on `(employeeId, contentHash)` but neither `Certificate.contentHash` nor `Resume.contentHash` is declared `@unique`/`@@unique` in the data model — relies on app-layer check only; a race/double-submit can still double-insert. |

> ADR-policy trigger citations (e.g. "T-NN") could not be attached to the YELLOWs because `adr-policy.md` is absent (see §0). Each YELLOW instead names the deviation and the corrective action.

---

## 3. Council Flags

| Trigger (heuristic) | Title | Description | Location | Rationale |
|---|---|---|---|---|
| New tech stack / third-party dependency / potential vendor lock-in | **Auth.js (NextAuth) adoption for real OAuth** | ADR-001 introduces Auth.js (NextAuth) + Google OIDC as a **net-new third-party auth dependency** not present in the current-state tech stack. The current-state explicitly records "Auth: none … missing entirely." Real authentication is a security-boundary decision and a new vendor/library on the stack. | Page 02 §3.2 (`/api/auth/[...]`), Page 05 ADR-001 | The task explicitly names Auth.js as a council trigger to detect. Introducing a new auth library + an external IdP (Google OAuth) is a tech-stack + vendor decision that, under NULogic council policy, normally warrants council visibility. ADR-001 is well-reasoned (alternatives Clerk/Auth0/hand-rolled considered; no-PII preserved), so this is a **soft** flag for parallel council awareness, not a stop. |

**Anthropic SDK note:** `@anthropic-ai/sdk` is *not* flagged — it is mandated by CLAUDE.md non-negotiables and already installed in the current-state stack (pre-approved by project policy), so it is not a *new* decision.

**Council approval status:** pending (soft). Domain-architect soft-approval lets work proceed; council reviews ADR-001 in parallel. The artifacts' own "Council / Deviation Notes" (Page 05) assert no triggers apply because principles are a local stub — that self-clearance is reasonable for a learning run but cannot be independently confirmed without the real `arch-council-policy.md` (see §0); hence the flag is raised for visibility.

---

## 4. Section-by-Section Findings

### 4.0 PRD compliance & traceability — VERIFIED
- **All 27 ACs mapped to phases** (Page 04 §4 table, AC-01..AC-27). No unmapped requirement; no terminology drift (trust states, `freeFrom`/allocation, AI-enabled, endorsed, synthetic-handle all used consistently with intent artifacts).
- **All 32 gaps referenced:** TD-SEED-01/02, TD-DATA-01..06, TD-AI-01/02, TD-CERT-01, TD-MATCH-01, TD-LOOP-01, TD-PROFILE-01, TD-RESUME-01, TD-APPROVE-01, TD-PLAN-01, TD-CAT-01/02, TD-PROG-01, TD-AUTH-01..04, TD-ROLE-01, TD-ADMIN-01, TD-UI-01/02/03, TD-TEST-01, TD-GUARD-01, TD-DOC-01. (TD-DATA-06 handled in Page 03 §6 "migration history deferred"; TD-DOC-01 reconciled in Phase 8.) **Coverage = 32/32.**
- **Capability→UC→BR→AC map** (Page 01 §5) is internally consistent with `acceptance-criteria.v1.json`'s coverage_matrix.

### 4.1 Data Constraints audit (CONSTRAINT) — 0 violations
- No invented metrics, fictional SLAs, or made-up telemetry. Performance NFRs are correctly stated as "demo-acceptable / interactive," and the current-state page explicitly records Dynatrace unavailable / metrics to-be-defined. The roadmap risk quadrant uses **illustrative** likelihood/impact coordinates for a qualitative chart — acceptable (not presented as measured data).
- **No-PII by design** (Page 03 §5) is sound: real email used only for the `hd` check then discarded; `IdentityMapping` keyed by an opaque synthetic handle derived from OIDC `sub`; only synthetic `Employee` rows persisted. This satisfies BR-10/BR-13a/AC-13/P3.
- **Synthetic data + secrets-from-env** consistent across pages; `.env.example` placeholder discipline noted; OAuth env vars flagged as a Phase-7 addition (matches TD-AUTH-04).

### 4.2 Business logic & the BR-18 hero invariant
- **GREEN (strong):** The trust-state machine (Page 03 §3) is correct — monotonic promotion `SELF_REPORTED < MANAGER_APPROVED < VERIFIED`, no-demote, no-op on equal/lower, ordering enforced in repository layer (SQLite has no enums). The state diagram, the `upsertAndPromoteSkill` pseudo-code, and ADR-007 all agree. This directly underpins AC-07/AC-22 and the hero loop, and is the single best-executed part of the design.
- **YELLOW — TS-001 (data-model correctness):** The data model claims the existing `EmployeeSkill @@unique([employeeId, skillId])` *is* the BR-18 single-record key (Page 03 §1 "this *is* the BR-18 single-record key," §6.1). **That is only true conditionally** — it prevents duplicates *per `skillId`*, but the BR-18 requirement is "one record per *semantic* skill." The de-dupe relies on `resolveCanonicalSkill` (Claude `skill-identity`) collapsing variants ("TypeScript" vs "TS") to one `Skill.id`. The verified starter schema has **`Skill.name @unique` only** (line 42) and **no `canonicalKey`** today; Page 03 adds `canonicalKey` but does **not** mark it `@unique` nor define the rule that forces a semantic match to reuse an existing `Skill.id` rather than insert a new `Skill` row. If two `Skill` rows for the same concept exist, `@@unique([employeeId, skillId])` will **not** stop two `EmployeeSkill` rows — the exact hero-loop "duplicate row" failure signature P4 exists to prevent. **Action:** make `Skill.canonicalKey @unique` (or have `resolveCanonicalSkill` upsert the canonical `Skill` by `canonicalKey` and always return that id), and restate §1/§6.1 so the invariant is "single-record per *canonical* skill" — the `@@unique` key is necessary but not sufficient on its own.
- **YELLOW — TS-002 (extra model dependency on the P0 write path):** Per Page 02 §4.1, `confirmCertExtraction` calls the Claude `skill-identity` de-dupe **synchronously inside the cert write path**. This adds a second model call (beyond the parse) to the most-protected loop step, with **no specified behavior if `skill-identity` fails or is unreachable** (the parse path has an explicit failure UX; the identity call does not). Risk: the loop's promote step could hang or error after a successful parse+confirm. **Action:** specify the `skill-identity` failure fallback on the write path (e.g. deterministic `canonicalKey` normalization as the *persistence* key with Claude used only to *suggest* merges, or treat identity-call failure as "create-as-new and reconcile later") so a single P0 step doesn't depend on two live model calls. Note this composes with TS-001.

### 4.3 API completeness
- **GREEN:** Server Actions (8) + Route Handlers (3) cover every mutation/upload/auth need; each action lists auth scope, I/O, and key rules traced to ACs. Per-capability sequence diagrams (cert, match, loop, resume, catalog, approval/plan, auth) are complete and consistent with the schemas in §2.5.
- **YELLOW — TS-003:** `runMatch` (Page 02 §3.1) is in the **Server Actions (mutations)** table yet annotated "**may be an action or a handler**." A staffing search is a *read*, not a mutation, and leaving the transport undecided is an open contract on a P0 capability. **Action:** decide and document (recommend an RSC data function or a `GET` Route Handler / read-only action) and move it out of the mutations table; this also affects caching/idempotency reasoning.
- **YELLOW — TS-004:** Idempotency (ADR-004, Page 02 §3.2, Page 03 §6.1) is keyed on `(employeeId, contentHash)` and is described as the integrity backbone of the loop, but the data model **does not declare a DB uniqueness constraint** on `contentHash` (no `@@unique([employeeId, contentHash])` on `Certificate`/`Resume`). It relies solely on an app-layer "seen before?" check, which is racy under genuine double-submit. **Action:** add `@@unique([employeeId, contentHash])` to `Certificate` and `Resume` so idempotency (AC-23) is DB-enforced, matching the rigor applied to the BR-18 key.

### 4.4 Technical components & tech-stack compliance
- **GREEN:** Next.js 16 / React 19.2 / Prisma+SQLite / Zod / Vitest / shadcn all match the current-state installed stack. Next.js 16 facts (`proxy.ts`, async `cookies()`/`headers()`/`params`/`searchParams`, Turbopack default, Node 20.9+) are correctly stated and the cited docs **exist on disk** (`node_modules/next/dist/docs/.../proxy.md` confirmed) — evidence VERIFIED.
- **YELLOW→Council (TS-007 → §3):** Auth.js (NextAuth) is the one genuinely new stack addition; see Council Flags. Not in the current-state stack; introduced by ADR-001 with sound justification. Flagged for council visibility under the new-tech / vendor-lock heuristic, **not** as a RED (it is well-reasoned and the alternative SaaS options that *would* store PII were correctly rejected).
- **Migration history deferred** (TD-DATA-06, `db:push` only) — correctly called out as accepted low-severity operational debt for a hackathon; no flag.

### 4.5 Roadmap / migration realism (hackathon)
- **GREEN:** 8 phases, risk-first, critical path `P1→P2→P3→P4` is acyclic; Phases 5/7 parallelize off P1; Phase 8 gates last. Honors the CLAUDE.md de-risked build order and the "protect the loop, freeze ~Day 6–7" mandate. T-shirt sizing only, no calendar dates (correct). All P0 ACs land in Phases 1–4 (+ AC-15 in 7). DoD per phase requires Zod-before-write, zero PII, evidence-not-assertion, typecheck+lint clean — matches CLAUDE.md.
- Minor (non-flag) observation: Phase 7 (Auth & Roles) carries P0 **AC-15** (non-NULogic rejection) while being sequenced *after* the loop. This is defensible (view-switcher fallback keeps the demo alive if auth slips) and is explicitly mitigated in the risk register; noted, not flagged.

### 4.6 ADR justifications
- **GREEN:** All 7 ADRs follow the full template (Status/Context/Decision/Rationale/Alternatives/Trade-offs/Impact/Evidence) with real alternatives and honest trade-offs. No **phantom ADR references** — every ADR cited cross-page (ADR-001..007) exists. Evidence citations to `prisma/schema.prisma` lines and Next.js docs were spot-checked and are accurate (schema `@@unique([employeeId, skillId])` at line 59; `proxy.md` present).
- ADR-007 (single promotable record) is the strongest; its only soft gap is the canonical-Skill collapse already captured in TS-001.

### 4.7 Principle compliance (P1–P9)
All nine principles are traced and honored. P1 (Claude-only) and P2 (validate-before-write) are made *enforceable* via the single wrapper + Zod gate (no fake-logic escape hatch; awkward calls stubbed with `TODO` returning typed failure — matches BR-09). P3 (no-PII) is enforced by the identity-mapping design. P4 (single record) is realized but carries the TS-001/TS-002 refinements. P5–P9 compliant.

---

## 5. Evidence Traceability (spot-checks)

- **Claimed (P03 §1, ADR-002/007):** starter `EmployeeSkill @@unique([employeeId, skillId])` exists. **Evidence:** `ai-nu-skillsync/prisma/schema.prisma:59`. **Verdict:** VERIFIED.
- **Claimed (P03 §1):** `Skill.name @unique`, no `canonicalKey` today. **Evidence:** `schema.prisma:42` (unique name), no canonicalKey field present. **Verdict:** VERIFIED (supports TS-001).
- **Claimed (P03 §4.6):** no `Certificate.contentHash` today. **Evidence:** `schema.prisma:89-97` (no contentHash). **Verdict:** VERIFIED (net-new; supports TS-004).
- **Claimed (P01 P9 / P02 / ADR-001/006):** Next.js 16 renames middleware→`proxy.ts`. **Evidence:** `ai-nu-skillsync/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` exists. **Verdict:** VERIFIED.
- **Claimed (P04 §4):** all 27 ACs mapped. **Evidence:** Page 04 §4 table rows AC-01..AC-27 vs `acceptance-criteria.v1.json`. **Verdict:** VERIFIED.
- **Claimed (current-state):** 32 gaps. **Evidence:** `current-state/04-gap-analysis-modernization.md` §3 ("Total 32") vs Page 04 phase gap lists. **Verdict:** VERIFIED — 32/32 referenced.

---

## 6. Corrections (proposed — non-blocking)

1. **TS-001:** In Page 03, mark `Skill.canonicalKey @unique` (or specify `resolveCanonicalSkill` always upserts/returns the canonical `Skill.id` by `canonicalKey`); reword §1/§6.1 from "`@@unique([employeeId, skillId])` *is* the BR-18 key" to "…is the single-record key **once `skillId` is resolved to the canonical Skill**."
2. **TS-002:** In Page 02 §4.1 (and ADR-007 Impact), specify the `skill-identity` call's failure behavior on the write path so a P0 promote step does not silently depend on a second live model call.
3. **TS-003:** Decide `runMatch` transport (read, not mutation); move out of the Server Actions mutations table and state the chosen handler/RSC form.
4. **TS-004:** Add `@@unique([employeeId, contentHash])` to `Certificate` and `Resume` in Page 03 so AC-23 idempotency is DB-enforced, not app-layer only.
5. **(Caveat-driven)** Re-run this review with the real `architecture-principles/`, `adr-policy.md`, and `arch-council-policy.md` to attach ADR-trigger numbers to the YELLOWs and to definitively clear/confirm the Auth.js council flag.

---

## 7. Gate Decision

- RED = 0, YELLOW = 4 (≤5), CONSTRAINT violations = 0, PRD mismatches = 0, phase violations = 0.
- Per the agent gate logic: no RED and ≤5 YELLOW ⇒ **`next_stage_ready: true`**. The 4 YELLOWs are refinements addressable during Phase 1 (schema) / Phase 2 (cert path) and do not block downstream Jira story creation.
- Council: 1 **soft** flag (Auth.js). `council_review_required: true`, `council_approval_status: pending` — domain-architect soft-approval allows work to proceed while council reviews ADR-001 in parallel.
