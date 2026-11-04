import { describe, expect, it } from "vitest";
import { scorecardRows } from "@/components/scorecard";
import { seedProjects } from "@/lib/mock-data";
import { allInterviews } from "@/lib/mock-service";
import { validationInputKey } from "@/lib/validation-request";

const demo = () => seedProjects().find((p) => p.id === "maple-ridge")!;

describe("evidence scorecard", () => {
  it("has one row per claim with status, evidence count and at most two quotes", () => {
    const rows = scorecardRows(demo());
    expect(rows.map((r) => [r.label, r.status, r.evidenceCount])).toEqual([
      ["H1", "supported", 2],
      ["H2", "supported", 3],
      ["H3", "contradicted", 3],
      ["H4", "unclear", 2],
    ]);
    expect(rows[1]!.quotes).toHaveLength(2);
    expect(rows[2]!.quotes[0]!.who).toBe("Raj Patel");
  });

  it("shows every claim as unclear before any interview has finished", () => {
    const { thesisValidation: _, ...p } = demo();
    expect(scorecardRows(p).every((r) => r.status === "unclear" && r.evidenceCount === 0)).toBe(true);
  });

  it("demo data is current, quotes only what interviewees said, and has a next round ready", () => {
    const p = demo();
    // Otherwise opening the demo would call Claude straight away.
    expect(p.thesisValidation!.inputKey).toBe(validationInputKey(p));
    const said = (id: string) =>
      allInterviews(p)
        .find((iv) => iv.id === id)!
        .transcript.filter((t) => t.speaker === "expert")
        .map((t) => t.text)
        .join(" ");
    for (const h of p.thesisValidation!.hypotheses)
      for (const e of h.evidence) expect(said(e.interviewId)).toContain(e.quote);
    expect(p.nextRound!.basedOn).toBe(p.thesisValidation!.at);
    expect(p.interviews.filter((iv) => iv.status === "Not Started")).toHaveLength(1);
  });
});
