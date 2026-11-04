import postgres from "postgres";
import type { Express } from "express";
import type {
  DiligenceProject,
  Expert,
  Interview,
  InvestmentHypothesis,
  PlanExpert,
  ThesisValidationResult,
} from "../frontend/src/lib/types";
import { mirror, type CallSnapshot } from "../frontend/src/lib/call-mirror";
import { deriveStatus } from "../frontend/src/lib/mock-service";
import {
  completedInterviews,
  validationInputKey,
  validationRequest,
  validationResult,
  type ValidationReply,
} from "../frontend/src/lib/validation-request";
import { validateThesis } from "./validation";

/**
 * Projects in Supabase Postgres (supabase/migrations/*_init.sql).
 *
 *   GET    /api/projects       every project, rebuilt from its rows
 *   PUT    /api/projects/:id   save one whole project (one transaction)
 *   DELETE /api/projects/:id   delete it (the database cascades to its rows)
 *
 * The dashboard works on whole DiligenceProject objects. A save splits one into
 * rows (toRows) and a load rebuilds it (fromRows). State with no table of its
 * own (plans, the validation summary, proposals) lives in projects.workspace.
 */

interface Workspace {
  networks: DiligenceProject["networks"];
  selectedExpertIds?: string[];
  /** One per round, oldest first; the last is the current plan. */
  rounds: Array<{ hypothesisIds: string[]; experts: PlanExpert[]; approved: boolean }>;
  validation?: Omit<ThesisValidationResult, "hypotheses">;
  nextRound?: DiligenceProject["nextRound"];
}

