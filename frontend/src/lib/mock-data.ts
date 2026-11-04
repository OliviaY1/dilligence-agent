import type {
  DiligenceProject,
  Expert,
  ExpertNetwork,
  InvestmentHypothesis,
  PlanExpert,
} from "./types";

export const SAMPLE_COMPANY = "Northstar Dental Group";

export const SAMPLE_THESIS = `Northstar Dental Group operates 62 general dentistry clinics across the US Midwest and represents an attractive platform for a buy-and-build strategy.

Market attractiveness: US general dentistry is a ~$165bn market growing 4–5% annually. It remains highly fragmented, with dental service organisations (DSOs) controlling under a third of practices and a large cohort of independent owners approaching retirement.

Consolidation opportunity: We believe Northstar can acquire 8–10 independent clinics per year at 4–5x EBITDA and integrate them onto its central platform, creating multiple arbitrage relative to an expected exit at 12–14x.

Recurring patient relationships: Preventive care drives twice-yearly visits. Management reports patient retention above 85% and a strong base of recall appointments that underpins revenue visibility.

Pricing power: Northstar has implemented annual fee increases of 4–6% with minimal patient attrition, suggesting sustainable pricing power, particularly in self-pay and cosmetic services.

Operational efficiencies: Centralised procurement, billing, scheduling and marketing should expand clinic-level EBITDA margins from 17% to 22% over the hold period.

Key risks: Industry-wide shortages of hygienists and dental assistants may increase wage costs and limit capacity. Service quality and clinician continuity must be maintained as the network scales.`;

export const NETWORKS: ExpertNetwork[] = [
  {
    id: "GLG",
    name: "GLG",
    description: "Global network of industry operators and former executives.",
    connected: false,
  },
  {
    id: "AlphaSights",
    name: "AlphaSights",
    description: "On-demand access to advisers, operators and transaction specialists.",
    connected: false,
  },
  {
    id: "Third Bridge",
    name: "Third Bridge",
    description: "Expert calls and frontline practitioner perspectives.",
    connected: false,
  },
];

export const NETWORK_EXPERTS: Expert[] = [
  {
    id: "e-david",
    name: "David Okafor",
    title: "Former Regional Operations Manager, Northstar Dental",
    phone: "+1 (555) 010-2231",
    description:
      "Ran operations for 14 Northstar clinics (2021–2024), covering staffing, scheduling, procurement and clinic P&Ls.",
    source: "GLG",
  },
  {
    id: "e-sarah",
    name: "Sarah Kim",
    title: "Former CFO, Regional DSO",
    phone: "+1 (555) 010-4410",
    description:
      "CFO of a 40-clinic dental service organisation through two acquisitions and a sponsor exit.",
    source: "GLG",
  },
  {
    id: "e-priya",
    name: "Priya Raman",
    title: "Healthcare M&A Adviser, Dental Services",
    phone: "+1 (555) 010-7782",
    description:
      "Advised on 30+ dental practice and DSO transactions; deep view on valuation multiples and integration.",
    source: "AlphaSights",
  },
  {
    id: "e-linda",
    name: "Linda Hart",
    title: "Former Lead Hygienist, Multi-site Dental Group",
    phone: "+1 (555) 010-3394",
    description:
      "15 years as a dental hygienist, including four in a DSO-owned clinic; close view of frontline staffing.",
    source: "Third Bridge",
  },
];

export const CUSTOM_EXPERTS: Expert[] = [
  {
    id: "e-maria",
    name: "Maria Chen",
    title: "Former Northstar Patient",
    phone: "+1 (555) 010-1187",
    description:
      "Northstar patient for six years at the Riverside clinic; switched providers in 2024.",
    source: "Custom",
  },
  {
    id: "e-tom",
    name: "Tom Reyes",
    title: "Sales Director, Dental Supply Distributor",
    phone: "+1 (555) 010-2054",
    description:
      "Manages supply accounts for DSOs in the Midwest, including purchasing volumes and pricing tiers.",
    source: "Custom",
  },
];

