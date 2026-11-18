import type { Express } from "express";
import { db, type Exec } from "./db";

/**
 * What the paid APIs cost, recorded per project in api_usage
 * (supabase/migrations/*_api_usage.sql).
 *
 *   GET /api/usage   spend per project, source and model (the dashboard sums it)
 *
 * Claude calls are recorded on the server from the reply's `usage`. A live
 * call's Boson voice, transcription, avatar and Haiku question updates are
 * counted in the interviewee's tab (CallController's `usage`) and recorded when
 * the call ends (finishInterview).
 */

/** USD per million tokens: input, output, cached input. */
const PER_MTOK: Record<string, [number, number, number?]> = {
  // anthropic.com pricing, 2026-11. Fallback models are here because a refusal can be answered by one.
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  // shortcut: Haiku 5.5 costs $0.50 / $2.50 past 100K prompt tokens; question updates stay far below that.
  "claude-haiku-5-5": [0.1, 0.5],
  // boson.ai/pricing, 2026-11.
  "higgs-realtime": [0.75, 4.5, 0.25],
};

/** USD per minute. */
const PER_MIN: Record<string, number> = {
  "higgs-stt-3.1": 0.0025, // Higgs Realtime transcription input
  // shortcut: priced at the default 480×640 output ($0.07); a 640×640 avatar is $0.09 — price per size if sessions set `output`.
  "higgs-avatar": 0.07,
};

export interface UsageRow {
  source: string;
  model: string;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  minutes?: number;
}

/** The row's price in USD, or null for a model with no price above. */
export function costOf(r: UsageRow): number | null {
  const tok = PER_MTOK[r.model];
  if (tok) {
    const [inp, out, cached = inp] = tok;
    const uncached = (r.inputTokens ?? 0) - (r.cachedTokens ?? 0);
    return (uncached * inp + (r.cachedTokens ?? 0) * cached + (r.outputTokens ?? 0) * out) / 1e6;
  }
  const rate = PER_MIN[r.model];
  return rate === undefined ? null : (r.minutes ?? 0) * rate;
}

/** A live call's usage as counted by CallController. */
export interface CallUsage {
  realtime?: { model?: string; input?: number; cached?: number; output?: number };
  transcription?: { model?: string; seconds?: number };
  claude?: { model?: string; input?: number; output?: number };
  avatar?: { ms?: number };
}

/** The rows for one finished call. */
export function callUsageRows(u: CallUsage | undefined): UsageRow[] {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const rows: UsageRow[] = [];
  const rt = u?.realtime;
  if (rt && (n(rt.input) || n(rt.output))) {
    rows.push({ source: "Live call voice", model: rt.model || "higgs-realtime", inputTokens: n(rt.input), cachedTokens: n(rt.cached), outputTokens: n(rt.output) });
  }
  const tr = u?.transcription;
  if (tr && n(tr.seconds)) rows.push({ source: "Live call transcription", model: tr.model || "higgs-stt-3.1", minutes: n(tr.seconds) / 60 });
  if (u?.avatar && n(u.avatar.ms)) rows.push({ source: "Live call avatar", model: "higgs-avatar", minutes: n(u.avatar.ms) / 60_000 });
  const c = u?.claude;
  if (c && (n(c.input) || n(c.output))) {
    rows.push({ source: "Live question updates", model: c.model || "claude-haiku-5-5", inputTokens: n(c.input), outputTokens: n(c.output) });
  }
  return rows;
}

const COLS = "project_id, source, model, input_tokens, cached_tokens, output_tokens, minutes, cost_usd";

/** Save the rows, priced, in one statement (all or none). Never throws: a failed write is logged, the call it measured still succeeds. */
export async function recordUsage(projectId: string | null | undefined, rows: UsageRow[], exec: Exec | undefined = db()?.exec): Promise<void> {
  if (!exec || !rows.length) return;
  const priced = rows.map((r) => {
    const cost_usd = costOf(r);
    if (cost_usd === null) console.warn(`usage: no price for model ${r.model}; recorded without a cost`);
    // Tokens are whole numbers (bigint columns); a fraction from the browser's counts must not fail the insert.
    const int = (v?: number) => Math.round(v ?? 0);
    return {
      project_id: projectId || null, source: r.source, model: r.model, input_tokens: int(r.inputTokens),
      cached_tokens: int(r.cachedTokens), output_tokens: int(r.outputTokens), minutes: r.minutes ?? 0, cost_usd,
    };
  });
  try {
    // Same JSON-array insert as server/projects.ts; ::text keeps the driver from encoding the JSON twice.
    await exec(`insert into api_usage (${COLS}) select ${COLS} from jsonb_populate_recordset(null::api_usage, $1::text::jsonb)`, [
      JSON.stringify(priced),
    ]);
  } catch (err) {
    console.error("usage: could not record", err);
  }
}

export function registerUsageRoute(app: Express): void {
  app.get("/api/usage", async (_req, res) => {
    const d = db();
    if (!d) return res.status(503).json({ error: "No DATABASE_URL in .env." });
    try {
      const rows = await d.exec(
        `select project_id as "projectId", source, model, count(*)::int as calls,
                sum(input_tokens)::float8 as "inputTokens", sum(output_tokens)::float8 as "outputTokens",
                sum(minutes)::float8 as minutes, sum(cost_usd)::float8 as "costUsd",
                bool_or(cost_usd is null) as unpriced
           from api_usage group by 1, 2, 3 order by "costUsd" desc nulls last`,
      );
      return res.json({ rows });
    } catch (err) {
      console.error("usage error:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
