import { Link, useParams } from "@tanstack/react-router";
import { CircleDollarSign, Compass, FolderKanban, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItem =
  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent";
const active = { className: "bg-sidebar-accent font-medium text-foreground" };

function Logo({ small }: { small?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
        <Compass className="size-3.5" />
      </span>
      <span className={cn("font-semibold tracking-[-0.01em]", small ? "text-sm" : "text-[15px]")}>
        Diligence Live
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projects, error } = useStore();
  const current = projects.find((p) => p.id === params.projectId);

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 py-3 md:flex">
        <div className="flex h-9 items-center px-2">
          <Logo small />
        </div>
        <nav className="mt-4 space-y-0.5">
          <Link to="/" className={navItem} activeOptions={{ exact: true }} activeProps={active}>
            <FolderKanban className="size-4" /> Projects
          </Link>
          <Link to="/usage" className={navItem} activeProps={active}>
            <CircleDollarSign className="size-4" /> API spend
          </Link>
        </nav>
        {current && (
          <div className="mt-5">
            <p className="px-2 pb-1 text-xs text-muted-foreground">Current project</p>
            <Link
              to="/projects/$projectId"
              params={{ projectId: current.id }}
              className={cn(navItem, "bg-sidebar-accent font-medium text-foreground")}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate">{current.company || "Untitled"}</span>
            </Link>
          </div>
        )}
        <Link to="/settings" className={cn(navItem, "mt-auto")} activeProps={active}>
          <Settings className="size-4" /> Settings
        </Link>
      </aside>
      <main className="min-w-0 flex-1 bg-background">
        <header className="no-print flex h-12 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
          <Logo />
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              aria-label="Projects"
              className={cn(navItem, "size-10 justify-center px-0")}
              activeOptions={{ exact: true }}
              activeProps={active}
            >
              <FolderKanban className="size-4" />
            </Link>
            <Link
              to="/usage"
              aria-label="API spend"
              className={cn(navItem, "size-10 justify-center px-0")}
              activeProps={active}
            >
              <CircleDollarSign className="size-4" />
            </Link>
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(navItem, "size-10 justify-center px-0")}
              activeProps={active}
            >
              <Settings className="size-4" />
            </Link>
          </nav>
        </header>
        {error && (
          <p
            role="alert"
            className="border-b bg-danger-soft px-4 py-2 text-sm text-destructive md:px-6"
          >
            {error}
          </p>
        )}
        {children}
      </main>
    </div>
  );
}

/** The bar at the top of every page: optional "Projects /" crumb, title, meta, actions, and tabs below. */
export function PageHeader({
  title,
  crumb,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  crumb?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card">
      <div className="flex h-12 items-center gap-2 px-4 text-sm md:px-6">
        {crumb && (
          <>
            <Link to="/" className="shrink-0 text-muted-foreground hover:text-foreground">
              Projects
            </Link>
            <span className="text-muted-foreground/50">/</span>
          </>
        )}
        <h1 className="min-w-0 truncate font-medium">{title}</h1>
        {meta}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Page content below the header. */
export function PageBody({ narrow, children }: { narrow?: boolean; children: ReactNode }) {
  return (
    <div className={cn("mx-auto px-4 py-6 md:px-8 md:py-8", narrow ? "max-w-3xl" : "max-w-6xl")}>
      {children}
    </div>
  );
}
