# Target State — Page 03: Data Model

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 03-architecture / target-state · **Version:** v1
**Mode:** TARGET-STATE · **Classification:** GREENFIELD · **Evidence:** `direct_scan`
**Branding:** NULogic. **Data:** Synthetic only — no real PII in repo, DB, or fixtures.
**Zero-code policy:** Mermaid + generic pseudo-schema only. The Prisma DSL fragments below are **schema design intent**, not final code.

> **What this page is.** The target Prisma/SQLite data model. It **extends the existing starter schema** (`prisma/schema.prisma`, verified this run) rather than replacing it, and adds exactly what the PRD/business-rules require: the **skill trust-state machine on a single promotable record**, **catalog `aiEnabled`/`endorsed`/enrichment** signals, the **UpskillingPlan**, the **Resume** model, **upload idempotency**, profile fields for matching, and the **OAuth-identity→synthetic-profile mapping table (no real PII)**.

> **SQLite constraint (verified in starter, line 2).** SQLite has no native enums; role/state/status/source are stored as **Strings with documented value sets**. This is intentional and demo-pragmatic (P8); promotion ordering is enforced in the repository layer, not the DB.

---

## 1. Starter Schema — What Exists Today (verified)

From `prisma/schema.prisma` (read this run): generator outputs the client to `../lib/generated/prisma`; datasource is `sqlite`. Six models exist: `Employee`, `Skill`, `EmployeeSkill`, `CatalogItem`, `Enrollment`, `Certificate`.

| Starter model | Keep | Extend | Gap (current-state) |
|---|---|---|---|
| `Employee` | ✓ | + `timezone`, `seniority`, identity relation | TD-DATA-04 |
| `Skill` | ✓ | + `canonicalKey @unique` (forces one canonical Skill per concept) for semantic de-dupe | TD-DATA-01 |
| `EmployeeSkill` | ✓ | **+ `trustState`, `origin` (baseline vs acquired)** — the core change | TD-DATA-01 |
| `CatalogItem` | ✓ | **+ `aiEnabled`, `endorsed`, `enrichmentPending`, typed enrichment fields** | TD-DATA-03 |
| `Enrollment` | ✓ | role in plan (link to `UpskillingPlan`) | TD-PLAN-01 |
| `Certificate` | ✓ | **+ `contentHash` (idempotency)** | TD-DATA-05 |
| — | — | **New:** `Resume`, `UpskillingPlan`, `PlanItem`, `IdentityMapping` | TD-DATA-02, TD-AUTH-02 |

**Preserved invariants from the starter:** `Skill.name @unique`, `EmployeeSkill @@unique([employeeId, skillId])`, `Enrollment @@unique([employeeId, catalogItemId])`, Practice-Lead self-relation (`leadId`/`team`).

> **BR-18 single-record key — precise statement (TS-001).** The BR-18 invariant is **one `EmployeeSkill` row per profile per *canonical* skill**. The starter `EmployeeSkill @@unique([employeeId, skillId])` is **necessary but NOT sufficient** on its own: it only prevents duplicate rows for the *same `skillId`*. Two distinct `Skill` rows for the same concept (e.g. `"TypeScript"` and `"TS"`) would each satisfy that key and yield two `EmployeeSkill` rows — the exact hero-loop duplicate-row failure signature (P4/AC-22). The invariant therefore requires **two cooperating constraints**: (1) `Skill.canonicalKey @unique` collapses every spelling/alias of a concept to **one** canonical `Skill.id`; (2) `EmployeeSkill @@unique([employeeId, skillId])` then guarantees one promotable row per profile for that canonical skill. The write path (§3.2) MUST resolve any incoming skill name to the canonical `Skill.id` **before** the `EmployeeSkill` upsert — see §3.4.

---

## 2. Target Entity-Relationship Model

