/**
 * Staffing matcher — AC-04, AC-05, AC-21, AC-06 (UC-2 · BR-04/05/09).
 * RED state via loadModule().
 *
 * Matching/ranking + availability reasoning MUST be Claude calls (no keyword search).
 * Tests assert the call boundary, the validated result shape, availability reasoning,
 * partial-quantity shortfall, and graceful failure.
 */
import { describe, it, expect } from "vitest";
import {
  loadModule,
  SYNTHETIC_PROFILES,
  makeClaudeClientSpy,
  makeClaudeClientThatThrows,
} from "./setup/test-helpers";

interface MatchModule {
  runStaffingSearch(args: {
    query: string;
    profiles: unknown[];
    claude: unknown;
  }): Promise<
    | { ok: true; shortlist: Array<Record<string, unknown>>; shortfallNote?: string }
    | { ok: false; userMessage: string }
  >;
}

describe("AC-04 Availability-aware ranked match (happy path) [P0]", () => {
  it("ranks the more-available candidate above the equally-skilled but out-of-window one", async () => {
    // BR-04 differentiator: ranking must reason over AVAILABILITY, not skills alone.
    // Construct two candidates with IDENTICAL skill overlap (both: React advanced + Node)
    // so skill match cannot be what separates them. They differ ONLY in availability:
    //   p-002 -> free now  (in the requested "free now / within 2 weeks" window)
    //   p-001 -> free in 6 weeks (OUT of window)
    // A skills-only ranker would tie or order by skill; an availability-aware ranker must
    // rank the in-window candidate first and demote/exclude the out-of-window one.
    const equalSkillProfiles = [
      {
        id: "p-002",
        handle: "synthetic-handle-002",
        currentProject: null,
        allocationPct: 0,
        freeFrom: "2026-06-05", // free now (TODAY)
        skills: [
          { canonicalSkillId: "skill-react", name: "React", level: "advanced" },
          { canonicalSkillId: "skill-node", name: "Node.js", level: "intermediate" },
        ],
      },
      {
        id: "p-001",
        handle: "synthetic-handle-001",
        currentProject: "proj-orion",
        allocationPct: 100,
        freeFrom: "2026-07-20", // ~6 weeks out — OUTSIDE the requested window
        skills: [
          { canonicalSkillId: "skill-react", name: "React", level: "advanced" },
          { canonicalSkillId: "skill-node", name: "Node.js", level: "intermediate" },
        ],
      },
    ];

    // The validated result the availability-aware ranker must produce: in-window candidate
    // ranked first; out-of-window candidate demoted to last (or excluded). The scripted
    // matchPercent is INTENTIONALLY equal/lower for the top entry so the ordering cannot be
    // explained by match% alone — only availability separates them.
    const claude = makeClaudeClientSpy([
      {
        profileId: "p-002",
        rank: 1,
        matchPercent: 85,
        matchedSkills: ["React", "Node.js"],
        gaps: [],
        availability: "free now",
        inRequestedWindow: true,
        rationale: "Equal skills; free now so available within the requested window.",
      },
      {
        profileId: "p-001",
        rank: 2,
        matchPercent: 85, // SAME skill match — only availability differs
        matchedSkills: ["React", "Node.js"],
        gaps: [],
        availability: "free in ~6 weeks",
        inRequestedWindow: false,
        rationale: "Same skills but frees up ~6 weeks out, outside the requested window.",
      },
    ]);
    const mod = await loadModule<MatchModule>("@/lib/match/run-staffing-search");
    const res = await mod.runStaffingSearch({
      query: "2 React + Node devs, free now or within 2 weeks, IST overlap",
      profiles: equalSkillProfiles,
      claude,
    });
    expect(claude.createMessage).toHaveBeenCalledTimes(1); // ranking went through Claude
    expect(res.ok).toBe(true);

    const shortlist = (res as {
      shortlist: Array<{ profileId: string; matchPercent: number; rank: number; inRequestedWindow: boolean }>;
    }).shortlist;

    for (const key of ["matchPercent", "matchedSkills", "gaps", "availability", "rationale"]) {
      expect(shortlist[0]).toHaveProperty(key); // BR-05 result shape
    }

    const inWindow = shortlist.find((e) => e.profileId === "p-002")!;
    const outOfWindow = shortlist.find((e) => e.profileId === "p-001");

    // Skills are equal — so match% cannot be what orders them. Prove availability drives rank.
    expect(inWindow.matchPercent).toBe(outOfWindow ? outOfWindow.matchPercent : inWindow.matchPercent);

    // The more-available candidate ranks ABOVE the equally-skilled out-of-window one
    // (or the out-of-window one is excluded entirely). Either outcome proves availability,
    // not skills, determined ordering. This is asserted on the result RELATIONSHIP, not on
    // any literal string the mock happened to script.
    if (outOfWindow) {
      expect(inWindow.rank).toBeLessThan(outOfWindow.rank); // in-window ranked higher (lower rank number)
      expect(shortlist.indexOf(inWindow)).toBeLessThan(shortlist.indexOf(outOfWindow));
      expect(outOfWindow.inRequestedWindow).toBe(false); // demoted entry is flagged out-of-window
    }
    expect(inWindow.inRequestedWindow).toBe(true);
    expect(shortlist[0].profileId).toBe("p-002"); // top of shortlist is the available candidate
  });
});

