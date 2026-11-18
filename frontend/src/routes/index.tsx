import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, Mic, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { fmtDate } from "@/components/status";
import { Button, buttonVariants, ConfirmDialog, EmptyState } from "@/components/ui-kit";
import { useStore } from "@/lib/store";
import { allInterviews } from "@/lib/mock-service";
import type { DiligenceProject, ProjectStatus } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Projects — Diligence Live" },
      {
        name: "description",
        content:
          "Your commercial due diligence projects, expert interviews and findings in one place.",
      },
      { property: "og:title", content: "Projects — Diligence Live" },
      {
        property: "og:description",
        content:
          "Your commercial due diligence projects, expert interviews and findings in one place.",
      },
    ],
  }),
  component: Projects,
});

const GROUPS: ProjectStatus[] = [
  "In Progress",
  "Ready for Interviews",
  "Planning",
  "Draft",
  "Completed",
];

/** Linear-style status ring: fills as the project moves through its stages. */
function StatusIcon({ status }: { status: ProjectStatus }) {
  const tone = {
    Draft: "text-muted-foreground",
    Planning: "text-muted-foreground",
    "Ready for Interviews": "text-primary",
    "In Progress": "text-warning",
    Completed: "text-primary",
  }[status];
  if (status === "Completed")
    return (
      <svg viewBox="0 0 14 14" className={`size-3.5 shrink-0 ${tone}`} aria-hidden>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path
          d="M4.2 7.2 6.1 9l3.7-3.8"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  const fill = { Draft: 0, Planning: 0.25, "Ready for Interviews": 0.5, "In Progress": 0.75 }[
    status
  ];
  const c = 2 * Math.PI * 2.5;
  return (
    <svg viewBox="0 0 14 14" className={`size-3.5 shrink-0 ${tone}`} aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={status === "Draft" ? "1.6 1.6" : undefined}
      />
      {fill > 0 && (
        <circle
          cx="7"
          cy="7"
          r="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray={`${fill * c} ${c}`}
          transform="rotate(-90 7 7)"
        />
      )}
    </svg>
  );
}

function Projects() {
  const { projects, hydrated, removeProject, loadSamples } = useStore();
  const [pending, setPending] = useState<DiligenceProject | null>(null);
  const groups = GROUPS.map((status) => ({
    status,
    items: projects.filter((p) => p.status === status),
  })).filter((g) => g.items.length);

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        meta={
          hydrated &&
          projects.length > 0 && (
            <span className="tabular-nums text-muted-foreground">{projects.length}</span>
          )
        }
        actions={
          <Link to="/new" className={buttonVariants({ size: "sm" })}>
            <Plus /> New diligence
          </Link>
        }
      />
      <div className="min-h-[calc(100vh-3rem)] bg-card">
        {!hydrated ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !projects.length ? (
          <div className="p-4 md:p-6">
            <EmptyState
              icon={<FolderKanban />}
              title="No projects yet"
              description="Start one, or load the samples."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/new" className={buttonVariants({ size: "sm" })}>
                    New diligence
                  </Link>
                  <Button size="sm" variant="secondary" onClick={loadSamples}>
                    Load samples
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.status} aria-label={g.status}>
              <h2 className="flex h-9 items-center gap-2 border-b bg-background px-4 text-[13px] font-medium md:px-6">
                <StatusIcon status={g.status} />
                {g.status}
                <span className="font-normal tabular-nums text-muted-foreground">
                  {g.items.length}
                </span>
              </h2>
              <ul>
                {g.items.map((p) => {
                  const company = p.company || "Untitled project";
                  return (
                    <li
                      key={p.id}
                      className="group relative flex h-14 items-center gap-3 border-b px-4 text-sm transition-colors hover:bg-background md:px-6"
                    >
                      <StatusIcon status={p.status} />
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground">
                        {company[0]!.toUpperCase()}
                      </span>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring/40"
                      >
                        {company}
                      </Link>
                      <span
                        className="flex items-center gap-1 tabular-nums text-muted-foreground"
                        title="Experts"
                      >
                        <Users className="size-3.5" aria-hidden />
                        <span className="sr-only">Experts</span>
                        {p.experts.length}
                      </span>
                      <span
                        className="flex items-center gap-1 tabular-nums text-muted-foreground"
                        title="Interviews"
                      >
                        <Mic className="size-3.5" aria-hidden />
                        <span className="sr-only">Interviews</span>
                        {allInterviews(p).length}
                      </span>
                      <span className="hidden w-24 text-right text-xs text-muted-foreground sm:block">
                        {fmtDate(p.updatedAt)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${company}`}
                        title="Delete project"
                        className="relative z-10 -mr-1.5 size-8 shrink-0 text-muted-foreground hover:bg-danger-soft hover:text-destructive md:size-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 [&_svg]:size-3.5"
                        onClick={() => setPending(p)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        <ConfirmDialog
          open={!!pending}
          onClose={() => setPending(null)}
          onConfirm={() => {
            if (pending) removeProject(pending.id);
            setPending(null);
          }}
          title={`Delete ${pending?.company || "this project"}?`}
          description="Its claims, plan, interviews and findings are removed."
          confirmLabel="Delete project"
        />
      </div>
    </AppShell>
  );
}
