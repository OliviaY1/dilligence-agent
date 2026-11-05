import { readFileSync } from "node:fs";
import express from "express";
import dotenv from "dotenv";
import { HttpError, loadLiveKitConfig, startAvatar, stopAvatar } from "./avatar";
import { allowOrigin } from "./cors";
import { registerInterviewRoutes } from "./interviews";
import { registerProjectRoutes } from "./projects";
import {
  registerInitialQuestionsRoute,
  registerNextRoundRoute,
  registerValidationRoute,
  strings,
} from "./validation";

dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);
const BOSON_BASE_URL = process.env.BOSON_BASE_URL ?? "https://api.boson.ai";
// The deployed frontend's address, when it runs on its own host (see cors.ts).
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim().replace(/\/+$/, "");

// Ephemeral key lifetime (API allows 10–7200 s); one is minted per connection.
const EPHEMERAL_TTL_SECONDS = 600;

/** BOSON_API_KEY, or the contents of the file at BOSON_API_KEY_FILE. */
function loadApiKey(): string | undefined {
  const inline = process.env.BOSON_API_KEY?.trim();
  if (inline) return inline;

  const keyFile = process.env.BOSON_API_KEY_FILE;
  if (keyFile) {
    try {
      const fromFile = readFileSync(keyFile, "utf8").trim();
      if (fromFile) {
        console.log(`Loaded BOSON_API_KEY from ${keyFile}`);
        return fromFile;
      }
    } catch {
      console.warn(`Could not read BOSON_API_KEY_FILE at ${keyFile}`);
    }
  }
  return undefined;
}

const BOSON_API_KEY = loadApiKey();

const app = express();
if (FRONTEND_ORIGIN) app.use("/api", allowOrigin(FRONTEND_ORIGIN));
app.use(express.json({ limit: "2mb" }));
registerInterviewRoutes(app);
registerProjectRoutes(app);
registerValidationRoute(app);
registerNextRoundRoute(app);
registerInitialQuestionsRoute(app);

// --- Question list: Claude Haiku 5.5 decides what to add and remove ---------

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const QUESTION_MODEL = "claude-haiku-5-5";

const QUESTION_SYSTEM =
  "You are an expert consumer-research interviewer for a private equity firm, updating the " +
  "question list of a live phone interview that lasts only about one minute, so keep the list " +
  "short. Follow up on what the person just said: remove remaining questions that are answered " +
  "or no longer fit them, and add up to 2 short follow-ups (under 12 words) that serve the " +
  "interview goal. Reply only with JSON " +
  '{"add":[],"remove":[]}, copying removed questions exactly.';

const AUDIENCE_STYLE: Record<string, string> = {
  customer:
    "The interviewee is a customer: use everyday words, one simple idea per question, easy to answer in a few seconds.",
  expert:
    "The interviewee is an industry expert: questions can be analytical and use industry terms (market share, pricing power, channels, margins).",
};

/**
 * POST /api/questions  { context, asked: string[], remaining: string[], transcript }
 *   -> { add: string[], remove: string[] }
 *
 * The Anthropic key stays here, on the server, like the Boson key.
 */
app.post("/api/questions", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "No ANTHROPIC_API_KEY in .env." });
  }
  const { context = "", audience = "customer", asked = [], remaining = [], transcript = "" } =
    req.body ?? {};
  const list = (items: unknown) =>
    Array.isArray(items) && items.length ? items.map((q) => `- ${String(q)}`).join("\n") : "(none)";
  // The context goes into the system prompt, ahead of everything that changes
  // per call. The API keeps no state between calls, so it is still sent every
  // time; putting the unchanging part first is what prompt caching needs.
  const style = AUDIENCE_STYLE[String(audience)] ?? AUDIENCE_STYLE.customer;
  const system = [QUESTION_SYSTEM, style, context ? `Interview goal:\n${String(context)}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const userMessage = [
    `Already asked:\n${list(asked)}`,
    `Remaining, in order:\n${list(remaining)}`,
    `Transcript so far:\n${String(transcript)}`,
  ].join("\n\n");

  // Echoed back to the browser so the UI can show exactly what was sent.
  const prompt = { model: QUESTION_MODEL, system, user: userMessage };
  const startedAt = Date.now();
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: QUESTION_MODEL,
        // Generous: a reply cut off by the limit is incomplete JSON and reads as "no change".
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      console.error(`anthropic ${upstream.status}: ${body}`);
      return res
        .status(upstream.status)
        .json({ error: `Anthropic ${upstream.status}: ${body}`, prompt, ms: Date.now() - startedAt });
    }
    const data = JSON.parse(body) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    // Take the first {...} in the reply, in case the model wraps it in prose.
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { add?: unknown; remove?: unknown }) : {};
    return res.json({
      add: strings(parsed.add),
      remove: strings(parsed.remove),
      raw: text,
      prompt,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("question update error:", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : String(err),
      prompt,
      ms: Date.now() - startedAt,
    });
  }
});

/** GET /api/token: mint a short-lived ephemeral key so the real key never reaches the browser. */
app.get("/api/token", async (_req, res) => {
  if (!BOSON_API_KEY) {
    return res.status(500).json({
      error:
        "No API key found. Set BOSON_API_KEY in .env, or point BOSON_API_KEY_FILE at a key file.",
    });
  }

  try {
    const upstream = await fetch(`${BOSON_BASE_URL}/v1/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOSON_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: EPHEMERAL_TTL_SECONDS } }),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(`client_secrets failed: ${upstream.status} ${text}`);
      return res
        .status(upstream.status)
        .json({ error: `Upstream ${upstream.status}: ${text || upstream.statusText}` });
    }

    const data = JSON.parse(text);
    return res.json({ value: data.value, expires_at: data.expires_at });
  } catch (err) {
    console.error("Token mint error:", err);
    return res.status(502).json({
      error: err instanceof Error ? err.message : "Failed to reach the Boson API",
    });
  }
});

