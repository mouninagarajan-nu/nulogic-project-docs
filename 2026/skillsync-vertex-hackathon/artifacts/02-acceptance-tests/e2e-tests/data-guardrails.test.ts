/**
 * Synthetic-data / no-PII / env-secrets guardrail — AC-13 (BR-09/10). RED state.
 *
 * This is a REVIEW-type AC made executable. It scans the seed dataset + fixtures for real PII
 * and asserts secrets are read from env (never hardcoded/committed). It fails RED until the
 * synthetic seed + fixtures + env-driven secret loading exist.
 *
 * NOTE: these helpers are intentionally not yet implemented (loadModule throws), keeping the
 * suite RED. When the seed/fixtures land, wire loadSeedProfiles()/scanRepoForSecrets() to read
 * the real artifacts and the assertions enforce the guardrail going forward.
 */
import { describe, it, expect } from "vitest";
import { loadModule } from "./setup/test-helpers";

interface GuardrailModule {
  loadSeedProfiles(): Promise<Array<{ handle: string; email?: string; name?: string }>>;
  /** Returns any literal-secret findings in tracked source (should be empty). */
  scanRepoForHardcodedSecrets(): Promise<Array<{ file: string; kind: string }>>;
  /** Returns the env var names the app reads secrets from. */
  secretEnvVarNames(): Promise<string[]>;
}

// Heuristic patterns that would indicate REAL PII leaking into synthetic data.
const REAL_EMAIL = /@(gmail|yahoo|outlook|hotmail)\.com/i;
const LOOKS_LIKE_REAL_NAME_FIELD = /name/i;

describe("AC-13 Synthetic-data / no-PII / env-secrets guardrail [P0] [review]", () => {
  it("seed profiles contain only synthetic handles — no real emails/names/PII", async () => {
    const mod = await loadModule<GuardrailModule>("@/lib/dev/guardrails");
    const profiles = await mod.loadSeedProfiles();
    for (const p of profiles) {
      expect(p.handle).toMatch(/^synthetic-handle-/); // synthetic identity
      expect(p.email ?? "").not.toMatch(REAL_EMAIL); // no real personal emails
      // No free-form real-name fields persisted on the synthetic record.
      expect(Object.keys(p).some((k) => LOOKS_LIKE_REAL_NAME_FIELD.test(k) && k !== "handle")).toBe(false);
    }
  });

  it("no hardcoded secrets are committed to source", async () => {
    const mod = await loadModule<GuardrailModule>("@/lib/dev/guardrails");
    const findings = await mod.scanRepoForHardcodedSecrets();
    expect(findings).toEqual([]);
  });

  it("reads ANTHROPIC_API_KEY and Google OAuth secrets from the environment", async () => {
    const mod = await loadModule<GuardrailModule>("@/lib/dev/guardrails");
    const names = await mod.secretEnvVarNames();
    expect(names).toContain("ANTHROPIC_API_KEY");
    expect(names.some((n) => /GOOGLE.*CLIENT.*(ID|SECRET)/i.test(n))).toBe(true);
  });
});
