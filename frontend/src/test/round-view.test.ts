import { describe, expect, it } from "vitest";
import { seedProjects } from "@/lib/mock-data";
import { roundsOf } from "@/lib/mock-service";
import { startNextRoundFrom } from "@/lib/next-round";
import { roundIndex } from "@/lib/round-view";

const oakville = () => seedProjects()[0]!;

describe("round view state", () => {
  it("follows the current round unless the consultant picks one", () => {
    const n = oakville();
    const p = startNextRoundFrom(n, { at: "", model: "", basedOn: "", plan: n.plan!, newExperts: [], why: {} });
    expect(roundsOf(p).length).toBe(2);
    expect(roundIndex(p, null)).toBe(1);
    expect(roundIndex(p, 0)).toBe(0);
  });

  it("clamps a pick to rounds that actually exist", () => {
    const p = oakville();
    expect(roundsOf(p).length).toBe(1);
    expect(roundIndex(p, 4)).toBe(0);
    expect(roundIndex(p, -2)).toBe(0);
  });
});
