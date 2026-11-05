import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allowOrigin } from "./cors";

const FRONTEND = "https://diligence-frontend.example.workers.dev";

describe("allowOrigin", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    const app = express();
    app.use("/api", allowOrigin(FRONTEND));
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.delete("/api/projects/:id", (_req, res) => res.json({ ok: true }));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("allows the frontend's origin", async () => {
    const res = await fetch(`${base}/api/health`, { headers: { Origin: FRONTEND } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND);
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("gives other origins no CORS headers", async () => {
    const res = await fetch(`${base}/api/health`, { headers: { Origin: "https://elsewhere.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers the frontend's preflight without reaching the route", async () => {
    const res = await fetch(`${base}/api/projects/p-1`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND,
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(FRONTEND);
    expect(res.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
  });
});
