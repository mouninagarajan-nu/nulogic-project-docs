# SKILL-2 — Tactical ADRs (Deviation Scan)

**Jira:** SKILL-2 · **Iteration:** 2 (revision) · **Agent:** nulogic-implementation-planner
**Scanned against:** target-state architecture Pages 01-05 (`artifacts/03-architecture/target-state/`), strategic ADRs (ADR-001..007), authored acceptance tests (`artifacts/02-acceptance-tests/e2e-tests/cert-parsing.test.ts` + the in-repo injected-client doubles `tests/setup/test-helpers.ts`).
**Procedure:** adr-policy.md Deviation Scan — PASS 1 (standards-scannable) + PASS 2 (judgment-based). Greenfield hackathon MVP; architecture-principles are local stubs ("no constraints beyond defaults"); **no NULogic architecture-council triggers apply** (no production data platform, multi-tenant, networking, or compliance surface). All deviations below are scope-bounded, demo-pragmatic, and reconcile a tension between the **strategic architecture (Page 02 §2.5)** and the **already-authored acceptance tests / already-landed SKILL-1 foundation** — not departures from a standard.

**Iteration-2 re-scan note.** Iteration 1 produced two ADRs; the implementation-reviewer found TADR-S2-01 was **wrong on inspection of its own cited evidence** (F-01/F-02/F-05): it reshaped `CertParseResult` to `z.object({ skills:[{skill,level?,date?}], issuer?, confidence })`, which the binding acceptance-test payloads do **not** match — so `callClaude`'s direct `schema.safeParse(raw)` (`lib/ai/claude.ts:132`) would fail the happy/multi-skill cases and leave them RED. TADR-S2-01 is **re-derived from the real payloads** below (now SUPERSEDED→Proposed-v2). TADR-S2-02's core/transport factoring was confirmed sound (aligned with ADR-004); only its dependency on the broken schema and the over-scoped auth language are corrected.

**Result:** **2 tactical ADRs** (TADR-S2-01 *re-derived*, TADR-S2-02 *amended*). Both LOW impact, both non-blocking, both presented for user confirmation before the plan is built around them.

---

## The binding payloads (ground truth for TADR-S2-01)

`makeClaudeClientSpy(scriptedResponse)` (`tests/setup/test-helpers.ts:27-32`) returns `{ content:[{ type:"text", text: JSON.stringify(scriptedResponse) }] }`. `callClaude` (`lib/ai/claude.ts:117-132`) renders the prompt, invokes the injected client, `JSON.parse`s the text block, then runs `schema.safeParse(raw)` **directly on that parsed value** — there is no normalization step in the wrapper. Therefore the schema must validate **exactly** what the spy serializes:

| Authored case | `scriptedResponse` (verbatim) | Shape `safeParse` receives | Source |
|---|---|---|---|
| **AC-01 happy** | `{ skill:"AWS Certified Solutions Architect", issuer:"Amazon Web Services", date:"2026-05-01", level:"associate", confidence:0.96 }` | **flat single-skill object**; `confidence` **top-level** | `cert-parsing.test.ts:30-36` |
| **AC-02 multi** | `[ { skill:"Kubernetes", issuer:"CNCF", date:"2026-04-10", level:"intermediate", confidence:0.9 }, { skill:"Docker", issuer:"CNCF", date:null, level:null, confidence:0.88 } ]` | **top-level JSON array** of flat skill objects; **no top-level `confidence`**; second entry has `date:null, level:null` | `cert-parsing.test.ts:57-60` |
| (foundation reference) | `{ skill:"AWS SAA", confidence:0.96 }` | flat `{skill, confidence}` — validated by an **independent local** `CertLike = z.object({skill, confidence})` (`wrapper-gate.test.ts:29-32`), which does **not** import `CertParseResult` | `wrapper-gate.test.ts:46` |

The iteration-1 object schema (`z.object({ skills:[…], … })`) `safeParse`-fails BOTH the flat object and the array → `parseCertificate` returns `{ok:false}` → AC-01/AC-02 stay RED at `expect(parsed.ok).toBe(true)`. This is the defect F-01 caught.

