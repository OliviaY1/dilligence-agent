import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import { Card, SectionTitle } from "@/components/ui-kit";
import { fmtUsd, groupBy, SpendTable, totalCost, useUsage } from "@/components/usage";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/usage")({
  head: () => ({ meta: [{ title: "API spend — Diligence Live" }] }),
  component: UsagePage,
});

function UsagePage() {
  const { rows, error } = useUsage();
  const { projects } = useStore();
  const name = (id: string | null) =>
    id === null ? "No project" : (projects.find((p) => p.id === id)?.company ?? "Deleted project");

  return (
    <AppShell>
      <PageHeader
        title="API spend"
        meta={
          rows && (
            <span className="tabular-nums text-muted-foreground">{fmtUsd(totalCost(rows))}</span>
          )
        }
      />
      <PageBody narrow>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !rows ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-8">
            <section>
              <SectionTitle
                title="All projects"
                description="Claude (analysis, live question updates) and Boson (voice, transcription, avatar), priced at list rates."
              />
              <Card>
                <SpendTable rows={rows} />
              </Card>
            </section>
            {rows.length > 0 && (
              <section>
                <SectionTitle title="By project" />
                <Card className="divide-y text-sm">
                  {groupBy(rows, (r) => r.projectId ?? "").map((g) => (
                    <div key={g.key} className="flex items-center justify-between px-5 py-2.5">
                      {g.projectId && projects.some((p) => p.id === g.projectId) ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: g.projectId }}
                          className="font-medium hover:underline"
                        >
                          {name(g.projectId)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{name(g.projectId)}</span>
                      )}
                      <span className="tabular-nums">{fmtUsd(g.costUsd ?? 0)}</span>
                    </div>
                  ))}
                </Card>
              </section>
            )}
          </div>
        )}
      </PageBody>
    </AppShell>
  );
}
