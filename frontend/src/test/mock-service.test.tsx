import { describe, expect, it } from "vitest";
import { OAKVILLE_THESIS, seedProjects } from "@/lib/mock-data";
import {
  canRecommendNextRound,
  completeMockInterview,
  createInterviewsFromPlan,
  generateMockResearchPlan,
  hypothesesFromThesis,
  missingSamples,
  withoutProject,
} from "@/lib/mock-service";

describe("research rounds", () => {
  it("offers the next round once one interview is completed", () => {
    const seed = seedProjects()[0]!;
    const plan = { ...seed.plan!, approved: true };
    const p = { ...seed, plan, interviews: createInterviewsFromPlan(plan) };
    expect(canRecommendNextRound(p)).toBe(false);
    const oneDone = { ...p, interviews: p.interviews.map((iv, k) => (k === 0 ? completeMockInterview(iv) : iv)) };
    expect(canRecommendNextRound(oneDone)).toBe(true);
  });
});

describe("saved projects", () => {
  it("deleting one project leaves the others untouched", () => {
    const ps = seedProjects();
    expect(withoutProject(ps, "oakville")).toEqual([]);
    expect(withoutProject(ps, "not-saved")).toHaveLength(ps.length);
  });

  it("offers the sample project only when it is not already saved", () => {
    expect(missingSamples(seedProjects())).toHaveLength(0);
    expect(missingSamples([]).map((p) => p.id)).toEqual(["oakville"]);
  });
});

describe("hypotheses from the thesis", () => {
  it("turns each 'Label: We believe …' pillar of the Oakville thesis into a hypothesis", () => {
    const hs = hypothesesFromThesis(OAKVILLE_THESIS);
    expect(hs.map((h) => h.title)).toEqual([
      "Customer Demand",
      "Customer Loyalty",
      "Pricing Power",
      "Talent Retention",
      "Acquisition Platform",
    ]);
    // The example's claims are exactly what its thesis says.
    expect(hs.map((h) => h.description)).toEqual(seedProjects()[0]!.plan!.hypotheses.map((h) => h.description));
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
    expect(plan.hypotheses).toHaveLength(5);
    expect(plan.experts[0]!.hypothesisIds).toHaveLength(5);
  });
});
