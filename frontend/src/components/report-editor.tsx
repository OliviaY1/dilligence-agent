import {
  Check,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  PencilLine,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfirmDialog, Sheet, Textarea } from "@/components/ui-kit";
import { renderMarkdown } from "@/lib/markdown";
import {
  downloadFile,
  newReportDraft,
  printReport,
  reportBasis,
  reportDocument,
  reportFileName,
  reportTitle,
} from "@/lib/report";
import type { DiligenceProject, ReportDraft } from "@/lib/types";
import { cn } from "@/lib/utils";

type Update = (fn: (p: DiligenceProject) => DiligenceProject) => void;

/** "Export report" on the Findings page: opens the report editor. */
export function ExportReportButton({
  project,
  update,
  disabled,
}: {
  project: DiligenceProject;
  update: Update;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <FileText /> Export report
      </Button>
      {open && <ReportEditor project={project} update={update} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The report as Markdown on the left and the formatted page on the right (one
 * at a time on a phone). Every edit is saved on the project, so the draft is
 * there next time; the formatted page is what "Export PDF" prints.
 */
function ReportEditor({
  project,
  update,
  onClose,
}: {
  project: DiligenceProject;
  update: Update;
  onClose: () => void;
}) {
  const basis = reportBasis(project);
  // The saved draft, unless the findings changed and nobody edited it: then a fresh one.
  const [draft, setDraft] = useState<ReportDraft>(() => {
    const saved = project.report;
    return saved && (saved.basedOn === basis || saved.edited) ? saved : newReportDraft(project);
  });
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [copied, setCopied] = useState(false);
  const outdated = draft.basedOn !== basis;
  const title = reportTitle(project);

  const save = useCallback(
    (d: ReportDraft) => {
      setDraft(d);
      update((p) => ({ ...p, report: d }));
    },
    [update],
  );
  // A newly built draft is saved on opening.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (project.report !== draft) save(draft);
  }, [project.report, draft, save]);

  const rebuild = () => save(newReportDraft(project));

  return (
    <Sheet open onClose={onClose} width="max-w-[1280px]">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-5">
        <div className="mr-auto min-w-0">
          <h2 className="font-semibold">Findings report</h2>
          <p className="text-xs text-muted-foreground">
            Edit in Markdown. Changes are saved to this project.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          title="Rebuild the report from the current findings"
          onClick={() => (draft.edited ? setConfirmRebuild(true) : rebuild())}
        >
          <RotateCcw /> Rebuild
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void navigator.clipboard.writeText(draft.markdown).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadFile(`${reportFileName(project)}.md`, draft.markdown)}
        >
          <Download /> Download .md
        </Button>
        <Button
          size="sm"
          title="Opens the print dialog: choose “Save as PDF”"
          onClick={() => printReport(draft.markdown, title)}
        >
          <FileDown /> Export PDF
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </header>

      {outdated && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-warning-soft px-4 py-2.5 text-sm text-warning md:px-5">
          <span>The findings have changed since this draft was written.</span>
          <Button variant="secondary" size="sm" onClick={() => setConfirmRebuild(true)}>
            <RotateCcw /> Rebuild from findings
          </Button>
        </div>
      )}

      <div className="flex gap-1 border-b px-4 py-2 md:hidden" role="tablist">
        {(
          [
            ["edit", "Edit", <PencilLine key="i" />],
            ["preview", "Preview", <Eye key="i" />],
          ] as const
        ).map(([id, label, icon]) => (
          <Button
            key={id}
            role="tab"
            aria-selected={view === id}
            variant={view === id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView(id)}
          >
            {icon} {label}
          </Button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <div
          className={cn(
            "min-h-0 flex-col md:flex md:border-r",
            view === "edit" ? "flex" : "hidden",
          )}
        >
          <Textarea
            aria-label="Report (Markdown)"
            spellCheck
            value={draft.markdown}
            onChange={(e) => save({ ...draft, markdown: e.target.value, edited: true })}
            className="min-h-0 flex-1 resize-none rounded-none border-0 bg-card p-5 font-mono text-[13px] focus:ring-0"
          />
          <p className="border-t px-5 py-2 font-mono text-[11px] text-muted-foreground">
            # Heading · **bold** · *italic* · - list · 1. list · &gt; quote · | table |
          </p>
        </div>
        <div className={cn("min-h-0 bg-muted md:block", view === "preview" ? "block" : "hidden")}>
          <ReportPreview markdown={draft.markdown} title={title} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmRebuild}
        onClose={() => setConfirmRebuild(false)}
        onConfirm={rebuild}
        title="Rebuild the report?"
        description="It is written again from the current findings. Your edits to this draft are replaced."
        confirmLabel="Rebuild"
      />
    </Sheet>
  );
}

/**
 * The formatted report, as it will print. The frame loads once and its page is
 * rewritten on each edit, so the scroll position stays where it was.
 */
function ReportPreview({ markdown, title }: { markdown: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const shell = useMemo(() => reportDocument("", title), [title]);
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  const paint = useCallback(() => {
    const main = frame.current?.contentDocument?.querySelector("main");
    if (main) main.innerHTML = html;
  }, [html]);
  useEffect(paint, [paint]);
  return (
    <iframe
      ref={frame}
      title="Report preview"
      srcDoc={shell}
      onLoad={paint}
      // No scripts run inside; same origin so the page can be rewritten from here.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block h-full w-full bg-white"
    />
  );
}
