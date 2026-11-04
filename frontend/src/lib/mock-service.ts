/**
 * Mock service layer. Each function mirrors the shape of a future backend
 * response so it can later be swapped for a real API call.
 */
import { seedProjects } from "./mock-data";
import type {
  DiligenceProject,
  Interview,
  InterviewQuestion,
  InvestmentHypothesis,
  ProjectStatus,
  ResearchPlan,
  ResearchRound,
} from "./types";

/** All research rounds, oldest first; the last one is the current round. */
export function roundsOf(p: DiligenceProject): ResearchRound[] {
  return [...(p.pastRounds ?? []), ...(p.plan ? [{ plan: p.plan, interviews: p.interviews }] : [])];
}
export const allInterviews = (p: DiligenceProject) => [
  ...(p.pastRounds ?? []).flatMap((r) => r.interviews),
  ...p.interviews,
];
export function allHypotheses(p: DiligenceProject): InvestmentHypothesis[] {
  const seen = new Map<string, InvestmentHypothesis>();
  for (const r of roundsOf(p))
    for (const h of r.plan.hypotheses) if (!seen.has(h.id)) seen.set(h.id, h);
  return [...seen.values()];
}

/** Drop a project from the saved list. */
export const withoutProject = (ps: DiligenceProject[], id: string) => ps.filter((p) => p.id !== id);

/** Sample projects the consultant has not saved yet. */
export const missingSamples = (ps: DiligenceProject[]) =>
  seedProjects().filter((s) => !ps.some((p) => p.id === s.id));

// Opening Findings means the consultant is done with this round, so one
// completed interview is enough to propose the next one.
export const canRecommendNextRound = (p: DiligenceProject) =>
  !!p.plan?.approved && p.interviews.some((i) => i.status === "Completed");

export const uid = (p = "id") => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * The thesis's own pillars as hypotheses: every line shaped like
 * "Label: We believe …" becomes one ("Market Attractiveness: We believe …").
 * Returns [] when the thesis is free text, so the template hypotheses are used.
 */
export function hypothesesFromThesis(thesis: string): InvestmentHypothesis[] {
  return thesisPillars(thesis).map((p, i) => ({
    id: `h${i + 1}`,
    title: p.label,
    description: p.text,
    evidence: `Interview evidence for or against: ${p.text.replace(/^we believe\s+/i, "")}`,
  }));
}

/**
 * The "Label: text" pillars of a thesis, whether they are on separate lines or
 * run together in one paragraph. A label starts a line or follows the end of a
 * sentence, starts with a capital, and is followed by a colon. Fewer than two
 * pillars means a free-text thesis: [].
 */
export function thesisPillars(thesis: string): Array<{ label: string; text: string }> {
  const label = /(?:^|\n|(?<=[.!?])\s+)([A-Z][A-Za-z0-9&/,'()\- ]{2,60}?):\s+/g;
  const starts: Array<{ label: string; at: number; body: number }> = [];
  for (const m of thesis.matchAll(label)) {
    const lead = m[0].length - m[0].trimStart().length;
    starts.push({ label: m[1]!.trim(), at: m.index! + lead, body: m.index! + m[0].length });
  }
  const pillars = starts
    .map((s, i) => ({
      label: s.label,
      text: thesis.slice(s.body, starts[i + 1]?.at ?? thesis.length).replace(/\s+/g, " ").trim(),
    }))
    .filter((p) => p.text.length >= 10);
  return pillars.length >= 2 ? pillars : [];
}

/** Experts the consultant has chosen for this project: all custom contacts plus selected network experts. */
export function selectedExperts(p: DiligenceProject) {
  const sel = new Set(p.selectedExpertIds ?? []);
  return p.experts.filter((e) => e.source === "Custom" || sel.has(e.id));
}

export function generateMockResearchPlan(input: DiligenceProject): ResearchPlan {
  const project = { ...input, experts: selectedExperts(input) };
  const c = project.company || "the target";
  const fromThesis = hypothesesFromThesis(project.thesis);
  const template: InvestmentHypothesis[] = [
    {
      id: "h1",
      title: "Customer demand is resilient",
      description: `Demand for ${c}'s services is recurring and stable.`,
      evidence: "Customer tenure, switching drivers, volume trends.",
    },
    {
      id: "h2",
      title: "Pricing is sustainable",
      description: "Price increases can be passed through without material volume loss.",
      evidence: "Price sensitivity, payer constraints, competitor pricing.",
    },
    {
      id: "h3",
      title: "Consolidation opportunity exists",
      description: "The market is fragmented enough to support a buy-and-build strategy.",
      evidence: "Market share data, acquisition multiples, seller pipeline.",
    },
    {
      id: "h4",
      title: "Operating leverage can expand margins",
      description: "Central functions will lower unit costs as the network grows.",
      evidence: "Realised synergies, cost benchmarks.",
    },
  ];
  const hypotheses = fromThesis.length ? fromThesis : template;
  return {
    hypotheses,
    // Everyone the consultant selected (custom contacts always are) is in the plan.
    experts: project.experts.map((e, i) => ({
      expertId: e.id,
      reason: `${e.title || "Expert"} with relevant perspective on ${c}.`,
      hypothesisIds: fromThesis.length
        ? hypotheses.map((h) => h.id)
        : [hypotheses[i % 4]!.id, hypotheses[(i + 1) % 4]!.id],
      objectives: fromThesis.length
        ? `Test the investment thesis for ${c}.`
        : `Test ${hypotheses[i % 4]!.title.toLowerCase()}.`,
      questions: [
        `What is your experience with ${c} or its direct competitors?`,
        "What drives customers to stay with or leave a provider in this market?",
        "How much pricing flexibility do operators in this sector really have?",
        "Where do you see the largest operational risks over the next three years?",
      ].map((text) => ({ id: uid("q"), text })),
    })),
    approved: false,
  };
}

export function createInterviewsFromPlan(plan: ResearchPlan): Interview[] {
  return plan.experts.map((pe) => ({
    id: uid("iv"),
    expertId: pe.expertId,
    status: "Not Started",
    topic: "Awaiting start",
    questions: pe.questions.map((q) => ({ id: q.id, text: q.text, status: "pending" })),
    transcript: [],
  }));
}

export function addInterviewQuestion(iv: Interview, text: string): Interview {
  const q: InterviewQuestion = { id: uid("fq"), text: text.trim(), status: "pending", added: true };
  return { ...iv, questions: [...iv.questions, q] };
}

export const completeMockInterview = (iv: Interview): Interview => ({
  ...iv,
  status: "Completed",
  topic: "Interview complete",
  questions: iv.questions.map((q) => (q.status === "current" ? { ...q, status: "pending" } : q)),
});

export function deriveStatus(p: DiligenceProject): ProjectStatus {
  if (p.interviews.length && p.interviews.every((i) => i.status === "Completed"))
    return "Completed";
  if (p.interviews.some((i) => i.status !== "Not Started")) return "In Progress";
  if (p.plan?.approved) return "Ready for Interviews";
  if (p.plan) return "Planning";
  return p.status === "Planning" ? "Planning" : "Draft";
}

export type Assessment = "Supported" | "Contradicted" | "Mixed Evidence" | "Insufficient Evidence";
