import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Lock,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { PeoplePicker } from "@/components/people-picker";
import { expertOf, HypothesisTag } from "@/components/research";
import { SourceBadge } from "@/components/status";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  SectionTitle,
  Textarea,
} from "@/components/ui-kit";
import { createInterviewsFromPlan, roundsOf, uid } from "@/lib/mock-service";
import { useProject } from "@/lib/store";
import { useRoundView } from "@/lib/round-view";
import type { DiligenceProject, PlanExpert } from "@/lib/types";
import { withInitialQuestions } from "@/lib/initial-questions";
import { apiUrl } from "@/lib/backend";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/$projectId/plan")({
  component: PlanPage,
});

function PlanPage() {
  const { projectId } = Route.useParams();
  const { project, update } = useProject(projectId);
  const navigate = useNavigate();
  const { view } = useRoundView();
  const [picking, setPicking] = useState(false);
  if (!project) return null;
  const rounds = roundsOf(project);
  const viewIdx = view(project);
  const isPast = viewIdx < rounds.length - 1;
  const plan = rounds[viewIdx]?.plan;
  if (!plan)
    return <PeoplePicker project={project} update={update} onDone={() => setPicking(false)} />;

  const locked = isPast || project.interviews.some((i) => i.status !== "Not Started");
  if (picking && !locked)
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
          Back to the plan
        </Button>
        <PeoplePicker project={project} update={update} onDone={() => setPicking(false)} />
      </div>
    );
  const roundNo = viewIdx + 1;
  const setPlanExpert = (expertId: string, fn: (pe: PlanExpert) => PlanExpert) =>
    update((p) => ({
      ...p,
      plan: {
        ...p.plan!,
        approved: false,
        experts: p.plan!.experts.map((pe) => (pe.expertId === expertId ? fn(pe) : pe)),
      },
    }));

  // Edit one question without un-approving the plan; a not-yet-started interview (and its sent link) gets it too.
  const editQuestion = (expertId: string, qid: string, text: string) => {
    const set = <Q extends { id: string; text: string }>(qs: Q[]) =>
      qs.map((q) => (q.id === qid ? { ...q, text } : q));
    update((p) => ({
      ...p,
      plan: {
        ...p.plan!,
        experts: p.plan!.experts.map((pe) =>
          pe.expertId === expertId ? { ...pe, questions: set(pe.questions) } : pe,
        ),
      },
      interviews: p.interviews.map((iv) =>
        iv.expertId === expertId && iv.status === "Not Started"
          ? { ...iv, questions: set(iv.questions) }
          : iv,
      ),
    }));
    const iv = project.interviews.find(
      (i) => i.expertId === expertId && i.status === "Not Started" && i.sessionId,
    );
    if (iv)
      void fetch(apiUrl(`/api/interviews/${iv.sessionId}/questions`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: set(iv.questions)
            .filter((q) => !q.removed)
            .map((q) => q.text),
        }),
      }).catch(() => undefined);
  };
  const canEditQuestions = (expertId: string) =>
    !isPast &&
    (project.interviews.find((i) => i.expertId === expertId)?.status ?? "Not Started") ===
      "Not Started";

  const approve = () => {
    if (!locked)
      update((p) => ({
        ...p,
        plan: { ...p.plan!, approved: true },
        interviews: createInterviewsFromPlan(p.plan!),
      }));
    navigate({ to: "/projects/$projectId/live", params: { projectId } });
  };

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <PlanStatus
          state={isPast ? "past" : plan.approved || locked ? "approved" : "waiting"}
          roundNo={roundNo}
          count={plan.experts.length}
          locked={locked}
          onApprove={approve}
          onGoLive={() => navigate({ to: "/projects/$projectId/live", params: { projectId } })}
        />
        <PlanNotes
          notes={plan.notes ?? ""}
          readOnly={isPast}
          onSave={(notes) => update((p) => ({ ...p, plan: { ...p.plan!, notes } }))}
        />
      </div>

      <section>
        <SectionTitle
          title="Interview plan"
          description="Who to call, which claims they test, and what to ask."
          action={
            !locked && (
              <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
                Change people
              </Button>
            )
          }
        />
        <div className="space-y-3">
          {plan.experts.map((pe) => (
            <PlanExpertCard
              key={pe.expertId}
              project={project}
              pe={pe}
              locked={locked}
              canEditQuestions={canEditQuestions(pe.expertId)}
              onEditQuestion={(qid, text) => editQuestion(pe.expertId, qid, text)}
              onChange={(fn) => setPlanExpert(pe.expertId, fn)}
              onRemove={() =>
                update((p) => ({
                  ...p,
                  plan: {
                    ...p.plan!,
                    approved: false,
                    experts: p.plan!.experts.filter((x) => x.expertId !== pe.expertId),
                  },
                }))
              }
            />
          ))}
          {!plan.experts.length && (
            <EmptyState
              title="No one to interview"
              description="Press Change people to add someone."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function PlanExpertCard({
  project,
  pe,
  locked,
  canEditQuestions,
  onEditQuestion,
  onChange,
  onRemove,
}: {
  project: DiligenceProject;
  pe: PlanExpert;
  locked: boolean;
  canEditQuestions: boolean;
  onEditQuestion: (qid: string, text: string) => void;
  onChange: (fn: (pe: PlanExpert) => PlanExpert) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [newQ, setNewQ] = useState("");
  const [editObj, setEditObj] = useState(false);
  const [obj, setObj] = useState(pe.objectives);
  const [confirm, setConfirm] = useState(false);
  const [writing, setWriting] = useState(false);
  const e = expertOf(project, pe.expertId);
  // Ask Claude again for this person's opening questions (e.g. after editing their description).
  const regenerate = async () => {
    if (!project.plan) return;
    setWriting(true);
    const next = await withInitialQuestions(project, project.plan, pe);
    onChange(() => next);
    setObj(next.objectives);
    setWriting(false);
  };

  const move = (i: number, d: number) =>
    onChange((x) => {
      const q = [...x.questions];
      [q[i], q[i + d]] = [q[i + d]!, q[i]!];
      return { ...x, questions: q };
    });

  return (
    <Card>
      <div className="flex items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{e?.name ?? "Removed expert"}</p>
            {e && <SourceBadge source={e.source} />}
          </div>
          <p className="text-sm text-muted-foreground">
            {e?.title} — {e?.description}
          </p>
          {pe.questionNote && (
            <p
              className={cn(
                "mt-1 text-xs",
                pe.questionSource === "template" ? "text-warning" : "text-primary",
              )}
            >
              {pe.questionNote}
            </p>
          )}
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Reason for selection</p>
              <p>{pe.reason}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Validates</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {pe.hypothesisIds.map((h) => (
                  <HypothesisTag key={h} project={project} id={h} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {!locked && (
            <Button
              variant="secondary"
              size="sm"
              disabled={writing}
              title="Write this person's opening questions with Claude from the thesis and their description"
              onClick={() => void regenerate()}
            >
              {writing ? "Writing…" : "Rewrite with Claude"}
            </Button>
          )}
          {!locked && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove expert"
              onClick={() => setConfirm(true)}
            >
              <X />
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
            {pe.questions.length} questions{" "}
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-5 border-t bg-muted/30 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="eyebrow">Interview objectives</p>
              {!locked && !editObj && (
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setObj(pe.objectives);
                    setEditObj(true);
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
            {editObj ? (
              <div className="flex gap-2">
                <Textarea rows={2} value={obj} onChange={(ev) => setObj(ev.target.value)} />
                <Button
                  size="sm"
                  onClick={() => {
                    onChange((x) => ({ ...x, objectives: obj }));
                    setEditObj(false);
                  }}
                >
                  Save
                </Button>
              </div>
            ) : (
              <p className="text-sm">{pe.objectives}</p>
            )}
          </div>
          <div>
            <p className="mb-2 eyebrow">Proposed questions</p>
            <ol className="space-y-1">
              {pe.questions.map((q, i) => (
                <li
                  key={q.id}
                  className="group flex items-start gap-3 rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border"
                >
                  <span className="mt-0.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  {editingId === q.id ? (
                    <div className="flex flex-1 gap-2">
                      <Input
                        autoFocus
                        value={text}
                        onChange={(ev) => setText(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" && text.trim()) {
                            onEditQuestion(q.id, text.trim());
                            setEditingId(null);
                          }
                          if (ev.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!text.trim()}
                        onClick={() => {
                          onEditQuestion(q.id, text.trim());
                          setEditingId(null);
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <span className="flex-1">{q.text}</span>
                  )}
                  {!locked && editingId !== q.id && (
                    <div className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={i === pe.questions.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete question"
                        onClick={() =>
                          onChange((x) => ({
                            ...x,
                            questions: x.questions.filter((y) => y.id !== q.id),
                          }))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                  {canEditQuestions && editingId !== q.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-my-1 shrink-0"
                      aria-label={`Edit question ${i + 1}`}
                      onClick={() => {
                        setEditingId(q.id);
                        setText(q.text);
                      }}
                    >
                      <Pencil className="!size-3.5" /> Edit
                    </Button>
                  )}
                </li>
              ))}
            </ol>
            {!locked && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (!newQ.trim()) return;
                  onChange((x) => ({
                    ...x,
                    questions: [...x.questions, { id: uid("q"), text: newQ.trim() }],
                  }));
                  setNewQ("");
                }}
              >
                <Input
                  value={newQ}
                  onChange={(ev) => setNewQ(ev.target.value)}
                  placeholder="Add a question"
                />
                <Button type="submit" variant="secondary" disabled={!newQ.trim()}>
                  <Plus /> Add
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onRemove}
        title={`Remove ${e?.name} from the plan?`}
        description="Their interview guide will be discarded."
        confirmLabel="Remove"
      />
    </Card>
  );
}

/** First line of the plan: is it approved, or waiting on a human? */
function PlanStatus({
  state,
  roundNo,
  count,
  locked,
  onApprove,
  onGoLive,
}: {
  state: "past" | "approved" | "waiting";
  roundNo: number;
  count: number;
  locked: boolean;
  onApprove: () => void;
  onGoLive: () => void;
}) {
  const look = {
    past: {
      icon: <Lock />,
      tone: "bg-secondary text-muted-foreground",
      title: `Round ${roundNo} complete`,
    },
    approved: { icon: <Check />, tone: "bg-success-soft text-success", title: "Approved" },
    waiting: {
      icon: <Clock />,
      tone: "bg-warning-soft text-warning",
      title: "Waiting for approval",
    },
  }[state];
  const detail =
    state === "past"
      ? "Shown for reference."
      : state === "approved"
        ? locked
          ? "Interviews are underway, so the plan is read-only."
          : `${count} interview${count === 1 ? "" : "s"} created.`
        : `${roundNo > 1 ? `Proposed from Round ${roundNo - 1} findings. ` : ""}Approving creates ${count} interview${count === 1 ? "" : "s"}.`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 pl-4">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-4",
          look.tone,
        )}
      >
        {look.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{look.title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {state === "waiting" && (
        <Button size="sm" disabled={!count} onClick={onApprove}>
          {roundNo > 1 ? `Approve & start Round ${roundNo}` : "Approve & start research"}{" "}
          <ArrowRight />
        </Button>
      )}
      {state === "approved" && (
        <Button size="sm" variant="secondary" onClick={onGoLive}>
          Go to Live <ArrowRight />
        </Button>
      )}
    </div>
  );
}

/** The team's notepad for this plan, kept with the round. */
function PlanNotes({
  notes,
  readOnly,
  onSave,
}: {
  notes: string;
  readOnly: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (readOnly && !notes) return null;
  return (
    <section aria-label="Notes" className="rounded-lg border bg-card">
      <div className="flex h-10 items-center justify-between border-b px-4">
        <h2 className="flex items-center gap-2 text-[13px] font-medium">
          <StickyNote className="size-3.5 text-muted-foreground" /> Notes
        </h2>
        {!readOnly && draft === null && (
          <Button variant="ghost" size="sm" className="-mr-2" onClick={() => setDraft(notes)}>
            <Pencil className="!size-3.5" /> Edit
          </Button>
        )}
      </div>
      {draft !== null ? (
        <div className="space-y-2 p-3">
          <Textarea
            autoFocus
            aria-label="Notes"
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave(draft.trim());
                setDraft(null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "whitespace-pre-line px-4 py-3 text-sm leading-relaxed",
            !notes && "text-muted-foreground",
          )}
        >
          {notes || "Empty"}
        </p>
      )}
    </section>
  );
}
