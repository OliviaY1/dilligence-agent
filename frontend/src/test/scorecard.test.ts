import { describe, expect, it } from "vitest";
import { scorecardRows } from "@/components/scorecard";
import { seedProjects } from "@/lib/mock-data";
import { allInterviews } from "@/lib/mock-service";
import { validationInputKey } from "@/lib/thesis-validation";

const northstar = () => seedProjects().find((p) => p.id === "northstar")!;

describe("evidence scorecard", () => {
  it("has one row per claim with status, evidence count and at most two quotes", () => {
    const rows = scorecardRows(northstar());
    expect(rows.map((r) => [r.label, r.status, r.evidenceCount])).toEqual([
      ["H1", "unclear", 2],
      ["H2", "contradicted", 2],
      ["H3", "unclear", 0],
      ["H4", "supported", 1],
      ["H5", "contradicted", 2],
    ]);
    expect(rows[3]!.quotes[0]!.who).toBe("David Okafor");
  });

  it("shows every claim as unclear before any interview has finished", () => {
    const { thesisValidation: _, ...p } = northstar();
    expect(scorecardRows(p).every((r) => r.status === "unclear" && r.evidenceCount === 0)).toBe(true);
  });

  it("sample data is current and quotes only what interviewees said", () => {
    const withResults = seedProjects().filter((p) => p.thesisValidation);
    expect(withResults.map((p) => p.id)).toEqual(["maple-ridge", "northstar"]);
    for (const p of withResults) {
      // Otherwise opening the sample would call Claude straight away.
      expect(p.thesisValidation!.inputKey).toBe(validationInputKey(p));
      const said = (id: string) =>
        allInterviews(p)
          .find((iv) => iv.id === id)!
          .transcript.filter((t) => t.speaker === "expert")
          .map((t) => t.text)
          .join(" ");
      for (const h of p.thesisValidation!.hypotheses)
        for (const e of h.evidence) expect(said(e.interviewId)).toContain(e.quote);
    }
  });

  it("the demo project shows every status and a ready next round", () => {
    const demo = seedProjects().find((p) => p.id === "maple-ridge")!;
    expect(scorecardRows(demo).map((r) => r.status)).toEqual(["supported", "supported", "contradicted", "unclear"]);
    expect(demo.nextRound!.basedOn).toBe(demo.thesisValidation!.at);
    expect(demo.interviews.filter((iv) => iv.status === "Not Started")).toHaveLength(1);
  });
});