---

## TADR-S2-01 — `CertParseResult` normalizes flat-object AND top-level-array into a canonical `{ skills[], confidence }` envelope

**Status:** Proposed (v2 — re-derived in iteration 2; supersedes the iteration-1 object-only shape)
**Trigger:** T-data-contract (schema/contract divergence between a landed artifact, the spec, and the binding tests).

**Context.**
- **Strategic spec — Page 02 §2.5** (verbatim): `CertParseResult { skills: [{ skill: string, level?: string }] (≥1; multi-skill, AC-02); issuer: string (REQUIRED); date?: string (TOP-LEVEL); confidence: number (0..1; gate below threshold ⇒ failure, AC-03) }`. (Note: §2.5 puts `date?` and a single `confidence` **top-level**, and `issuer` is **required** — see Divergence A below.)
- **Binding acceptance test** feeds the wrapper a **flat single-skill object** (AC-01) and a **top-level array of flat skill objects** (AC-02) — see "binding payloads" above. Each skill object carries its **own** `confidence`, `date`, `level`, and `issuer`; the array case has **no** top-level `confidence`. The test reads `parsed.skills[0]` as an object (`cert-parsing.test.ts:46,67`) and asserts `skills.length >= 2` for the array (`:68`).
- **Landed SKILL-1 foundation** created `CertParseResult` as `skills: z.array(z.string().min(1)).min(1)` + `issuer?` + `confidence` (`src/schemas/CertParseResult.ts:4-8`) — a placeholder string-array shape that matches none of the above.
- The SKILL-1 `parse-certificate` prompt emits singular `{ skill, confidence }` (`src/prompts/parse-certificate.ts:7`).

**Decision.**
Rework `CertParseResult` to a **`z.preprocess` normalizer wrapping a canonical envelope object**, so that ONE schema validates all three real shapes (flat object, top-level array, already-canonical envelope) and **always emits a top-level `confidence`** for the wrapper's confidence gate. Concretely:

```ts
// src/schemas/CertParseResult.ts
import { z } from "zod";

const CertSkill = z.object({
  skill: z.string().min(1),
  level: z.string().nullish(),   // optional AND nullable — AC-02 sends level:null
  date: z.string().nullish(),    // per-skill date (test shape); see Divergence A
  issuer: z.string().nullish(),  // per-skill issuer (test shape); see Divergence A
  confidence: z.number().min(0).max(1).optional(),
});

/** Normalize the raw Claude block — flat object | top-level array | envelope —
 *  into a canonical { skills[], issuer?, confidence } with a TOP-LEVEL confidence
 *  the callClaude gate (claude.ts:139-144) can read for BOTH single- and multi-skill. */
export const CertParseResult = z.preprocess((raw) => {
  // Case A: top-level array of skill objects (AC-02 multi-skill).
  if (Array.isArray(raw)) {
    const skills = raw;
    const confs = skills
      .map((s) => (s && typeof s === "object" ? (s as { confidence?: unknown }).confidence : undefined))
      .filter((c): c is number => typeof c === "number");
    return {
      skills,
      issuer: skills[0] && typeof skills[0] === "object" ? (skills[0] as { issuer?: unknown }).issuer : undefined,
      // Envelope confidence = MIN per-skill confidence (BR-02: the weakest skill governs the gate).
      confidence: confs.length ? Math.min(...confs) : undefined,
    };
  }
  // Case B: already-canonical envelope { skills:[...], confidence } — pass through.
  if (raw && typeof raw === "object" && Array.isArray((raw as { skills?: unknown }).skills)) {
    return raw;
  }
  // Case C: flat single-skill object (AC-01 happy path) — wrap into skills[].
  if (raw && typeof raw === "object") {
    const o = raw as { confidence?: unknown; issuer?: unknown };
    return { skills: [raw], issuer: o.issuer, confidence: o.confidence };
  }
  return raw; // non-object/array — let the inner object schema reject it (parse failure).
}, z.object({
  skills: z.array(CertSkill).min(1),
  issuer: z.string().nullish(),
  confidence: z.number().min(0).max(1),   // REQUIRED top-level — the gate scalar
}));

export type CertParseResult = z.infer<typeof CertParseResult>;
```

