# SKILL-3 / SUB-TASK-2 — runMatch via POST /api/match: happy / hard-match / partial-quantity / failure branches

**Parent:** SKILL-3 · **Component:** Matching service (read-only Route Handler) · **Repo:** ai-nu-skillsync
**Gaps:** TD-MATCH-01

## Pseudocode

1. **Implement `POST /api/match`** as a **read-only Route Handler** (TS-003 — a search writes nothing; NOT a Server Action):
   - Await `cookies()`; re-derive session + role server-side. On a stale/expired session → redirect to sign-in (composed with `proxy.ts`, AC-24). If role is `EMPLOYEE` → deny (BR-03/AC-11).
   - Read `{ queryText }` from the request body.
2. **Run the match** `runMatch(queryText, session)`:
   - `dataset = buildMatchDataset(session)` (SUB-TASK-1) — role-scoped, deterministic.
   - `result = callClaude({ promptName:"match-staffing", variables:{ queryText, datasetJson: serialize(dataset) }, schema: MatchResult, complexity:"hard", cacheableContext: serialize(dataset) })`.
   - **On `Failure`** (unreachable / invalid JSON) → return `{ error: "Search is temporarily unavailable — please retry." }`; **never** construct or return a partial/garbled ranking (AC-06).
3. **Branch on the validated `MatchResult`:**
   - **Happy (AC-04):** return the ranked shortlist as-is (entries already carry matchPercent / matchedSkills / gaps / availability / rationale).
   - **Hard match, no perfect fit (AC-05):** the model returns closest people + gap/ramp-up in `gaps`/`rationale`; ensure the response is **never an empty list** (closest candidates always surfaced).
   - **Partial quantity (AC-21):** when the model parsed a requested `count` and fewer qualify, surface `shortfallNote` (e.g. "2 of 3 requested qualify") alongside the qualifying results — neither empty nor a silent drop.

## Implementation Contract

- **GOAL:** A read-only match endpoint that returns a validated, availability-aware shortlist and degrades gracefully across the hard-match, partial-quantity, and failure paths — the same call the loop (SKILL-4) re-runs before/after.
- **CONSTRAINTS:**
  - Per **TS-003 / ADR-006**, `runMatch` is a **read-only Route Handler** (`POST /api/match`, query in body), NOT a Server Action; it performs **no DB writes**.
  - Per **AC-06 / Page 02 §2.5**, on any Zod failure or unreachable model, show the spec'd retry message and **no partial ranking**.
  - Per **AC-05**, never return an empty list — surface closest people + ramp-up; per **AC-21**, surface `shortfallNote` when fewer than the requested count qualify.
  - Per **Page 02 §3.1 discipline / AC-24**, re-derive session + role server-side; stale session → redirect; Employee denied.
- **FORMAT:** `app/api/match/route.ts` (POST handler); `lib/match/run-match.ts` (`runMatch`). Reuses `buildMatchDataset` (SUB-TASK-1) + `callClaude` (SKILL-1).

## Data Models

- **Route Handler:** `POST /api/match` body `{ queryText: string }` → `MatchResult` | `{ error }` | redirect/denied.
- **Service:** `runMatch(queryText, session) → MatchResult | Failure`.
- **Zod schema:** `MatchResult` (Page 02 §2.5) including optional `shortfallNote`.
- **Prisma:** read-only (via `buildMatchDataset`); **no writes**.

## Error Handling

1. **Claude unreachable / 5xx / rate-limited:** `callClaude` returns `Failure`; handler returns the retry message; no partial ranking, no crash (AC-06).
2. **Model returns near-but-invalid JSON:** Zod `safeParse` fails → `Failure` → retry message (AC-06); never coerce/repair into a shown ranking.
3. **Employee role hits `/api/match`:** denied server-side before any dataset build or model call (BR-03/AC-11).
4. **Expired session mid-search:** `proxy.ts`/handler redirects to sign-in; no protected dataset served under the stale identity (AC-24).
5. **Model returns an empty `results[]` for a hard match:** treat as the closest-people path — the prompt is instructed to never return empty; if it does, surface a "no close matches found" message rather than a blank screen.

## Failure Conditions (testable defects)

1. On a Claude failure the handler returns a partial or fabricated ranking instead of the retry message → AC-06 violation.
2. A hard-match query returns an empty list instead of closest people + ramp-up → AC-05 violation.
3. A "3 React devs" query with only 2 qualifiers drops the shortfall silently (no `shortfallNote`) or returns empty → AC-21 violation.
4. The handler writes to the DB (e.g. logs a "search" row through a mutation path) → TS-003 read-only violation.
5. An Employee successfully receives match results → BR-03/AC-11 authorization violation.
