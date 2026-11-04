import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { DiligenceProject } from "../frontend/src/lib/types";
import { finishInterview, fromRows, loadProjects, saveProject, toRows, type Exec, type Transact } from "./projects";

// A project in round 2: one past interview, one current, a validation with evidence from both.
const project = (): DiligenceProject => ({
  id: "p-1",
  company: "Oakville Vet",
  thesis: "Market: We believe demand grows.",
  status: "In Progress",
  networks: [{ id: "GLG", name: "GLG", description: "Expert network", connected: true }],
  experts: [
    { id: "e-1", name: "Ana", title: "Pet owner", phone: "", description: "Two dogs", source: "Custom" },
    { id: "e-2", name: "Ben", title: "Vet", phone: "555", description: "Clinic owner", source: "GLG", crmId: "crm-9" },
  ],
  selectedExpertIds: ["e-2"],
  pastRounds: [
    {
      plan: {
        hypotheses: [{ id: "h1", title: "Demand", description: "We believe demand grows.", evidence: "Visit trends" }],
        experts: [{ expertId: "e-1", reason: "Customer", hypothesisIds: ["h1"], objectives: "Test demand", questions: [{ id: "q1", text: "How often do you visit?" }], audience: "customer" }],
        approved: true,
      },
      interviews: [
        {
          id: "iv-1", expertId: "e-1", status: "Completed", topic: "Interview complete", sessionId: "s-1",
          questions: [{ id: "q1", text: "How often do you visit?", status: "answered" }],
          transcript: [
            { id: "t1", speaker: "ai", text: "How often do you visit?", time: "00:02" },
            { id: "t2", speaker: "expert", text: "Every month, more than before.", time: "00:05" },
          ],
        },
      ],
    },
  ],
  plan: {
    hypotheses: [{ id: "h-r2-1", title: "Pricing", description: "We believe prices can rise.", evidence: "Price talk", origin: "New", round: 2 }],
    experts: [{ expertId: "e-2", reason: "Expert", hypothesisIds: ["h-r2-1"], objectives: "Test pricing", questions: [{ id: "q2", text: "Can prices rise?" }] }],
    approved: true,
  },
  interviews: [
    {
      id: "iv-2", expertId: "e-2", status: "Completed", topic: "Interview complete",
      questions: [{ id: "q2", text: "Can prices rise?", status: "answered" }],
      transcript: [{ id: "t3", speaker: "expert", text: "Clients would leave if prices rose.", time: "00:04" }],
    },
  ],
  thesisValidation: {
    at: "2026-11-04T10:00:00.000Z", model: "claude-opus-5-5", inputKey: "k", interviewCount: 2,
    overall: { verdict: "Partially supported", summary: "Mixed." },
    hypotheses: [
      { id: "h1", assessment: "Supported", confidence: "medium", rationale: "Customer saw growth.", evidence: [{ interviewId: "iv-1", turnId: "t2", quote: "Every month, more than before.", stance: "support" }] },
      { id: "h-r2-1", assessment: "Contradicted", confidence: "low", rationale: "Expert pushback.", evidence: [{ interviewId: "iv-2", turnId: "t3", quote: "Clients would leave", stance: "contradict" }] },
    ],
    gaps: [{ hypothesisId: "h-r2-1", gap: "One source.", nextStep: "Ask another vet.", priority: "high" }],
    droppedQuotes: 0,
  },
  updatedAt: "2026-11-04T10:05:00.000Z",
});

describe("project rows", () => {
  it("rebuilds the same project from its rows", () => {
    expect(fromRows(toRows(project()))).toEqual(project());
  });

  it("links evidence to the quoted sentence, even for results saved without a turnId", () => {
    const p = project();
    delete p.thesisValidation!.hypotheses[0]!.evidence[0]!.turnId;
    expect(toRows(p).evidence[0]).toMatchObject({ claim_id: "h1", interview_id: "iv-1", turn_id: "t2" });
  });
});

describe("Supabase schema (Postgres in PGlite)", () => {
  let exec: Exec;
  let tx: Transact;

  beforeEach(async () => {
    const pg = new PGlite();
    await pg.exec(readFileSync(new URL("../supabase/migrations/20261104000000_init.sql", import.meta.url), "utf8"));
    exec = async (text, params) => (await pg.query(text, params)).rows;
    tx = (fn) => pg.transaction((t) => fn(async (text, params) => (await t.query(text, params)).rows));
  });

  it("saves, updates and loads a project", async () => {
    await saveProject(tx, project());
    await saveProject(tx, { ...project(), status: "Completed" });
    expect(await loadProjects(exec)).toEqual([{ ...project(), status: "Completed" }]);
    expect(await exec("select claim_id, turn_id, stance from evidence order by id")).toEqual([
      { claim_id: "h1", turn_id: "t2", stance: "support" },
      { claim_id: "h-r2-1", turn_id: "t3", stance: "contradict" },
    ]);
  });

  it("keeps a deleted contact's interview but drops their evidence", async () => {
    const p = project();
    p.experts = p.experts.filter((e) => e.id !== "e-2");
    await saveProject(tx, p);
    const [loaded] = await loadProjects(exec);
    expect(loaded!.interviews.map((iv) => iv.id)).toEqual(["iv-2"]);
    expect(loaded!.thesisValidation!.hypotheses.find((h) => h.id === "h-r2-1")!.evidence).toEqual([]);
  });

  it("an ended call saves its transcript, then re-validates, even with no dashboard open", async () => {
    const p = project();
    p.interviews.push({ id: "iv-3", expertId: "e-1", status: "Not Started", topic: "", questions: [], transcript: [] });
    await saveProject(tx, p);
    const sent: unknown[] = [];
    await finishInterview(
      "p-1",
      "iv-3",
      {
        phase: "ended", startedAt: 1000, endedAt: 5000, questions: [],
        transcript: [{ id: "item-1", speaker: "interviewee", text: "Prices went up twice this year.", at: 2000, interrupted: false }],
      },
      { exec, tx },
      async (body) => {
        sent.push(body);
        return {
          model: "fake", overall: { verdict: "Supported", summary: "" }, gaps: [], droppedQuotes: 0,
          hypotheses: [{ id: "h-r2-1", assessment: "Mixed Evidence", confidence: "medium", rationale: "r",
            evidence: [{ interviewId: "iv-3", turnId: "item-1", quote: "Prices went up", stance: "support" }] }],
        };
      },
    );
    expect(sent).toHaveLength(1);
    const [saved] = await loadProjects(exec, "p-1");
    expect(saved!.interviews.find((iv) => iv.id === "iv-3")).toMatchObject({
      status: "Completed",
      transcript: [{ id: "item-1", speaker: "expert", text: "Prices went up twice this year.", time: "00:01" }],
    });
    expect(await exec("select status from claims where id = $1", ["h-r2-1"])).toEqual([{ status: "Mixed Evidence" }]);
    expect(await exec("select interview_id, turn_id from evidence")).toEqual([{ interview_id: "iv-3", turn_id: "item-1" }]);

    // A browser tab that has not reloaded saves its older copy: the new validation stays.
    await saveProject(tx, p);
    expect((await loadProjects(exec, "p-1"))[0]!.thesisValidation!.model).toBe("fake");
  });

  it("deleting a project removes all its rows", async () => {
    await saveProject(tx, project());
    await exec("delete from projects where id = $1", ["p-1"]);
    for (const t of ["interviewees", "claims", "interviews", "evidence"]) {
      expect(await exec(`select * from ${t}`)).toEqual([]);
    }
  });
});