Rework the `parse-certificate` prompt body to instruct the model to emit the **canonical envelope** `{ skills:[{skill, level?, date?, issuer?, confidence?}], issuer, confidence }` (single JSON object, no prose) — the normalizer also accepts the array/flat shapes the synthetic spy uses, so the prompt and the test stay mutually consistent. The schema stays registered in `src/schemas/index.ts` (no barrel change).

**Multi-skill confidence semantics (resolves F-02).**
The wrapper's gate reads `parsed.data.confidence` as a single top-level scalar (`lib/ai/claude.ts:139-144`). For the AC-02 array (which carries **no** top-level confidence, only per-skill), the normalizer derives the envelope `confidence = min(per-skill confidence)`. Rationale: the BR-02 "low-confidence ⇒ write nothing" invariant is defined for the whole extraction as a unit, and taking the **minimum** means a single low-confidence skill drags the whole cert below the gate (conservative / safest for a verified write). For the flat object (AC-01) and the canonical envelope, `confidence` is taken as-is. The gate therefore fires deterministically for **both** single- and multi-skill payloads. (A per-skill drop-the-weak-entry policy was considered and rejected as out of scope for SKILL-2 — see Alternatives.)

**Divergence A from Page 02 §2.5 (honestly recorded — resolves F-05).**
§2.5 places `date?` **top-level** and a single `confidence` top-level, with `issuer` **required** and the per-skill object only `{skill, level?}`. The **binding authored test** instead sends `date`, `issuer`, and `confidence` **per skill** (and `null`-valued for the AC-02 second entry), and the array case has no top-level `issuer`/`confidence` at all. Per the evidence hierarchy (the acceptance tests are the artifact the test-creator turns green and the binding contract for this story), this plan follows the **test payloads** and therefore:
1. accepts `date`, `issuer`, `confidence` **per skill** (nullable-optional), and
2. makes top-level `issuer` **optional** (`nullish`) rather than required (the array payload has none),
3. derives the top-level `confidence` the §2.5 gate needs via the normalizer.
This is a **real divergence from §2.5**, not merely "aligning a SKILL-1 placeholder." It is justified because the strategic §2.5 is a *representative pseudo-schema* ("Representative shapes … generic types", Page 02 §2.5 preamble) while the authored test is the concrete, executable contract. The canonical envelope the normalizer emits is a **superset-compatible** view of §2.5 (it still has top-level `skills[]` + `confidence`; `issuer`/`date` simply also live per-skill), so downstream consumers expecting the §2.5 envelope still see `skills[]` + `confidence`.

**Rationale.**
- One schema validates all three real shapes; `callClaude`'s existing direct `safeParse` (`claude.ts:132`) needs **no** change. `z.preprocess` runs **before** the inner object validation, so `safeParse(raw)` on a flat object or array now succeeds and `parsed.ok===true` for AC-01/AC-02.
- `.nullish()` on `level`/`date`/`issuer` is required specifically because AC-02's second entry sends explicit `null` (`cert-parsing.test.ts:59`), not absent keys.
- Keeping a **required top-level `confidence`** on the inner object guarantees the gate always has a scalar to compare — the F-02 fix.

