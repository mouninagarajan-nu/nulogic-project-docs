/**
 * Upskilling plan validation gate — AC-26 (UC-1 · BR-11). RED state via loadModule().
 *
 * Finalizing a plan requires >=2 items incl. >=1 AI-enabled (AI-enabled reuses the catalog
 * Claude-assigned tag, BR-07). The count + AI-enabled check is a plan-validation constraint,
 * NOT new intelligence. Covers happy / non-conforming (specific message) / remove-swap-to-conform.
 */
import { describe, it, expect } from "vitest";
import { loadModule } from "./setup/test-helpers";

interface CatalogItemRef {
  id: string;
  aiEnabled: boolean;
}

interface PlanModule {
  finalizePlan(args: { profileId: string; items: CatalogItemRef[] }): Promise<
    | { ok: true; markedComplete: true; countsTowardCompliance: true }
    | { ok: false; markedComplete: false; message: string }
  >;
}

describe("AC-26 Upskilling plan validation gate (happy + non-conforming + remove/swap) [P1]", () => {
  it("accepts a conforming plan (>=2 items incl. >=1 AI-enabled) and counts it toward compliance", async () => {
    const mod = await loadModule<PlanModule>("@/lib/plan/finalize");
    const res = await mod.finalizePlan({
      profileId: "p-001",
      items: [
        { id: "cat-claude", aiEnabled: true },
        { id: "cat-aws-saa", aiEnabled: false },
      ],
    });
    expect(res).toMatchObject({ ok: true, markedComplete: true, countsTowardCompliance: true });
  });

  it("rejects a plan with fewer than 2 items with the specific too-few message; not marked complete", async () => {
    const mod = await loadModule<PlanModule>("@/lib/plan/finalize");
    const res = await mod.finalizePlan({ profileId: "p-001", items: [{ id: "cat-claude", aiEnabled: true }] });
    expect(res.ok).toBe(false);
    expect((res as { markedComplete: false }).markedComplete).toBe(false);
    expect((res as { message: string }).message).toBe("Pick at least 2 items for your plan.");
  });

  it("rejects a plan with zero AI-enabled items with the specific AI-enabled message", async () => {
    const mod = await loadModule<PlanModule>("@/lib/plan/finalize");
    const res = await mod.finalizePlan({
      profileId: "p-001",
      items: [
        { id: "cat-aws-saa", aiEnabled: false },
        { id: "cat-k8s", aiEnabled: false },
      ],
    });
    expect(res.ok).toBe(false);
    expect((res as { message: string }).message).toBe("Your plan needs at least one AI-enabled item.");
  });

  it("re-validates and accepts after swapping in an AI-enabled item (remove/swap to conform)", async () => {
    const mod = await loadModule<PlanModule>("@/lib/plan/finalize");
    // Non-conforming first, then swap one item for an AI-enabled one and re-finalize.
    const conforming = await mod.finalizePlan({
      profileId: "p-001",
      items: [
        { id: "cat-aws-saa", aiEnabled: false },
        { id: "cat-claude", aiEnabled: true }, // swapped in
      ],
    });
    expect(conforming).toMatchObject({ ok: true, markedComplete: true });
  });
});
