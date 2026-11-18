import postgres from "postgres";

/** Runs one parameterized statement and returns its rows. */
export type Exec = (text: string, params?: unknown[]) => Promise<any[]>;
/** Runs a callback inside one transaction. */
export type Transact = <T>(fn: (exec: Exec) => Promise<T>) => Promise<T>;

let sql: postgres.Sql | null = null;

/** The Supabase connection, or null without DATABASE_URL. Created on first use, after dotenv. */
export function db(): { exec: Exec; tx: Transact } | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  // prepare: false works with Supabase's transaction pooler too; SSL except on a local database.
  sql ??= postgres(url, { prepare: false, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require" });
  const s = sql;
  // No parameters: the "simple" protocol, which also runs a migration file's many statements.
  const run = (q: postgres.Sql | postgres.TransactionSql): Exec => (text, params = []) =>
    params.length ? q.unsafe(text, params as never[]) : q.unsafe(text).simple();
  return { exec: run(s), tx: (fn) => s.begin((t) => fn(run(t))) as never };
}
