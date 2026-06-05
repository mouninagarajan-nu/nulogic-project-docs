/**
 * Catalog intelligence — AC-08 (de-dupe), AC-09 (tag/enrich + degrade), AC-10 (recommend),
 * AC-27 (manager 'endorsed' flag) — UC-5 · BR-06/07/08/22. RED state via loadModule().
 *
 * De-dupe/tag/enrich/recommend MUST be Claude calls (no string-equality/regex).
 */
import { describe, it, expect } from "vitest";
import { loadModule, makeClaudeClientSpy, makeClaudeClientThatThrows } from "./setup/test-helpers";

interface CatalogModule {
  addCatalogItem(args: { name: string; existing: unknown[]; claude: unknown }): Promise<{
    canonicalId: string;
    merged: boolean;
    tags?: { aiEnabled: boolean; skillArea: string };
    enrichmentPending?: boolean;
  }>;
  recommendItems(args: { profileId: string; claude: unknown }): Promise<{ items: unknown[] }>;
  setEndorsed(args: { itemId: string; endorsed: boolean; actorRole: string }): Promise<
    { ok: true; endorsed: boolean } | { ok: false; denied: true }
  >;
}

describe("AC-08 Catalog de-dupe / normalize on add (happy + edge) [P1]", () => {
  it("merges a near-duplicate into the existing canonical item via a Claude call", async () => {
    const claude = makeClaudeClientSpy({ canonicalId: "cat-aws-saa", isDuplicateOf: "cat-aws-saa" });
    const mod = await loadModule<CatalogModule>("@/lib/catalog/add-item");
    const res = await mod.addCatalogItem({
      name: "AWS Solutions Architect",
      existing: [{ id: "cat-aws-saa", name: "AWS Certified Solutions Architect" }],
      claude,
    });
    expect(claude.createMessage).toHaveBeenCalledTimes(1); // de-dupe is a Claude call, not regex
    expect(res.merged).toBe(true);
    expect(res.canonicalId).toBe("cat-aws-saa");
  });
});

describe("AC-09 Catalog auto-tag + enrich on add (happy + degrade) [P2]", () => {
  it("auto-tags and enriches a new item via Claude", async () => {
    const claude = makeClaudeClientSpy({
      tags: { aiEnabled: true, skillArea: "GenAI", level: "intermediate", roleRelevance: ["engineer"] },
      enrichment: { description: "…", duration: "4 weeks", provider: "Synthetic Provider", prerequisites: [] },
    });
    const mod = await loadModule<CatalogModule>("@/lib/catalog/add-item");
    const res = await mod.addCatalogItem({ name: "Building with Claude", existing: [], claude });
    expect(res.tags?.aiEnabled).toBe(true);
  });

  it("saves with enrichmentPending when enrichment fails — never blocks the add", async () => {
    const claude = makeClaudeClientThatThrows("enrichment failed");
    const mod = await loadModule<CatalogModule>("@/lib/catalog/add-item");
    const res = await mod.addCatalogItem({ name: "Some New Course", existing: [], claude });
    expect(res.enrichmentPending).toBe(true); // graceful degradation, item still saved
  });
});

describe("AC-10 Personalized recommendations (happy path) [P2]", () => {
  it("returns Claude-recommended catalog items relevant to the employee's role/team/skills/gaps", async () => {
    const claude = makeClaudeClientSpy({ items: [{ id: "cat-aws-saa", reason: "addresses surfaced AWS gap" }] });
    const mod = await loadModule<CatalogModule>("@/lib/catalog/recommend");
    const res = await mod.recommendItems({ profileId: "p-001", claude });
    expect(claude.createMessage).toHaveBeenCalledTimes(1);
    expect(res.items.length).toBeGreaterThan(0);
  });
});

describe("AC-27 Manager 'endorsed' catalog flag (happy + unauthorized) [P2]", () => {
  it("lets a manager set then unset endorsed", async () => {
    const mod = await loadModule<CatalogModule>("@/lib/catalog/endorse");
    const set = await mod.setEndorsed({ itemId: "cat-aws-saa", endorsed: true, actorRole: "manager" });
    expect(set).toMatchObject({ ok: true, endorsed: true });
    const unset = await mod.setEndorsed({ itemId: "cat-aws-saa", endorsed: false, actorRole: "manager" });
    expect(unset).toMatchObject({ ok: true, endorsed: false });
  });

  it("denies a non-manager (employee) from toggling endorsed", async () => {
    const mod = await loadModule<CatalogModule>("@/lib/catalog/endorse");
    const res = await mod.setEndorsed({ itemId: "cat-aws-saa", endorsed: true, actorRole: "employee" });
    expect(res).toMatchObject({ ok: false, denied: true });
  });
});
