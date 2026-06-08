/**
 * Authentication — AC-14 (NULogic-only sign-in), AC-15 (reject non-NULogic/unmapped),
 * AC-24 (session expiry / re-auth) — UC-6/UC-6b · BR-13/13a/20. RED state via loadModule().
 *
 * No real PII persisted: identity resolves via a seeded synthetic-handle mapping; the real
 * email is used transiently for the hosted-domain check only, then discarded.
 */
import { describe, it, expect } from "vitest";
import { loadModule, SEEDED_IDENTITY_MAP } from "./setup/test-helpers";

interface AuthModule {
  signInWithGoogle(args: {
    hostedDomain: string;
    syntheticHandle?: string;
    realEmail: string; // transient — must NOT be persisted
  }): Promise<
    | { ok: true; session: { profileId: string; role: string }; landingRoute: string }
    | { ok: false; userMessage: string; sessionCreated: false }
  >;
  /** Test seam: what (if anything) the auth layer persisted for this sign-in. */
  inspectPersistedIdentity(profileId: string): Promise<{ storedFields: string[] }>;
  resolveProtectedRequest(args: { sessionValid: boolean; inFlightDraft?: unknown }): Promise<{
    served: boolean;
    redirectTo?: string;
    draftWrittenUnderStaleSession: boolean;
  }>;
}

describe("AC-14 Google sign-in restricted to NULogic (happy path) [P1]", () => {
  it("resolves a nulogic.io identity deterministically to the SAME synthetic profile, no PII stored", async () => {
    const mod = await loadModule<AuthModule>("@/lib/auth/sign-in");
    const first = await mod.signInWithGoogle({
      hostedDomain: "nulogic.io",
      syntheticHandle: "synthetic-handle-001",
      realEmail: "[REDACTED]@nulogic.io",
    });
    expect(first.ok).toBe(true);
    expect((first as { session: { profileId: string } }).session.profileId).toBe(
      SEEDED_IDENTITY_MAP["synthetic-handle-001"],
    );

    // Deterministic: same handle -> same profile every time.
    const second = await mod.signInWithGoogle({
      hostedDomain: "nulogic.io",
      syntheticHandle: "synthetic-handle-001",
      realEmail: "[REDACTED]@nulogic.io",
    });
    expect((second as { session: { profileId: string } }).session.profileId).toBe(
      (first as { session: { profileId: string } }).session.profileId,
    );

    // No real PII persisted — only synthetic fields.
    const persisted = await mod.inspectPersistedIdentity("p-001");
    expect(persisted.storedFields).not.toContain("email");
    expect(persisted.storedFields).not.toContain("name");
  });
});

describe("AC-15 Non-NULogic / unmapped account rejected (error) [P0]", () => {
  it("creates no session and shows the restricted message for a wrong hosted domain", async () => {
    const mod = await loadModule<AuthModule>("@/lib/auth/sign-in");
    const res = await mod.signInWithGoogle({
      hostedDomain: "gmail.com",
      realEmail: "[REDACTED]@gmail.com",
    });
    expect(res.ok).toBe(false);
    expect((res as { sessionCreated: false }).sessionCreated).toBe(false);
    expect((res as { userMessage: string }).userMessage).toBe(
      "Sign-in is restricted to NULogic accounts. Please use your @nulogic.io Google account.",
    );
  });

  it("rejects a nulogic.io identity with no mapped profile", async () => {
    const mod = await loadModule<AuthModule>("@/lib/auth/sign-in");
    const res = await mod.signInWithGoogle({
      hostedDomain: "nulogic.io",
      syntheticHandle: "synthetic-handle-unmapped",
      realEmail: "[REDACTED]@nulogic.io",
    });
    expect(res.ok).toBe(false);
  });
});

describe("AC-24 Expired session redirect / graceful in-flight (error) [P1]", () => {
  it("serves no protected data on an expired session and redirects to sign-in", async () => {
    const mod = await loadModule<AuthModule>("@/lib/auth/session-guard");
    const res = await mod.resolveProtectedRequest({ sessionValid: false, inFlightDraft: { skill: "x" } });
    expect(res.served).toBe(false);
    expect(res.redirectTo).toMatch(/sign-in|auth/i);
    expect(res.draftWrittenUnderStaleSession).toBe(false); // no garbage write under a stale identity
  });
});