export interface Rows {
  project: { id: string; company: string; thesis: string; status: string; workspace: Workspace; updated_at: string };
  interviewees: Array<{
    project_id: string; id: string; crm_id: string | null; name: string; title: string;
    phone: string; description: string; source: string; position: number;
  }>;
  claims: Array<{
    project_id: string; id: string; round: number; title: string; description: string;
    evidence_needed: string; origin: string | null; status: string | null;
    confidence: string | null; rationale: string | null;
  }>;
  interviews: Array<{
    project_id: string; id: string; round: number; interviewee_id: string; status: string; topic: string;
    session_id: string | null; questions: Interview["questions"]; transcript: Interview["transcript"]; position: number;
  }>;
  evidence: Array<{
    project_id: string; claim_id: string; interview_id: string; turn_id: string; quote: string; stance: string;
  }>;
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Split a project into table rows. */
export function toRows(p: DiligenceProject): Rows {
  const plans = [...(p.pastRounds ?? []).map((r) => r.plan), ...(p.plan ? [p.plan] : [])];
  const ivRounds = [...(p.pastRounds ?? []).map((r) => r.interviews), p.interviews];
  const v = p.thesisValidation;
  const assessed = new Map((v?.hypotheses ?? []).map((h) => [h.id, h]));

  // shortcut: a hypothesis id that repeats in a later round is stored once (the
  // first, as allHypotheses shows it); give rounds unique ids if that ever matters.
  const claims: Rows["claims"] = [];
  plans.forEach((plan) =>
    plan.hypotheses.forEach((h) => {
      if (claims.some((c) => c.id === h.id)) return;
      const a = assessed.get(h.id);
      claims.push({
        project_id: p.id, id: h.id, round: h.round ?? 1, title: h.title, description: h.description,
        evidence_needed: h.evidence, origin: h.origin ?? null,
        status: a?.assessment ?? null, confidence: a?.confidence ?? null, rationale: a?.rationale ?? null,
      });
    }),
  );

  const interviews: Rows["interviews"] = ivRounds.flatMap((ivs, r) =>
    ivs.map((iv, i) => ({
      project_id: p.id, id: iv.id, round: r + 1, interviewee_id: iv.expertId, status: iv.status, topic: iv.topic,
      session_id: iv.sessionId ?? null, questions: iv.questions, transcript: iv.transcript, position: i,
    })),
  );

  // Evidence counts only while its claim, its interview and the interviewee exist:
  // a contact deleted as unreliable keeps their transcript but loses their evidence.
  const contactIds = new Set(p.experts.map((e) => e.id));
  const ivById = new Map(interviews.map((iv) => [iv.id, iv]));
  const evidence: Rows["evidence"] = (v?.hypotheses ?? []).flatMap((h) =>
    claims.some((c) => c.id === h.id)
      ? h.evidence.flatMap((e) => {
          const iv = ivById.get(e.interviewId);
          if (!iv || !contactIds.has(iv.interviewee_id)) return [];
          // Results saved before turnId existed: find the sentence by its quote.
          const turnId =
            e.turnId ??
            iv.transcript.find((t) => t.speaker === "expert" && lower(t.text).includes(lower(e.quote)))?.id;
          if (!turnId) return [];
          return [{ project_id: p.id, claim_id: h.id, interview_id: iv.id, turn_id: turnId, quote: e.quote, stance: e.stance }];
        })
      : [],
  );

  const validation = v ? (({ hypotheses: _h, ...rest }) => rest)(v) : undefined;
  return {
    project: {
      id: p.id, company: p.company, thesis: p.thesis, status: p.status, updated_at: p.updatedAt,
      workspace: {
        networks: p.networks,
        ...(p.selectedExpertIds ? { selectedExpertIds: p.selectedExpertIds } : {}),
        rounds: plans.map((pl) => ({ hypothesisIds: pl.hypotheses.map((h) => h.id), experts: pl.experts, approved: pl.approved })),
        ...(validation ? { validation } : {}),
        ...(p.nextRound ? { nextRound: p.nextRound } : {}),
      },
    },
    interviewees: p.experts.map((e, i) => ({
      project_id: p.id, id: e.id, crm_id: e.crmId ?? null, name: e.name, title: e.title, phone: e.phone,
      description: e.description, source: e.source, position: i,
    })),
    claims,
    interviews,
    evidence,
  };
}

/** Rebuild a project from its rows (children already filtered to this project). */
export function fromRows(r: Rows): DiligenceProject {
  const ws = r.project.workspace;
  const claim = new Map(r.claims.map((c) => [c.id, c]));
  const hypothesis = (c: Rows["claims"][number]): InvestmentHypothesis => ({
    id: c.id, title: c.title, description: c.description, evidence: c.evidence_needed,
    ...(c.origin !== null ? { origin: c.origin } : {}),
    ...(c.round > 1 ? { round: c.round } : {}),
  });
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const interview = (iv: Rows["interviews"][number]): Interview => ({
    id: iv.id, expertId: iv.interviewee_id, status: iv.status as Interview["status"], topic: iv.topic,
    questions: iv.questions, transcript: iv.transcript,
    ...(iv.session_id !== null ? { sessionId: iv.session_id } : {}),
  });
  const roundOf = (n: number) => r.interviews.filter((iv) => iv.round === n).sort(byPosition).map(interview);
  const rounds = ws.rounds.map((rd, i) => ({
    plan: {
      hypotheses: rd.hypothesisIds.flatMap((id) => (claim.has(id) ? [hypothesis(claim.get(id)!)] : [])),
      experts: rd.experts,
      approved: rd.approved,
    },
    interviews: roundOf(i + 1),
  }));
  const current = rounds.at(-1);

  const p: DiligenceProject = {
    id: r.project.id,
    company: r.project.company,
    thesis: r.project.thesis,
    status: r.project.status as DiligenceProject["status"],
    networks: ws.networks,
    experts: [...r.interviewees].sort(byPosition).map(
      (e): Expert => ({
        id: e.id, name: e.name, title: e.title, phone: e.phone, description: e.description,
        source: e.source as Expert["source"], ...(e.crm_id !== null ? { crmId: e.crm_id } : {}),
      }),
    ),
    interviews: current ? current.interviews : roundOf(1),
    updatedAt: new Date(r.project.updated_at).toISOString(),
  };
  if (current) p.plan = current.plan;
  if (rounds.length > 1) p.pastRounds = rounds.slice(0, -1);
  if (ws.selectedExpertIds) p.selectedExpertIds = ws.selectedExpertIds;
  if (ws.nextRound) p.nextRound = ws.nextRound;
  if (ws.validation) {
    p.thesisValidation = {
      ...ws.validation,
      // The app's hypothesis order: by round, first occurrence of each id.
      hypotheses: [...new Set(ws.rounds.flatMap((rd) => rd.hypothesisIds))]
        .flatMap((id) => (claim.get(id)?.status != null ? [claim.get(id)!] : []))
        .map((c) => ({
          id: c.id,
          assessment: c.status as ThesisValidationResult["hypotheses"][number]["assessment"],
          confidence: (c.confidence ?? "low") as "high" | "medium" | "low",
          rationale: c.rationale ?? "",
          evidence: r.evidence
            .filter((e) => e.claim_id === c.id)
            .map((e) => ({
              interviewId: e.interview_id, turnId: e.turn_id, quote: e.quote,
              stance: e.stance as "support" | "contradict" | "neutral",
            })),
        })),
    };
  }
  return p;
}

/** Runs one parameterized statement and returns its rows. */
export type Exec = (text: string, params?: unknown[]) => Promise<any[]>;
/** Runs a callback inside one transaction. */
export type Transact = <T>(fn: (exec: Exec) => Promise<T>) => Promise<T>;

// Each child table takes all of a project's rows as one JSON array parameter. The ::text
// keeps the postgres driver from JSON-encoding the (already JSON) string a second time.
const insertAll = (table: string) =>
  `insert into ${table} select * from jsonb_populate_recordset(null::${table}, $1::text::jsonb)`;

export async function saveProject(tx: Transact, p: DiligenceProject): Promise<void> {
  await tx((exec) => writeProject(exec, p));
}

/** Save inside an open transaction; locks the project row first (see lockProject). */
async function writeProject(exec: Exec, incoming: DiligenceProject): Promise<void> {
  await lockProject(exec, incoming.id);
  // A browser that has not seen the newest validation (e.g. the one run after a call) must not undo it.
  const [cur] = await loadProjects(exec, incoming.id);
  const newer = cur?.thesisValidation;
  const p = newer && (!incoming.thesisValidation || incoming.thesisValidation.at < newer.at)
    ? { ...incoming, thesisValidation: newer }
    : incoming;
  const r = toRows(p);
  await exec(
    `insert into projects (id, company, thesis, status, workspace, updated_at)
     values ($1, $2, $3, $4, $5::text::jsonb, $6::timestamptz)
     on conflict (id) do update set company = excluded.company, thesis = excluded.thesis,
       status = excluded.status, workspace = excluded.workspace, updated_at = excluded.updated_at`,
    [r.project.id, r.project.company, r.project.thesis, r.project.status, JSON.stringify(r.project.workspace), r.project.updated_at],
  );
  // Replace the children: the project object is the whole truth for its rows.
  for (const table of ["evidence", "interviews", "claims", "interviewees"]) {
    await exec(`delete from ${table} where project_id = $1`, [p.id]);
  }
  await exec(insertAll("interviewees"), [JSON.stringify(r.interviewees)]);
  await exec(insertAll("claims"), [JSON.stringify(r.claims)]);
  await exec(insertAll("interviews"), [JSON.stringify(r.interviews)]);
  await exec(
    `insert into evidence (project_id, claim_id, interview_id, turn_id, quote, stance)
     select project_id, claim_id, interview_id, turn_id, quote, stance
     from jsonb_populate_recordset(null::evidence, $1::text::jsonb)`,
    [JSON.stringify(r.evidence)],
  );
}

/** Writes to one project wait for each other (no-op for a project not saved yet). */
const lockProject = (exec: Exec, id: string) => exec("select 1 from projects where id = $1 for update", [id]);

/** Every project, or just the one with `id`. */
export async function loadProjects(exec: Exec, id?: string): Promise<DiligenceProject[]> {
  const where = id ? " where project_id = $1" : "";
  const args = id ? [id] : [];
  const [projects, interviewees, claims, interviews, evidence] = await Promise.all([
    exec(`select * from projects${id ? " where id = $1" : ""} order by updated_at desc`, args),
    exec(`select * from interviewees${where}`, args),
    exec(`select * from claims${where}`, args),
    exec(`select * from interviews${where}`, args),
    exec(`select * from evidence${where} order by id`, args),
  ]);
  const of = <T extends { project_id: string }>(rows: T[], id: string) => rows.filter((x) => x.project_id === id);
  // shortcut: loads every project on each request; filter by user or page it once there are many.
  return projects.map((project) =>
    fromRows({
      project,
      interviewees: of(interviewees, project.id),
      claims: of(claims, project.id),
      interviews: of(interviews, project.id),
      evidence: of(evidence, project.id),
    }),
  );
}

/**
 * A call ended (server/interviews.ts): write it into its interview, then re-run Claude's
 * thesis validation, so evidence and claim status update after every call, with or
 * without a dashboard open. `d` and `validate` are parameters for tests.
 */
export async function finishInterview(
  projectId: string,
  interviewId: string,
  state: CallSnapshot,
  d = db(),
  validate: (body: ReturnType<typeof validationRequest>) => Promise<ValidationReply> = validateThesis as never,
): Promise<void> {
  if (!d) return;
  /** Read, change and save one project in one transaction. */
  const change = async (fn: (p: DiligenceProject) => DiligenceProject) => {
    let out: DiligenceProject | undefined;
    await d.tx(async (exec) => {
      await lockProject(exec, projectId);
      const [p] = await loadProjects(exec, projectId);
      if (p) await writeProject(exec, (out = fn(p)));
    });
    return out;
  };
  const touched = (p: DiligenceProject) => ({ ...p, status: deriveStatus(p), updatedAt: new Date().toISOString() });

  const p = await change((p) =>
    touched({ ...p, interviews: p.interviews.map((iv) => (iv.id === interviewId ? mirror(iv, state) : iv)) }),
  );
  if (!p || !completedInterviews(p).length || p.thesisValidation?.inputKey === validationInputKey(p)) return;
  const result = validationResult(p, await validate(validationRequest(p)));
  // Saved on the latest copy, so edits made while Claude worked are kept.
  await change((cur) => touched({ ...cur, thesisValidation: result }));
}

let sql: postgres.Sql | null = null;

/** The Supabase connection, or null without DATABASE_URL. Created on first use, after dotenv. */
function db(): { exec: Exec; tx: Transact } | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  // prepare: false works with Supabase's transaction pooler too; SSL except on a local database.
  sql ??= postgres(url, { prepare: false, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require" });
  const s = sql;
  const exec: Exec = (text, params = []) => s.unsafe(text, params as never[]);
  return {
    exec,
    tx: (fn) => s.begin((t) => fn((text, params = []) => t.unsafe(text, params as never[]))) as never,
  };
}

const NO_DB = { error: "No DATABASE_URL in .env (Supabase → Connect → Session pooler)." };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function registerProjectRoutes(app: Express): void {
  app.get("/api/projects", async (_req, res) => {
    const d = db();
    if (!d) return res.status(503).json(NO_DB);
    try {
      return res.json({ projects: await loadProjects(d.exec) });
    } catch (err) {
      console.error("load projects error:", err);
      return res.status(500).json({ error: errText(err) });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    const d = db();
    if (!d) return res.status(503).json(NO_DB);
    const p = req.body as DiligenceProject | undefined;
    if (!p || typeof p !== "object" || p.id !== req.params.id || typeof p.company !== "string") {
      return res.status(400).json({ error: "Body must be the project, with the id from the URL." });
    }
    try {
      await saveProject(d.tx, p);
      return res.json({ ok: true });
    } catch (err) {
      console.error("save project error:", err);
      return res.status(500).json({ error: errText(err) });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    const d = db();
    if (!d) return res.status(503).json(NO_DB);
    try {
      await d.exec("delete from projects where id = $1", [req.params.id]);
      return res.json({ ok: true });
    } catch (err) {
      console.error("delete project error:", err);
      return res.status(500).json({ error: errText(err) });
    }
  });
}
