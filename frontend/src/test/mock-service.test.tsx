import { describe, expect, it } from "vitest";
import { OAKVILLE_THESIS, seedProjects } from "@/lib/mock-data";
import {
  canRecommendNextRound,
  completeMockInterview,
  generateMockResearchPlan,
  hypothesesFromThesis,
  missingSamples,
  withoutProject,
} from "@/lib/mock-service";

describe("research rounds", () => {
  it("offers the next round once one interview is completed", () => {
    const seed = seedProjects().find((p) => p.id === "northstar")!;
    const p = { ...seed, interviews: seed.interviews.map((iv) => ({ ...iv, status: "Not Started" as const })) };
    expect(canRecommendNextRound(p)).toBe(false);
    const oneDone = { ...p, interviews: p.interviews.map((iv, k) => (k === 0 ? completeMockInterview(iv) : iv)) };
    expect(canRecommendNextRound(oneDone)).toBe(true);
  });
});

describe("saved projects", () => {
  it("deleting one project leaves the others untouched", () => {
    const ps = seedProjects();
    expect(withoutProject(ps, "northstar").map((p) => p.id)).toEqual(["maple-ridge", "harbor", "summit", "oakville"]);
    expect(withoutProject(ps, "not-saved")).toHaveLength(ps.length);
  });

  it("offers sample projects only when they are not already saved", () => {
    const ps = seedProjects();
    expect(missingSamples(ps)).toHaveLength(0);
    expect(missingSamples([]).map((p) => p.id)).toEqual(["maple-ridge", "northstar", "harbor", "summit", "oakville"]);
    expect(missingSamples([ps[0]!]).map((p) => p.id)).toEqual(["northstar", "harbor", "summit", "oakville"]);
  });
});

describe("hypotheses from the thesis", () => {
  it("turns each 'Label: We believe …' pillar of the Oakville thesis into a hypothesis", () => {
    const hs = hypothesesFromThesis(OAKVILLE_THESIS);
    expect(hs.map((h) => h.title)).toEqual([
      "Market Attractiveness",
      "Competitive Positioning",
      "Organic Revenue Growth",
      "Operational Efficiency",
      "Talent Retention",
      "Acquisition-Led Expansion",
      "Financial Returns",
    ]);
    expect(hs[0]!.description.startsWith("We believe Oakville's")).toBe(true);
  });

  it("falls back to the template for free-text theses", () => {
    expect(hypothesesFromThesis("A great company with strong growth.")).toEqual([]);
  });

  it("uses the pillars in a generated plan", () => {
    const p = seedProjects().find((x) => x.id === "oakville")!;
    const plan = generateMockResearchPlan({
      ...p,
      experts: [
        { id: "c1", name: "Olivia", title: "Custom contact", phone: "", description: "Dog owner", source: "Custom" },
      ],
    });
    expect(plan.hypotheses).toHaveLength(7);
    expect(plan.experts[0]!.hypothesisIds).toHaveLength(7);
  });
});
