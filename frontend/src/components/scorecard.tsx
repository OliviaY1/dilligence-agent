import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { expertOf } from "@/components/research";
import { Button, Dialog } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { allHypotheses, allInterviews } from "@/lib/mock-service";
import type { useThesisValidation } from "@/lib/thesis-validation";
import type { DiligenceProject, ThesisValidationResult } from "@/lib/types";

export type ClaimStatus = "supported" | "contradicted" | "unclear";

export interface ScoreRow {
  id: string;
  label: string;
  title: string;
  status: ClaimStatus;
  evidenceCount: number;
  quotes: Array<{ quote: string; who: string }>;
  /** Claude's assessment, or null before the claim has been assessed. */
  assessment: ThesisValidationResult["hypotheses"][number]["assessment"] | null;
  confidence: "high" | "medium" | "low" | null;
  stances: Array<"support" | "contradict" | "neutral">;
  /** The claim as written in the thesis. */
  description: string;
  rationale: string;
  /** One-line belief summary for the card. */
  summary: string;
  evidence: Array<{
    quote: string;
    who: string;
    role: string;
    stance: "support" | "contradict" | "neutral";
    interviewId: string;
    turnId: string | undefined;
  }>;
}

// shortcut: the card summary is the rationale's first sentence; ask Claude for a dedicated summary if these read poorly.
const firstSentence = (t: string) => t.match(/^.+?[.!?](?=\s+[A-Z]|$)/s)?.[0] ?? t;

/** One row per claim from the latest thesis validation; claims it has not assessed are unclear. */
export function scorecardRows(project: DiligenceProject): ScoreRow[] {
  const result = project.thesisValidation;
  const ivs = allInterviews(project);
  const expert = (interviewId: string) => {
    const iv = ivs.find((i) => i.id === interviewId);
    return iv ? expertOf(project, iv.expertId) : undefined;
  };
  const who = (interviewId: string) => expert(interviewId)?.name || "Interviewee";
  return allHypotheses(project).map((h, i) => {
    const a = result?.hypotheses.find((x) => x.id === h.id);
    return {
      id: h.id,
      label: `H${i + 1}`,
      title: h.title,
      status:
        a?.assessment === "Supported"
          ? "supported"
          : a?.assessment === "Contradicted"
            ? "contradicted"
            : "unclear",
      evidenceCount: a?.evidence.length ?? 0,
      quotes: (a?.evidence ?? [])
        .slice(0, 2)
        .map((e) => ({ quote: e.quote, who: who(e.interviewId) })),
      assessment: a?.assessment ?? null,
      confidence: a?.confidence ?? null,
      stances: (a?.evidence ?? []).map((e) => e.stance),
      description: h.description,
      rationale: a?.rationale ?? "",
      summary: firstSentence(a?.rationale ?? ""),
      evidence: (a?.evidence ?? []).map((e) => ({
        quote: e.quote,
        who: who(e.interviewId),
        role: expert(e.interviewId)?.title ?? "",
        stance: e.stance,
        interviewId: e.interviewId,
        turnId: e.turnId,
      })),
    };
  });
}

// Visual language per assessment: edge colour, chip, and short label.
const LOOK = {
  Supported: { edge: "bg-success", chip: "bg-success-soft text-success", label: "Supported" },
  Contradicted: {
    edge: "bg-destructive",
    chip: "bg-danger-soft text-destructive",
    label: "Contradicted",
  },
  "Mixed Evidence": { edge: "bg-warning", chip: "bg-warning-soft text-warning", label: "Mixed" },
  "Insufficient Evidence": {
    edge: "bg-border",
    chip: "bg-secondary text-muted-foreground",
    label: "Thin evidence",
  },
  none: { edge: "bg-border", chip: "bg-secondary text-muted-foreground", label: "Not tested yet" },
} as const;
const STANCE = {
  support: "bg-success",
  contradict: "bg-destructive",
  neutral: "bg-muted-foreground/40",
} as const;
const look = (row: ScoreRow) => LOOK[row.assessment ?? "none"];

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

function Confidence({ level }: { level: ScoreRow["confidence"] }) {
  const n = level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
  return (
    <span
      className="flex items-end gap-0.5"
      title={level ? `${level} confidence` : "No confidence yet"}
    >
      <span className="sr-only">{level ? `${level} confidence` : "no confidence yet"}</span>
      {[1, 2, 3].map((k) => (
        <span
          key={k}
          className={cn("w-[3px] rounded-sm", k <= n ? "bg-foreground/70" : "bg-border")}
          style={{ height: 4 + k * 3 }}
        />
      ))}
    </span>
  );
}

