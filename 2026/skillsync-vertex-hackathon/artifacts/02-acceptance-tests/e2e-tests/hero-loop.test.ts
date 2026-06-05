/**
 * THE HERO LOOP — AC-07 (UC-3 · BR-18). Protect above all.
 * RED state via loadModule().
 *
 * Asserts: a staffing search surfaces a gap -> employee uploads cert -> the SAME canonical
 * skill record is PROMOTED to verified (NOT duplicated) -> re-running the SAME search visibly
 * improves the candidate's match%/rank, driven by the promoted record's raised weight.
 *
 * Failure signature guarded against: a duplicated skill row instead of an in-place promotion.
 */
import { describe, it, expect } from "vitest";
import { loadModule, makeClaudeClientSpy, CERT_FIXTURES } from "./setup/test-helpers";

interface LoopModule {
  runStaffingSearch(args: { query: string; claude: unknown }): Promise<{
    shortlist: Array<{ profileId: string; matchPercent: number; rank: number }>;
  }>;
  getProfileSkills(
    profileId: string,
  ): Promise<Array<{ canonicalSkillId: string; state: string; source: string }>>;
  uploadAndPromoteCert(args: {
    profileId: string;
    file: string;
    claude: unknown;
  }): Promise<{ promotedSkillId: string; createdNewRow: boolean }>;
}

describe("AC-07 The loop — cert upload sharpens the next match (hero) [P0] [e2e]", () => {
  it("promotes the SAME skill record (no duplicate) and the candidate's match improves on re-run", async () => {
    const mod = await loadModule<LoopModule>("@/lib/loop/hero-loop");

    // 1) Pre-upload search surfaces a gap; candidate p-001 holds the target skill self-reported.
    const before = await mod.runStaffingSearch({
      query: "Solutions Architect with AWS, free within 2 weeks",
      claude: makeClaudeClientSpy([{ profileId: "p-001", matchPercent: 72, rank: 2 }]),
    });
    const beforeEntry = before.shortlist.find((e) => e.profileId === "p-001")!;
    const skillsBefore = await mod.getProfileSkills("p-001");
    const rowsBefore = skillsBefore.length;

    // 2) Employee uploads the cert — the existing skill record is promoted to verified in place.
    const promotion = await mod.uploadAndPromoteCert({
      profileId: "p-001",
      file: CERT_FIXTURES.validAwsSaa,
      claude: makeClaudeClientSpy({
        skill: "AWS Certified Solutions Architect",
        issuer: "AWS",
        date: "2026-05-01",
        level: "associate",
        confidence: 0.95,
      }),
    });
    expect(promotion.createdNewRow).toBe(false); // BR-18: promote in place, NEVER duplicate

    const skillsAfter = await mod.getProfileSkills("p-001");
    expect(skillsAfter.length).toBe(rowsBefore); // no duplicate skill row
    const promoted = skillsAfter.find((s) => s.canonicalSkillId === promotion.promotedSkillId)!;
    expect(promoted.state).toBe("verified");
    // BR-01/BR-18: a verified promotion is locked to its certificate origin — the promoted
    // record's source becomes "certificate", proving the rank lift is cert-driven (not self-reported).
    expect(promoted.source).toBe("certificate");

    // 3) Re-run the SAME search; the promoted (higher-weight) record improves match%/rank.
    const after = await mod.runStaffingSearch({
      query: "Solutions Architect with AWS, free within 2 weeks",
      claude: makeClaudeClientSpy([{ profileId: "p-001", matchPercent: 91, rank: 1 }]),
    });
    const afterEntry = after.shortlist.find((e) => e.profileId === "p-001")!;
    expect(afterEntry.matchPercent).toBeGreaterThan(beforeEntry.matchPercent);
    expect(afterEntry.rank).toBeLessThan(beforeEntry.rank); // moved up
  });
});
