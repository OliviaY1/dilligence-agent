import { describe, expect, it } from "vitest";
import {
  addClaim,
  claimsOf,
  deleteClaim,
  editClaim,
  openCalls,
  resetClaims,
  timesAsked,
} from "@/lib/claims";
import { seedProjects } from "@/lib/mock-data";
import {
  createInterviewsFromPlan,
  generateMockResearchPlan,
  hypothesesFromThesis,
} from "@/lib/mock-service";
import type { DiligenceProject } from "@/lib/types";
import { validationInputKey } from "@/lib/validation-request";

const seed = (id: string) => seedProjects().find((p) => p.id === id)!;

/** Oakville before planning: its thesis and two contacts, no plan yet. */
const unplanned = (): DiligenceProject => {
  const { plan: _, ...p } = seed("oakville");
  return p;
};

/** Oakville with the plan approved, Maya's call done and Raj's not started. */
const underway = (): DiligenceProject => {
  const s = seed("oakville");
  const plan = { ...s.plan!, approved: true };
  const [maya, raj] = createInterviewsFromPlan(plan);
  return { ...s, plan, interviews: [{ ...maya!, status: "Completed" }, raj!] };
};

describe("claims before the first plan", () => {
  it("follow the thesis until edited; the plan is then built from the edited list", () => {
    const p = unplanned();
    expect(claimsOf(p)).toEqual(hypothesesFromThesis(p.thesis));

    const edited = addClaim(
      editClaim(p, "h2", { title: " Loyalty ", description: "We believe owners stay." }),
      { title: "Vet Supply", description: "We believe vets can be hired." },
    );
    expect(edited.draftClaims!.map((h) => h.title)).toEqual([
      "Customer Demand",
      "Loyalty",
      "Pricing Power",
      "Talent Retention",
      "Acquisition Platform",
      "Vet Supply",
    ]);
    expect(edited.draftClaims![1]!.evidence).toBe(
      "Interview evidence for or against: owners stay.",
    );

    const plan = generateMockResearchPlan(deleteClaim(edited, "h1"));
    expect(plan.hypotheses.map((h) => h.title)).toEqual(
      edited.draftClaims!.slice(1).map((h) => h.title),
    );
    expect(plan.experts.map((pe) => pe.hypothesisIds.length)).toEqual([5, 5]);

    expect(claimsOf(resetClaims(edited))).toEqual(hypothesesFromThesis(p.thesis));
  });
});

describe("claims once there is a plan", () => {
  it("a new claim goes to calls not made and not sent yet, and to no one else", () => {
    const p = underway();
    const out = addClaim(p, { title: "Vet Supply", description: "We believe vets can be hired." });
    const h = out.plan!.hypotheses.at(-1)!;
    expect(claimsOf(out).at(-1)).toEqual(h);
    const tests = (id: string) => out.plan!.experts.find((pe) => pe.expertId === id)!.hypothesisIds;
    expect(tests("e-raj")).toContain(h.id);
    expect(tests("e-maya")).not.toContain(h.id);

    // A sent link keeps the claims it was sent with.
    const sent = { ...p, interviews: p.interviews.map((iv) => ({ ...iv, sessionId: "s-1" })) };
    expect(openCalls(sent)).toHaveLength(0);
  });

  it("an unasked claim can be deleted; changing people keeps the plan's claims", () => {
    const p = addClaim(underway(), { title: "Vet Supply", description: "We believe vets stay." });
    const id = p.plan!.hypotheses.at(-1)!.id;
    expect(generateMockResearchPlan(p).hypotheses).toEqual(p.plan!.hypotheses);
    const out = deleteClaim(p, id);
    expect(claimsOf(out).some((h) => h.id === id)).toBe(false);
    expect(out.plan!.experts.flatMap((pe) => pe.hypothesisIds)).not.toContain(id);
  });

  it("a claim already asked can be reworded, which re-scores it, but not deleted", () => {
    const p = seed("maple-ridge");
    const asked = claimsOf(p).find((h) => timesAsked(p, h.id) > 0)!;
    expect(p.thesisValidation!.inputKey).toBe(validationInputKey(p));

    const out = editClaim(p, asked.id, { ...asked, description: "We believe something else." });
    expect(claimsOf(out).find((h) => h.id === asked.id)!.description).toBe(
      "We believe something else.",
    );
    expect(out.thesisValidation!.inputKey).not.toBe(validationInputKey(out));
    expect(deleteClaim(p, asked.id)).toBe(p);
  });
});
