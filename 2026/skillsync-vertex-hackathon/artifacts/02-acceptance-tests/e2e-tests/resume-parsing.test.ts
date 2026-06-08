/**
 * Resume parsing — AC-19 (happy), AC-20 (graceful failure) — UC-9 · BR-17/09/18.
 * RED state via loadModule().
 *
 * Resume parsing MUST be a Claude API call against fixtures/resumes/ (NO regex/keyword).
 * Resume is self-attested -> extracted baseline skills are source=self-reported (not verified).
 */
import { describe, it, expect } from "vitest";
import {
  loadModule,
  RESUME_FIXTURES,
  makeClaudeClientSpy,
  makeClaudeClientGarbled,
} from "./setup/test-helpers";

interface ResumeModule {
  parseResume(args: { file: string; claude: unknown }): Promise<
    | { ok: true; extracted: { currentProject?: string; allocation?: number; baselineSkills: string[] } }
    | { ok: false; userMessage: string }
  >;
  confirmAndPrepopulate(args: { profileId: string; extracted: Record<string, unknown> }): Promise<{
    baselineSkillsWritten: Array<{ source: string; state: string }>;
  }>;
}

describe("AC-19 Resume upload + Claude extraction (happy path) [P1]", () => {
  it("sends the resume to Claude, Zod-validates JSON, pre-populates baseline skills as self-reported", async () => {
    const claude = makeClaudeClientSpy({
      currentProject: "proj-orion",
      allocation: 60,
      baselineSkills: ["React", "TypeScript", "Node.js"],
    });
    const mod = await loadModule<ResumeModule>("@/lib/resume/parse-resume");
    const parsed = await mod.parseResume({ file: RESUME_FIXTURES.validEngineer, claude });
    expect(claude.createMessage).toHaveBeenCalledTimes(1); // intelligence via Claude, not regex
    expect(parsed.ok).toBe(true);

    const written = await mod.confirmAndPrepopulate({
      profileId: "p-001",
      extracted: (parsed as { extracted: Record<string, unknown> }).extracted,
    });
    expect(written.baselineSkillsWritten.length).toBeGreaterThan(0);
    expect(written.baselineSkillsWritten.every((s) => s.source === "self-reported")).toBe(true);
    expect(written.baselineSkillsWritten.every((s) => s.state === "self-reported")).toBe(true);
  });
});

describe("AC-20 Resume parse failure degrades gracefully (error) [P1]", () => {
  it("writes nothing and shows the recoverable resume error when Claude returns invalid JSON", async () => {
    const claude = makeClaudeClientGarbled();
    const mod = await loadModule<ResumeModule>("@/lib/resume/parse-resume");
    const parsed = await mod.parseResume({ file: RESUME_FIXTURES.unreadable, claude });
    expect(parsed.ok).toBe(false);
    expect((parsed as { userMessage: string }).userMessage).toContain(
      "We couldn't reliably read this resume",
    );
    // BR-17: nothing written on failure — no prepopulate path is reachable.
  });
});
