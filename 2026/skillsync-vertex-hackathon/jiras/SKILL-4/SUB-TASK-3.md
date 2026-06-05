# SKILL-4 / SUB-TASK-3 — Upskilling-plan validation gate + loop/catalog/plan tests

**Parent:** SKILL-4 · **Component:** Upskilling Plan service + test harness · **Repo:** ai-nu-skillsync
**Gaps:** TD-PLAN-01

## Pseudocode

1. **`finalizePlan({itemIds})` Server Action** (`lib/plan/finalizePlan.ts`, Page 02 §4.6, own plan only):
   - Resolve the caller's single `UpskillingPlan` (`@@unique([employeeId])`); set its `PlanItem`s to `itemIds` (remove/swap allowed while `DRAFT`).
   - **Rule 1 (count):** if fewer than 2 items → keep `status=DRAFT`, return `{rejected, reason:"MIN_ITEMS", message:"Pick at least 2 items for your plan."}`.
   - **Rule 2 (AI-enabled):** load the chosen `CatalogItem`s; if none has `aiEnabled=true` → keep `DRAFT`, return `{rejected, reason:"NO_AI_ENABLED", message:"Your plan needs at least one AI-enabled item."}`.
   - **Conforming:** set `status=FINALIZED`, `finalizedAt=now`, return `{accepted:true}` — counts toward the §8 compliance metric.
2. **Remove/swap re-validate:** because validation runs on every `finalizePlan` call and the plan stays `DRAFT` on rejection, the employee can remove/swap an item and re-attempt; the gate re-evaluates both rules (AC-26).
3. **Tests** (`__tests__/loop.test.ts`, `catalog.test.ts`, `plan.test.ts`): drive the hero loop before/after, catalog de-dupe/enrich/endorse, recommendations, and the plan gate with stubbed Claude outputs where a live call is awkward (BR-09 stub boundary).

## Implementation Contract

- **GOAL:** A plan finalize gate that enforces ≥2 items AND ≥1 AI-enabled with rule-specific messages and a remove/swap re-validate path, plus a test suite proving the loop, catalog intelligence, and the gate.
- **CONSTRAINTS:**
  - Per **BR-11 / AC-26**, the gate is a **constraint, not new intelligence** — it counts `PlanItem`s and reads the Claude-assigned `aiEnabled` tag (SUB-TASK-2); it does NOT make a model call.
  - Per **Page 02 §4.6**, each failed rule returns its **specific** message; a non-conforming plan stays `DRAFT` and is NOT marked complete.
  - Per **Page 03 §4.5**, `UpskillingPlan` is one-per-employee (`@@unique([employeeId])`); `status` is `DRAFT|FINALIZED` (SQLite string).
  - Per **CLAUDE.md / Page 04 §7**, tests must show evidence (output), use synthetic fixtures only, and stub awkward Claude boundaries with a `TODO` returning `Failure` rather than fake data.
- **FORMAT:** `lib/plan/finalizePlan.ts`; tests under `__tests__/` (or co-located). Reuses the Prisma `UpskillingPlan`/`PlanItem`/`CatalogItem` models and SKILL-1's Vitest config + single-file test command.

## Data Models

- **Server Action:** `finalizePlan({itemIds[]}) → {accepted} | {rejected, reason, message}` (Page 02 §3.1/§4.6).
- **Prisma:** `UpskillingPlan` (`status`, `finalizedAt`, `@@unique([employeeId])`), `PlanItem` (`planId`, `catalogItemId`), `CatalogItem.aiEnabled` (Page 03 §4.5/§4.4).
- **Test fixtures:** synthetic plans/catalog items spanning conforming, <2 items, and 0-AI-enabled cases; `fixtures/certs/aws-saa-valid.pdf` for the loop test.

## Error Handling

1. **Plan with <2 items finalized:** stays `DRAFT`; returns the `MIN_ITEMS` message; nothing marked complete (AC-26).
2. **Plan with ≥2 items but 0 AI-enabled:** stays `DRAFT`; returns the `NO_AI_ENABLED` message (AC-26).
3. **`itemIds` references a non-existent or merged `CatalogItem`:** resolve to the canonical id (catalog merge, SUB-TASK-2) or reject the specific item with a clear message — never finalize a plan referencing a dangling item.
4. **Caller finalizes someone else's plan:** denied (own-plan scope, Page 02 §3.1).
5. **Concurrent finalize of the same plan:** the `@@unique([employeeId])` plan row + a status check make the second a no-op converging to `FINALIZED` — no double-count toward compliance.

## Failure Conditions (testable defects)

1. A plan with fewer than 2 items is marked `FINALIZED` → AC-26/BR-11 violation.
2. A plan with no AI-enabled item is accepted → AC-26/BR-11 violation.
3. A rejected plan shows a generic error instead of the rule-specific message ("Pick at least 2 items." / "At least one item must be AI-enabled.") → AC-26 violation.
4. The gate makes a Claude call to decide AI-enabled instead of reading the stored `aiEnabled` tag → BR-11 ("constraint, not new intelligence") violation.
5. After a remove/swap that reaches conformance, re-finalize still rejects → AC-26 remove/swap-path violation.
