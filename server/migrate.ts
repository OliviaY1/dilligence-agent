import { readdirSync, readFileSync } from "node:fs";
import { db, type Transact } from "./db";

const DIR = new URL("../supabase/migrations/", import.meta.url);

/**
 * Apply the supabase/migrations/*.sql files this database has not run yet, in
 * name order, and remember each in schema_migrations. Runs on server start, so
 * a deploy brings any database (Supabase, Render Postgres, local) up to date.
 * All in one transaction: a failing file applies nothing. Returns the files applied.
 */
export async function migrate(tx: Transact | undefined = db()?.tx, files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()): Promise<string[]> {
  if (!tx) return [];
  return tx(async (exec) => {
    // Two servers starting at once: the second waits, then finds nothing to do.
    await exec("select pg_advisory_xact_lock(491)");
    await exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    // A database set up by hand (the first file's SQL pasted in) has its tables but no record of it.
    const [{ manual }] = await exec(
      "select not exists (select 1 from schema_migrations) and to_regclass('public.projects') is not null as manual",
    );
    if (manual && files[0]) await exec("insert into schema_migrations (name) values ($1)", [files[0]]);
    const applied = new Set((await exec("select name from schema_migrations")).map((r) => r.name as string));
    const pending = files.filter((f) => !applied.has(f));
    for (const f of pending) {
      await exec(readFileSync(new URL(f, DIR), "utf8"));
      await exec("insert into schema_migrations (name) values ($1)", [f]);
    }
    return pending;
  });
}
