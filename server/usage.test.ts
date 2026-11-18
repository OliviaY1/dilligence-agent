import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { callUsageRows, costOf, recordUsage } from "./usage";

describe("usage pricing", () => {
  it("prices tokens, cached tokens and minutes; unknown models get no price", () => {
    // 1M in + 1M out on Opus 5.5: $4 + $20.
    expect(costOf({ source: "x", model: "claude-opus-5-5", inputTokens: 1e6, outputTokens: 1e6 })).toBeCloseTo(24);
    // Higgs Realtime: 1M input of which 400K cached, 1M output: 0.6×0.75 + 0.4×0.25 + 4.5.
    expect(
      costOf({ source: "x", model: "higgs-realtime", inputTokens: 1e6, cachedTokens: 4e5, outputTokens: 1e6 }),
    ).toBeCloseTo(0.45 + 0.1 + 4.5);
    expect(costOf({ source: "x", model: "higgs-avatar", minutes: 2 })).toBeCloseTo(0.14);
    expect(costOf({ source: "x", model: "mystery-model", inputTokens: 5 })).toBeNull();
  });

  it("turns a call's counted usage into rows and saves them priced", async () => {
    const rows = callUsageRows({
      realtime: { model: "higgs-realtime", input: 1000, cached: 0, output: 500 },
      transcription: { model: "higgs-stt-3.1", seconds: 90 },
      claude: { model: "claude-haiku-5-5", input: 0, output: 0 },
      avatar: { ms: 60_000 },
    });
    expect(rows.map((r) => r.model)).toEqual(["higgs-realtime", "higgs-stt-3.1", "higgs-avatar"]);

    const pg = new PGlite();
    await pg.exec(readFileSync(new URL("../supabase/migrations/20261118000000_api_usage.sql", import.meta.url), "utf8"));
    await recordUsage("p-1", rows, async (text, params) => (await pg.query(text, params)).rows);
    const saved = (await pg.query<{ model: string; cost_usd: string }>("select model, cost_usd from api_usage order by id")).rows;
    expect(saved.map((r) => [r.model, Number(r.cost_usd)])).toEqual([
      ["higgs-realtime", (1000 * 0.75 + 500 * 4.5) / 1e6],
      ["higgs-stt-3.1", 1.5 * 0.0025],
      ["higgs-avatar", 0.07],
    ]);
  });
});