export const DENTAL_HYPOTHESES: InvestmentHypothesis[] = [
  {
    id: "h1",
    title: "Customer retention is strong",
    description:
      "Patients remain with Northstar over multiple years, supporting recurring revenue.",
    evidence: "Patient tenure, reasons for switching, recall appointment adherence.",
  },
  {
    id: "h2",
    title: "The business has sustainable pricing power",
    description: "Annual fee increases can continue without material patient attrition.",
    evidence: "Patient sensitivity to price, insurer fee schedule constraints, service mix.",
  },
  {
    id: "h3",
    title: "Market fragmentation creates acquisition opportunities",
    description: "A large pool of independent practices can be acquired at attractive multiples.",
    evidence: "DSO penetration, seller pipeline, recent transaction multiples.",
  },
  {
    id: "h4",
    title: "Centralised operations can improve margins",
    description: "Shared procurement, billing and scheduling expand clinic-level EBITDA margins.",
    evidence:
      "Realised procurement savings, back-office cost reductions, offsetting cost pressures.",
  },
  {
    id: "h5",
    title: "Staffing challenges are manageable",
    description: "Hygienist and assistant shortages will not constrain capacity or quality.",
    evidence: "Vacancy rates, agency usage, clinician continuity, impact on schedules.",
  },
];

export const DENTAL_PLAN_EXPERTS: PlanExpert[] = [
  {
    expertId: "e-maria",
    reason:
      "Direct patient perspective on why Northstar patients stay or leave, and how they react to price increases.",
    hypothesisIds: ["h1", "h2"],
    objectives: "Understand drivers of patient churn and tolerance for fee increases.",
    questions: [
      {
        id: "q-maria-1",
        text: "How long were you a Northstar patient, and what originally brought you to the clinic?",
      },
      {
        id: "q-maria-2",
        text: "What ultimately led you to switch to a different dental provider?",
      },
      {
        id: "q-maria-3",
        text: "How did Northstar's pricing compare with the alternatives you considered?",
      },
      {
        id: "q-maria-4",
        text: "How would you rate the quality and continuity of care compared with your new clinic?",
      },
      { id: "q-maria-5", text: "What, if anything, would have made you stay?" },
    ],
  },
  {
    expertId: "e-david",
    reason:
      "Former operator with first-hand data on staffing, scheduling and the impact of centralisation on clinic P&Ls.",
    hypothesisIds: ["h4", "h5"],
    objectives:
      "Quantify margin benefits of centralisation and assess the severity of staffing constraints.",
    questions: [
      { id: "q-david-1", text: "What was your scope of responsibility at Northstar?" },
      {
        id: "q-david-2",
        text: "How have centralised procurement and back-office functions affected clinic margins?",
      },
      {
        id: "q-david-3",
        text: "How significant are hygienist and assistant staffing shortages across the network?",
      },
      {
        id: "q-david-4",
        text: "What has the company done to recruit and retain clinical staff, and at what cost?",
      },
      {
        id: "q-david-5",
        text: "Which clinics performed best, and what distinguished them operationally?",
      },
    ],
  },
  {
    expertId: "e-priya",
    reason:
      "Transaction adviser who can test the acquisition pipeline, valuation assumptions and pricing dynamics.",
    hypothesisIds: ["h3", "h2"],
    objectives:
      "Validate the size of the acquisition opportunity and whether entry multiples support the thesis.",
    questions: [
      { id: "q-priya-1", text: "How fragmented is the US general dentistry market today?" },
      {
        id: "q-priya-2",
        text: "How have acquisition multiples for independent practices changed over the past three years?",
      },
      {
        id: "q-priya-3",
        text: "Do DSOs typically achieve pricing power after acquiring practices?",
      },
      { id: "q-priya-4", text: "What integration risks do you see most often in dental roll-ups?" },
      {
        id: "q-priya-5",
        text: "How do you view Northstar's positioning relative to other mid-sized DSOs?",
      },
    ],
  },
];

const now = new Date("2026-10-22T15:30:00Z").toISOString();

