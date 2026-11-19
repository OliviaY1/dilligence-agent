import { expertOf } from "@/components/research";
import { scorecardRows, type ScoreRow } from "@/components/scorecard";
import { escapeHtml, renderMarkdown } from "./markdown";
import { allHypotheses, roundsOf } from "./mock-service";
import { UPLOADED_TOPIC, type DiligenceProject, type ReportDraft } from "./types";
import { completedInterviews } from "./validation-request";

/**
 * The findings report: everything on the Findings page (verdict, claim by
 * claim assessment with its quotes, research gaps, the proposed next round)
 * written out as Markdown. The team edits it on the Findings page
 * (components/report-editor.tsx) and exports it as .md or, through the
 * browser's print dialog, as a PDF.
 */

/** The next-round proposal, if it was made from the current validation. */
const currentNextRound = (p: DiligenceProject) =>
  p.nextRound && p.thesisValidation && p.nextRound.basedOn === p.thesisValidation.at
    ? p.nextRound
    : undefined;

/** What a report is built from; when this changes, the draft is out of date. */
export const reportBasis = (p: DiligenceProject) =>
  `${p.thesisValidation?.at ?? ""}|${currentNextRound(p)?.at ?? ""}`;

/** A new, unedited draft from the project's findings. */
export const newReportDraft = (p: DiligenceProject, now = new Date()): ReportDraft => ({
  markdown: buildReport(p, now),
  at: now.toISOString(),
  basedOn: reportBasis(p),
});

export const reportTitle = (p: DiligenceProject) =>
  `${p.company.trim() || "Untitled project"} — Diligence findings`;

/** e.g. "maple-ridge-veterinary-group-findings" */
export const reportFileName = (p: DiligenceProject) =>
  `${
    p.company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "diligence"
  }-findings`;

const date = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

/** One line, safe inside a table cell. */
const cell = (s: string) => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim() || "—";
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ASSESSMENT_LABEL: Record<NonNullable<ScoreRow["assessment"]>, string> = {
  Supported: "Supported",
  Contradicted: "Contradicted",
  "Mixed Evidence": "Mixed evidence",
  "Insufficient Evidence": "Insufficient evidence",
};
const assessmentOf = (r: ScoreRow) =>
  r.assessment ? ASSESSMENT_LABEL[r.assessment] : "Not tested yet";
const STANCE = { support: "supports", contradict: "contradicts", neutral: "neutral" } as const;

/** "3 (2 for, 1 against)" */
function evidenceSummary(r: ScoreRow): string {
  if (!r.evidence.length) return "None yet";
  const n = (s: "support" | "contradict" | "neutral") => r.stances.filter((x) => x === s).length;
  const parts = [
    n("support") && `${n("support")} for`,
    n("contradict") && `${n("contradict")} against`,
    n("neutral") && `${n("neutral")} neutral`,
  ].filter(Boolean);
  return `${r.evidence.length} (${parts.join(", ")})`;
}

const list = (rows: ScoreRow[]) => rows.map((r) => `${r.label} ${r.title}`).join("; ");

