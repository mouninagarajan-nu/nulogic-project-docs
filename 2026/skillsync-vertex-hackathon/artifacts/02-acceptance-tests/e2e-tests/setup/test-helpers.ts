/**
 * Shared test helpers, fixtures, and mock-service contracts for SkillSync acceptance tests.
 *
 * STATE: RED. The SkillSync product does not exist yet. The `loadModule()` helper below
 * intentionally throws "NOT_IMPLEMENTED" so every test that calls into product code FAILS
 * until a real module is wired up. This is deliberate TDD test-first scaffolding.
 *
 * When implementation lands, replace `loadModule()` bodies with real dynamic imports
 * (e.g. `await import("@/lib/cert/parse-certificate")`) and the tests turn GREEN.
 *
 * GUARDRAILS asserted across the suite:
 *  - All intelligence (cert/resume parse, match/rank, catalog de-dupe/tag/enrich/recommend,
 *    summary) goes through the Claude API and is Zod-validated before use. Tests assert the
 *    CALL BOUNDARY + VALIDATION + GRACEFUL FAILURE — never hardcoded keyword/regex logic.
 *  - Synthetic data only. No real names/emails/PII. Secrets read from env.
 */

import { vi } from "vitest";

export const NOT_IMPLEMENTED = "NOT_IMPLEMENTED: SkillSync module not built yet (TDD RED)";

/**
 * Resolves a not-yet-existing product module. Throws until implementation exists,
 * guaranteeing the RED state. Tests await this so the failure surfaces inside the test body.
 *
 * @example const { parseCertificate } = await loadModule("@/lib/cert/parse-certificate");
 */
export async function loadModule<T = unknown>(_specifier: string): Promise<T> {
  // TODO(code-writer): replace with `return (await import(_specifier)) as T;`
  throw new Error(NOT_IMPLEMENTED + ` :: ${_specifier}`);
}

// ---------------------------------------------------------------------------
// Synthetic fixtures (NO real PII — synthetic handles only)
// ---------------------------------------------------------------------------

/** Synthetic employee profile shape used across matcher / profile tests. */
export interface SyntheticProfile {
  id: string;
  /** Synthetic handle — NOT a real name/email. */
  handle: string;
  role: "employee" | "practice-lead" | "manager" | "admin";
  teamId: string;
  currentProject: string | null;
  allocationPct: number; // 0..100
  freeFrom: string; // ISO date
  skills: SyntheticSkill[];
}

export interface SyntheticSkill {
  canonicalSkillId: string;
  name: string;
  level: "beginner" | "intermediate" | "advanced";
  source: "self-reported" | "certificate";
  /** Trust state ladder: self-reported -> manager-approved -> verified (promote-only). */
  state: "self-reported" | "manager-approved" | "verified";
  origin: "baseline" | "upskilling-acquired";
}

export const SYNTHETIC_PROFILES: SyntheticProfile[] = [
  {
    id: "p-001",
    handle: "synthetic-handle-001",
    role: "employee",
    teamId: "team-alpha",
    currentProject: "proj-orion",
    allocationPct: 60,
    freeFrom: "2026-06-19", // free within 2 weeks of 2026-06-05
    skills: [
      {
        canonicalSkillId: "skill-react",
        name: "React",
        level: "intermediate",
        source: "self-reported",
        state: "self-reported",
        origin: "baseline",
      },
      {
        canonicalSkillId: "skill-typescript",
        name: "TypeScript",
        level: "intermediate",
        source: "self-reported",
        state: "self-reported",
        origin: "baseline",
      },
    ],
  },
  {
    id: "p-002",
    handle: "synthetic-handle-002",
    role: "employee",
    teamId: "team-alpha",
    currentProject: null,
    allocationPct: 0,
    freeFrom: "2026-06-05", // free now
    skills: [
      {
        canonicalSkillId: "skill-react",
        name: "React",
        level: "advanced",
        source: "self-reported",
        state: "manager-approved",
        origin: "baseline",
      },
      {
        canonicalSkillId: "skill-node",
        name: "Node.js",
        level: "intermediate",
        source: "self-reported",
        state: "self-reported",
        origin: "baseline",
      },
    ],
  },
];

/** Deterministic seeded OAuth-identity -> synthetic-profile map, keyed by synthetic handle. */
export const SEEDED_IDENTITY_MAP: Record<string, string> = {
  "synthetic-handle-001": "p-001",
  "synthetic-handle-002": "p-002",
};

/** Synthetic certificate fixture paths under fixtures/certs/. */
export const CERT_FIXTURES = {
  validAwsSaa: "fixtures/certs/aws-saa-valid.pdf",
  multiSkill: "fixtures/certs/multi-skill-bootcamp.pdf",
  unreadable: "fixtures/certs/not-a-cert.png",
} as const;

/** Synthetic resume fixture paths under fixtures/resumes/. */
export const RESUME_FIXTURES = {
  validEngineer: "fixtures/resumes/synthetic-engineer.pdf",
  unreadable: "fixtures/resumes/garbled.png",
} as const;

// ---------------------------------------------------------------------------
// Claude API mock — assert the CALL BOUNDARY, not real network calls.
// ---------------------------------------------------------------------------

/**
 * A spy stand-in for the Claude API client. Implementation code MUST route all
 * intelligence through a single injectable client so tests can assert it was called
 * and stub structured/garbled responses for validation + graceful-failure paths.
 */
export function makeClaudeClientSpy(scriptedResponse: unknown) {
  const createMessage = vi.fn(async () => ({
    // The product layer is responsible for extracting + Zod-validating this.
    content: [{ type: "text", text: JSON.stringify(scriptedResponse) }],
  }));
  return { createMessage };
}

/** A Claude client that throws — for unreachable / error-path tests. */
export function makeClaudeClientThatThrows(message = "Claude API unreachable") {
  return { createMessage: vi.fn(async () => { throw new Error(message); }) };
}

/** A Claude client that returns malformed JSON — for Zod-validation-failure tests. */
export function makeClaudeClientGarbled() {
  return {
    createMessage: vi.fn(async () => ({
      content: [{ type: "text", text: "{ not: valid json <<<" }],
    })),
  };
}

export const TODAY = "2026-06-05";
