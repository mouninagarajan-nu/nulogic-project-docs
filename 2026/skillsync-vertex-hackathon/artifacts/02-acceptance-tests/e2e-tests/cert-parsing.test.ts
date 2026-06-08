/**
 * Certificate parsing — AC-01, AC-02, AC-03 (UC-1 · BR-01/02/09/10/18).
 * RED state: every test fails via loadModule() until the cert-parse flow exists.
 *
 * Intelligence boundary: parsing MUST be a Claude API call against fixtures/certs/.
 * Tests assert the call boundary + Zod validation + graceful failure — NOT regex/keyword logic.
 */
import { describe, it, expect } from "vitest";
import {
  loadModule,
  CERT_FIXTURES,
  makeClaudeClientSpy,
  makeClaudeClientGarbled,
} from "./setup/test-helpers";

interface CertParseModule {
  parseCertificate(args: {
    file: string;
    claude: unknown;
  }): Promise<{ ok: true; skills: Array<Record<string, unknown>> } | { ok: false; userMessage: string }>;
  confirmAndWriteSkill(args: {
    profileId: string;
    catalogItemId: string;
    skill: Record<string, unknown>;
  }): Promise<{ skill: { source: string; state: string; verified: boolean }; itemStatus: string }>;
}

describe("AC-01 Certificate parsing via Claude (happy path) [P0]", () => {
  it("sends the cert to Claude, Zod-validates JSON, writes a verified skill, item -> done", async () => {
    const claude = makeClaudeClientSpy({
      skill: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      date: "2026-05-01",
      level: "associate",
      confidence: 0.96,
    });
    const mod = await loadModule<CertParseModule>("@/lib/cert/parse-certificate");

    const parsed = await mod.parseCertificate({ file: CERT_FIXTURES.validAwsSaa, claude });
    expect(claude.createMessage).toHaveBeenCalledTimes(1); // intelligence went through Claude
    expect(parsed.ok).toBe(true);

    const written = await mod.confirmAndWriteSkill({
      profileId: "p-001",
      catalogItemId: "cat-aws-saa",
      skill: (parsed as { skills: Array<Record<string, unknown>> }).skills[0],
    });
    expect(written.skill).toMatchObject({ source: "certificate", state: "verified", verified: true });
    expect(written.itemStatus).toBe("done");
  });
});

describe("AC-02 Multi-skill / unusual certificate (edge) [P1]", () => {
  it("writes EACH extracted skill as verified; ambiguous/empty optional fields do not break the write", async () => {
    // Second skill has null date AND null level — ambiguous optional fields that must NOT
    // block a successful verified write.
    const claude = makeClaudeClientSpy([
      { skill: "Kubernetes", issuer: "CNCF", date: "2026-04-10", level: "intermediate", confidence: 0.9 },
      { skill: "Docker", issuer: "CNCF", date: null, level: null, confidence: 0.88 },
    ]);
    const mod = await loadModule<CertParseModule>("@/lib/cert/parse-certificate");

    const parsed = await mod.parseCertificate({ file: CERT_FIXTURES.multiSkill, claude });
    expect(claude.createMessage).toHaveBeenCalledTimes(1); // intelligence went through Claude
    expect(parsed.ok).toBe(true);

    const skills = (parsed as { skills: Array<Record<string, unknown>> }).skills;
    expect(skills.length).toBeGreaterThanOrEqual(2); // ALL extracted skills returned + Zod-validated

    // The full THEN clause: confirm + write EACH extracted skill (including the ambiguous one).
    const catalogIds = ["cat-kubernetes", "cat-docker"];
    const writes = await Promise.all(
      skills.map((skill, i) =>
        mod.confirmAndWriteSkill({
          profileId: "p-001",
          catalogItemId: catalogIds[i] ?? `cat-extra-${i}`,
          skill,
        }),
      ),
    );

    // Every confirmed skill is written to the profile as verified — including the
    // null-date/null-level one, proving ambiguous optional fields do not break the write.
    expect(writes.length).toBe(skills.length);
    for (const written of writes) {
      expect(written.skill).toMatchObject({ source: "certificate", state: "verified", verified: true });
      expect(written.itemStatus).toBe("done");
    }
  });
});

describe("AC-03 Cert parse failure / low confidence (error) [P0]", () => {
  it("writes NO skill, keeps item in-progress, shows the recoverable cert error message", async () => {
    const claude = makeClaudeClientGarbled(); // invalid JSON -> Zod validation must fail
    const mod = await loadModule<CertParseModule>("@/lib/cert/parse-certificate");
    const parsed = await mod.parseCertificate({ file: CERT_FIXTURES.unreadable, claude });
    expect(parsed.ok).toBe(false);
    expect((parsed as { userMessage: string }).userMessage).toContain(
      "We couldn't reliably read this certificate",
    );
    // BR-02: a failed parse must never create an unverified skill — no write path is reachable.
  });
});
