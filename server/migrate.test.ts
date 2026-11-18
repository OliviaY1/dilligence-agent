import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import type { Exec, Transact } from "./db";
import { migrate } from "./migrate";

const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();

function pglite() {
  const pg = new PGlite();
  const wrap = (q: { exec: PGlite["exec"]; query: PGlite["query"] }): Exec => async (text, params) =>
    params?.length ? (await q.query(text, params)).rows : ((await q.exec(text)).at(-1)?.rows ?? []);
  const tx: Transact = (fn) => pg.transaction((t) => fn(wrap(t)));
  return { pg, tx };
}

describe("migrate", () => {
  it("applies every file once, in order", async () => {
    const { pg, tx } = pglite();
    expect(await migrate(tx)).toEqual(files);
    expect(await migrate(tx)).toEqual([]);
    expect((await pg.query("select to_regclass('public.api_usage') as t")).rows).toEqual([{ t: "api_usage" }]);
  });

  it("on a database set up by hand, skips the first file and applies the rest", async () => {
    const { pg, tx } = pglite();
    await pg.exec(readFileSync(new URL(`../supabase/migrations/${files[0]}`, import.meta.url), "utf8"));
    expect(await migrate(tx)).toEqual(files.slice(1));
  });
});
