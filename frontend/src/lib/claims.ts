import { allHypotheses, evidenceFor, roundsOf, startingClaims, uid } from "./mock-service";
import type { DiligenceProject, InvestmentHypothesis, PlanExpert, ResearchPlan } from "./types";

/**
 * The claims the interviews test, as the Claims page edits them. Before the
 * first plan they are drafts (what the thesis says, until one is edited) and the
 * plan is built from them; after, they live in each round's plan, and:
 *  - a new claim goes to everyone in the current round whose link is not sent yet;
 *  - a claim already asked in a call can be reworded (it is re-scored against
 *    those transcripts) but not deleted, so its evidence stays.
 */

export interface ClaimDraft {
  title: string;
  description: string;
}

export const claimsOf = (p: DiligenceProject): InvestmentHypothesis[] =>
  p.plan ? allHypotheses(p) : (p.draftClaims ?? startingClaims(p));

/** Calls (any round) that have started with someone set to test this claim. */
export function timesAsked(p: DiligenceProject, id: string): number {
  return roundsOf(p).reduce(
    (n, r) =>
      n +
      r.interviews.filter(
        (iv) =>
          iv.status !== "Not Started" &&
          r.plan.experts.some((pe) => pe.expertId === iv.expertId && pe.hypothesisIds.includes(id)),
      ).length,
    0,
  );
}

/**
 * People in the current plan whose call can still take a new claim: not started,
 * and no link sent yet (a sent link keeps the claims it was sent with).
 */
export function openCalls(p: DiligenceProject): PlanExpert[] {
  return (p.plan?.experts ?? []).filter((pe) => {
    const iv = p.interviews.find((i) => i.expertId === pe.expertId);
    return !iv || (iv.status === "Not Started" && !iv.sessionId);
  });
}

/** Calls not yet made that will test this claim. */
export const upcomingCalls = (p: DiligenceProject, id: string) =>
  openCalls(p).filter((pe) => pe.hypothesisIds.includes(id)).length;

const tidy = (d: ClaimDraft) => ({ title: d.title.trim(), description: d.description.trim() });

/** Every round's plan, changed by fn. */
function eachPlan(p: DiligenceProject, fn: (plan: ResearchPlan) => ResearchPlan): DiligenceProject {
  return {
    ...p,
    ...(p.plan ? { plan: fn(p.plan) } : {}),
    ...(p.pastRounds ? { pastRounds: p.pastRounds.map((r) => ({ ...r, plan: fn(r.plan) })) } : {}),
  };
}

export function addClaim(p: DiligenceProject, d: ClaimDraft): DiligenceProject {
  const { title, description } = tidy(d);
  const round = (p.pastRounds?.length ?? 0) + 1;
  const h: InvestmentHypothesis = {
    id: uid("h"),
    title,
    description,
    evidence: evidenceFor(description),
    ...(p.plan && round > 1 ? { round } : {}),
  };
  if (!p.plan) return { ...p, draftClaims: [...claimsOf(p), h] };
  const open = new Set(openCalls(p).map((pe) => pe.expertId));
  return {
    ...p,
    plan: {
      ...p.plan,
      hypotheses: [...p.plan.hypotheses, h],
      experts: p.plan.experts.map((pe) =>
        open.has(pe.expertId) ? { ...pe, hypothesisIds: [...pe.hypothesisIds, h.id] } : pe,
      ),
    },
  };
}

export function editClaim(p: DiligenceProject, id: string, d: ClaimDraft): DiligenceProject {
  const { title, description } = tidy(d);
  const edit = (h: InvestmentHypothesis): InvestmentHypothesis =>
    h.id !== id
      ? h
      : {
          ...h,
          title,
          description,
          // Refresh evidence notes made from the old wording; keep ones written separately.
          evidence:
            h.evidence === evidenceFor(h.description) || h.evidence === h.description
              ? evidenceFor(description)
              : h.evidence,
        };
  if (!p.plan) return { ...p, draftClaims: claimsOf(p).map(edit) };
  const out = eachPlan(p, (plan) => ({ ...plan, hypotheses: plan.hypotheses.map(edit) }));
  // The validation key covers titles, not wording: mark the scores out of date.
  return out.thesisValidation
    ? { ...out, thesisValidation: { ...out.thesisValidation, inputKey: "" } }
    : out;
}

/** Remove a claim no call has asked yet; one already asked stays (with its evidence). */
export function deleteClaim(p: DiligenceProject, id: string): DiligenceProject {
  if (!p.plan) return { ...p, draftClaims: claimsOf(p).filter((h) => h.id !== id) };
  if (timesAsked(p, id)) return p;
  return eachPlan(p, (plan) => ({
    ...plan,
    hypotheses: plan.hypotheses.filter((h) => h.id !== id),
    experts: plan.experts.map((pe) => ({
      ...pe,
      hypothesisIds: pe.hypothesisIds.filter((x) => x !== id),
    })),
  }));
}

/** Drop the edited drafts, so the claims follow the thesis again. */
export function resetClaims(p: DiligenceProject): DiligenceProject {
  const { draftClaims: _, ...rest } = p;
  return rest;
}
