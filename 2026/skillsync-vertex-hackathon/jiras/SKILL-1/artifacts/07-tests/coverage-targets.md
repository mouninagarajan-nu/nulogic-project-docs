# SKILL-1 — Coverage Targets (hackathon-relaxed)

**Source:** `inputs/test-creator-input.json` (orchestrator-set; NOT negotiated by this agent).
These are the floors the SKILL-1 suite targets when implementation lands (Stage 8 GREEN).

| Metric | Target | Notes |
|---|---|---|
| Overall | **≥ 40%** | hackathon-relaxed |
| New code | **≥ 45%** | hackathon-relaxed |
| Branch / decision | **≥ 40%** | hackathon-relaxed |
| Critical paths | **≥ 75%** | the three non-negotiables (below) |

## Critical paths (must reach ≥ 75%)

1. **Claude validate-before-write boundary (BR-09)** — `lib/ai/claude.ts` `callClaude<T>`
   safeParse-before-return gate, typed `Ok`/`Failure`, SDK-throw mapping, confidence threshold.
   Covered by `wrapper-gate.test.ts` (TS-P2-01..04, TS-P3-03).
2. **Single canonical-record invariant (BR-18)** — `lib/repos/skill.ts` `resolveCanonicalSkill` +
   `upsertAndPromoteSkill` + `order`, and the schema `@@unique` keys. Covered by
   `schema-invariant.test.ts` (TS-P1-01, TS-P2-06/07/08, TS-P3-01).
3. **No-PII gate (BR-10)** — `lib/dev/guardrails.ts` `loadSeedProfiles` (no-name projection),
   `scanRepoForHardcodedSecrets`, `secretEnvVarNames`. Covered by `no-pii.test.ts`
   (TS-P1-04, TS-P1-05, TS-P3-02).

## Vitest coverage config (to wire at GREEN)

When implementation lands, configure these thresholds in `vitest.config.ts` under
`test.coverage` (provider `v8`):

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "html"],
  thresholds: {
    lines: 40,
    functions: 45,      // new-code proxy
    branches: 40,
    statements: 40,
    // Per-file critical-path floors (BR-09 / BR-18 / BR-10):
    "lib/ai/claude.ts": { lines: 75, branches: 75 },
    "lib/repos/skill.ts": { lines: 75, branches: 75 },
    "lib/dev/guardrails.ts": { lines: 75, branches: 75 },
  },
  include: ["lib/**", "src/**", "prisma/seed.ts"],
},
```

> Coverage % is a floor, not a target — do not pad. Every authored test traces to a unique
> AC / BR / scenario / edge case (see `scenarios.md`).
