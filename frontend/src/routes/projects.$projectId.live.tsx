import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, MessageSquarePlus, Radio, Square, X } from "lucide-react";
import { useState } from "react";
import { expertOf, InterviewCard, QuestionStatusList, TranscriptViewer } from "@/components/research";
import { InterviewStatusBadge } from "@/components/status";
import { LiveCallBar, useLiveCall, useSyncSessions } from "@/components/live-call";
import { Scorecard } from "@/components/scorecard";
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  EmptyState,
  SectionTitle,
  Sheet,
  Textarea,
} from "@/components/ui-kit";
import {
  addInterviewQuestion,
  completeMockInterview,
  allInterviews,
  roundsOf,
} from "@/lib/mock-service";
import { useProject } from "@/lib/store";
import { useThesisValidation } from "@/lib/thesis-validation";
import type { DiligenceProject, Interview } from "@/lib/types";
import { useRoundView } from "@/lib/round-view";

type Search = { interview?: string | undefined; turn?: string | undefined };

export const Route = createFileRoute("/projects/$projectId/live")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    interview: typeof s["interview"] === "string" ? s["interview"] : undefined,
    turn: typeof s["turn"] === "string" ? s["turn"] : undefined,
  }),
  component: LivePage,
});

function LivePage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { project, update, updateInterview } = useProject(projectId);
  const { picked, select } = useRoundView();
  // Pick up live calls that finished while their sheet was closed.
  useSyncSessions(project, updateInterview);
  if (!project) return null;

  const rounds = roundsOf(project);
  const located = search.interview
    ? rounds.findIndex((r) => r.interviews.some((i) => i.id === search.interview))
    : -1;
  const viewIdx = picked(project) ?? (located >= 0 ? located : rounds.length - 1);
  const isPast = viewIdx < rounds.length - 1;
  const ivs = rounds[viewIdx]?.interviews ?? [];
  if (!ivs.length && rounds.length < 2)
    return (
      <EmptyState
        icon={<Radio />}
        title="No interviews yet"
        description="Approve the plan to create the interviews."
        action={
          <Link to="/projects/$projectId/plan" params={{ projectId }} className={buttonVariants()}>
            Review Research Plan
          </Link>
        }
      />
    );

  const open = (id?: string, turn?: string) => {
    if (id) {
      const r = rounds.findIndex((rd) => rd.interviews.some((i) => i.id === id));
      if (r >= 0) select(project.id, r);
    }
    navigate({ search: { interview: id, turn }, replace: true });
  };
  const selected = allInterviews(project).find((i) => i.id === search.interview);
  const completed = ivs.filter((i) => i.status === "Completed").length;

  return (
    <div className="space-y-8">
      <LiveScorecard project={project} update={update} />
      {!ivs.length && (
        <EmptyState
          icon={<Radio />}
          title={`Round ${viewIdx + 1} has not started`}
          description="Approve the proposed plan to create the next interview sessions."
          action={
            <Link
              to="/projects/$projectId/plan"
              params={{ projectId }}
              className={buttonVariants()}
            >
              Review Round {viewIdx + 1} Plan
            </Link>
          }
        />
      )}
      {ivs.length > 0 && (
        <>
          <section>
            <SectionTitle
              title="Interviews"
              description="Open one and press Send the interview. The call starts when the interviewee presses Start."
              action={
                // Findings open once any interview has finished; the rest can still run.
                !isPast &&
                completed > 0 && (
                  <Link to="/projects/$projectId/findings" params={{ projectId }} className={buttonVariants()}>
                    View Findings <ArrowRight />
                  </Link>
                )
              }
            />
            <div className="grid gap-4 lg:grid-cols-3">
              {ivs.map((iv) => (
                <InterviewCard
                  key={iv.id}
                  project={project}
                  interview={iv}
                  selected={iv.id === search.interview}
                  onOpen={() => open(iv.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <Sheet open={!!selected} onClose={() => open(undefined)} width="max-w-4xl">
        {selected && (
          <InterviewDetail
            project={project}
            key={selected.id}
            interviewId={selected.id}
            highlightTurn={search.turn}
            onClose={() => open(undefined)}
            setIv={updateInterview}
          />
        )}
      </Sheet>
    </div>
  );
}

function LiveScorecard({
  project,
  update,
}: {
  project: DiligenceProject;
  update: (fn: (p: DiligenceProject) => DiligenceProject) => void;
}) {
  return <Scorecard project={project} v={useThesisValidation(project, update)} />;
}

function InterviewDetail({
  project,
  interviewId,
  highlightTurn,
  onClose,
  setIv,
}: {
  project: DiligenceProject;
  interviewId: string;
  highlightTurn?: string | undefined;
  onClose: () => void;
  setIv: (id: string, fn: (iv: Interview) => Interview) => void;
}) {
  const iv = allInterviews(project).find((i) => i.id === interviewId)!;
  const expert = expertOf(project, iv.expertId);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const call = useLiveCall(project, iv, setIv);
  const done = iv.status === "Completed";
  // A live call drives this interview; the manual controls stay out of its way.
  const simControls = !done && !iv.live && !call.running;
  return (
    <>
      <div className="flex items-start justify-between border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{expert?.name}</p>
            <InterviewStatusBadge status={iv.status} />
          </div>
          <p className="text-sm text-muted-foreground">{expert?.title}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {simControls && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowAdd((s) => !s)}>
                <MessageSquarePlus /> Add Follow-Up Question
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(true)}>
                <Square /> End
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <LiveCallBar call={call} />
      {showAdd && simControls && (
        <form
          className="flex gap-2 border-b bg-primary-soft px-6 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!q.trim()) return;
            setIv(iv.id, (i) => addInterviewQuestion(i, q));
            setQ("");
            setShowAdd(false);
          }}
        >
          <Textarea
            autoFocus
            rows={2}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Investigate whether staffing shortages are causing appointment cancellations."
          />
          <Button type="submit" disabled={!q.trim()}>
            Add
          </Button>
        </form>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px]">
        <div className="min-h-0 overflow-y-auto px-4 py-5">
          <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Live transcript
          </p>
          <TranscriptViewer
            project={project}
            interview={iv}
            highlightTurnId={highlightTurn}
            aiName={call.state ? call.name : undefined}
          />
        </div>
        <div className="min-h-0 space-y-6 overflow-y-auto border-l bg-muted/30 px-4 py-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Interview questions{call.running ? " · live" : ""}
            </p>
            <QuestionStatusList questions={iv.questions} />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => setIv(iv.id, completeMockInterview)}
        title="End this interview?"
        description="Remaining questions will be left unanswered."
        confirmLabel="End interview"
      />
    </>
  );
}
