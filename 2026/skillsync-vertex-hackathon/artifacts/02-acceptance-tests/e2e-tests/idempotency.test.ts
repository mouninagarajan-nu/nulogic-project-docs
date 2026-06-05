/**
 * Idempotent / de-duplicated double-submit of cert or resume upload —
 * AC-23 (UC-1/UC-9 · BR-19). RED state via loadModule().
 *
 * A double-submit (double-click / retry / network re-send of the SAME file) must converge
 * to a single result: no duplicate skill record, no duplicate promotion, no duplicate
 * resume pre-population. Composes with BR-18 (skill upsert) but also guards the upload action.
 */
import { describe, it, expect } from "vitest";
import { loadModule, CERT_FIXTURES, RESUME_FIXTURES, makeClaudeClientSpy } from "./setup/test-helpers";

interface UploadModule {
  submitCertUpload(args: { profileId: string; file: string; idempotencyKey: string; claude: unknown }): Promise<{
    skillRowCount: number;
    promotionCount: number;
    deduped: boolean;
  }>;
  submitResumeUpload(args: { profileId: string; file: string; idempotencyKey: string; claude: unknown }): Promise<{
    prepopulationCount: number;
    baselineSkillRowCount: number;
    deduped: boolean;
  }>;
}

describe("AC-23 Idempotent double-submit (cert + resume) (edge) [P1]", () => {
  it("cert: two submits of the same file converge to one skill record / one promotion", async () => {
    const mod = await loadModule<UploadModule>("@/lib/upload/submit");
    const claude = makeClaudeClientSpy({ skill: "AWS Certified Solutions Architect", confidence: 0.95 });
    const args = { profileId: "p-001", file: CERT_FIXTURES.validAwsSaa, idempotencyKey: "cert-key-1", claude };

    const first = await mod.submitCertUpload(args);
    const second = await mod.submitCertUpload(args); // double-submit, same key/file

    expect(second.deduped).toBe(true);
    expect(second.skillRowCount).toBe(first.skillRowCount); // no duplicate row
    expect(second.promotionCount).toBe(first.promotionCount); // no duplicate promotion
  });

  it("resume: two submits of the same file converge to one pre-population", async () => {
    const mod = await loadModule<UploadModule>("@/lib/upload/submit");
    const claude = makeClaudeClientSpy({ baselineSkills: ["React", "Node.js"] });
    const args = { profileId: "p-001", file: RESUME_FIXTURES.validEngineer, idempotencyKey: "resume-key-1", claude };

    const first = await mod.submitResumeUpload(args);
    const second = await mod.submitResumeUpload(args);

    expect(second.deduped).toBe(true);
    expect(second.prepopulationCount).toBe(first.prepopulationCount);
    expect(second.baselineSkillRowCount).toBe(first.baselineSkillRowCount); // no duplicate baseline skills
  });
});
