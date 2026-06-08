/**
 * Profile & skill state machine — AC-16 (baseline skills), AC-17 (self-service),
 * AC-18 (manager approval), AC-22 (one canonical identity + promotion) —
 * UC-7/UC-8 · BR-14/15/16/18. RED state via loadModule().
 *
 * Skill identity de-dupe (AC-22) is Claude semantic normalization, NOT string equality.
 */
import { describe, it, expect } from "vitest";
import { loadModule, SYNTHETIC_PROFILES, makeClaudeClientSpy } from "./setup/test-helpers";

interface ProfileModule {
  getProfile(profileId: string): Promise<(typeof SYNTHETIC_PROFILES)[number]>;
  addOrUpdateSkill(args: {
    actorId: string;
    profileId: string;
    name: string;
    level?: string;
  }): Promise<{ ok: true; skill: { source: string; state: string } } | { ok: false; inlineError: string }>;
  approveSkill(args: {
    actorRole: string;
    actorHasAuthorityOver: boolean;
    profileId: string;
    canonicalSkillId: string;
  }): Promise<{ ok: true; state: string } | { ok: false; denied: true }>;
  upsertSkillFromSource(args: {
    profileId: string;
    name: string;
    incomingState: "self-reported" | "manager-approved" | "verified";
    claude: unknown;
  }): Promise<{ canonicalSkillId: string; state: string; createdNewRow: boolean; rowCount: number }>;
}

describe("AC-16 Baseline current skills present on the profile [P0]", () => {
  it("carries baseline skills (distinct from verified), current project, and availability", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/get-profile");
    const profile = await mod.getProfile("p-001");
    expect(profile.skills.some((s) => s.origin === "baseline")).toBe(true);
    expect(profile).toHaveProperty("currentProject");
    expect(profile).toHaveProperty("allocationPct");
    expect(profile).toHaveProperty("freeFrom");
  });
});

describe("AC-17 Employee self-service skill add/update (happy + invalid) [P1]", () => {
  it("writes a self-reported skill (not verified, not manager-approved)", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/self-service-skill");
    const res = await mod.addOrUpdateSkill({ actorId: "p-001", profileId: "p-001", name: "GraphQL", level: "intermediate" });
    expect(res).toMatchObject({ ok: true });
    expect((res as { skill: { source: string; state: string } }).skill).toMatchObject({
      source: "self-reported",
      state: "self-reported",
    });
  });

  it("rejects a blank/invalid entry inline with no garbage written", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/self-service-skill");
    const res = await mod.addOrUpdateSkill({ actorId: "p-001", profileId: "p-001", name: "   " });
    expect(res.ok).toBe(false);
    expect((res as { inlineError: string }).inlineError.length).toBeGreaterThan(0);
  });
});

describe("AC-18 Manager approval of self-reported skills (happy + unauthorized) [P1]", () => {
  it("transitions self-reported -> manager-approved for an authorized manager", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/approve-skill");
    const res = await mod.approveSkill({
      actorRole: "manager",
      actorHasAuthorityOver: true,
      profileId: "p-001",
      canonicalSkillId: "skill-typescript",
    });
    expect(res).toMatchObject({ ok: true, state: "manager-approved" });
  });

  it("denies approval for a user without authority (employee / PL outside team)", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/approve-skill");
    const res = await mod.approveSkill({
      actorRole: "practice-lead",
      actorHasAuthorityOver: false,
      profileId: "p-001",
      canonicalSkillId: "skill-typescript",
    });
    expect(res).toMatchObject({ ok: false, denied: true });
  });
});

describe("AC-22 One canonical skill identity + promotion (edge) [P0]", () => {
  it("promotes the SAME record self-reported -> verified via cert (no duplicate row)", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/upsert-skill");
    const claude = makeClaudeClientSpy({ canonicalSkillId: "skill-typescript", isSameAsExisting: true });
    const res = await mod.upsertSkillFromSource({
      profileId: "p-001", // already holds TypeScript self-reported
      name: "TypeScript",
      incomingState: "verified",
      claude,
    });
    expect(res.createdNewRow).toBe(false); // BR-18: promote in place
    expect(res.state).toBe("verified");
  });

  it("is a no-op (never demotes) when re-asserting at equal-or-lower trust", async () => {
    const mod = await loadModule<ProfileModule>("@/lib/profile/upsert-skill");
    const claude = makeClaudeClientSpy({ canonicalSkillId: "skill-react", isSameAsExisting: true });
    // p-002 holds React at manager-approved; re-asserting self-reported must not demote.
    const res = await mod.upsertSkillFromSource({
      profileId: "p-002",
      name: "React",
      incomingState: "self-reported",
      claude,
    });
    expect(res.createdNewRow).toBe(false);
    expect(res.state).toBe("manager-approved"); // unchanged, not demoted
  });
});
