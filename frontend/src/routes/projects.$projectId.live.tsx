import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, MessageSquarePlus, Radio, Square, Upload, X } from "lucide-react";
import { useState } from "react";
import {
  expertOf,
  InterviewCard,
  QuestionStatusList,
  TranscriptViewer,
} from "@/components/research";
import { InterviewStatusBadge } from "@/components/status";
import { LiveCallBar, useLiveCall, useSyncSessions } from "@/components/live-call";
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Label,
  SectionTitle,
  Select,
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
import { UPLOADED_TOPIC, type DiligenceProject, type Interview } from "@/lib/types";
import {
  guessInterviewee,
  readTranscriptFile,
  speakersOf,
  withUploadedInterview,
  type ParsedTurn,
} from "@/lib/transcript-upload";
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
  const [uploading, setUploading] = useState(false);
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
      <KeepScorecardFresh project={project} update={update} />
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
                !isPast && (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => setUploading(true)}>
                      <Upload /> Upload an interview
                    </Button>
                    {/* Findings open once any interview has finished; the rest can still run. */}
                    {completed > 0 && (
                      <Link
                        to="/projects/$projectId/findings"
                        params={{ projectId }}
                        className={buttonVariants()}
                      >
                        View Findings <ArrowRight />
                      </Link>
                    )}
                  </div>
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

      {uploading && (
        <UploadInterviewDialog
          project={project}
          onClose={() => setUploading(false)}
          onSave={update}
        />
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

/** Re-scores claims as soon as a call ends, without showing the scorecard here. */
function KeepScorecardFresh({
  project,
  update,
}: {
  project: DiligenceProject;
  update: (fn: (p: DiligenceProject) => DiligenceProject) => void;
}) {
  useThesisValidation(project, update);
  return null;
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
          <p className="mb-3 px-3 eyebrow">Live transcript</p>
          <TranscriptViewer
            project={project}
            interview={iv}
            highlightTurnId={highlightTurn}
            aiName={
              call.state ? call.name : iv.topic === UPLOADED_TOPIC ? "Interviewer" : undefined
            }
          />
        </div>
        <div className="min-h-0 space-y-6 overflow-y-auto border-l bg-muted/30 px-4 py-5">
          <div>
            <p className="mb-2 eyebrow">Interview questions{call.running ? " · live" : ""}</p>
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

const NEW_PERSON = "__new";

/** An interview the consultant ran themselves: who it was with, and its transcript file. */
function UploadInterviewDialog({
  project,
  onClose,
  onSave,
}: {
  project: DiligenceProject;
  onClose: () => void;
  onSave: (fn: (p: DiligenceProject) => DiligenceProject) => void;
}) {
  const [person, setPerson] = useState(project.experts[0]?.id ?? NEW_PERSON);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [turns, setTurns] = useState<ParsedTurn[] | null>(null);
  const [interviewee, setInterviewee] = useState("");
  const [error, setError] = useState("");
  const isNew = person === NEW_PERSON;
  const personName = isNew ? name : (project.experts.find((e) => e.id === person)?.name ?? "");
  const speakers = turns ? speakersOf(turns) : [];
  const ready = !!turns && (!isNew || !!name.trim());

  return (
    <Dialog
      open
      onClose={onClose}
      title="Upload an interview"
      description="A transcript of an interview you ran yourself. Its evidence counts in the findings like an AI interview."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              onSave((p) =>
                withUploadedInterview(p, isNew ? { name, title } : person, turns!, interviewee),
              );
              onClose();
            }}
          >
            Save interview
          </Button>
        </>
      }
    >
      <div>
        <Label htmlFor="upload-person">Interviewee</Label>
        <Select
          id="upload-person"
          className="w-full"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          {project.experts.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.title ? ` · ${e.title}` : ""}
            </option>
          ))}
          <option value={NEW_PERSON}>New person…</option>
        </Select>
      </div>
      {isNew && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="upload-name">Name</Label>
            <Input id="upload-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="upload-title">Title</Label>
            <Input
              id="upload-title"
              value={title}
              placeholder="e.g. Clinic owner"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="upload-file">Transcript file</Label>
        <input
          id="upload-file"
          type="file"
          accept=".txt,.md,.vtt,.srt,text/plain,text/vtt"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setTurns(null);
            setError("");
            if (!file) return;
            try {
              const t = await readTranscriptFile(file);
              setTurns(t);
              setInterviewee(guessInterviewee(t, personName));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">.txt, .vtt (Zoom, Teams), .srt or .md</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {turns && (
        <p className="text-sm">
          Found {turns.length} turn{turns.length === 1 ? "" : "s"}
          {speakers.length
            ? ` from ${speakers.join(", ")}.`
            : " with no speaker names; all are counted as the interviewee."}
        </p>
      )}
      {speakers.length > 0 && (
        <div>
          <Label htmlFor="upload-speaker">
            Which speaker is {personName || "the interviewee"}?
          </Label>
          <Select
            id="upload-speaker"
            className="w-full"
            value={interviewee}
            onChange={(e) => setInterviewee(e.target.value)}
          >
            {speakers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Dialog>
  );
}
