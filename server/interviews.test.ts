import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerInterviewRoutes } from "./interviews";

describe("editing a sent interview's questions", () => {
  let server: Server;
  let base = "";
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerInterviewRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("replaces the questions before the call starts, and refuses once it is live", async () => {
    const { id } = (await (await post("/api/interviews", { config: { name: "Ava", questions: ["Old?"] } })).json()) as { id: string };

    expect((await post(`/api/interviews/${id}/questions`, { questions: [""] })).status).toBe(400);
    expect((await post(`/api/interviews/${id}/questions`, { questions: ["New?"] })).status).toBe(200);
    const loaded = (await (await fetch(`${base}/api/interviews/${id}`)).json()) as { config: { questions: string[] } };
    expect(loaded.config.questions).toEqual(["New?"]);

    await post(`/api/interviews/${id}/state`, { state: { phase: "live" } });
    expect((await post(`/api/interviews/${id}/questions`, { questions: ["Later?"] })).status).toBe(409);
  });
});
