import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedProjects } from "@/lib/mock-data";
import { StoreProvider, useStore } from "@/lib/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sample = () => seedProjects()[0]!;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Mount the store; returns the latest store value and the fetch calls made. */
async function mount(dbProjects: unknown[], stored: Record<string, string> = {}) {
  // Node 26's own localStorage hides jsdom's, so tests bring an in-memory one.
  const mem = new Map(Object.entries(stored));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return json(method === "GET" ? { projects: dbProjects } : { ok: true });
  });
  let store!: ReturnType<typeof useStore>;
  const Probe = () => {
    store = useStore();
    return null;
  };
  await act(async () => {
    createRoot(document.createElement("div")).render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 0)));
  return { store: () => store, calls, mem };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project store (database through /api/projects)", () => {
  it("imports projects from the old browser storage once, when the database is empty", async () => {
    const { store, calls, mem } = await mount([], {
      "diligence-live:v2": JSON.stringify([sample()]),
    });
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.url)).toEqual([
      "/api/projects/oakville",
    ]);
    expect(store().projects.map((p) => p.id)).toEqual(["oakville"]);
    expect(mem.has("diligence-live:v2")).toBe(false);
  });

  it("saves a changed project once, not on every change, and deletes on remove", async () => {
    const { store, calls } = await mount([sample()]);
    await act(async () => {
      store().updateProject("oakville", (p) => ({ ...p, thesis: "one" }));
      store().updateProject("oakville", (p) => ({ ...p, thesis: "two" }));
    });
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect((puts[0]!.body as { thesis: string }).thesis).toBe("two");

    await act(async () => store().removeProject("oakville"));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: "/api/projects/oakville" });
  });
});