function ClaimCard({ row, onOpen }: { row: ScoreRow; onOpen: () => void }) {
  const l = look(row);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="relative flex flex-col overflow-hidden rounded-lg border bg-card p-4 pl-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] hover:border-input hover:shadow-[0_2px_6px_rgba(16,24,40,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", l.edge)} aria-hidden />
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">{row.label}</span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", l.chip)}>
          {l.label}
        </span>
        <span className="ml-auto">
          <Confidence level={row.confidence} />
        </span>
      </div>
      <h3 className="mt-2 text-[15px] font-medium leading-snug tracking-[-0.01em]">{row.title}</h3>
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-foreground/75">
        {row.summary || "No interview has touched this claim yet."}
      </p>
      <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted-foreground">
        <span className="flex gap-1" aria-hidden>
          {row.stances.length
            ? row.stances.map((st, k) => (
                <span key={k} className={cn("size-2 rounded-full", STANCE[st])} />
              ))
            : [0, 1, 2].map((k) => (
                <span
                  key={k}
                  className="size-2 rounded-full border border-dashed border-muted-foreground/40"
                />
              ))}
        </span>
        <span className="tabular-nums">
          {row.evidenceCount} {row.evidenceCount === 1 ? "quote" : "quotes"}
        </span>
      </div>
    </button>
  );
}

const STANCE_LABEL = {
  support: "Supports",
  contradict: "Contradicts",
  neutral: "Neutral",
} as const;
const STANCE_TEXT = {
  support: "text-success",
  contradict: "text-destructive",
  neutral: "text-muted-foreground",
} as const;

/** Floating card for one claim: its state, the thesis sentence, and every quote with its source. */
function ClaimDetail({
  row,
  projectId,
  onClose,
}: {
  row: ScoreRow;
  projectId: string;
  onClose: () => void;
}) {
  const l = look(row);
  return (
    <Dialog open onClose={onClose} title={`${row.label} · ${row.title}`}>
      <div className="-mx-5 -my-4 max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", l.chip)}>
            {l.label}
          </span>
          {row.confidence && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Confidence level={row.confidence} /> {row.confidence} confidence
            </span>
          )}
        </div>
        {row.rationale && <p className="-mt-2 text-sm leading-relaxed">{row.rationale}</p>}

        <div>
          <p className="eyebrow">In the thesis</p>
          <p className="mt-1.5 border-l-2 border-primary pl-3 text-sm leading-relaxed">
            {row.description}
          </p>
        </div>

        <div>
          <p className="eyebrow">
            Evidence <span className="tabular-nums">{row.evidence.length}</span>
          </p>
          {row.evidence.length ? (
            <ul className="mt-2 divide-y rounded-lg border">
              {row.evidence.map((e, k) => (
                <li key={k} className="p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <span className={cn("size-2 rounded-full", STANCE[e.stance])} aria-hidden />
                    <span className={STANCE_TEXT[e.stance]}>{STANCE_LABEL[e.stance]}</span>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed">&ldquo;{e.quote}&rdquo;</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-foreground">{e.who}</span>
                      {e.role && <> · {e.role}</>}
                    </span>
                    <Link
                      to="/projects/$projectId/live"
                      params={{ projectId }}
                      search={{ interview: e.interviewId, turn: e.turnId }}
                      className="flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                      Transcript <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No quotes yet.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** The live evidence scorecard: refreshed by `v` whenever an interview finishes. */
export function Scorecard({
  project,
  v,
  action,
}: {
  project: DiligenceProject;
  v: ReturnType<typeof useThesisValidation>;
  /** Shown beside the refresh button, e.g. "Export report". */
  action?: ReactNode;
}) {
  const rows = scorecardRows(project);
  const r = v.result;
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = rows.find((x) => x.id === openId);
  const count = (a: ScoreRow["assessment"]) => rows.filter((x) => x.assessment === a).length;
  const supported = count("Supported");
  const contradicted = count("Contradicted");
  const open = rows.length - supported - contradicted;

  return (
    <section aria-label="Evidence scorecard" className="space-y-3">
      <div className="rounded-lg border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Evidence scorecard</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] md:text-[28px]">
              {r ? r.overall.verdict : "Awaiting first call"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {r
                ? `${r.interviewCount} ${r.interviewCount === 1 ? "call" : "calls"} · updated ${ago(r.at)}`
                : "Fills in when an interview finishes"}
              {v.loading && " · updating…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {action}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh scorecard"
              title="Refresh"
              disabled={v.loading || !v.hasEvidence}
              onClick={() => void v.run()}
            >
              {v.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-4">
          {[
            ["Supported", supported, "bg-success"],
            ["Contradicted", contradicted, "bg-destructive"],
            ["Open", open, "bg-border"],
          ].map(([label, n, dot]) => (
            <div key={label as string}>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", dot as string)} />
                {label}
              </dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
      </div>

      {v.error && <p className="text-sm text-destructive">Could not update: {v.error}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <ClaimCard key={row.id} row={row} onOpen={() => setOpenId(row.id)} />
        ))}
      </div>
      {opened && (
        <ClaimDetail row={opened} projectId={project.id} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}
