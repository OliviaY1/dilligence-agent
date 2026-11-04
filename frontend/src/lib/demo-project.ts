import { NETWORKS } from "./mock-data";
import { hypothesesFromThesis } from "./mock-service";
import { validationInputKey } from "./validation-request";
import type { DiligenceProject, Expert, Interview, PlanExpert } from "./types";

/**
 * The showcase project: every step filled in (claims, plan, three finished
 * interviews, scorecard, gaps, a proposed next round), so the whole product
 * can be shown without API keys. One interview is left open for a real call.
 */

const THESIS = `Maple Ridge Veterinary Group runs 9 companion-animal clinics in Ontario. We see it as a platform for regional consolidation.

Client Loyalty: We believe pet owners stay with Maple Ridge for years because they trust its vets, so revenue is recurring.

Pricing Power: We believe Maple Ridge can raise prices 5% a year without losing clients.

Vet Staffing: We believe Maple Ridge can hire and keep enough vets to open two new clinics a year.

Acquisition Pipeline: We believe enough independent clinics in Ontario are for sale at prices that still pay off.`;

const person = (id: string, name: string, title: string, description: string, phone: string): Expert => ({
  id,
  name,
  title,
  description,
  phone,
  source: "Custom",
});

const EXPERTS: Expert[] = [
  person("e-mr-jennifer", "Jennifer Walsh", "Dog owner, Maple Ridge client", "Has taken her dog to the Burlington clinic for eight years.", "+1 (905) 555-0142"),
  person("e-mr-raj", "Raj Patel", "Former Medical Director, Maple Ridge", "Ran clinical staffing for all nine clinics until 2025.", "+1 (416) 555-0178"),
  person("e-mr-claire", "Claire Dubois", "Veterinary M&A adviser, Ontario", "Has advised on more than 30 clinic sales in the province.", "+1 (647) 555-0119"),
  person("e-mr-sam", "Sam Okoye", "Cat owner, former client", "Moved his two cats to an independent clinic last year.", "+1 (905) 555-0165"),
];

type Line = [speaker: "ai" | "expert", text: string];

/** Planned questions, then the call. `added` and `removed` show Claude changing the list mid-call. */
const CALLS: Array<{
  expertId: string;
  audience: "customer" | "expert";
  hypothesisIds: string[];
  reason: string;
  objectives: string;
  questions: Array<{ text: string; added?: boolean; removed?: boolean }>;
  lines: Line[];
}> = [
  {
    expertId: "e-mr-jennifer",
    audience: "customer",
    hypothesisIds: ["h1", "h2"],
    reason: "A long-time client who can speak to loyalty and price increases first-hand.",
    objectives: "Learn why clients stay and how they react to higher prices.",
    questions: [
      { text: "How long have you taken your dog to Maple Ridge, and why do you stay?" },
      { text: "How did you feel about the last price increase?" },
      { text: "What would make you switch to another clinic?", removed: true },
      { text: "Did you compare prices with other clinics nearby?", added: true },
    ],
    lines: [
      ["ai", "Hi Jennifer, this is Alexa calling about your vet clinic. Do you have a minute for three quick questions?"],
      ["expert", "Sure, go ahead."],
      ["ai", "How long have you taken your dog to Maple Ridge, and why do you stay?"],
      ["expert", "Eight years now. Dr. Chen knows my dog's whole history, and I trust her completely."],
      ["ai", "How did you feel about the last price increase?"],
      ["expert", "I noticed the bill went up, but honestly I would pay more to keep seeing Dr. Chen."],
      ["ai", "Did you compare prices with other clinics nearby?"],
      ["expert", "No, I never looked. Price is not why I go there."],
      ["ai", "Thank you, Jennifer. That's all my questions. Have a great day!"],
    ],
  },
  {
    expertId: "e-mr-raj",
    audience: "expert",
    hypothesisIds: ["h2", "h3"],
    reason: "Ran staffing for the whole group, so knows hiring, turnover and expansion limits.",
    objectives: "Test whether vet staffing can support two new clinics a year.",
    questions: [
      { text: "How hard is it to hire and keep vets at Maple Ridge today?" },
      { text: "How long does it take to fill an open vet position?" },
      { text: "How did the last price increase affect visit volumes?" },
      { text: "What limits how many clinics you can open each year?" },
    ],
    lines: [
      ["ai", "Hi Raj, this is Alexa. Thanks for taking the call. Do you have a minute?"],
      ["expert", "Yes, happy to help."],
      ["ai", "How hard is it to hire and keep vets at Maple Ridge today?"],
      ["expert", "It is the hardest part of the job. We lost four vets last year to corporate groups paying more."],
      ["ai", "How long does it take to fill an open vet position?"],
      ["expert", "Usually six to nine months, and some positions stayed open for a year."],
      ["ai", "How did the last price increase affect visit volumes?"],
      ["expert", "Visits held steady after the last increase. We did not see clients leave."],
      ["ai", "What limits how many clinics you can open each year?"],
      ["expert", "Vets, not money. We could open one clinic a year at most with the staff we have."],
      ["ai", "That's very helpful, Raj. Thank you for your time!"],
    ],
  },
  {
    expertId: "e-mr-claire",
    audience: "expert",
    hypothesisIds: ["h4"],
    reason: "Advises on clinic sales across Ontario, so sees the supply of sellers and prices.",
    objectives: "Size the pipeline of clinics for sale and check today's prices.",
    questions: [
      { text: "How many independent vet clinics in Ontario are open to selling?" },
      { text: "How have purchase prices changed for clinics like these?" },
      { text: "Who are the main competing buyers?" },
      { text: "What makes an acquisition fail in this market?" },
    ],
    lines: [
      ["ai", "Hi Claire, this is Alexa. Do you have a minute for a few questions on clinic sales?"],
      ["expert", "A short one, yes. I have a meeting soon."],
      ["ai", "How many independent vet clinics in Ontario are open to selling?"],
      ["expert", "Quite a few. I would say a third of independent owners are near retirement and open to talks."],
      ["ai", "How have purchase prices changed for clinics like these?"],
      ["expert", "They went up a lot. Good clinics now sell for twelve to fifteen times EBITDA, up from eight a few years ago."],
      ["ai", "Thank you, Claire. I'll let you get to your meeting."],
    ],
  },
];

