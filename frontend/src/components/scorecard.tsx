import { Loader2, RefreshCw } from "lucide-react";
import { expertOf } from "@/components/research";
import { Badge, Button, Card, SectionTitle } from "@/components/ui-kit";
import { allHypotheses, allInterviews } from "@/lib/mock-service";
import type { useThesisValidation } from "@/lib/thesis-validation";
import type { DiligenceProject } from "@/lib/types";

export type ClaimStatus = "supported" | "contradicted" | "unclear";

export interface ScoreRow {
  id: string;
  label: string;
  title: string;
  status: ClaimStatus;
  evidenceCount: number;
  quotes: Array<{ quote: string; who: string }>;
}

/** One row per claim from the latest thesis validation; claims it has not assessed are unclear. */
export function scorecardRows(project: DiligenceProject): ScoreRow[] {
  const result = project.thesisValidation;
  const ivs = allInterviews(project);
  const who = (interviewId: string) => {
    const iv = ivs.find((i) => i.id === interviewId);
    return (iv && expertOf(project, iv.expertId)?.name) || "Interviewee";
  };
  return allHypotheses(project).map((h, i) => {
    const a = result?.hypotheses.find((x) => x.id === h.id);
    return {
      id: h.id,
      label: `H${i + 1}`,
      title: h.title,
      status:
        a?.assessment === "Supported" ? "supported" : a?.assessment === "Contradicted" ? "contradicted" : "unclear",
      evidenceCount: a?.evidence.length ?? 0,
      quotes: (a?.evidence ?? []).slice(0, 2).map((e) => ({ quote: e.quote, who: who(e.interviewId) })),
    };
  });
}

const TONE = { supported: "success", contradicted: "danger", unclear: "outline" } as const;

/** The live evidence scorecard: refreshed by `v` whenever an interview finishes. */
export function Scorecard({
  project,
  v,
}: {
  project: DiligenceProject;
  v: ReturnType<typeof useThesisValidation>;
}) {
  const rows = scorecardRows(project);
  const r = v.result;
  return (
    <section>
      <SectionTitle
        title="Evidence scorecard"
        description={
          r
            ? `From ${r.interviewCount} finished interview${r.interviewCount === 1 ? "" : "s"}. Updates on its own when another one finishes.`
            : "Fills in when the first interview finishes."
        }
        action={
          <Button variant="secondary" size="sm" disabled={v.loading || !v.hasEvidence} onClick={() => void v.run()}>
            {v.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {v.loading ? "Updating…" : "Refresh"}
          </Button>
        }
      />
      {v.error && <p className="mb-3 text-sm text-destructive">Could not update the scorecard: {v.error}</p>}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2.5 font-medium">Claim</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 text-right font-medium">Evidence</th>
              <th className="px-5 py-2.5 font-medium">Key quotes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-5 py-3 font-medium">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{row.label}</span>
                  {row.title}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={TONE[row.status]} dot>
                    {row.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{row.evidenceCount}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {row.quotes.length
                    ? row.quotes.map((q, k) => (
                        <p key={k} className={k ? "mt-1.5" : ""}>
                          &ldquo;{q.quote}&rdquo; <span className="text-xs">— {q.who}</span>
                        </p>
                      ))
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