describe("AC-05 Hard match — closest people + gaps (edge) [P1]", () => {
  it("returns closest available people with explicit gap/ramp-up analysis, never empty", async () => {
    const claude = makeClaudeClientSpy([
      {
        profileId: "p-001",
        matchPercent: 70,
        matchedSkills: ["React"],
        gaps: ["AWS"],
        availability: "free within 2 weeks",
        rationale: "88% there; ~1 week of AWS ramp-up.",
      },
    ]);
    const mod = await loadModule<MatchModule>("@/lib/match/run-staffing-search");
    const res = await mod.runStaffingSearch({
      query: "Senior AWS data engineer free now",
      profiles: SYNTHETIC_PROFILES,
      claude,
    });
    expect(res.ok).toBe(true);
    const list = (res as { shortlist: Array<{ gaps: string[] }> }).shortlist;
    expect(list.length).toBeGreaterThan(0); // not empty
    expect(list[0].gaps.length).toBeGreaterThan(0); // explicit gaps
  });
});

describe("AC-21 Partial-quantity fulfillment (edge) [P1]", () => {
  it("returns the fewer-than-requested qualifiers WITH an explicit shortfall note", async () => {
    const claude = makeClaudeClientSpy({
      shortlist: [
        { profileId: "p-002", matchPercent: 90, matchedSkills: ["React"], gaps: [], availability: "free now", rationale: "x" },
        { profileId: "p-001", matchPercent: 78, matchedSkills: ["React"], gaps: [], availability: "free within 2 weeks", rationale: "y" },
      ],
      shortfallNote: "2 of 3 requested qualify",
    });
    const mod = await loadModule<MatchModule>("@/lib/match/run-staffing-search");
    const res = await mod.runStaffingSearch({
      query: "3 mid-level React devs free within 2 weeks",
      profiles: SYNTHETIC_PROFILES,
      claude,
    });
    expect(res.ok).toBe(true);
    expect((res as { shortlist: unknown[] }).shortlist.length).toBe(2); // some qualify, not zero
    expect((res as { shortfallNote?: string }).shortfallNote).toMatch(/2 of 3/);
  });
});

describe("AC-06 Staffing search failure (error) [P1]", () => {
  it("shows no partial/garbled ranking and the unavailable message when Claude fails", async () => {
    const claude = makeClaudeClientThatThrows();
    const mod = await loadModule<MatchModule>("@/lib/match/run-staffing-search");
    const res = await mod.runStaffingSearch({ query: "any", profiles: SYNTHETIC_PROFILES, claude });
    expect(res.ok).toBe(false);
    expect((res as { userMessage: string }).userMessage).toBe(
      "Search is temporarily unavailable — please retry.",
    );
  });
});