```mermaid
erDiagram
    Employee ||--o{ EmployeeSkill : has
    Employee ||--o{ Enrollment : tracks
    Employee ||--o{ Certificate : uploads
    Employee ||--o{ Resume : uploads
    Employee ||--o| UpskillingPlan : owns
    Employee ||--o{ Employee : "leads (team)"
    Employee ||--o| IdentityMapping : "resolved by"
    Skill ||--o{ EmployeeSkill : "instance of"
    CatalogItem ||--o{ Enrollment : "enrolled via"
    CatalogItem ||--o{ PlanItem : "chosen in"
    UpskillingPlan ||--o{ PlanItem : contains

    Employee {
        string id PK
        string name "synthetic only"
        string email UK "synthetic only"
        string role "ADMIN|MANAGER|PRACTICE_LEAD|EMPLOYEE"
        string title
        string practice
        string seniority "NEW: JUNIOR|MID|SENIOR"
        string timezone "NEW: e.g. IST (AC-04)"
        int allocation "0-100"
        datetime freeFrom
        string leadId FK
    }
    Skill {
        string id PK
        string name UK
        string canonicalKey UK "NEW: @unique — enforces single canonical Skill (TS-001)"
        string category "Claude-assigned"
    }
    EmployeeSkill {
        string id PK
        string employeeId FK
        string skillId FK
        int proficiency "1-5"
        string trustState "NEW: SELF_REPORTED|MANAGER_APPROVED|VERIFIED"
        string origin "NEW: BASELINE|ACQUIRED"
        string source "SELF|CERTIFICATE|RESUME|CATALOG"
        datetime promotedAt "NEW"
    }
    CatalogItem {
        string id PK
        string name
        string provider
        string kind "CERT|COURSE"
        boolean aiEnabled "NEW: BR-11 gate"
        boolean endorsed "NEW: BR-22"
        boolean enrichmentPending "NEW: BR-07"
        string description "NEW"
        string typicalDuration "NEW"
        string tagsJson "skillArea/level/roleRelevance"
    }
    UpskillingPlan {
        string id PK
        string employeeId FK UK
        string status "DRAFT|FINALIZED"
        datetime finalizedAt
    }
    PlanItem {
        string id PK
        string planId FK
        string catalogItemId FK
    }
    Certificate {
        string id PK
        string employeeId FK
        string fileName
        string contentHash "NEW: @@unique([employeeId,contentHash]) — DB-enforced idempotency (BR-19/TS-004)"
        string rawText
        string parsedJson "Zod-validated extraction"
        datetime uploadedAt
    }
    Resume {
        string id PK
        string employeeId FK
        string fileName
        string contentHash "NEW: @@unique([employeeId,contentHash]) — DB-enforced idempotency (TS-004)"
        string parsedJson "Zod-validated extraction"
        datetime uploadedAt
    }
    IdentityMapping {
        string id PK
        string syntheticHandle UK "NOT real email/PII (BR-13a)"
        string employeeId FK
    }
```

---

## 3. The Skill Trust-State Machine (BR-18 — the core design)

This is the single most important data decision. A skill on a profile is **one row** (`EmployeeSkill`) whose `trustState` field **monotonically promotes** and **never duplicates**.

### 3.1 State machine

```mermaid
stateDiagram-v2
    [*] --> SELF_REPORTED: employee adds / resume extract (source=SELF|RESUME)
    SELF_REPORTED --> MANAGER_APPROVED: manager with authority approves (AC-18)
    SELF_REPORTED --> VERIFIED: certificate parsed for this skill (AC-01)
    MANAGER_APPROVED --> VERIFIED: certificate parsed for this skill (AC-22)
    VERIFIED --> VERIFIED: re-assert (no-op)
    MANAGER_APPROVED --> MANAGER_APPROVED: re-approve (no-op)
    SELF_REPORTED --> SELF_REPORTED: re-add (no-op)
    note right of VERIFIED
        Highest trust. Never demotes.
        Matching weight: VERIFIED > MANAGER_APPROVED > SELF_REPORTED
    end note
```

**Ordering (enforced in repository layer, not DB):** `SELF_REPORTED(1) < MANAGER_APPROVED(2) < VERIFIED(3)`.

### 3.2 The upsert+promote write path (the one path all skill writes use)

```text
function upsertAndPromoteSkill(profileId, skillNameOrId, targetState, source, origin):
    canonicalSkillId = resolveCanonicalSkill(skillNameOrId)   // resolves to ONE canonical Skill.id; see §3.4 (Claude-assisted, deterministic fallback)
    existing = find EmployeeSkill by (profileId, canonicalSkillId)   // the @@unique key
    if existing is null:
        insert EmployeeSkill(profileId, canonicalSkillId, trustState=targetState, source, origin)
    else:
        if order(targetState) > order(existing.trustState):
            update existing.trustState = targetState   // PROMOTE same row; set promotedAt
        else:
            no-op   // equal-or-lower never demotes (AC-22)
    return the single canonical record
```

