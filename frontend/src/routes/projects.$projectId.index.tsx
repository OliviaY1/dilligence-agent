import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleDashed,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import {
  Button,
  buttonVariants,
  Card,
  ConfirmDialog,
  Input,
  Label,
  SectionTitle,
  Textarea,
} from "@/components/ui-kit";
import { SpendTable, useUsage } from "@/components/usage";
import {
  addClaim,
  claimsOf,
  deleteClaim,
  editClaim,
  openCalls,
  resetClaims,
  timesAsked,
  upcomingCalls,
  type ClaimDraft,
} from "@/lib/claims";
import { hypothesesFromThesis } from "@/lib/mock-service";
import { useProject } from "@/lib/store";
import type { DiligenceProject, InvestmentHypothesis } from "@/lib/types";

export const Route = createFileRoute("/projects/$projectId/")({
  component: ClaimsPage,
});

type Update = (fn: (p: DiligenceProject) => DiligenceProject) => void;

/** The thesis as written and the claims the interviews test; how they score is on Findings. */
function ClaimsPage() {
  const { projectId } = Route.useParams();
  const { project, update } = useProject(projectId);
  if (!project) return null;
  return (
    <div className="space-y-8">
      <Thesis project={project} update={update} />
      <Claims project={project} update={update} />
      <ProjectSpend projectId={projectId} />
    </div>
  );
}

function Thesis({ project, update }: { project: DiligenceProject; update: Update }) {
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState("");
  const [thesis, setThesis] = useState("");
  return (
    <Card className="p-6">
      <SectionTitle
        title="Investment thesis"
        action={
          !editing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCompany(project.company);
                setThesis(project.thesis);
                setEditing(true);
              }}
            >
              <Pencil /> Edit
            </Button>
          )
        }
      />
      {editing ? (
        <div className="space-y-4">
          <div>
            <Label>Target Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label>Investment Thesis</Label>
            <Textarea rows={16} value={thesis} onChange={(e) => setThesis(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                update((p) => ({ ...p, company: company.trim() || p.company, thesis }));
                setEditing(false);
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-line text-sm leading-relaxed">
          {project.thesis || "No thesis provided."}
        </div>
      )}
    </Card>
  );
}