// --- Higgs Avatar ---------------------------------------------------------------

const DEFAULT_AVATAR_ID = "builtin_claire_v1";
// Interviews take about a minute; a short cap means a session left behind by a
// crashed or closed tab frees its avatar slot quickly.
const AVATAR_MAX_DURATION_SECONDS = 180;

/** Avatar sessions this server started and has not ended, released on shutdown. */
const activeAvatarSessions = new Set<string>();

async function releaseAvatars(): Promise<void> {
  if (!BOSON_API_KEY || !activeAvatarSessions.size) return;
  const ids = [...activeAvatarSessions];
  activeAvatarSessions.clear();
  await Promise.all(
    ids.map((id) =>
      stopAvatar({ baseUrl: BOSON_BASE_URL, apiKey: BOSON_API_KEY! }, id)
        .then(() => console.log(`avatar session ${id} released on shutdown`))
        .catch(() => undefined),
    ),
  );
}

// A restart (tsx watch after a pull) or Ctrl+C must not leave avatars holding slots.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void releaseAvatars().finally(() => process.exit(0));
  });
}

/**
 * POST /api/avatar/start  { avatarId? }
 *   -> { sessionId, url, roomName, token, avatarIdentity, publisherIdentity, ... }
 *
 * Creates a LiveKit room, mints the avatar's and the browser's tokens, and
 * starts a Boson avatar session in that room. The browser then joins with
 * `token` and streams Higgs Realtime's audio to the avatar.
 */
app.post("/api/avatar/start", async (req, res) => {
  const livekit = loadLiveKitConfig();
  if (!BOSON_API_KEY) return res.status(500).json({ error: "No BOSON_API_KEY in .env." });
  if (!livekit) {
    return res
      .status(500)
      .json({ error: "Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env." });
  }
  const avatarId = String(req.body?.avatarId || DEFAULT_AVATAR_ID);
  try {
    const result = await startAvatar({
      boson: { baseUrl: BOSON_BASE_URL, apiKey: BOSON_API_KEY },
      livekit,
      avatarId,
      maxDurationSeconds: AVATAR_MAX_DURATION_SECONDS,
    });
    activeAvatarSessions.add(result.sessionId);
    console.log(`avatar session ${result.sessionId} started in room ${result.roomName}`);
    return res.json(result);
  } catch (err) {
    console.error("avatar start error:", err);
    if (err instanceof HttpError) {
      if (err.retryAfter) res.setHeader("Retry-After", err.retryAfter);
      return res.status(err.status).json({ error: err.message, retryAfter: err.retryAfter });
    }
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/avatar/stop  { sessionId } — DELETE /v1/avatar/sessions/{id}. */
app.post("/api/avatar/stop", async (req, res) => {
  const sessionId = String(req.body?.sessionId ?? "");
  if (!BOSON_API_KEY || !sessionId) return res.status(400).json({ error: "sessionId required" });
  try {
    activeAvatarSessions.delete(sessionId);
    const session = await stopAvatar({ baseUrl: BOSON_BASE_URL, apiKey: BOSON_API_KEY }, sessionId);
    console.log(`avatar session ${sessionId} released`);
    return res.json({ ok: true, session });
  } catch (err) {
    console.error("avatar stop error:", err);
    const status = err instanceof HttpError ? err.status : 502;
    return res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (FRONTEND_ORIGIN) console.log(`  Accepting browser requests from ${FRONTEND_ORIGIN}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn("  ⚠ No ANTHROPIC_API_KEY in .env — question writing, live updates and findings will return 500.");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    console.warn("  ⚠ No DATABASE_URL in .env — projects can't be loaded or saved (/api/projects returns 503).");
  }
  if (!BOSON_API_KEY) {
    console.warn(
      "  ⚠ No API key found (set BOSON_API_KEY or BOSON_API_KEY_FILE in .env) — /api/token will return 500.",
    );
  }
});
