/**
 * A small Markdown-to-HTML renderer for the findings report (lib/report.ts):
 * headings, paragraphs, **bold**, *italic*, ~~strike~~, `code`, links, images,
 * bullet and numbered lists (nested by indent), > quotes, tables, rules and
 * fenced code. Raw HTML is shown as text, never run, and links keep only safe
 * schemes, so pasted transcript text cannot inject markup into the page.
 */

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LIST = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>/;
const TABLE_DELIM = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const indentOf = (line: string) => line.length - line.trimStart().length;
const isTableStart = (lines: string[], i: number) =>
  (lines[i] ?? "").includes("|") &&
  (lines[i + 1] ?? "").includes("|") &&
  TABLE_DELIM.test(lines[i + 1] ?? "");
const startsBlock = (lines: string[], i: number) => {
  const l = lines[i] ?? "";
  return (
    FENCE.test(l) ||
    HEADING.test(l) ||
    RULE.test(l) ||
    QUOTE.test(l) ||
    LIST.test(l) ||
    isTableStart(lines, i)
  );
};

export function renderMarkdown(md: string): string {
  return blocks(md.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n"), false);
}

/** Block structure. In a tight list item, paragraphs are not wrapped in <p>. */
function blocks(lines: string[], tight: boolean): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const close = new RegExp(
        `^ {0,3}${fence[1]![0] === "`" ? "`" : "~"}{${fence[1]!.length},}[ \\t]*$`,
      );
      const body: string[] = [];
      for (i++; i < lines.length && !close.test(lines[i]!); i++) body.push(lines[i]!);
      i++; // the closing fence
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const n = heading[1]!.length;
      out.push(`<h${n}>${inline(heading[2] ?? "")}</h${n}>`);
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!))
        body.push(lines[i++]!.replace(/^ {0,3}> ?/, ""));
      out.push(`<blockquote>${blocks(body, false)}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = cells(line);
      const align = cells(lines[i + 1]!).map((c) =>
        c.startsWith(":") && c.endsWith(":")
          ? "center"
          : c.endsWith(":")
            ? "right"
            : c.startsWith(":")
              ? "left"
              : "",
      );
      const cell = (tag: "th" | "td", text: string, k: number) =>
        `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(text)}</${tag}>`;
      const rows: string[] = [];
      for (i += 2; i < lines.length && lines[i]!.trim() && lines[i]!.includes("|"); i++) {
        const row = cells(lines[i]!);
        rows.push(`<tr>${head.map((_, k) => cell("td", row[k] ?? "", k)).join("")}</tr>`);
      }
      out.push(
        `<table><thead><tr>${head.map((h, k) => cell("th", h, k)).join("")}</tr></thead>` +
          `<tbody>${rows.join("")}</tbody></table>`,
      );
      continue;
    }

    if (LIST.test(line)) {
      const [html, next] = list(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // A paragraph runs to a blank line or the start of another block.
    const para = [line.replace(/^\s+/, "")];
    for (i++; i < lines.length && lines[i]!.trim() && !startsBlock(lines, i); i++) {
      // "Text" underlined with === or --- is a heading (setext).
      if (/^ {0,3}=+[ \t]*$/.test(lines[i]!) || /^ {0,3}-+[ \t]*$/.test(lines[i]!)) break;
      para.push(lines[i]!.replace(/^\s+/, ""));
    }
    const underline = lines[i] ?? "";
    if (
      /^ {0,3}=+[ \t]*$/.test(underline) ||
      (/^ {0,3}-+[ \t]*$/.test(underline) && underline.trim())
    ) {
      const n = underline.trim()[0] === "=" ? 1 : 2;
      out.push(`<h${n}>${inline(para.join("\n").trimEnd())}</h${n}>`);
      i++;
      continue;
    }
    const text = inline(para.join("\n").trimEnd());
    out.push(tight ? text : `<p>${text}</p>`);
  }
  return out.join("\n");
}

/** The cells of one table row; `\|` stays inside a cell. */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

/** One list starting at lines[start]; returns its HTML and the first line after it. */
function list(lines: string[], start: number): [string, number] {
  const first = lines[start]!.match(LIST)!;
  const indent = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: string[][] = [];
  let contentIndent = 0;
  let loose = false;
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = line.match(LIST);
    if (m && m[1]!.length <= indent + 1 && /\d/.test(m[2]!) === ordered) {
      items.push([m[3]!]);
      contentIndent = line.length - m[3]!.length;
      i++;
      continue;
    }
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim()) j++;
      const next = lines[j];
      if (next === undefined) break;
      const sibling = next.match(LIST);
      const continues =
        indentOf(next) > indent ||
        (!!sibling && sibling[1]!.length <= indent + 1 && /\d/.test(sibling[2]!) === ordered);
      if (!continues) break;
      loose = true;
      for (; i < j; i++) items.at(-1)!.push("");
      continue;
    }
    if (indentOf(line) > indent) {
      items.at(-1)!.push(line.slice(Math.min(indentOf(line), contentIndent)));
      i++;
      continue;
    }
    // A plain line right after an item's text continues it (lazy continuation).
    if (!startsBlock(lines, i) && items.at(-1)!.at(-1)?.trim()) {
      items.at(-1)!.push(line.trim());
      i++;
      continue;
    }
    break;
  }
  const tag = ordered ? "ol" : "ul";
  const n = ordered ? parseInt(first[2]!, 10) : 1;
  const open = ordered && n !== 1 ? `<ol start="${n}">` : `<${tag}>`;
  const body = items.map((it) => `<li>${blocks(it, !loose)}</li>`).join("");
  return [`${open}${body}</${tag}>`, i];
}

const SAFE_LINK = /^(https?:|mailto:|tel:|#|\/|\.{0,2}\/|[^:]*$)/i;
const SAFE_IMAGE = /^(https?:|data:image\/(png|jpe?g|gif|webp);)/i;

/** Inline formatting. Code spans and escapes are set aside first so nothing inside them is formatted. */
export function inline(src: string): string {
  const stash: string[] = [];
  const hold = (html: string) => `\uE000${stash.push(html) - 1}\uE001`;
  const restore = (s: string): string =>
    s.replace(/\uE000(\d+)\uE001/g, (_, k: string) => restore(stash[Number(k)]!));

  let s = src
    .replace(/[\uE000\uE001]/g, "") // the placeholder markers below
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code: string) =>
      hold(`<code>${escapeHtml(code.replace(/^ (.*) $/s, "$1"))}</code>`),
    )
    .replace(/\\\n/g, () => hold("<br>"))
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, (_, c: string) => hold(escapeHtml(c)));
  s = escapeHtml(s);

  // Images, links and <autolinks> (already escaped, so "<" is "&lt;" and '"' is "&quot;").
  const target = /\(\s*([^\s()]+)(?:\s+&quot;[\s\S]*?&quot;)?\s*\)/.source;
  s = s
    .replace(new RegExp(`!\\[([^\\]]*)\\]${target}`, "g"), (_, alt: string, url: string) =>
      SAFE_IMAGE.test(url) ? hold(`<img src="${url}" alt="${alt}">`) : alt,
    )
    .replace(new RegExp(`\\[([^\\]]+)\\]${target}`, "g"), (_, text: string, url: string) =>
      SAFE_LINK.test(url) ? hold(`<a href="${url}">${emphasis(text)}</a>`) : emphasis(text),
    )
    .replace(/&lt;((?:https?:\/\/|mailto:)[^\s]*?)&gt;/gi, (_, url: string) =>
      hold(`<a href="${url}">${url}</a>`),
    );

  return restore(emphasis(s).replace(/ {2,}\n/g, "<br>\n"));
}

function emphasis(s: string): string {
  return s
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1<strong>$2</strong>")
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, "<em>$1</em>")
    .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
}
