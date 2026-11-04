import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deriveStatus, missingSamples, withoutProject } from "./mock-service";
import { readBackendJson } from "./backend";
import type { DiligenceProject, Interview } from "./types";

// Projects live in the database behind /api/projects (server/projects.ts).
// Browsers used to keep them under this key; they are imported once, then removed.
const OLD_KEY = "diligence-live:v2";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await readBackendJson<T & { error?: string }>(res);
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
const put = (p: DiligenceProject) =>
  api(`/api/projects/${encodeURIComponent(p.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
const del = (id: string) => api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Store {
  projects: DiligenceProject[];
  hydrated: boolean;
  /** Why loading or saving failed, or "". */
  error: string;
  updateProject: (id: string, fn: (p: DiligenceProject) => DiligenceProject) => void;
  addProject: (p: DiligenceProject) => void;
  removeProject: (id: string) => void;
  removeAllProjects: () => void;
  loadSamples: () => void;
}

const Ctx = createContext<Store | null>(null);

const touch = (p: DiligenceProject): DiligenceProject => ({
  ...p,
  status: deriveStatus(p),
  updatedAt: new Date().toISOString(),
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<DiligenceProject[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  /** The version of each project the database has (loaded or saved). */
  const saved = useRef(new Map<string, DiligenceProject>());
  const latest = useRef(projects);
  latest.current = projects;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Saves run one after another, so an older version never lands after a newer one. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    // The interviewee's page (an outside person) must not download the firm's projects.
    if (window.location.pathname.startsWith("/interview/")) return setHydrated(true);
    void (async () => {
      try {
        let { projects: loaded } = await api<{ projects: DiligenceProject[] }>("/api/projects");
        if (!loaded.length) {
          let old: DiligenceProject[] = [];
          try {
            old = JSON.parse(localStorage.getItem(OLD_KEY) ?? "[]") as DiligenceProject[];
          } catch {
            /* corrupt old storage: nothing to import */
          }
          for (const p of old) await put(p);
          localStorage.removeItem(OLD_KEY);
          loaded = old;
        }
        for (const p of loaded) saved.current.set(p.id, p);
        setProjects(loaded);
      } catch (e) {
        setError(`Could not load projects: ${errText(e)}`);
      }
      setHydrated(true);
    })();
  }, []);

  // Back on the tab: take what others, and the backend after each call, saved since.
  // Projects with local changes not saved yet are kept as they are.
  // shortcut: refreshes on focus only; use Supabase Realtime if teammates edit the same project at once.
  useEffect(() => {
    if (window.location.pathname.startsWith("/interview/")) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || timer.current) return;
      queue.current = queue.current
        .then(() => api<{ projects: DiligenceProject[] }>("/api/projects"))
        .then(({ projects: fresh }) =>
          setProjects((ps) => {
            const local = new Map(
              ps.filter((p) => saved.current.get(p.id) !== p).map((p) => [p.id, p]),
            );
            for (const p of fresh) if (!local.has(p.id)) saved.current.set(p.id, p);
            const ids = new Set(fresh.map((p) => p.id));
            return [
              ...fresh.map((p) => local.get(p.id) ?? p),
              ...[...local.values()].filter((p) => !ids.has(p.id)),
            ];
          }),
        )
        .catch(() => undefined); // offline for a moment: keep what is on screen
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Save changed projects at most once a second: a live call updates its project ~4 times a second.
  useEffect(() => {
    if (!hydrated || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      for (const p of latest.current) {
        if (saved.current.get(p.id) === p) continue;
        saved.current.set(p.id, p);
        queue.current = queue.current.then(() =>
          put(p).then(
            () => setError(""),
            (e) => {
              saved.current.delete(p.id); // retried with the next change
              setError(`Could not save ${p.company || "a project"}: ${errText(e)}`);
            },
          ),
        );
      }
    }, 1000);
  }, [projects, hydrated]);

  const remove = useCallback((ids: string[]) => {
    for (const id of ids) {
      saved.current.delete(id);
      queue.current = queue.current.then(() =>
        del(id).catch((e) => setError(`Could not delete a project: ${errText(e)}`)),
      );
    }
  }, []);

  const updateProject = useCallback((id: string, fn: (p: DiligenceProject) => DiligenceProject) => {
    setProjects((ps) => ps.map((p) => (p.id === id ? touch(fn(p)) : p)));
  }, []);
  const addProject = useCallback((p: DiligenceProject) => setProjects((ps) => [p, ...ps]), []);
  const removeProject = useCallback(
    (id: string) => {
      remove([id]);
      setProjects((ps) => withoutProject(ps, id));
    },
    [remove],
  );
  const removeAllProjects = useCallback(() => {
    remove(latest.current.map((p) => p.id));
    setProjects([]);
  }, [remove]);
  const loadSamples = useCallback(() => setProjects((ps) => [...missingSamples(ps), ...ps]), []);

  const value = useMemo(
    () => ({
      projects,
      hydrated,
      error,
      updateProject,
      addProject,
      removeProject,
      removeAllProjects,
      loadSamples,
    }),
    [
      projects,
      hydrated,
      error,
      updateProject,
      addProject,
      removeProject,
      removeAllProjects,
      loadSamples,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}

export function useProject(id: string) {
  const { projects, updateProject, hydrated } = useStore();
  const project = projects.find((p) => p.id === id);
  const update = useCallback(
    (fn: (p: DiligenceProject) => DiligenceProject) => updateProject(id, fn),
    [id, updateProject],
  );
  /** Change one interview of the current round. */
  const updateInterview = useCallback(
    (ivId: string, fn: (iv: Interview) => Interview) =>
      update((p) => ({ ...p, interviews: p.interviews.map((i) => (i.id === ivId ? fn(i) : i)) })),
    [update],
  );
  return { project, update, updateInterview, hydrated };
}