const VALIDATED_AT = "2026-11-02T16:00:00Z";

export function demoProject(): DiligenceProject {
  const hypotheses = hypothesesFromThesis(THESIS);
  const plan = {
    hypotheses,
    approved: true,
    experts: [
      ...CALLS.map(
        (c): PlanExpert => ({
          expertId: c.expertId,
          reason: c.reason,
          hypothesisIds: c.hypothesisIds,
          objectives: c.objectives,
          audience: c.audience,
          questionSource: "claude",
          questionNote: `Written by Claude for ${c.audience === "customer" ? "a customer" : "an industry expert"}`,
          questions: c.questions.filter((q) => !q.added).map((q, i) => ({ id: `${c.expertId}-q${i + 1}`, text: q.text })),
        }),
      ),
      {
        expertId: "e-mr-sam",
        reason: "A client who left: the other side of the loyalty claim.",
        hypothesisIds: ["h1", "h2"],
        objectives: "Learn why a long-time client switched clinics.",
        audience: "customer",
        questionSource: "claude",
        questionNote: "Written by Claude for a customer",
        questions: [
          "Why did you move your cats to a different clinic?",
          "How did Maple Ridge's prices compare with your new clinic?",
          "What could Maple Ridge have done to keep you?",
        ].map((text, i) => ({ id: `e-mr-sam-q${i + 1}`, text })),
      },
    ] satisfies PlanExpert[],
  };

  const interviews: Interview[] = CALLS.map((c) => {
    const asked = new Set(c.lines.filter(([sp]) => sp === "ai").map(([, t]) => t));
    return {
      id: `iv-${c.expertId}`,
      expertId: c.expertId,
      status: "Completed",
      topic: "Interview complete",
      questions: c.questions.map((q, i) => ({
        id: `${c.expertId}-q${i + 1}`,
        text: q.text,
        status: asked.has(q.text) ? "answered" : "pending",
        ...(q.added ? { added: true } : {}),
        ...(q.removed ? { removed: true } : {}),
      })),
      transcript: c.lines.map(([speaker, text], i) => ({
        id: `iv-${c.expertId}-t${i}`,
        speaker,
        text,
        time: `00:${String(i * 7).padStart(2, "0")}`,
      })),
    };
  });
  interviews.push({
    id: "iv-e-mr-sam",
    expertId: "e-mr-sam",
    status: "Not Started",
    topic: "Awaiting start",
    questions: plan.experts[3]!.questions.map((q) => ({ ...q, status: "pending" })),
    transcript: [],
  });

  const project: DiligenceProject = {
    id: "maple-ridge",
    company: "Maple Ridge Veterinary Group",
    thesis: THESIS,
    status: "In Progress",
    networks: NETWORKS.map((n) => ({ ...n })),
    experts: EXPERTS.map((e) => ({ ...e })),
    plan,
    interviews,
    updatedAt: VALIDATED_AT,
  };

  const ev = (iv: string, quote: string, stance: "support" | "contradict") => ({
    interviewId: `iv-${iv}`,
    quote,
    stance,
  });
  project.thesisValidation = {
    at: VALIDATED_AT,
    model: "sample data",
    inputKey: validationInputKey(project),
    interviewCount: 3,
    overall: {
      verdict: "Partially supported",
      summary:
        "Clients are loyal and accept price increases, but vet staffing caps growth at about one clinic a year, and clinic prices have risen sharply.",
    },
    hypotheses: [
      {
        id: "h1",
        assessment: "Supported",
        confidence: "medium",
        rationale: "A long-time client stays because she trusts her vet. Only one client so far.",
        evidence: [
          ev("e-mr-jennifer", "Eight years now.", "support"),
          ev("e-mr-jennifer", "Dr. Chen knows my dog's whole history, and I trust her completely.", "support"),
        ],
      },
      {
        id: "h2",
        assessment: "Supported",
        confidence: "medium",
        rationale: "The client would pay more, and the former director saw no drop in visits after the last increase.",
        evidence: [
          ev("e-mr-raj", "Visits held steady after the last increase. We did not see clients leave.", "support"),
          ev("e-mr-jennifer", "I would pay more to keep seeing Dr. Chen.", "support"),
          ev("e-mr-jennifer", "Price is not why I go there.", "support"),
        ],
      },
      {
        id: "h3",
        assessment: "Contradicted",
        confidence: "high",
        rationale: "The former director says staffing allows one new clinic a year at most, not two.",
        evidence: [
          ev("e-mr-raj", "We could open one clinic a year at most with the staff we have.", "contradict"),
          ev("e-mr-raj", "We lost four vets last year to corporate groups paying more.", "contradict"),
          ev("e-mr-raj", "Usually six to nine months, and some positions stayed open for a year.", "contradict"),
        ],
      },
      {
        id: "h4",
        assessment: "Mixed Evidence",
        confidence: "low",
        rationale: "Many owners want to sell, but prices have nearly doubled. The call ended before buyers were discussed.",
        evidence: [
          ev("e-mr-claire", "a third of independent owners are near retirement and open to talks.", "support"),
          ev("e-mr-claire", "Good clinics now sell for twelve to fifteen times EBITDA, up from eight a few years ago.", "contradict"),
        ],
      },
    ],
    gaps: [
      {
        hypothesisId: "h3",
        gap: "Staffing rests on one former director, and it is the main limit on the growth plan.",
        nextStep: "Interview a vet who left Maple Ridge last year: why did you leave, and what would have kept you?",
        priority: "high",
      },
      {
        hypothesisId: "h4",
        gap: "It is unclear whether deals still pay off at 12 to 15 times EBITDA, or who else is bidding.",
        nextStep: "Finish the call with Claire Dubois: who are the main competing buyers?",
        priority: "medium",
      },
      {
        hypothesisId: "h1",
        gap: "Loyalty comes from one happy dog owner; clients who left have not been heard.",
        nextStep: "Interview Sam Okoye, who moved his cats elsewhere last year.",
        priority: "medium",
      },
    ],
    droppedQuotes: 0,
  };

  const newVet = person(
    "e-mr-new-vet",
    "Former Maple Ridge vet",
    "Veterinarian who left for a corporate group",
    "Left Maple Ridge in the last year to join a larger corporate group.",
    "",
  );
  project.nextRound = {
    at: "2026-11-02T16:05:00Z",
    model: "sample data",
    basedOn: VALIDATED_AT,
    newExperts: [newVet],
    why: {
      "h-r2-1": "Staffing was contradicted and is the main limit on growth.",
      "h-r2-2": "Clinic prices nearly doubled, so the deal maths needs testing.",
    },
    plan: {
      approved: false,
      hypotheses: [
        {
          id: "h-r2-1",
          title: "Matching pay keeps vets",
          description: "We believe matching corporate pay would halve vet turnover at Maple Ridge.",
          evidence: hypotheses[2]?.evidence ?? "",
          origin: "Refined from H3 · Contradicted",
          round: 2,
        },
        {
          id: "h-r2-2",
          title: "Deals still pay off",
          description: "We believe clinics bought at 12 to 15 times EBITDA still earn a 20% return.",
          evidence: hypotheses[3]?.evidence ?? "",
          origin: "Refined from H4 · Mixed Evidence",
          round: 2,
        },
      ],
      experts: [
        {
          expertId: newVet.id,
          reason: "Can say first-hand why vets leave and what would keep them.",
          hypothesisIds: ["h-r2-1"],
          objectives: "Find out what would make vets stay.",
          audience: "expert",
          questionSource: "claude",
          questionNote: "Written by sample data for round 2 (an industry expert)",
          questions: [
            "Why did you leave Maple Ridge?",
            "How much more does your new employer pay?",
            "What, besides pay, would have kept you there?",
            "How many of your former colleagues are thinking of leaving?",
          ].map((text, i) => ({ id: `r2-vet-q${i + 1}`, text })),
        },
        {
          expertId: "e-mr-claire",
          reason: "The first call ended before buyers and deal risks came up.",
          hypothesisIds: ["h-r2-2"],
          objectives: "Finish the pipeline picture: competition and deal risk.",
          audience: "expert",
          questionSource: "claude",
          questionNote: "Written by sample data for round 2 (an industry expert)",
          questions: [
            "Who else is bidding for Ontario clinics today?",
            "What returns do buyers expect at today's prices?",
            "What makes a clinic acquisition fail?",
            "Which clinics sell below the going rate, and why?",
          ].map((text, i) => ({ id: `r2-claire-q${i + 1}`, text })),
        },
      ],
    },
  };
  return project;
}