function Claims({ project, update }: { project: DiligenceProject; update: Update }) {
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const claims = claimsOf(project);
  const planned = !!project.plan;
  const edited = !planned && !!project.draftClaims;
  const roundNo = (project.pastRounds?.length ?? 0) + 1;
  const open = openCalls(project).length;

  const description = planned
    ? "What the interviews test. Reword a claim or add one you thought of later."
    : edited
      ? "Your edited list. The interview plan is built from these."
      : hypothesesFromThesis(project.thesis).length
        ? "Taken from the thesis: each “Label: We believe …” line is one claim. Edit them or add your own."
        : "Starter claims, as the thesis has no “Label: We believe …” lines. Edit them or add your own.";
  const addNote = !planned
    ? undefined
    : open
      ? `Goes to the ${open} ${open === 1 ? "person" : "people"} in Round ${roundNo} not sent a link yet. Their interviewer is told to test it; their written questions stay as they are.`
      : `Everyone in Round ${roundNo} has been called or sent a link, so no call will ask it yet. Findings still checks it against the transcripts so far, and the next-round proposal takes it into account.`;

  return (
    <section>
      <SectionTitle
        title="Claims"
        description={description}
        action={
          !planned && (
            <div className="flex shrink-0 gap-2">
              {edited && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
                  <RotateCcw /> Reset to thesis
                </Button>
              )}
              <Link
                to="/projects/$projectId/plan"
                params={{ projectId: project.id }}
                className={buttonVariants({ size: "sm" })}
              >
                Next: plan interviews <ArrowRight />
              </Link>
            </div>
          )
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {claims.map((h, i) => (
          <ClaimCard key={h.id} project={project} claim={h} label={`H${i + 1}`} update={update} />
        ))}
        {adding ? (
          <ClaimForm
            label={`H${claims.length + 1}`}
            note={addNote}
            onCancel={() => setAdding(false)}
            onSave={(d) => {
              update((p) => addClaim(p, d));
              setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-28 items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus className="size-4" /> Add a claim
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => update(resetClaims)}
        title="Reset claims to the thesis?"
        description="Your edits and added claims are replaced by the claims the thesis gives."
        confirmLabel="Reset"
      />
    </section>
  );
}

function ClaimCard({
  project,
  claim,
  label,
  update,
}: {
  project: DiligenceProject;
  claim: InvestmentHypothesis;
  label: string;
  update: Update;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const asked = project.plan ? timesAsked(project, claim.id) : 0;

  if (editing)
    return (
      <ClaimForm
        label={label}
        initial={claim}
        note={
          asked
            ? `Asked in ${asked} ${asked === 1 ? "call" : "calls"} already. Saving re-scores it against those transcripts; the questions already asked stay as they were.`
            : undefined
        }
        onCancel={() => setEditing(false)}
        onSave={(d) => {
          update((p) => editClaim(p, claim.id, d));
          setEditing(false);
        }}
      />
    );

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">{label}</span>
        <div className="-my-1.5 -mr-2 ml-auto flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${label}`}
            title="Edit"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          {!asked && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${label}`}
              title="Delete"
              onClick={() => setConfirm(true)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <h3 className="mt-1 text-[15px] font-medium leading-snug tracking-[-0.01em]">
        {claim.title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/75">{claim.description}</p>
      {project.plan && <ClaimProgress project={project} id={claim.id} asked={asked} />}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => update((p) => deleteClaim(p, claim.id))}
        title={`Delete ${label} · ${claim.title}?`}
        description={
          project.plan
            ? "No call has asked it yet. It comes out of the plan."
            : "It will not be in the interview plan."
        }
      />
    </Card>
  );
}

/** Where the claim is in the research: asked already, waiting for a call, or in no call. */
function ClaimProgress({
  project,
  id,
  asked,
}: {
  project: DiligenceProject;
  id: string;
  asked: number;
}) {
  const upcoming = upcomingCalls(project, id);
  const calls = (n: number) => `${n} ${n === 1 ? "call" : "calls"}`;
  const Icon = asked ? MessageSquare : upcoming ? Clock : CircleDashed;
  const text = asked
    ? `Asked in ${calls(asked)}${upcoming ? ` · ${upcoming} more to come` : ""}`
    : upcoming
      ? `Not asked yet · ${calls(upcoming)} to come will test it`
      : "Not asked yet · in no upcoming call";
  const findings = project.interviews.some((iv) => iv.status === "Completed");
  return (
    <div className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span>{text}</span>
      {asked > 0 && findings && (
        <Link
          to="/projects/$projectId/findings"
          params={{ projectId: project.id }}
          className="ml-auto flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline"
        >
          Evidence <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

function ClaimForm({
  label,
  initial,
  note,
  onSave,
  onCancel,
}: {
  label: string;
  initial?: ClaimDraft | undefined;
  note?: string | undefined;
  onSave: (d: ClaimDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const ok = !!title.trim() && !!description.trim();
  return (
    <Card className="p-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave({ title, description });
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      >
        <p className="font-mono text-[11px] font-medium text-muted-foreground">{label}</p>
        <div>
          <Label htmlFor={`${id}-title`}>Claim</Label>
          <Input
            id={`${id}-title`}
            autoFocus
            placeholder="e.g. Pricing Power"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-text`}>What we believe</Label>
          <Textarea
            id={`${id}-text`}
            rows={3}
            placeholder="We believe …"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!ok}>
            {initial ? "Save" : "Add claim"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ProjectSpend({ projectId }: { projectId: string }) {
  const { rows, error } = useUsage();
  return (
    <section>
      <SectionTitle
        title="API spend"
        description="What this project's Claude and Boson calls have cost, by model."
      />
      <Card>
        {error ? (
          <p className="px-5 py-4 text-sm text-destructive">{error}</p>
        ) : !rows ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <SpendTable rows={rows.filter((r) => r.projectId === projectId)} />
        )}
      </Card>
    </section>
  );
}
