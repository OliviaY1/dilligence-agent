import { allHypotheses, allInterviews } from "./mock-service";
import type { DiligenceProject, ThesisValidationResult } from "./types";

/**
 * What thesis validation sends and keeps, as plain code (no React): the
 * dashboard's Findings page and the backend after every call (server/projects.ts)
 * build the same request from a project.
 */

/** Interviews that count as evidence: completed, with a transcript, and the contact not deleted. */
export function completedInterviews(p: DiligenceProject) {
  return allInterviews(p).filter(
    (iv) =>
      iv.status === "Completed" &&
      iv.transcript.length > 0 &&
      p.experts.some((e) => e.id === iv.expertId),
  );
}

/** A fingerprint of everything the validation depends on. */
export function validationInputKey(p: DiligenceProject): string {
  const ivs = completedInterviews(p)
    .map((iv) => `${iv.id}:${iv.transcript.length}:${iv.transcript.at(-1)?.text.length ?? 0}`)
    .join(",");
  const hyps = allHypotheses(p)
    .map((h) => `${h.id}:${h.title}`)
    .join(",");
  return `${p.thesis.length}:${p.thesis.slice(0, 40)}|${hyps}|${ivs}`;
}

/** Completed interviews as the backend expects them (who, and the transcript). */
export function interviewsPayload(p: DiligenceProject) {
  return completedInterviews(p).map((iv) => {
    const person = p.experts.find((e) => e.id === iv.expertId);
    const planned = [p.plan, ...(p.pastRounds ?? []).map((r) => r.plan)]
      .flatMap((pl) => pl?.experts ?? [])
      .find((e) => e.expertId === iv.expertId);
    return {
      id: iv.id,
      name: person?.name ?? "",
      title: person?.title ?? "",
      description: person?.description ?? "",
      audience: planned?.audience ?? "",
      status: iv.status,
      // Which planned questions were asked, never reached, or dropped during the call.
      questions: iv.questions.map((q) => ({
        text: q.text,
        status: q.removed ? "removed" : q.status === "answered" ? "asked" : "not asked",
      })),
      transcript: iv.transcript.map((t) => ({
        id: t.id,
        speaker: t.speaker === "ai" ? "interviewer" : "interviewee",
        text: t.text,
      })),
    };
  });
}

/** The POST /api/thesis-validation body for a project. */
export function validationRequest(p: DiligenceProject) {
  return {
    company: p.company,
    thesis: p.thesis,
    hypotheses: allHypotheses(p).map((h) => ({
      id: h.id,
      title: h.title,
      description: h.description,
      evidence: h.evidence,
    })),
    interviews: interviewsPayload(p),
  };
}

export type ValidationReply = Omit<ThesisValidationResult, "at" | "inputKey" | "interviewCount">;

/** The reply, stamped with what it was computed from, ready to save on the project. */
export function validationResult(
  p: DiligenceProject,
  reply: ValidationReply,
): ThesisValidationResult {
  return {
    at: new Date().toISOString(),
    model: reply.model,
    inputKey: validationInputKey(p),
    interviewCount: completedInterviews(p).length,
    overall: reply.overall,
    hypotheses: reply.hypotheses,
    gaps: reply.gaps ?? [],
    droppedQuotes: reply.droppedQuotes ?? 0,
  };
}
