# SKILL-3 — Documentation Sync Summary (Stage 10)

**Jira:** SKILL-3 — Staffing Matcher: availability-aware ranked shortlist
**Docs branch:** `feature/SKILL-3-staffing-matcher` (local docs repo)
**Code branch:** `feature/SKILL-3-staffing-matcher` (ai-nu-skillsync)

## Synced

| Source | Destination | Commit |
|---|---|---|
| `artifacts/06-planning/tactical-adrs.md` | code repo `docs/architecture/decisions/tactical/SKILL-3-tactical-adrs.md` | `51244b1` |

Mirrors the SKILL-1 / SKILL-2 Stage-10 pattern (tactical ADRs land in the code repo alongside SKILL-1/2's).

## Implementation notes carried forward

- **New surface:** read-only `POST /api/match` → role-scoped deterministic `buildMatchDataset` → single Opus `callClaude` (rules+dataset in `cacheableContext`, query in user turn) → `MatchResult` (z.preprocess coercion) → happy / hard-match / partial-quantity / failure branches.
- **Real-Claude boundary** (BR-09): ranking/availability is the model's job; no keyword/date logic. Live client TODO-stubbed (`NO_LIVE_CLIENT` → AC-06 retry message).
- **Infra:** `next.config.ts` externalizes Prisma v7 native modules for Turbopack (commit `8c643cf`) — required for the dev server to serve the route.

## Code commit trail (feature branch)
- `b9d4844` test(SKILL-3): RED tests (19)
- `dcd9207` feat(SKILL-3): staffing matcher GREEN (58/58)
- `8c643cf` fix(SKILL-3): Turbopack/Prisma externalization + coverage tooling
- `51244b1` docs(SKILL-3): tactical ADRs synced

## Deferred (tracked in Stage 9 combined-report.md)
Auth seam (SKILL-6), prompt-injection hardening, org-scope `take` cap, `@@index([leadId])`, route try/catch → AC-06 503.

## Not synced / N/A
- No SPEC/PRD changes required (implementation matched the approved plan + ADRs).
- No public API docs surface yet (match UI deferred to SKILL-6).
