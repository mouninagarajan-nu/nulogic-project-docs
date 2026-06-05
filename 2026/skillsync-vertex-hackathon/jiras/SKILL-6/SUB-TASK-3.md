# SKILL-6 / SUB-TASK-3 — NULogic-branded UI screens + role view-switcher + auth/role/progress tests + freeze

**Parent:** SKILL-6 · **Component:** UI (shadcn/ui) + view-switcher + test harness · **Repo:** ai-nu-skillsync
**Gaps:** TD-UI-01, TD-UI-02, TD-UI-03, TD-DOC-01

## Pseudocode

1. **Build the product screens** (App Router pages + Client Components, shadcn/ui, Page 04 Phase 8):
   - sign-in (Google button + NULogic branding + restricted-access message); role-appropriate home; profile (baseline vs verified skills, current project/availability); tracker + resume upload; matcher (query input, loading state, ranked shortlist, hard-match, shortfall banner, retry message, Employee-denied state); approval queue; progress summary (on-track/behind/thin + PL empty state); admin role-assignment; catalog (merged-into-canonical indicator, `enrichmentPending` badge, **endorsed badge** surfacing SKILL-4's flag — AC-27).
   - Use shadcn/ui (style `radix-lyra`, `lucide` icons, Tailwind v4 CSS-based config in `app/globals.css`); replace scaffold copy with NULogic branding.
2. **Role view-switcher** (`components/role-switcher.tsx`): a persistent demo/testing aid that switches the active role/profile (Employee/PL/Manager/Admin) so role journeys demo even if OAuth isn't wired (ADR-001 fallback). Wired to the same `scopeForViewer` so it exercises real scoping.
3. **Tests + freeze** (`__tests__/auth-oauth.test.ts`, `roles-scoping.test.ts`, progress): assert hd-check reject (AC-15), deterministic mapping (AC-14), expired-session redirect (AC-24), PL scoping + Employee matcher-block (AC-11), Admin-only assignRole (AC-25), progress summary + empty state (AC-12), endorsed surfacing (AC-27). Then **feature freeze (~Day 6–7)**: polish only the loop demo; reconcile `CLAUDE.md` doc drift (TD-DOC-01).

## Implementation Contract

- **GOAL:** All NULogic-branded product screens via shadcn/ui surfacing every capability, a role view-switcher as a demo/testing aid, and an auth/role/progress test suite — then the feature freeze and loop-demo polish.
- **CONSTRAINTS:**
  - Per **org branding + CLAUDE.md**, all screens use NULogic branding; shadcn/ui style `radix-lyra`, Tailwind v4 CSS-based config (no `tailwind.config.*`); path alias `@/*` to repo root.
  - Per **ADR-006 / Next.js 16**, RSC for role-scoped reads, Client Components for forms/uploads/optimistic UI; `params`/`searchParams` awaited — read `node_modules/next/dist/docs/` first.
  - Per **ADR-001 / Page 04**, retain the role view-switcher as a demo fallback (do not delete it after OAuth lands).
  - Per **Page 04 §6 freeze**, freeze features ~Day 6–7; after freeze, polish only the end-to-end loop demo; typecheck + lint clean before each commit.
  - Per **BR-22 / AC-27**, the endorsed flag is surfaced (badge) in catalog + recommendation views — UI only; the logic lives in SKILL-4.
- **FORMAT:** `app/(routes)/*` pages, `components/*` (incl. `components/role-switcher.tsx`), `components/ui/*` (shadcn add); `__tests__/auth-oauth.test.ts`, `__tests__/roles-scoping.test.ts`. Reuses SKILL-1's Vitest config.

## Data Models

- **UI consumes:** session `{profileId, role}` (SUB-TASK-1), `scopeForViewer` (SUB-TASK-2), `MatchResult` (SKILL-3), `Recommendations`/`CatalogItem.endorsed` (SKILL-4), profile/skill/`ProgressSummary` (SKILL-5/this story).
- **shadcn components:** add via `pnpm dlx shadcn@latest add <name>` → `components/ui/`.
- **No new Prisma models** — UI surfaces existing data scoped server-side.

## Error Handling

1. **OAuth not wired at demo time:** the role view-switcher lets role journeys demo without sign-in (ADR-001 fallback) — never block the demo on auth.
2. **Matcher failure/Employee-denied state reaches the UI:** render the spec'd retry message / denied state (from SKILL-3) — never a blank crash.
3. **`enrichmentPending` / merged-canonical catalog states:** surface a badge/indicator rather than hiding the item or erroring (AC-09/AC-08 surfacing).
4. **Scaffold copy leaks into a screen:** the branding review catches it before freeze (org branding rule).
5. **A screen reads data unscoped (client-side filtering):** scoping must be server-side via `scopeForViewer`; a client-only filter is a security defect, not a UI choice.

## Failure Conditions (testable defects)

1. A screen renders data outside the viewer's role scope (client-side-only filtering) → AC-11/BR-03 violation.
2. The role view-switcher is removed, leaving no fallback when OAuth is unavailable → Page 04/ADR-001 demo-risk regression.
3. The endorsed flag is not surfaced in catalog/recommendation views → AC-27 surfacing gap.
4. Scaffold (non-NULogic) branding remains on a shipped screen → org branding violation.
5. The auth/role tests omit the hd-reject (AC-15) or expired-session (AC-24) branches → security coverage gap.
