import type { DiligenceProject, Expert, ExpertNetwork, InvestmentHypothesis } from "./types";

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

export const OAKVILLE_COMPANY = "Oakville Lakeshore Animal Hospital";

/** The example's five claims: h1-h2 are tested with a customer, h3-h5 with an industry expert. */
const OAKVILLE_CLAIMS: InvestmentHypothesis[] = [
  {
    id: "h1",
    title: "Customer Demand",
    description: "We believe more pet owners in Oakville will keep vet visits growing.",
    evidence: "How often customers visit, and whether that is rising.",
  },
  {
    id: "h2",
    title: "Customer Loyalty",
    description:
      "We believe pet owners stay because they trust the vets and the clinic is convenient.",
    evidence: "Why customers stay, and what would make them switch.",
  },
  {
    id: "h3",
    title: "Pricing Power",
    description: "We believe the clinic can raise prices without losing many clients.",
    evidence: "Recent local price increases and how clients reacted.",
  },
  {
    id: "h4",
    title: "Talent Retention",
    description: "We believe the clinic can keep its vets with good pay and support.",
    evidence: "Why vets stay at or leave a clinic.",
  },
  {
    id: "h5",
    title: "Acquisition Platform",
    description: "We believe the clinic can buy nearby practices and run them more efficiently.",
    evidence: "How many nearby practices would sell, and at what price.",
  },
];

/** The example thesis: each "Label: We believe …" line becomes one claim. */
export const OAKVILLE_THESIS = [
  "Investment Thesis — Acquisition of an Oakville Animal Hospital",
  ...OAKVILLE_CLAIMS.map((c) => `${c.title}: ${c.description}`),
].join("\n\n");

/** The one example project: five claims, one customer and one expert, plan ready to approve. */
export function seedProjects(): DiligenceProject[] {
  const q = (id: string, text: string) => ({ id, text });
  return [
    {
      id: "oakville",
      company: OAKVILLE_COMPANY,
      thesis: OAKVILLE_THESIS,
      status: "Planning",
      networks: NETWORKS.map((n) => ({ ...n })),
      experts: [
        {
          id: "e-maya",
          name: "Maya Chen",
          title: "Dog owner, client for 6 years",
          phone: "",
          description: "Brings her two dogs to the clinic for checkups and vaccines.",
          source: "Custom",
        },
        {
          id: "e-raj",
          name: "Raj Patel",
          title: "Former practice manager",
          phone: "",
          description:
            "Ran operations for a 12-clinic veterinary group in the Greater Toronto Area.",
          source: "Custom",
        },
      ],
      plan: {
        hypotheses: OAKVILLE_CLAIMS.map((c) => ({ ...c })),
        experts: [
          {
            expertId: "e-maya",
            audience: "customer",
            hypothesisIds: ["h1", "h2"],
            reason: "A long-time client can speak to demand and loyalty first-hand.",
            objectives: "Learn how often she visits and why she stays.",
            questions: [
              q("q-maya-1", "How often do you bring your dogs to the clinic now?"),
              q("q-maya-2", "Why do you keep coming back to this clinic?"),
              q("q-maya-3", "What would make you switch to another clinic?"),
            ],
          },
          {
            expertId: "e-raj",
            audience: "expert",
            hypothesisIds: ["h3", "h4", "h5"],
            reason: "A former operator knows pricing, staffing and deals across local clinics.",
            objectives: "Test pricing, vet retention and the acquisition pipeline.",
            questions: [
              q("q-raj-1", "How much have local clinics raised prices recently?"),
              q("q-raj-2", "How did clients react when prices went up?"),
              q("q-raj-3", "What makes vets stay at or leave a clinic?"),
              q("q-raj-4", "How many nearby practices would sell to a larger group?"),
            ],
          },
        ],
        approved: false,
      },
      interviews: [],
      updatedAt: "2026-11-04T12:00:00.000Z",
    },
  ];
}
