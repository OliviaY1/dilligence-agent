import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Compass, FileText, Loader2, RefreshCw } from "lucide-react";
import { Scorecard } from "@/components/scorecard";
import { Badge, Button, buttonVariants, Card, EmptyState, SectionTitle } from "@/components/ui-kit";
import {
  allHypotheses,
  canRecommendNextRound,
} from "@/lib/mock-service";
import { useProject } from "@/lib/store";
import { useRoundView } from "@/lib/round-view";
import type { DiligenceProject } from "@/lib/types";
import { useThesisValidation } from "@/lib/thesis-validation";
import { startNextRoundFrom, useNextRound } from "@/lib/next-round";
import { useSyncSessions } from "@/components/live-call";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId/findings")({
  head: () => ({
    meta: [
      { title: "Research Findings — Diligence Live" },
      {
        name: "description",
        content:
          "Review expert evidence, investment thesis assessments and recommended next research rounds.",
      },
      { property: "og:title", content: "Research Findings — Diligence Live" },
      {
        property: "og:description",
        content:
          "Review expert evidence, investment thesis assessments and recommended next research rounds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FindingsPage,
});

function FindingsPage() {
  const { projectId } = Route.useParams();
  const { project, update, updateInterview } = useProject(projectId);
  const navigate = useNavigate();
  const { clear: clearRound } = useRoundView();
  // Pick up live calls that finished while their sheet was closed.
  useSyncSessions(project, updateInterview);
  if (!project) return null;
  // Opening Findings means the consultant is done; one finished interview is enough.
  const anyDone = project.interviews.some((i) => i.status === "Completed");

  if (!anyDone)
    return (
      <EmptyState
        icon={<FileText />}
        title="No findings yet"
        description="Findings open as soon as one interview has finished."
        action={
          <Link to="/projects/$projectId/live" params={{ projectId }} className={buttonVariants()}>
            Go to Live
          </Link>
        }
      />
    );

  return (
    <div className="space-y-10">
      <LlmFindings
        project={project}
        update={update}
        nextRound={
          canRecommendNextRound(project) ? (
            <NextRoundCard
              project={project}
              update={update}
              onCreated={() => {
                clearRound(projectId);
                navigate({ to: "/projects/$projectId/plan", params: { projectId } });
              }}
            />
          ) : null
        }
      />

    </div>
  );
}

/**
 * "Recommended next round", written by Claude from all the context so far
 * (lib/next-round.ts): sharper hypotheses, who to interview (existing contacts
 * or new profiles to recruit) and their questions.
 */
function NextRoundCard({
  project,
  update,
  onCreated,
}: {
  project: DiligenceProject;
  update: (fn: (p: DiligenceProject) => DiligenceProject) => void;
  onCreated: () => void;
}) {
  const n = useNextRound(project, update);
  const roundNo = (project.pastRounds?.length ?? 0) + 2;
  const existing = allHypotheses(project);
  const proposal = n.proposal;
  const person = (id: string) =>
    project.experts.find((e) => e.id === id) ?? proposal?.newExperts.find((e) => e.id === id);
  const isNew = (id: string) => !!proposal?.newExperts.some((e) => e.id === id);

  return (
    <section>
      <SectionTitle
        title="Recommended next round"
        description={
          proposal
            ? `By ${proposal.model} from the thesis, the findings, the research gaps and every transcript so far.`
            : `Claude proposes Round ${roundNo}: what to test next, who to interview, and what to ask.`
        }
        action={
          <Button variant="secondary" size="sm" disabled={n.loading} onClick={() => void n.run()}>
            {n.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {n.loading ? "Proposing…" : proposal ? "Propose again" : "Propose"}
          </Button>
        }
      />
      {n.error && !n.loading && <p className="mb-3 text-sm text-destructive">Proposal failed: {n.error}</p>}
      {n.loading && <ThinkingBar label={`Claude is planning Round ${roundNo} from everything so far…`} />}
      {proposal && !n.loading && (
        <Card className="border-primary/30">
          <div className="space-y-5 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Hypotheses to test in Round {roundNo}
            </p>
            {!proposal.plan.hypotheses.length && (
              <p className="text-sm text-muted-foreground">Nothing left to test: every hypothesis is supported.</p>
            )}
            {proposal.plan.hypotheses.map((h, i) => (
              <div key={h.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">H{existing.length + i + 1}</span>
                  <p className="font-medium">{h.title}</p>
                  {h.origin && (
                    <Badge tone={h.origin === "New" ? "warning" : "primary"} className="font-normal">
                      {h.origin}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{h.description}</p>
                {proposal.why[h.id] && (
                  <p className="mt-1 text-xs text-muted-foreground">Why: {proposal.why[h.id]}</p>
                )}
              </div>
            ))}

            <p className="pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Who to interview
            </p>
            {proposal.plan.experts.map((pe) => {
              const e = person(pe.expertId);
              return (
                <div key={pe.expertId} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{e?.name ?? "Interviewee"}</p>
                    <Badge tone={isNew(pe.expertId) ? "warning" : "neutral"} className="font-normal">
                      {isNew(pe.expertId) ? "New contact to recruit" : "From your contacts"}
                    </Badge>
                    <Badge tone="outline" className="font-normal">
                      {pe.audience === "customer" ? "Customer" : "Industry expert"}
                    </Badge>
                  </div>
                  {(e?.title || e?.description) && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[e?.title, e?.description].filter(Boolean).join(" — ")}
                    </p>
                  )}
                  {pe.reason && <p className="mt-2 text-sm">{pe.reason}</p>}
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {pe.questions.map((q) => (
                      <li key={q.id}>{q.text}</li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-4 border-t bg-primary-soft/50 px-5 py-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Compass className="size-4 text-primary" /> New people are added to your contacts. You can
              edit everything in the Round {roundNo} plan before approving.
            </p>
            <Button
              disabled={!proposal.plan.experts.length}
              onClick={() => {
                update((p) => startNextRoundFrom(p, proposal));
                onCreated();
              }}
            >
              Create Round {roundNo} Plan <ArrowRight />
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}

/**
 * Thesis validation and research gaps, both from one Claude call. Nothing
 * pre-generated is shown: gaps and the next round wait for an up-to-date result.
 */
function LlmFindings({
  project,
  update,
  nextRound,
}: {
  project: DiligenceProject;
  update: (fn: (p: DiligenceProject) => DiligenceProject) => void;
  /** The "Recommended next round" card; shown only with a finished Claude result. */
  nextRound: ReactNode;
}) {
  const v = useThesisValidation(project, update);
  const working = v.loading || (v.hasEvidence && v.stale && !v.error);
  return (
    <>
      <Scorecard project={project} v={v} />
      {!working && v.result && <ResearchGapsSection project={project} result={v.result} />}
      {!working && v.result && nextRound}
    </>
  );
}

/** Research gaps from the same Claude call as the validation (so the two never disagree). */
function ResearchGapsSection({
  project,
  result,
}: {
  project: DiligenceProject;
  result: NonNullable<DiligenceProject["thesisValidation"]>;
}) {
  const hyps = allHypotheses(project);
  const label = (id: string | null) => {
    if (!id) return "Overall thesis";
    const i = hyps.findIndex((h) => h.id === id);
    return i >= 0 ? `H${i + 1} · ${hyps[i]?.title ?? ""}` : "Overall thesis";
  };
  return (
    <section>
      <SectionTitle
        title="Research gaps"
        description="What the completed interviews have not established yet, and what to do next."
      />
      <Card className="divide-y text-sm">
        {result.gaps.length ? (
          result.gaps.map((g, i) => (
            <div key={i} className="flex gap-3 px-4 py-3">
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  g.priority === "high"
                    ? "text-destructive"
                    : g.priority === "medium"
                      ? "text-warning"
                      : "text-muted-foreground",
                )}
              />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {label(g.hypothesisId)} · {g.priority} priority
                </p>
                <p>{g.gap}</p>
                {g.nextStep && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Next step: </span>
                    {g.nextStep}
                  </p>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="px-4 py-3 text-muted-foreground">No open gaps.</p>
        )}
      </Card>
    </section>
  );
}

/** An indeterminate progress bar with the elapsed time, while Claude works. */
function ThinkingBar({ label, note }: { label: string; note?: string }) {
  const [t0] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">{Math.floor((now - t0) / 1000)}s</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="animate-indeterminate h-full w-1/3 rounded-full bg-primary" />
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </Card>
  );
}
