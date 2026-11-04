// Per-step interviewer instructions and the Claude question-update call.

export type Audience = "customer" | "expert";

export function questionInstructions(question: string, name = "Alexa"): string {
  return `You are ${name}, a market researcher. Say exactly: "${question}" Nothing else.`;
}

/** Sent after the greeting: the model decides whether the person agreed to talk. */
export function firstQuestionInstructions(question: string, closing: string, name = "Alexa"): string {
  return `You are ${name}, a market researcher. If the person said no, declined, or has no time, say exactly: "${closing}" Otherwise say exactly: "${question}" Nothing else.`;
}

/** Did this reply say this line? ≥80% of its words, ignoring case and punctuation. */
export function saidLine(reply: string, line: string): boolean {
  const words = (t: string) => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const target = words(line);
  if (target.length === 0) return false;
  const said = new Set(words(reply));
  return target.filter((w) => said.has(w)).length / target.length >= 0.8;
}

export interface QuestionChangeResult {
  status: "ok" | "error";
  add?: string[];
  remove?: string[];
  error?: string;
}

/** POST /api/questions: what to add to / remove from the unasked questions. Never throws. */
export async function fetchQuestionChanges(payload: {
  context: string;
  audience: Audience;
  asked: string[];
  remaining: string[];
  transcript: string;
}): Promise<QuestionChangeResult> {
  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { error?: string; add?: string[]; remove?: string[] };
    if (!res.ok) return { status: "error", error: body.error ?? `HTTP ${res.status}` };
    return { status: "ok", add: body.add ?? [], remove: body.remove ?? [] };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