**Alternatives considered.**
- *Keep the string-array placeholder and map in the core* — rejected: cannot represent `level`/`date`, breaks the test's object access, contradicts §2.5 multi-skill.
- *Object-only schema `z.object({skills:[…]})` (iteration-1 decision)* — rejected: `safeParse`-fails the flat object AND the array the spy actually serializes (F-01); leaves AC-01/AC-02 RED.
- *Normalize inside `parseCertificate` and `safeParse` the normalized shape there (not via the registered schema)* — rejected: would mean `callClaude` no longer validates against `CertParseResult` for this prompt (the wrapper's safeParse would run against the raw shape and fail), splitting the validation gate; `z.preprocess` keeps the single-gate contract (ADR-003) intact.
- *Per-skill confidence gating (drop sub-threshold entries, keep the rest)* — rejected for SKILL-2: adds partial-success semantics not in any AC; min-confidence envelope is simpler and satisfies BR-02 conservatively.
- *Add a second schema instead of editing the slot* — rejected: duplicates the registered slot, violates "one schema per call" (ADR-003) and Reuse-over-Create.

**Trade-offs.** *Gain:* one schema validates the flat-object, array, and envelope shapes; the gate fires for single- and multi-skill; tests + spec reconciled. *Give up:* a `z.preprocess` wrapper (a few more LOC than a plain object) and a documented §2.5 divergence (per-skill `date`/`issuer`, optional top-level `issuer`).

**Impact.** *Technical:* `src/schemas/CertParseResult.ts` (EXTEND — replace body with the preprocess+envelope, ~28 LOC), `src/prompts/parse-certificate.ts` (EXTEND — multi-skill envelope instruction, ~10 LOC). *Risk:* LOW — the delta sweep (plan §12) found **no** existing product consumer of the old shape; the foundation `wrapper-gate` test uses an independent local `CertLike` schema (`wrapper-gate.test.ts:29-32`), not this export, so it is unaffected.

**Evidence.** Page 02 §2.5 (`02-service-design-api-contracts.md:182-187`); `cert-parsing.test.ts:30-36,46,57-60,67-68`; `tests/setup/test-helpers.ts:27-32`; `lib/ai/claude.ts:117-145`; `src/schemas/CertParseResult.ts:4-8`; `src/prompts/parse-certificate.ts:4-11`; `wrapper-gate.test.ts:29-32`; plan §12 delta sweep.

---

## TADR-S2-02 — Factor a cert-flow functional **core** that both the AC test and the ADR-004 transport call into

**Status:** Proposed (amended in iteration 2 — schema dependency corrected to TADR-S2-01 v2; auth language scoped to SKILL-2)
**Trigger:** T-transport/test-contract divergence (the authored test asserts a module API that differs from the strategic transport).

**Context.**
- ADR-004 / Page 02 §3.2 / §3.1 mandate the **transport**: a multipart **Route Handler** `POST /api/uploads/certificate` for upload+parse, and a **Server Action** `confirmCertExtraction({uploadId, confirmedSkills[]})` for the confirm+write ("uploads are handlers, mutations are actions", ADR-006/Next.js 16).
- The **authored acceptance test** imports a **functional module** `@/lib/cert/parse-certificate` exposing `parseCertificate({ file, claude })` and `confirmAndWriteSkill({ profileId, catalogItemId, skill })`, and asserts a **domain-flattened** result (`{ source:"certificate", state:"verified", verified:true }`, `itemStatus:"done"`) (`cert-parsing.test.ts:16-50`). It injects the Claude client under the key `claude` and does not import HTTP/Action transport.
- Persistence speaks UPPERCASE DB tokens + `Enrollment.status` (`prisma/schema.prisma`; `lib/domain/trust-state.ts`), not the test's lowercase `state`/`source`/`verified`/`itemStatus`.

**Decision.**
Implement a **single functional core** `lib/cert/parse-certificate.ts` exporting the exact API the authored test imports:
- `parseCertificate({ file, claude })` → `{ ok:true, skills } | { ok:false, userMessage }` — delegates parsing to `callClaude({ promptName:"parse-certificate", variables:{ text }, schema:CertParseResult, complexity:"routine", confidenceThreshold:CONFIDENCE_THRESHOLD, client: claude })`. On `Ok`, returns `{ ok:true, skills: data.skills }` (the normalized canonical `skills[]` from TADR-S2-01). On `Failure`, returns `{ ok:false, userMessage: CERT_FAILURE_MESSAGE }`. **File-handling contract (resolves F-07):** the single prompt variable is **`text`** (the name the prompt template already renders — `src/prompts/parse-certificate.ts:7`; the SUB-TASK-1 `fileRef` reference is reconciled to **`text`**). `parseCertificate` receives a `file: string` path and derives the `text` variable from it via a real, file-derived read — it MUST NOT fabricate or hardcode cert text (BR-09). Because the default SDK client stays stubbed (`defaultClientThrows`) and **tests inject the spy** (which never reads the file), the spy-driven tests exercise the schema/gate/write path only; the live `file → text` extraction (PDF/image → text or base64) is a deferred boundary that returns `Failure` for the live path until wired (TODO at the boundary), consistent with the BR-09 guardrail. See the new Wiring-Trace row tying `file → variables.text`.
- `confirmAndWriteSkill({ profileId, catalogItemId, skill })` → `{ skill:{ source:"certificate", state:"verified", verified:true }, itemStatus:"done" }` — delegates to `resolveCanonicalSkill(skill.skill, { client })` + `upsertAndPromoteSkill(profileId, canonicalSkillId, "verified", "certificate", "acquired")` + sets the linked `Enrollment.status="COMPLETED"`, translating to/from DB tokens via `lib/domain/trust-state.ts`.
- `confirmCertExtraction({ uploadId, confirmedSkills[] })` → `{ promotedSkills[] }` — the multi-skill orchestration (loads the `Certificate`, loops through `confirmAndWriteSkill`, idempotent on re-confirm).

Then the **strategic transport files are thin wrappers over the core** (transport + caller-scope only, no business logic):
- `app/api/uploads/certificate/route.ts` — `POST`: `request.formData()` → bytes → `contentHash` → idempotency fast path → `parseCertificate` → persist `Certificate` → `{ uploadId, extracted }`.
- `app/actions/cert.ts` — `"use server"` `confirmCertExtraction`: derive the caller's `employeeId` from a **caller-identity seam**, assert the upload belongs to the caller (own-profile), delegate to the core.

**Auth scope for SKILL-2 (resolves F-06).**
SKILL-2's ACs are AC-01/02/03/22/23 only; the auth layer (sessions, `cookies()`-based identity, `proxy.ts`, `IdentityMapping → session` resolution, AC-24 stale-session redirect) is owned by a later auth story (ADR-001) and **does not exist in the repo yet** (no `/api/auth`, no `proxy.ts`, no session). Therefore SKILL-2 does **not** implement `cookies()`/session re-derivation or the AC-24 stale-session redirect. Instead:
- The Server Action derives the caller's `employeeId` from an explicit **caller-identity seam** — a single function (e.g. `getCallerEmployeeId()`) with a `TODO(auth-story)` that, until the auth layer lands, resolves the caller deterministically (for the demo/tests, from the request/argument under test) and **defaults to denying cross-profile writes** (own-profile only). The action asserts `certificate.employeeId === callerEmployeeId` and rejects otherwise.
- `cookies()`, session re-derivation, `proxy.ts`, and the **AC-24 stale-session redirect are explicitly OUT OF SCOPE for SKILL-2** and deferred to the auth story. They are removed from this plan's in-scope mechanism set.
- The **testable authorization failure-condition** in SKILL-2 is concrete: a `confirmCertExtraction`/`confirmAndWriteSkill` call whose `profileId`/upload-owner ≠ the seam's caller identity is denied (no write). This is asserted at the core/action layer without needing a real session.

**Rationale.**
- This is the only design that satisfies **both** binding inputs at once: the authored acceptance tests (which the test-creator turns green) **and** the strategic transport (ADR-004/§3.1). The core holds the testable logic; the transport holds framework concerns. Standard hexagonal layering (SRP).
- Returning the **domain-flattened** object the test asserts (and translating to DB tokens internally) keeps the persistence contract (Page 03) intact while honoring the test's read shape — the `MISSING_IN_ARCH` reconciliation noted in plan §4.
- The schema the core passes to `callClaude` is now TADR-S2-01 **v2** (the normalizer), so the core's `parseCertificate` returns `parsed.ok===true` for the flat-object (AC-01) and array (AC-02) payloads — the dependency that iteration 1 got wrong.

**Alternatives considered.**
- *Put the logic in the Route Handler/Server Action and rewrite the authored test to call HTTP/Action* — rejected: the authored tests are an upstream artifact the test-creator consumes; rewriting them inverts the TDD contract and loses direct unit-level coverage.
- *Two separate cores (one per transport)* — rejected: duplicates the BR-18 write path, the exact divergence ADR-007 forbids.
- *Implement full session auth (cookies/proxy/AC-24) in SKILL-2* — rejected: out of SKILL-2's AC set, depends on an unbuilt auth layer (F-06); scoped to the caller-identity seam instead.

**Trade-offs.** *Gain:* both contracts satisfied; one tested write path; thin transport; no logic duplication; auth scoped to what SKILL-2 can build. *Give up:* three small files instead of two; a stubbed caller-identity seam (TODO) until the auth story lands.

**Impact.** *Technical:* `lib/cert/parse-certificate.ts` (NEW core), `app/api/uploads/certificate/route.ts` (NEW thin), `app/actions/cert.ts` (NEW thin, caller-identity seam). *Architecture:* consistent with ADR-004/006/007 — transport exactly as specified; only an internal core seam + a scoped auth seam are added. *Risk:* LOW.

**Evidence.** ADR-004; Page 02 §3.1/§3.2/§4.1; `cert-parsing.test.ts:16-50`; `lib/repos/skill.ts:49-160`; `lib/domain/trust-state.ts`; `prisma/schema.prisma:97-141`; `src/prompts/parse-certificate.ts:7`; SUB-TASK-1 FORMAT (`route.ts`, `fileRef`→`text` reconciliation), SUB-TASK-2 FORMAT (`app/actions/cert.ts`); TADR-S2-01 v2 (schema dependency).

---

## TADR-S2-03 — Cover `CertParseResult` z.preprocess normalizer branches via integration tests rather than isolated unit tests

**Status:** Proposed (added in iteration 3 — per G2-02 finding from test-reviewer)
**Trigger:** T-test-strategy (test-pyramid policy vs. integration-only normalizer coverage for a `z.preprocess` lambda).

**Context.**
- The `CertParseResult` schema (TADR-S2-01 v2, `src/schemas/CertParseResult.ts`) wraps a canonical object schema with a `z.preprocess` normalizer. The normalizer has **4 branches**: (A) top-level array of skill objects → wrap into envelope; (B) already-canonical envelope `{skills:[], …}` → pass through; (C) flat single-skill object → wrap into `skills[1]`; (D) non-object/non-array → let inner schema reject.
- The standard test-pyramid policy (`architecture-principles/testing.md`) prefers isolated unit tests for branching logic to maximize branch coverage at low cost.
- `callClaude` calls `schema.safeParse(raw)` **directly on the parsed JSON value** (`lib/ai/claude.ts:132`). The `z.preprocess` lambda is an internal Zod hook — it has no independently callable export, and extracting it to test in isolation would require either (a) duplicating the lambda outside the schema registration, violating ADR-003's "one schema per call" contract, or (b) reaching into Zod internals to invoke the preprocess step directly — a framework-internals anti-pattern.

**Decision.**
Cover all 4 normalizer branches **via integration tests** that invoke `parseCertificate` end-to-end with a real scripted Claude client spy:

| Normalizer branch | Covered by |
|---|---|
| Case A — top-level array (AC-02 multi-skill) | AC-02 tests: S2-P1-02, S2-P2-02, S2-P3-06 |
| Case B — already-canonical envelope (AC-23 idempotent / re-submit) | AC-23 tests: S2-P1-05, S2-P2-06 (second parse reuses the same shape) |
| Case C — flat single-skill object (AC-01 happy path) | AC-01 tests: S2-P1-01, S2-P2-01, S2-P3-06 |
| Case D — non-object/array → inner schema rejects | AC-03 garbled tests: S2-P1-03, S2-P1-03-sdk |

Every branch is exercised by a **real behavioral assertion** (not a structural tautology): Case A exercises `confidence=min(…)` derivation; Case B exercises idempotent re-submit; Case C exercises the flat-object parse path; Case D exercises the garbled-JSON failure path with a `userMessage` assertion.

**Rationale.**
- Isolated unit tests for the `z.preprocess` lambda would require accessing or duplicating the lambda outside its registered schema slot — a direct violation of ADR-003 ("one schema per call"; the schema is the contract, not its sub-components) and the "Refuse to ship" rule ("mocks from contract, not from scenario prose").
- Each integration test adds a real behavioral assertion that the unit tests cannot replicate: the spy serialization round-trip (`makeClaudeClientSpy` → `JSON.stringify` → `JSON.parse` → `safeParse`) is the actual code path that broke in iteration-1 (TADR-S2-01 F-01). Unit tests on the raw lambda would bypass this path and miss the class of defect that F-01 caught.
- `z.preprocess` runs synchronously inside `safeParse`; its 4 branches are simple guard clauses (Array.isArray, `.skills` check, `typeof === "object"`, fallthrough). The integration coverage is sufficient: every branch is hit by at least one scenario with a real behavioral assertion.

**Alternatives considered.**
- *Export the preprocess lambda separately and unit-test it* — rejected: duplicates the schema's registered slot (ADR-003 violation); creates a second testable surface that diverges from the deployed schema under changes.
- *Use Zod's internal `._def.preprocess` hook to invoke the lambda directly* — rejected: framework-internals testing is an anti-pattern; brittle under Zod version upgrades; the resulting tests would be structural (input→output of a pure function) not behavioral.
- *Add a thin normalizer wrapper function exported alongside the schema* — rejected: adds production LOC solely for testability with no behavioral value; the `z.preprocess` design keeps the normalizer co-located with the schema for maintainability.

**Trade-offs.** *Gain:* normalizer branch coverage without ADR-003 violations or framework-internals coupling; existing integration tests exercise every branch with real behavioral assertions. *Give up:* branch coverage is not isolated; a normalizer regression may appear as an AC-level failure rather than a narrowly-scoped unit failure.

**Impact.** *Technical:* no code changes — decision is test-strategy only. *Risk:* LOW.

**Evidence.** `src/schemas/CertParseResult.ts` (TADR-S2-01 v2 schema body); `lib/ai/claude.ts:132` (`safeParse(raw)` call site); `tests/cert-parsing.test.ts` (all AC-01/AC-02/AC-03/AC-23 scenarios); ADR-003; iteration-1 F-01 defect (array/flat-object safeParse failure).

---

## Deviations explicitly NOT raised (scan completeness)

| Candidate | Why it is NOT a deviation |
|---|---|
| Claude wrapper / Zod gate / model routing | Used exactly as ADR-003 specifies (`callClaude`, `route("routine")`→Sonnet). `z.preprocess` runs inside the same single `safeParse` gate — no new boundary. No deviation. |
| TS-002 de-dupe-failure fallback | Already implemented in SKILL-1 `resolveCanonicalSkill` (`lib/repos/skill.ts:49-103`); the plan reuses it verbatim. No deviation. |
| `@@unique([employeeId, contentHash])` idempotency | Used as ADR-004/TS-004 specifies. No deviation. |
| Default Claude client stubbed (`defaultClientThrows`) | Explicitly sanctioned by ADR-003 / BR-09 guardrail ("stub with TODO, never fake"). The deferred live `file→text` extraction follows the same guardrail. No deviation. |
| No feature flag | `release-strategy.md` default-false applies only when an upstream is pending; SKILL-1 is merged/deployed and the surface is additive. Documented in plan §10, not an ADR. |
| `CONFIDENCE_THRESHOLD` env-configurable | Matches the STORY assumption ("configurable + documented") and the config-externalization standard. No deviation. |
| Caller-identity seam (scoped auth) | Not a deviation but a **scope boundary**: the auth layer is a later story (ADR-001); SKILL-2 stubs the seam (own-profile deny-by-default) and defers cookies/proxy/AC-24. Documented in TADR-S2-02 Auth Scope. |

---

**Generated by:** nulogic-implementation-planner · **Version:** 2.2
