# SkillSync E2E Acceptance Tests — Execution Guide

**Initiative:** `skillsync-vertex-hackathon` · **Stage:** 02-acceptance-tests
**Source ACs:** `artifacts/01-intent/acceptance-criteria.v1.json` (27 ACs) · **BRs:** `business-rules.v1.md` (23 BRs)
**Scenarios:** `../test-scenarios.md`

## Current state: RED (all failing) — this is intentional (TDD test-first)

The SkillSync product is **not built yet**. Every test routes through `setup/test-helpers.ts → loadModule()`, which throws `NOT_IMPLEMENTED` until the corresponding product module exists. So **all tests FAIL by design**. The `code-writer` stage makes them pass one by one.

## Framework

- **Vitest** (already in the repo: `package.json` → `"test": "vitest run"`, `vitest@^4` in devDependencies).
- **Zod** is present (`zod@^4`) — implementation must Zod-validate every Claude response before use; tests assert that validation gate (e.g. garbled JSON → graceful failure, no write).
- TypeScript path alias `@/*` maps to the repo root (per `CLAUDE.md`). Test stubs import product code as `@/lib/...`.

## How to run

These stubs live under the initiative docs folder. To execute them, copy/move the `e2e-tests/` tree into the app repo's test location (e.g. `ai-nu-skillsync/tests/acceptance/`) so Vitest + the `@/*` alias resolve, then:

```bash
pnpm test                 # run all (expect RED until implemented)
pnpm vitest run e2e-tests/cert-parsing.test.ts   # single file
pnpm test:watch           # watch mode while implementing
```

> The repo currently has no real ANTHROPIC_API_KEY or OAuth secrets set (local-only run). Tests do **not** call the live Claude API — they inject a `makeClaudeClientSpy` / `...ThatThrows` / `...Garbled` stand-in and assert the **call boundary**, the **Zod-validation** gate, and **graceful failure**. Implementation must accept an injectable Claude client for this reason.

## Test files (by feature area)

| File | ACs | Notes |
|---|---|---|
| `cert-parsing.test.ts` | AC-01, AC-02, AC-03 | Claude cert parse against `fixtures/certs/`; no-write-on-failure |
| `staffing-matcher.test.ts` | AC-04, AC-05, AC-21, AC-06 | Availability-aware ranking, hard match, partial-quantity, failure |
| `hero-loop.test.ts` | AC-07 | **Hero.** Same-record promotion → sharper re-match; no duplicate row |
| `catalog-intelligence.test.ts` | AC-08, AC-09, AC-10, AC-27 | De-dupe/tag/enrich/recommend + manager 'endorsed' flag |
| `roles-scoping.test.ts` | AC-11, AC-12, AC-25 | Role scoping, Claude progress summary, Admin role assign |
| `data-guardrails.test.ts` | AC-13 | Synthetic data / no PII / env secrets (review AC, made executable) |
| `auth-oauth.test.ts` | AC-14, AC-15, AC-24 | Google OAuth (nulogic.io only), rejection, session expiry |
| `profile-skills.test.ts` | AC-16, AC-17, AC-18, AC-22 | Baseline skills, self-service, approval, single-identity promotion |
| `resume-parsing.test.ts` | AC-19, AC-20 | Claude resume extraction (self-reported) + graceful failure |
| `idempotency.test.ts` | AC-23 | Double-submit cert/resume converges to one result |
| `plan-validation.test.ts` | AC-26 | ≥2 items incl. ≥1 AI-enabled gate + remove/swap |
| `setup/test-helpers.ts` | — | Synthetic fixtures, seeded identity map, Claude client spies |

## Test status checklist (flip to ✅ as `code-writer` makes each pass)

- [ ] AC-01 cert parse happy · [ ] AC-02 multi-skill · [ ] AC-03 cert failure
- [ ] AC-04 ranked match · [ ] AC-05 hard match · [ ] AC-21 partial-quantity · [ ] AC-06 search failure
- [ ] AC-07 hero loop
- [ ] AC-08 de-dupe · [ ] AC-09 tag/enrich · [ ] AC-10 recommend · [ ] AC-27 endorsed flag
- [ ] AC-11 role scoping · [ ] AC-12 progress summary · [ ] AC-25 admin role assign
- [ ] AC-13 guardrails
- [ ] AC-14 google sign-in · [ ] AC-15 reject non-nulogic · [ ] AC-24 session expiry
- [ ] AC-16 baseline skills · [ ] AC-17 self-service · [ ] AC-18 approval · [ ] AC-22 single identity
- [ ] AC-19 resume parse · [ ] AC-20 resume failure
- [ ] AC-23 idempotent uploads
- [ ] AC-26 plan validation

## Guardrails the implementation MUST honor (asserted by these tests)

1. **All intelligence via Claude API**, Zod-validated before use — cert/resume parse, match/rank, catalog de-dupe/tag/enrich/recommend, progress summary. No regex/keyword/string-equality substitutes. Tests assert the call boundary + validation, not hardcoded logic.
2. **Synthetic data only / no real PII**; secrets (`ANTHROPIC_API_KEY`, Google OAuth client id/secret) read from env, never committed.
3. **One canonical skill record per profile**; trust state promotes in place (`self-reported → manager-approved → verified`), never duplicates the row (BR-18) — underpins the hero loop.
4. **Graceful failure on every Claude flow** — clear user-facing message, no crash, no garbage write.
5. **Idempotent uploads** — double-submit converges to a single result.

## Next steps

`code-writer` (Stage 3+) implements the modules referenced by `loadModule("@/lib/...")` and turns the suite GREEN, protecting the hero loop (`hero-loop.test.ts`) above all.