**Why this satisfies the AC:**
- **AC-22** — re-asserting at equal/lower trust is a no-op; higher trust promotes the same row; never a duplicate.
- **AC-07 (hero)** — the loop's before/after compares this same row; cert upload promotes `→ VERIFIED`, raising matching weight.
- **AC-17/18/01** — self-service add, manager approval, and cert verify are all the same call with different `targetState`.
- Identity resolution (`resolveCanonicalSkill`) is a **Claude call** (BR-18/BR-06 discipline) so "TypeScript" self-reported and a "TypeScript" certificate converge to one record — no regex.

### 3.3 Baseline vs acquired (BR-16 / AC-16)
`origin` distinguishes `BASELINE` (skills held before upskilling; seeded or self-reported/resume-derived) from `ACQUIRED` (gained via the tracker/cert). This lets the profile and the demo show capability growth, and lets matching reason over baseline skills + availability (AC-16, P0).

### 3.4 Canonical skill resolution + de-dupe failure fallback (TS-001 / TS-002)

`resolveCanonicalSkill` is the single function that turns any incoming skill string (from cert confirm, resume, self-service, or approval) into exactly **one** canonical `Skill.id`. It is the de-dupe seam that protects the BR-18 invariant. Two things matter for the P0 hero write path: (a) it must always converge aliases to one row (TS-001), and (b) a **Claude de-dupe failure must never block or corrupt the verified write** (TS-002).

**Two-layer resolution — deterministic key first, Claude as the merge advisor:**

```text
function resolveCanonicalSkill(rawSkillName):
    // LAYER 1 (deterministic, always runs — never depends on a model call):
    key = deterministicCanonicalKey(rawSkillName)   // case/whitespace/punctuation-normalized; NOT semantic matching of meaning, just a stable key
    existing = find Skill by canonicalKey == key      // @unique lookup
    if existing: return existing.id                   // alias already collapsed → reuse the one canonical Skill

    // LAYER 2 (Claude skill-identity — semantic merge advice, BR-18/BR-06):
    try:
        decision = claude.skillIdentity(rawSkillName, candidateSkills)   // "is this the same as an existing skill?"
        if decision.sameAs is not null:
            return decision.sameAs                    // merge into the canonical Skill Claude identified
    catch (modelFailure | unreachable | invalidSchema):
        // TS-002 FALLBACK — the P0 write must NOT hang or error here:
        //   fall through to create-new keyed by the deterministic canonicalKey,
        //   and flag the row for later reconciliation. Never block, never fake a merge.
        markReconcilePending(key)

    // CREATE-NEW (no semantic match, or Claude failed): one new canonical Skill keyed by `key`.
    return createSkill(name=rawSkillName, canonicalKey=key).id   // @unique on canonicalKey guarantees single-record even under concurrent create
```

**Why this is safe (TS-002):**
- The **deterministic `canonicalKey` (Layer 1) is the persistence key**, not the Claude call. Exact/alias matches collapse without ever touching a model — so the common case of re-asserting `"TypeScript"` is model-independent.
- Claude's `skill-identity` call (Layer 2) only **suggests merges** for harder semantic cases (`"TS"` ↔ `"TypeScript"`, `"AWS"` ↔ `"Amazon Web Services"`). If it fails, times out, or returns invalid JSON, the path **falls back to create-new keyed by `canonicalKey`** with a `reconcilePending` flag — the verified write still completes, the row is never corrupted, and the loop's promote step cannot hang on a second live model call.
- `Skill.canonicalKey @unique` makes create-new **idempotent under races**: two concurrent creates for the same key collide on the unique constraint; the loser re-reads the winner's `Skill.id`. This is the DB-level guarantee that backs single-record semantics (TS-001).
- **Reconcile-later** (deferred, demo-acceptable): rows flagged `reconcilePending` can be merged by a follow-up de-dupe pass; until then they are *correct but possibly slightly redundant* — which degrades de-dupe quality, never loop correctness. Recorded as an OPEN-ITEM, not a blocker.

