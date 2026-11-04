import type { Interview, InterviewQuestion, TranscriptTurn } from "./types";

/**
 * Write a live call's state into the interview the dashboard renders. Plain code
 * (no React) because the backend runs it too, when a call ends (server/projects.ts).
 */

/** The parts of CallController's CallState that mirror reads (src/call/CallController.ts). */
export interface CallSnapshot {
  phase: "idle" | "starting" | "live" | "ended";
  startedAt: number | null;
  endedAt: number | null;
  questions: Array<{
    id: string;
    text: string;
    status: "said" | "next" | "pending" | "removed";
    added: boolean;
  }>;
  transcript: Array<{
    id: string;
    speaker: "alexa" | "interviewee";
    text: string;
    at: number;
    interrupted: boolean;
  }>;
}

export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** The call's state, written into the interview the dashboard already renders. */
export function mirror(iv: Interview, st: CallSnapshot): Interview {
  const questions = st.questions.map((q): InterviewQuestion => {
    const out: InterviewQuestion = {
      id: q.id,
      text: q.text,
      status: q.status === "said" ? "answered" : q.status === "next" ? "current" : "pending",
    };
    if (q.added) out.added = true;
    if (q.status === "removed") out.removed = true;
    return out;
  });
  const t0 = st.startedAt ?? st.transcript[0]?.at ?? Date.now();
  const transcript = st.transcript.map((t): TranscriptTurn => ({
    id: t.id,
    speaker: t.speaker === "alexa" ? "ai" : "expert",
    text: t.interrupted ? `${t.text} —` : t.text,
    time: formatDuration(t.at - t0),
  }));
  const ended = st.phase === "ended";
  const running = st.phase === "live" || st.phase === "starting";
  return {
    ...iv,
    live: running,
    status: ended ? "Completed" : running ? "In Progress" : iv.status,
    topic: ended
      ? `Interview complete${st.startedAt && st.endedAt ? ` · ${formatDuration(st.endedAt - st.startedAt)}` : ""}`
      : running
        ? "Live call"
        : iv.topic,
    questions: questions.length ? questions : iv.questions,
    transcript: st.transcript.length || ended ? transcript : iv.transcript,
  };
}
