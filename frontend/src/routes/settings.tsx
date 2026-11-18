import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, PageBody, PageHeader } from "@/components/app-shell";
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { useStore } from "@/lib/store";
import {
  AVATAR_OPTIONS,
  interviewerName,
  useAlexaSettings,
  type AlexaSettings,
} from "@/lib/alexa-settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Diligence Live" },
      {
        name: "description",
        content: "Manage saved projects and demo data for the Diligence Live prototype.",
      },
      { property: "og:title", content: "Settings — Diligence Live" },
      {
        property: "og:description",
        content: "Manage saved projects and demo data for the Diligence Live prototype.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { projects, loadSamples, removeAllProjects } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <PageBody narrow>
        <Card className="divide-y">
          <Row
            title="Sample projects"
            description="Add the Maple Ridge demo and the Oakville example. Existing projects are kept."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  loadSamples();
                  setDone("Sample projects loaded.");
                }}
              >
                Load sample projects
              </Button>
            }
          />
          <Row
            title="Saved projects"
            description={`${projects.length} project${projects.length === 1 ? "" : "s"}. Deleting removes their plans, interviews and findings.`}
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={!projects.length}
                onClick={() => setConfirm(true)}
              >
                Delete all projects
              </Button>
            }
          />
        </Card>
        {done && <p className="mt-3 text-sm text-success">{done}</p>}
        <AlexaCard />
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            removeAllProjects();
            setConfirm(false);
            setDone("All projects deleted.");
          }}
          title="Delete all projects?"
          description="Every project is removed. The samples can be loaded again from here."
          confirmLabel="Delete all"
        />
      </PageBody>
    </AppShell>
  );
}

function Row({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/**
 * The voice interviewer for live calls (Higgs Realtime + Higgs Avatar).
 * The system instructions open the call; the closing ends it.
 */
function AlexaCard() {
  const { settings, save, reset, hydrated } = useAlexaSettings();
  const [draft, setDraft] = useState<AlexaSettings>(settings);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (hydrated) setDraft(settings);
  }, [hydrated, settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="mt-10">
      <SectionTitle
        title={`${interviewerName(settings)} — voice interviewer`}
        description="{name} and {company} are filled in on each call."
      />
      <Card className="space-y-5 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="alexa-name">Name</Label>
          <Input
            id="alexa-name"
            value={draft.name}
            placeholder="Alexa"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            What the interviewer calls herself on the call, and what the dashboard shows.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alexa-instructions">System instructions (opening of the call)</Label>
          <Textarea
            id="alexa-instructions"
            rows={4}
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Sent to Higgs Realtime in the first session.update; the interviewer speaks first. Keep
            it short.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alexa-closing">Closing</Label>
          <Textarea
            id="alexa-closing"
            rows={2}
            value={draft.closing}
            onChange={(e) => setDraft({ ...draft, closing: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Said after the last question, or right after the interviewee declines. The call ends
            once it has been said.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alexa-avatar">Avatar</Label>
          <div>
            <Select
              id="alexa-avatar"
              value={draft.avatarId}
              onChange={(e) => setDraft({ ...draft, avatarId: e.target.value })}
            >
              {AVATAR_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={!dirty}
            onClick={() => {
              save(draft);
              setSaved("Interviewer settings saved.");
            }}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              setSaved("Interviewer settings reset to the defaults.");
            }}
          >
            Reset to defaults
          </Button>
          {saved && !dirty && <span className="text-sm text-success">{saved}</span>}
        </div>
      </Card>
    </div>
  );
}
