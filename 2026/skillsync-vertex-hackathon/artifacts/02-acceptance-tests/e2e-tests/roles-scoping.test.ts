/**
 * Roles, scoping, progress summary, admin role management —
 * AC-11, AC-12, AC-25 (UC-4/UC-10 · BR-03/21). RED state via loadModule().
 *
 * Progress summarization MUST be a Claude call. Role scoping + admin assignment are
 * authorization boundaries.
 */
import { describe, it, expect } from "vitest";
import { loadModule, makeClaudeClientSpy, makeClaudeClientThatThrows } from "./setup/test-helpers";

interface RoleModule {
  listVisibleProfiles(args: { actorId: string; actorRole: string; teamId?: string }): Promise<
    Array<{ id: string; teamId: string }>
  >;
  canAccessMatcher(role: string): boolean;
  summarizeProgress(args: { actorId: string; actorRole: string; claude: unknown }): Promise<
    { ok: true; summary: string } | { ok: false; emptyMessage?: string; userMessage?: string }
  >;
  assignRole(args: { actorRole: string; targetUserId: string; newRole: string }): Promise<
    { ok: true; role: string } | { ok: false; denied: true }
  >;
}

describe("AC-11 Role-based data scoping (happy + unauthorized) [P1]", () => {
  it("limits a Practice Lead to their own team's profiles", async () => {
    const mod = await loadModule<RoleModule>("@/lib/roles/scoping");
    const visible = await mod.listVisibleProfiles({ actorId: "pl-1", actorRole: "practice-lead", teamId: "team-alpha" });
    expect(visible.every((p) => p.teamId === "team-alpha")).toBe(true);
  });

  it("lets Manager/HR and Admin see the whole org", async () => {
    const mod = await loadModule<RoleModule>("@/lib/roles/scoping");
    const mgr = await mod.listVisibleProfiles({ actorId: "m-1", actorRole: "manager" });
    expect(new Set(mgr.map((p) => p.teamId)).size).toBeGreaterThan(1);
  });

  it("denies an Employee access to the Staffing Matcher", async () => {
    const mod = await loadModule<RoleModule>("@/lib/roles/scoping");
    expect(mod.canAccessMatcher("employee")).toBe(false);
    expect(mod.canAccessMatcher("manager")).toBe(true);
  });
});

describe("AC-12 Team progress / compliance summary (happy + empty) [P2]", () => {
  it("summarizes progress via Claude, scoped to the viewer's permission", async () => {
    const claude = makeClaudeClientSpy({ summary: "2 on track, 1 behind; React coverage thin." });
    const mod = await loadModule<RoleModule>("@/lib/roles/progress-summary");
    const res = await mod.summarizeProgress({ actorId: "m-1", actorRole: "manager", claude });
    expect(claude.createMessage).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  it("shows the empty message for a Practice Lead with no team members", async () => {
    const mod = await loadModule<RoleModule>("@/lib/roles/progress-summary");
    const res = await mod.summarizeProgress({
      actorId: "pl-empty",
      actorRole: "practice-lead",
      claude: makeClaudeClientThatThrows("should not be called for empty team"),
    });
    expect(res.ok).toBe(false);
    expect((res as { emptyMessage?: string }).emptyMessage).toBe("No team members assigned yet.");
  });
});

describe("AC-25 Admin assigns / overrides a role (happy + unauthorized) [P2]", () => {
  it("lets an Admin assign/override a target user's role", async () => {
    const mod = await loadModule<RoleModule>("@/lib/roles/admin-assign");
    const res = await mod.assignRole({ actorRole: "admin", targetUserId: "p-001", newRole: "manager" });
    expect(res).toMatchObject({ ok: true, role: "manager" });
  });

  it("denies a non-Admin from assigning roles", async () => {
    const mod = await loadModule<RoleModule>("@/lib/roles/admin-assign");
    const res = await mod.assignRole({ actorRole: "manager", targetUserId: "p-001", newRole: "admin" });
    expect(res).toMatchObject({ ok: false, denied: true });
  });
});