> **Boundary note:** `deterministicCanonicalKey` is a **normalization** (lowercase, trim, collapse punctuation/whitespace) used only to derive a stable storage key and to short-circuit the obvious exact/alias case — it is **not** keyword/regex "intelligence" substituting for the model. All *semantic* "is this the same skill?" judgement still routes through Claude (BR-09); the deterministic layer only decides *which storage row a confirmed identity lands in*, and provides the safe fallback when the model is unavailable.

---

## 4. Model-by-Model Design Notes

### 4.1 Employee (extend)
Adds `seniority` (`JUNIOR|MID|SENIOR` — needed for "mid-level" queries, AC-04) and `timezone` (IST-overlap, AC-04). `allocation` + `freeFrom` already present (starter lines 24–25) and feed availability reasoning (BR-04). `role` already present; data scoping enforced in the app layer (BR-03). **Synthetic `name`/`email` only** (starter comments preserved).

### 4.2 Skill (extend)
Adds **`canonicalKey @unique`** — a deterministic normalized key (see §3.4) that **forces one canonical `Skill` row per concept**. The `@unique` constraint is what makes "TypeScript" and "TS" resolve to a single `Skill.id`, so they cannot fan out into two `EmployeeSkill` rows (TS-001). The Claude `skill-identity` call advises *which* existing canonical skill an alias merges into; the `@unique` key enforces the single-record outcome at the DB level (and idempotently under concurrent creates). `name @unique` retained. Category is Claude-assigned.

### 4.3 EmployeeSkill (extend — the core change)
Replaces the flat `source` string semantics with the **trust-state machine**: adds `trustState`, `origin`, `promotedAt`; keeps `source` (provenance), `proficiency`, and crucially the **`@@unique([employeeId, skillId])`** which is the BR-18 single-record key. No new "history" table — promotion mutates the row (P8; approval workflow sprawl is out of scope).

### 4.4 CatalogItem (extend — BR-07/11/22)
Adds typed `aiEnabled` (drives the plan gate AC-26 — must be a reliable boolean, not parsed from `tags`), `endorsed` (BR-22/AC-27), `enrichmentPending` (BR-07/AC-09 graceful degradation), and enrichment fields (`description`, `typicalDuration`, `provider`). `tagsJson` retains the richer Claude tags (skillArea/level/roleRelevance). De-dupe merges into the canonical row (AC-08) — no duplicate items.

### 4.5 UpskillingPlan + PlanItem (new — BR-11/AC-26)
A plan is one-per-employee (`@@unique` on `employeeId`) with `status DRAFT|FINALIZED`. `PlanItem` links chosen `CatalogItem`s. **Finalize validation** (≥2 items AND ≥1 with `aiEnabled=true`) runs in the Plan service (Page 02 §4.6); non-conforming ⇒ stays `DRAFT`, specific message; conforming ⇒ `FINALIZED`, counts toward §8 compliance. The starter `Enrollment` (progress: NOT_STARTED/IN_PROGRESS/COMPLETED) is retained for per-item progress tracking and links to the plan.

### 4.6 Certificate (extend) + Resume (new) — BR-17/19
Both store `fileName`, `contentHash`, and `parsedJson` (the Zod-validated extraction kept for audit/demo). `Resume.parsedJson` holds `{currentProject, allocation, baselineSkills[]}`. Neither stores PII beyond synthetic profile linkage; uploaded files live in demo-local storage only (ADR-004).

**Idempotency is DB-enforced (TS-004).** Each model carries **`@@unique([employeeId, contentHash])`** — same employee + same file bytes → same hash → the second insert is rejected by the DB, not merely by an app-layer "seen before?" check. The app-layer guard remains as a fast path (return the prior `uploadId` without re-parsing, AC-23), but the unique constraint is the **race-safe backstop** under a genuine double-submit (BR-19): two concurrent uploads of the same file collide on the constraint, the loser reads back the winner's row, and no duplicate Certificate/Resume — and therefore no duplicate skill promotion — can be created. Scoped **per employee** so two different employees may legitimately hold a certificate with identical bytes. This matches the rigor of the BR-18 key.

### 4.7 IdentityMapping (new — BR-13a / AC-14)
The **OAuth-identity→synthetic-profile** table. Keyed by `syntheticHandle @unique` (an opaque key derived from the OIDC `sub`, **never** the real email/PII), mapping to an `Employee` (synthetic profile + role). Seeded so resolution is **deterministic and testable**. The real email is used only transiently for the `nulogic.io` hosted-domain check and **discarded** (P3). This table is the only thing that touches authentication, and it contains **zero real PII**.

