import { useEffect, useState } from "react";
import { apiUrl, readBackendJson } from "@/lib/backend";

/** One GET /api/usage row: spend for one project, source and model (server/usage.ts). */
export interface UsageRow {
  projectId: string | null;
  source: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  minutes: number;
  costUsd: number | null;
  /** Some of these calls used a model with no price, so costUsd is too low. */
  unpriced: boolean;
}

export function useUsage() {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(apiUrl("/api/usage"))
      .then(async (res) => {
        const body = await readBackendJson<{ rows?: UsageRow[]; error?: string }>(res);
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (live) setRows(body.rows ?? []);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);
  return { rows, error };
}

/** Cents are too coarse for one call, so small amounts keep four decimals. */
export const fmtUsd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export const totalCost = (rows: UsageRow[]) => rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);

const amount = (r: Pick<UsageRow, "inputTokens" | "outputTokens" | "minutes">) =>
  r.minutes > 0
    ? `${r.minutes.toFixed(1)} min`
    : `${r.inputTokens.toLocaleString()} in · ${r.outputTokens.toLocaleString()} out`;

/** Rows merged by `key`, summed. */
export function groupBy(
  rows: UsageRow[],
  key: (r: UsageRow) => string,
): Array<UsageRow & { key: string }> {
  const out = new Map<string, UsageRow & { key: string }>();
  for (const r of rows) {
    const k = key(r);
    const g = out.get(k);
    if (!g) out.set(k, { ...r, key: k });
    else {
      g.calls += r.calls;
      g.inputTokens += r.inputTokens;
      g.outputTokens += r.outputTokens;
      g.minutes += r.minutes;
      g.costUsd = (g.costUsd ?? 0) + (r.costUsd ?? 0);
      g.unpriced ||= r.unpriced;
    }
  }
  return [...out.values()].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
}

function Cost({ r }: { r: Pick<UsageRow, "costUsd" | "unpriced"> }) {
  if (r.costUsd === null) return <span title="No price for this model">—</span>;
  return (
    <span
      title={
        r.unpriced ? "Some calls used a model with no price; the real cost is higher" : undefined
      }
    >
      {fmtUsd(r.costUsd)}
      {r.unpriced && "*"}
    </span>
  );
}

/** What was spent on each source and the model behind it, with the total. */
export function SpendTable({
  rows,
  empty = "No API calls recorded yet.",
}: {
  rows: UsageRow[];
  empty?: string;
}) {
  if (!rows.length) return <p className="px-5 py-4 text-sm text-muted-foreground">{empty}</p>;
  const merged = groupBy(rows, (r) => `${r.source}\u0000${r.model}`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-5 py-2 font-medium">Used for</th>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Usage</th>
            <th className="px-5 py-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((r) => (
            <tr key={r.key} className="border-b last:border-0">
              <td className="px-5 py-2.5">
                {r.source}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  ×{r.calls}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                  {r.model}
                </code>
              </td>
              <td className="hidden px-3 py-2.5 tabular-nums text-muted-foreground sm:table-cell">
                {amount(r)}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums">
                <Cost r={r} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td className="px-5 py-2.5" colSpan={3}>
              Total
            </td>
            <td className="px-5 py-2.5 text-right tabular-nums">{fmtUsd(totalCost(rows))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