function bare(
  id: string,
  company: string,
  thesis: string,
  status: DiligenceProject["status"],
  updatedAt: string,
): DiligenceProject {
  return {
    id,
    company,
    thesis,
    status,
    networks: NETWORKS.map((n) => ({ ...n })),
    experts: [],
    interviews: [],
    updatedAt,
  };
}

export const OAKVILLE_COMPANY = "Oakville Lakeshore Animal Hospital";

/** The demo thesis: each "Label: We believe …" line becomes one hypothesis. */
export const OAKVILLE_THESIS = "Investment Thesis \u2014 Acquisition of an Oakville Veterinary Group\n\nMarket Attractiveness: We believe Oakville's affluent and growing population will drive sustained demand for high-quality veterinary services, supporting long-term revenue growth.\n\nCompetitive Positioning: We believe the target's established customer relationships, strong clinical reputation, and convenient locations will enable it to defend and expand its local market share.\n\nOrganic Revenue Growth: We believe the target can accelerate organic revenue growth by increasing appointment utilization, improving customer retention, and expanding its range of veterinary services.\n\nOperational Efficiency: We believe centralized administrative functions, optimized staffing, and improved procurement will reduce operating costs and expand EBITDA margins.\n\nTalent Retention: We believe the target can attract and retain skilled veterinarians through competitive compensation, professional development, and operational support, enabling sustainable clinical capacity.\n\nAcquisition-Led Expansion: We believe the target can serve as a regional consolidation platform by acquiring complementary veterinary practices across the Greater Toronto Area and realizing operational synergies.\n\nFinancial Returns: We believe sustainable organic growth, margin expansion, and disciplined acquisitions will generate attractive risk-adjusted returns over a five-year investment horizon without relying on exit multiple expansion.";

export function seedProjects(): DiligenceProject[] {
  const connected = new Set(["GLG", "AlphaSights", "Third Bridge"]);
  const northstar: DiligenceProject = {
    ...bare("northstar", SAMPLE_COMPANY, SAMPLE_THESIS, "Ready for Interviews", now),
    networks: NETWORKS.map((n) => ({ ...n, connected: connected.has(n.id) })),
    experts: [...CUSTOM_EXPERTS, ...NETWORK_EXPERTS.filter((e) => connected.has(e.source))],
    selectedExpertIds: ["e-david", "e-priya"],
    plan: {
      hypotheses: DENTAL_HYPOTHESES.map((h) => ({ ...h })),
      experts: DENTAL_PLAN_EXPERTS.map((p) => ({
        ...p,
        questions: p.questions.map((q) => ({ ...q })),
      })),
      approved: true,
    },
  };
  northstar.interviews = northstar.plan!.experts.map((pe) => ({
    id: `iv-${pe.expertId.replace("e-", "")}`,
    expertId: pe.expertId,
    status: "Not Started" as const,
    topic: "Awaiting start",
    questions: pe.questions.map((q) => ({ id: q.id, text: q.text, status: "pending" as const })),
    transcript: [],
  }));

  const harbor = {
    ...bare(
      "harbor",
      "Harbor Veterinary Partners",
      "Harbor Veterinary Partners operates 28 companion-animal clinics in the Pacific Northwest. The thesis rests on rising pet ownership, premiumisation of veterinary care, and consolidation of independent practices.",
      "Planning",
      "2026-10-19T10:00:00Z",
    ),
  };
  harbor.networks = harbor.networks.map((n) => ({ ...n, connected: n.id === "AlphaSights" }));
  harbor.experts = NETWORK_EXPERTS.filter((e) => e.source === "AlphaSights");

  const summit = bare(
    "summit",
    "Summit Physio Clinics",
    "Summit Physio is a regional outpatient physiotherapy chain with 19 sites. We believe referral relationships with orthopaedic surgeons create defensible volume.",
    "Draft",
    "2026-10-14T09:12:00Z",
  );

  // The demo project: the real thesis, no experts yet (add customers and experts as
  // custom contacts on Expert Sources, then generate the plan).
  const oakville = bare(
    "oakville",
    OAKVILLE_COMPANY,
    OAKVILLE_THESIS,
    "Draft",
    "2026-10-24T12:00:00Z",
  );

  return [northstar, harbor, summit, oakville];
}