---

## 5. No-PII Guarantee by Design (BR-10 / AC-13 / P3)

```mermaid
graph LR
    G["Google id_token<br/>(real email, hd, sub)"] -->|hd check only| CHK{hd == nulogic.io?}
    CHK -->|no| REJ["Reject — no session, nothing stored"]
    CHK -->|yes| H["syntheticHandle = opaque(sub)"]
    H --> MAP["IdentityMapping lookup"]
    MAP --> PROF["Synthetic Employee profile + role"]
    G -. real email/name .-> DISCARD["DISCARDED — never written"]
    classDef bad fill:#fdd,stroke:#a33;
    class DISCARD,REJ bad;
```

| Data | Stored? | Where |
|---|---|---|
| Real email / name from Google | **No** | discarded after hd check |
| OIDC `sub` (raw) | **No** (only its opaque derivative) | — |
| `syntheticHandle` (opaque) | Yes | `IdentityMapping` |
| Synthetic profile (name/email/skills) | Yes | `Employee` + related (seeded synthetic) |

**Review gate:** seed data and fixtures are inspected for PII before any commit (AC-13). All `Employee.name`/`email` are synthetic.

---

## 6. Persistence, Migrations & Seed

- **Engine:** SQLite via Prisma (`dev.db` present). Single-file DB, zero infra — correct for a hackathon (ADR-002, P8).
- **Schema application:** `db:push` is wired (`package.json:15`). Migration history is **deferred** (TD-DATA-06, Low) — acceptable for MVP; `prisma.config.ts` already declares `migrations.path`.
- **Generated client:** `lib/generated/prisma` (starter generator output) — consumed by the repository layer.
- **Seed (TD-SEED-01):** the `seed` script (currently a `TODO` stub) generates **~20–25 synthetic profiles** with baseline skills (`origin=BASELINE`), allocation + `freeFrom`, seniority, timezone; a starter catalog (with `aiEnabled` set); and the **seeded `IdentityMapping`** entries (synthetic handles) that make AC-14 deterministic.
- **Fixtures (TD-SEED-02):** synthetic `fixtures/certs/` and `fixtures/resumes/` for parse tests and the demo.

### 6.1 Indexing & integrity (demo-appropriate)
| Constraint | Purpose | AC |
|---|---|---|
| `Skill.canonicalKey @unique` | **One canonical Skill per concept** — collapses aliases ("TypeScript"/"TS"); the precondition for the BR-18 key (TS-001) | AC-22 |
| `EmployeeSkill @@unique([employeeId, skillId])` | One promotable row per profile per *canonical* skill (with the above) — the BR-18 single-record key | AC-22 |
| `Certificate @@unique([employeeId, contentHash])` | **DB-enforced** idempotent cert uploads (race-safe, not app-layer only) (TS-004) | AC-23 |
| `Resume @@unique([employeeId, contentHash])` | **DB-enforced** idempotent resume uploads (TS-004) | AC-23 |
| `UpskillingPlan @@unique([employeeId])` | One plan per employee | AC-26 |
| `IdentityMapping.syntheticHandle @unique` | Deterministic identity resolution | AC-14 |
| `Skill.name @unique` | Display-name uniqueness (retained from starter) | AC-22 |
| FK cascades (starter) | Clean deletes for synthetic data | — |

---

## 7. Data Volume & Lifecycle (demo scope)
~20–25 profiles, a few dozen catalog items, a handful of certs/resumes per demo. No partitioning, sharding, archival, or CDC — explicitly out of scope (`scope-boundary.v1.md`). The DB is disposable and re-seedable; the loop's state change (one promoted skill) is the only mutation that matters for the demo narrative.

---

## 8. Cross-References
- **Page 01** — principles P3 (no PII), P4 (single record).
- **Page 02** — the upsert+promote repository function and the Claude `skill-identity` call that backs §3.2; the IdentityMapping resolution flow.
- **Page 04** — schema work is Phase 1 (Foundation); seed + fixtures gate everything.
- **Page 05** — ADR-002 (persistence), ADR-005 (synthetic data), ADR-001 (auth/identity mapping).