export function buildReport(p: DiligenceProject, now = new Date()): string {
  const v = p.thesisValidation;
  const rows = scorecardRows(p);
  const ivs = completedInterviews(p);
  const rounds = roundsOf(p);
  const next = currentNextRound(p);
  const out: string[] = [];
  const add = (...lines: string[]) => out.push(...lines, "");

  // Title and summary line
  add(`# ${reportTitle(p)}`);
  add(
    [
      `Prepared ${date(now)}`,
      plural(ivs.length, "completed interview"),
      plural(rows.length, "claim"),
      rounds.length > 1 ? `${rounds.length} research rounds` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );

  // Executive summary
  const supported = rows.filter((r) => r.assessment === "Supported");
  const contradicted = rows.filter((r) => r.assessment === "Contradicted");
  const open = rows.filter((r) => r.assessment !== "Supported" && r.assessment !== "Contradicted");
  add("## Executive summary");
  if (v) {
    add(`**Overall verdict: ${v.overall.verdict}.** ${oneLine(v.overall.summary)}`.trim());
  } else {
    add("The thesis has not been assessed against the interviews yet.");
  }
  add(
    `Of the ${plural(rows.length, "claim")} in the thesis, ${supported.length} ${
      supported.length === 1 ? "is" : "are"
    } supported, ${contradicted.length} ${contradicted.length === 1 ? "is" : "are"} contradicted and ${
      open.length
    } ${open.length === 1 ? "remains" : "remain"} open.`,
  );
  const tally = [
    supported.length ? `- **Supported:** ${list(supported)}` : "",
    contradicted.length ? `- **Contradicted:** ${list(contradicted)}` : "",
    open.length
      ? `- **Open:** ${open.map((r) => `${r.label} ${r.title} (${assessmentOf(r).toLowerCase()})`).join("; ")}`
      : "",
  ].filter(Boolean);
  if (tally.length) add(...tally);

  // Thesis
  if (p.thesis.trim()) {
    add("## Investment thesis");
    add(p.thesis.trim());
  }

  // Scorecard
  if (rows.length) {
    add("## Claim scorecard");
    add(
      "| | Claim | Assessment | Confidence | Quotes |",
      "|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.label} | ${cell(r.title)} | ${assessmentOf(r)} | ${
            r.confidence ? r.confidence[0]!.toUpperCase() + r.confidence.slice(1) : "—"
          } | ${evidenceSummary(r)} |`,
      ),
    );
  }

  // Claim by claim
  if (rows.length) add("## Findings by claim");
  for (const r of rows) {
    add(`### ${r.label}. ${oneLine(r.title)}`);
    add(`**${assessmentOf(r)}**${r.confidence ? ` · ${r.confidence} confidence` : ""}`);
    if (r.description.trim()) add(`*The claim:* ${oneLine(r.description)}`);
    add(
      r.assessment
        ? r.rationale.trim() || "No rationale was given."
        : "No completed interview has covered this claim yet.",
    );
    if (r.evidence.length) {
      add("**Evidence**");
      for (const e of r.evidence) {
        const who = [`**${oneLine(e.who)}**`, e.role && oneLine(e.role)].filter(Boolean).join(", ");
        add(`> “${oneLine(e.quote)}”`, ">", `> — ${who} · *${STANCE[e.stance]}*`);
      }
    }
  }

  // Research gaps
  const label = (id: string | null) => {
    const r = id ? rows.find((x) => x.id === id) : undefined;
    return r ? `${r.label} ${oneLine(r.title)}` : "Overall thesis";
  };
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const gaps = [...(v?.gaps ?? [])].sort((a, b) => rank[a.priority] - rank[b.priority]);
  if (v) {
    add("## Research gaps");
    if (!gaps.length) add("No open gaps.");
    gaps.forEach((g, i) => {
      const priority = g.priority[0]!.toUpperCase() + g.priority.slice(1);
      add(`${i + 1}. **${label(g.hypothesisId)}** (${priority} priority). ${oneLine(g.gap)}`);
      if (g.nextStep.trim()) add(`   *Next step:* ${oneLine(g.nextStep)}`);
    });
  }

  // Next round
  if (next) {
    const roundNo = (p.pastRounds?.length ?? 0) + 2;
    const prior = allHypotheses(p).length;
    const person = (id: string) =>
      p.experts.find((e) => e.id === id) ?? next.newExperts.find((e) => e.id === id);
    add("## Recommended next round");
    add(`Proposed from the findings and research gaps above.`);
    if (next.plan.hypotheses.length) {
      add(`### Claims to test in Round ${roundNo}`);
      next.plan.hypotheses.forEach((h, i) => {
        const why = next.why[h.id];
        add(
          `- **H${prior + i + 1}. ${oneLine(h.title)}**${h.origin ? ` (${h.origin})` : ""}. ${oneLine(h.description)}`,
        );
        if (why) add(`  *Why:* ${oneLine(why)}`);
      });
    }
    if (next.plan.experts.length) {
      add("### Who to interview");
      for (const pe of next.plan.experts) {
        const e = person(pe.expertId);
        const isNew = next.newExperts.some((x) => x.id === pe.expertId);
        add(`#### ${oneLine(e?.name || "Interviewee")}${e?.title ? ` — ${oneLine(e.title)}` : ""}`);
        add(
          `*${isNew ? "New contact to recruit" : "From your contacts"} · ${
            pe.audience === "customer" ? "Customer" : "Industry expert"
          }.*${pe.reason ? ` ${oneLine(pe.reason)}` : ""}`,
        );
        if (pe.questions.length) add(...pe.questions.map((q, k) => `${k + 1}. ${oneLine(q.text)}`));
      }
    }
  }

  // Appendix: who was interviewed
  if (ivs.length) {
    const roundOf = new Map(
      rounds.flatMap((r, k) => r.interviews.map((iv) => [iv.id, k + 1] as const)),
    );
    const audience = (expertId: string) =>
      rounds.flatMap((r) => r.plan.experts).find((e) => e.expertId === expertId)?.audience;
    add("## Appendix: interviews");
    add(
      "| Interviewee | Role | Type | Source | Round |",
      "|---|---|---|---|---|",
      ...ivs.map((iv) => {
        const e = expertOf(p, iv.expertId);
        const a = audience(iv.expertId);
        return `| ${cell(e?.name ?? "Interviewee")} | ${cell(e?.title ?? "")} | ${
          a === "customer" ? "Customer" : a === "expert" ? "Industry expert" : "—"
        } | ${iv.topic === UPLOADED_TOPIC ? "Uploaded transcript" : "AI voice interview"} | ${
          roundOf.get(iv.id) ?? "—"
        } |`;
      }),
    );
  }

  // Method
  if (v) {
    add("## Methodology");
    add(
      `This report draws on ${plural(ivs.length, "completed interview")}. ` +
        "Each claim was assessed only on what interviewees said: the interviewer's questions and outside knowledge " +
        "were not counted as evidence. Quotes are verbatim from the interview transcripts" +
        (v.droppedQuotes
          ? `; ${plural(v.droppedQuotes, "quote")} that could not be matched to a transcript ${
              v.droppedQuotes === 1 ? "was" : "were"
            } left out.`
          : "."),
    );
    add(`*Assessment by ${v.model}, ${date(new Date(v.at))}.*`);
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

// --- Export -------------------------------------------------------------------

const REPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { background: #fff; }
body {
  margin: 0; color: #1f2937; background: #fff;
  font: 10.5pt/1.6 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.report { max-width: 46rem; margin: 0 auto; padding: 40px 36px 64px; overflow-wrap: break-word; }
h1, h2, h3, h4, h5, h6, strong { color: #111827; }
h1 { font-size: 21pt; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 6px; }
h1 + p { color: #667085; font-size: 9.5pt; margin-bottom: 20px; }
h2 { font-size: 13.5pt; line-height: 1.3; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
h3 { font-size: 11.5pt; line-height: 1.35; margin: 22px 0 6px; }
h4, h5, h6 { font-size: 10.5pt; margin: 16px 0 4px; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 12px; padding-left: 22px; }
li { margin: 3px 0; }
li > ul, li > ol { margin: 3px 0 0; }
blockquote { margin: 8px 0 12px; padding: 4px 0 4px 14px; border-left: 3px solid #5e6ad2; color: #344054; }
blockquote p { margin: 0 0 4px; }
blockquote p:last-child { margin: 0; font-size: 9.5pt; color: #667085; }
blockquote p:only-child { font-size: inherit; color: inherit; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 16px; font-size: 9.5pt; }
th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f8f9fb; font-weight: 600; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: #f2f4f7; padding: 1px 4px; border-radius: 4px; }
pre { background: #f8f9fb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
hr { border: 0; border-top: 1px solid #e5e7eb; margin: 22px 0; }
img { max-width: 100%; }
a { color: #5e6ad2; }
@page { margin: 18mm 16mm 20mm; }
@media print {
  .report { max-width: none; padding: 0; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
  blockquote, tr, pre, img { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
`;

/** The report as a standalone HTML page: the preview, and what is printed to PDF. */
export const reportDocument = (markdown: string, title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
  `<base target="_blank"><style>${REPORT_CSS}</style></head>` +
  `<body><main class="report">${renderMarkdown(markdown)}</main></body></html>`;

export function downloadFile(name: string, text: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open the browser's print dialog on the report alone (choose "Save as PDF").
 * It prints from a hidden frame, so the app around it is not in the PDF. The
 * page title is the PDF's default file name.
 */
export function printReport(markdown: string, title: string) {
  document.getElementById("report-print-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "report-print-frame";
  frame.setAttribute("aria-hidden", "true");
  // No scripts can run in it; the parent can still reach it (same origin) to print.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.srcdoc = reportDocument(markdown, title);
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    const appTitle = document.title;
    document.title = title;
    const restore = () => {
      if (document.title === title) document.title = appTitle;
      window.removeEventListener("pointerdown", restore);
      window.removeEventListener("keydown", restore);
    };
    w.addEventListener("afterprint", restore, { once: true });
    w.focus();
    w.print();
    // If the browser never sends "afterprint", the next click or key press in the app
    // puts the title back (the print dialog is modal, so none can come while it is open).
    window.addEventListener("pointerdown", restore);
    window.addEventListener("keydown", restore);
  };
  document.body.append(frame);
}
