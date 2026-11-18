import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { ProjectStatusBadge } from "@/components/status";
import { RoundIndicator } from "@/components/research";
import { buttonVariants, EmptyState } from "@/components/ui-kit";
import { useProject } from "@/lib/store";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Diligence Project — Diligence Live" },
      {
        name: "description",
        content: "Plan, run and review expert interviews for a diligence project.",
      },
      { property: "og:title", content: "Diligence Project — Diligence Live" },
      {
        property: "og:description",
        content: "Plan, run and review expert interviews for a diligence project.",
      },
    ],
  }),
  component: ProjectLayout,
});

const tabs = [
  { to: "/projects/$projectId", label: "Claims", exact: true },
  { to: "/projects/$projectId/plan", label: "Plan" },
  { to: "/projects/$projectId/live", label: "Live" },
  { to: "/projects/$projectId/findings", label: "Findings" },
] as const;

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { project, hydrated } = useProject(projectId);
  const { pathname } = useLocation();
  const roundAware = /\/(plan|live)$/.test(pathname);

  return (
    <AppShell>
      {!project ? (
        <PageBody narrow>
          {hydrated ? (
            <EmptyState
              title="Project not found"
              description="It may have been deleted."
              action={
                <Link to="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Back to projects
                </Link>
              }
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          )}
        </PageBody>
      ) : (
        <>
          <PageHeader
            crumb
            title={project.company || "Untitled project"}
            meta={
              <span className="hidden sm:inline-flex">
                <ProjectStatusBadge status={project.status} />
              </span>
            }
            actions={<RoundIndicator project={project} interactive={roundAware} />}
          >
            <nav className="-mb-px flex gap-5 overflow-x-auto px-4 md:px-6">
              {tabs.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  params={{ projectId }}
                  activeOptions={{ exact: "exact" in t }}
                  className="shrink-0 border-b-2 border-transparent pb-2.5 pt-1 text-[13px] text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "!border-foreground !text-foreground font-medium" }}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </PageHeader>
          <PageBody>
            <Outlet />
          </PageBody>
        </>
      )}
    </AppShell>
  );
}
