import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";
import { seedProjects } from "@/lib/mock-data";
import { buildReport, newReportDraft, reportBasis, reportFileName } from "@/lib/report";

const demo = () => seedProjects().find((p) => p.id === "maple-ridge")!;
const NOW = new Date("2026-11-18T12:00:00Z");

describe("findings report", () => {
  it("covers the verdict, every claim with its quotes, the gaps and the next round", () => {
    const p = demo();
    const md = buildReport(p, NOW);
    expect(md).toMatch(/^# Maple Ridge Veterinary Group — Diligence findings\n/);
    expect(md).toContain("Prepared November 18, 2026 · 3 completed interviews · 4 claims");
    expect(md).toContain("**Overall verdict: Partially supported.** Clients are loyal");
    expect(md).toContain("2 are supported, 1 is contradicted and 1 remains open.");
    for (const h of p.plan!.hypotheses) expect(md).toContain(h.title);
    // Every quote, verbatim, with who said it.
    for (const h of p.thesisValidation!.hypotheses)
      for (const e of h.evidence) expect(md).toContain(`> “${e.quote}”`);
    expect(md).toContain("> — **Raj Patel**, Former Medical Director, Maple Ridge · *contradicts*");
    // Gaps, most urgent first, each with its next step.
    const gaps = md.slice(md.indexOf("## Research gaps"), md.indexOf("## Recommended next round"));
    expect(gaps).toMatch(/^1\. \*\*H3 Vet Staffing\*\* \(High priority\)/m);
    expect(gaps).toContain("*Next step:* Interview a vet who left Maple Ridge");
    // The proposed round, numbered after the existing claims as on the page.
    expect(md).toContain("**H5. Matching pay keeps vets** (Refined from H3 · Contradicted)");
    expect(md).toContain("1. Why did you leave Maple Ridge?");
    expect(md).toContain("## Appendix: interviews");
    expect(md).toContain("| Jennifer Walsh | Dog owner, Maple Ridge client | Customer |");
  });

  it("leaves out a next round proposed from an older validation", () => {
    const p = demo();
    p.nextRound = { ...p.nextRound!, basedOn: "older" };
    expect(buildReport(p, NOW)).not.toContain("## Recommended next round");
    expect(reportBasis(p)).toBe(`${p.thesisValidation!.at}|`);
  });

  it("keeps table cells on one line and escapes pipes", () => {
    const p = demo();
    p.plan!.hypotheses[0]!.title = "Loyalty | retention\nrate";
    expect(buildReport(p, NOW)).toContain("| H1 | Loyalty \\| retention rate | Supported |");
  });

  it("renders as a page: the draft records what it was built from", () => {
    const p = demo();
    const d = newReportDraft(p, NOW);
    expect(d).toMatchObject({ at: NOW.toISOString(), basedOn: reportBasis(p) });
    expect(d.edited).toBeUndefined();
    const html = renderMarkdown(d.markdown);
    expect(html).toContain("<h1>Maple Ridge Veterinary Group — Diligence findings</h1>");
    expect(html).toContain("<blockquote><p>“Eight years now.”</p>");
    expect(html).toContain("<th>Claim</th>");
    expect(reportFileName(p)).toBe("maple-ridge-veterinary-group-findings");
  });
});

describe("markdown", () => {
  it("renders headings, emphasis, code and links", () => {
    expect(renderMarkdown("## Title ##")).toBe("<h2>Title</h2>");
    expect(renderMarkdown("**bold** and *it* and `a*b*`")).toBe(
      "<p><strong>bold</strong> and <em>it</em> and <code>a*b*</code></p>",
    );
    expect(renderMarkdown("[site](https://x.com/?a=1&b=2)")).toBe(
      '<p><a href="https://x.com/?a=1&amp;b=2">site</a></p>',
    );
    expect(renderMarkdown("snake_case_name and 5 * 3 * 2")).toBe(
      "<p>snake_case_name and 5 * 3 * 2</p>",
    );
    expect(renderMarkdown("Title\n===")).toBe("<h1>Title</h1>");
    expect(renderMarkdown("line one  \nline two")).toBe("<p>line one<br>\nline two</p>");
  });

  it("shows raw HTML as text and drops unsafe links", () => {
    expect(renderMarkdown('<script>alert("x")</script>')).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
    expect(renderMarkdown("[click](javascript:alert(1))")).not.toContain("href");
    expect(renderMarkdown("![x](javascript:alert(1))")).not.toContain("<img");
    expect(renderMarkdown("a 0 b")).toBe("<p>a 0 b</p>");
  });

  it("renders nested, numbered and loose lists", () => {
    expect(renderMarkdown("- a\n  - b\n- c")).toBe(
      "<ul><li>a\n<ul><li>b</li></ul></li><li>c</li></ul>",
    );
    expect(renderMarkdown("3. x\n4. y")).toBe('<ol start="3"><li>x</li><li>y</li></ol>');
    expect(renderMarkdown("1. a\n\n   more\n\n2. b")).toBe(
      "<ol><li><p>a</p>\n<p>more</p></li><li><p>b</p></li></ol>",
    );
    expect(renderMarkdown("- a\n\n# Next")).toBe("<ul><li>a</li></ul>\n<h1>Next</h1>");
  });

  it("renders quotes, tables, rules and fenced code", () => {
    expect(renderMarkdown("> “q”\n>\n> — who")).toBe(
      "<blockquote><p>“q”</p>\n<p>— who</p></blockquote>",
    );
    expect(renderMarkdown("| a | b |\n|---|--:|\n| 1 \\| 2 | 3 |")).toBe(
      '<table><thead><tr><th>a</th><th style="text-align:right">b</th></tr></thead>' +
        '<tbody><tr><td>1 | 2</td><td style="text-align:right">3</td></tr></tbody></table>',
    );
    expect(renderMarkdown("a\n\n---\n\nb")).toBe("<p>a</p>\n<hr>\n<p>b</p>");
    expect(renderMarkdown("```\n<b> *x*\n```")).toBe("<pre><code>&lt;b&gt; *x*</code></pre>");
  });
});
