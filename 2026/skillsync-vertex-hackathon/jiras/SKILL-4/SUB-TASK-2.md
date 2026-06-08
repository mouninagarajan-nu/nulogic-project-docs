# SKILL-4 / SUB-TASK-2 — Catalog service: add (de-dupe → enrich), endorse, recommend

**Parent:** SKILL-4 · **Component:** Catalog service + Claude integration · **Repo:** ai-nu-skillsync
**Gaps:** TD-CAT-01, TD-CAT-02, TD-DATA-03

## Pseudocode

1. **`addCatalogItem({name})` Server Action** (`lib/catalog/addCatalogItem.ts`, Page 02 §4.5):
   - Re-derive session server-side (any authenticated user). Load existing canonical `CatalogItem`s (id + name).
   - Call `callClaude({ promptName:"catalog-dedupe", complexity:"routine", schema: DedupeDecision, variables:{ name, existing } })`. If `isDuplicateOf` is set → **merge** (return the canonical item, create no new row, AC-08). Else continue to create.
2. **Enrich on create** (`catalog-enrich`):
   - Call `callClaude({ promptName:"catalog-enrich", complexity:"routine", schema: CatalogEnrichment, variables:{ name } })` → `{ tags{skillArea,level?,roleRelevance[]}, aiEnabled, description?, provider?, typicalDuration?, prerequisites? }`.
   - On `Ok`: persist `CatalogItem` with `tagsJson`, `aiEnabled`, `description`, `provider`, `typicalDuration`, `enrichmentPending=false`.
   - On `Failure`: persist the item with `enrichmentPending=true` and `aiEnabled=false` (conservative default) — **the add is never blocked** (AC-09/BR-07). A later pass can re-enrich.
3. **`setEndorsed({itemId, endorsed})` Server Action** (Page 02 §3.1, AC-27): authority check — only `MANAGER|HR|ADMIN` may set/unset; non-manager → denied. Toggle `CatalogItem.endorsed`. **`recommend-items`** (used by SUB-TASK-1) surfaces/prefers `endorsed=true` items.

## Implementation Contract

- **GOAL:** A catalog that Claude keeps clean (semantic de-dupe/merge), tagged + enriched (with a reliable `aiEnabled` boolean for the plan gate), endorsable by managers, and recommendable — all writes Zod-gated, enrichment failure non-blocking.
- **CONSTRAINTS:**
  - Per **BR-06 / BR-09 / AC-08**, de-dupe is the `catalog-dedupe` Claude call — NO string-equality/regex matching of item names in code.
  - Per **BR-07 / AC-09**, enrichment failure sets `enrichmentPending=true` and never blocks the add; `aiEnabled` is a typed boolean column (not parsed from `tags`) so the plan gate (SUB-TASK-3) can trust it (Page 03 §4.4).
  - Per **BR-22 / AC-27**, `setEndorsed` is authority-gated to Manager/HR/Admin; the flag is the only machinery — no review workflow.
  - Per **ADR-003**, every Claude output passes `safeParse` before any write; a `safeParse` failure is treated as enrich-failure (sets `enrichmentPending`).
- **FORMAT:** `lib/catalog/addCatalogItem.ts`, `lib/catalog/setEndorsed.ts`; `src/prompts/catalog-dedupe.ts`, `src/prompts/catalog-enrich.ts`; `src/schemas/dedupe-decision.ts`, `src/schemas/catalog-enrichment.ts`. Reuses `callClaude` (SKILL-1) and the Prisma `CatalogItem` model.

## Data Models

- **Prompts:** `catalog-dedupe` (Sonnet) → `DedupeDecision { isDuplicateOf?: string, canonicalName: string }`; `catalog-enrich` (Sonnet) → `CatalogEnrichment { tags{skillArea,level?,roleRelevance[]}, aiEnabled: boolean, description?, provider?, typicalDuration?, prerequisites? }` (Page 02 §2.5).
- **Prisma writes:** `CatalogItem` (`name`, `provider`, `kind`, `aiEnabled`, `endorsed`, `enrichmentPending`, `description`, `typicalDuration`, `tagsJson`) — Page 03 §4.4.
- **Server Actions:** `addCatalogItem`, `setEndorsed` (Page 02 §3.1).

## Error Handling

1. **`catalog-dedupe` returns `Failure`** (invalid JSON / unreachable): treat as "not a duplicate" and proceed to create-new + enrich — never block the add; log the failure (BR-09 boundary).
2. **`catalog-enrich` returns `Failure` or fails `safeParse`:** save the item with `enrichmentPending=true`, `aiEnabled=false`; the add succeeds (AC-09).
3. **Non-manager calls `setEndorsed`:** denied server-side (role re-derived); the toggle is unavailable in the UI for them (AC-27).
4. **De-dupe says merge but the referenced canonical id no longer exists:** fall back to create-new (referential safety); never throw into the user flow.
5. **Concurrent add of the same name:** both may create rows; a follow-up de-dupe pass merges — degraded de-dupe quality, never a crash (consistent with TS-002 reconcile-later philosophy).

## Failure Conditions (testable defects)

1. A near-duplicate ("AWS Solutions Architect" vs "AWS Certified Solutions Architect") creates a second `CatalogItem` instead of merging → AC-08/BR-06 violation.
2. De-dupe is implemented with string/regex equality rather than the `catalog-dedupe` Claude call → BR-09 violation.
3. An enrich-call failure blocks (rejects/throws) the add instead of saving with `enrichmentPending=true` → AC-09/BR-07 violation.
4. `aiEnabled` is derived by parsing `tagsJson` rather than stored as a typed boolean → the plan gate can't trust it (Page 03 §4.4) → AC-26 risk.
5. A non-manager successfully sets/unsets `endorsed` → AC-27 authorization violation.
