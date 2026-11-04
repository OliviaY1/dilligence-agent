import {
  ArrowRight,
  Check,
  Loader2,
  UserMinus,
  UserPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { X } from "lucide-react";
import { SourceBadge } from "@/components/status";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Label,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/ui-kit";
import { NETWORK_EXPERTS } from "@/lib/mock-data";
import { generateMockResearchPlan, selectedExperts, uid } from "@/lib/mock-service";
import { planWithInitialQuestions } from "@/lib/initial-questions";
import type { DiligenceProject, Expert } from "@/lib/types";

type Draft = { id?: string; name: string; phone: string; description: string };

/** Step one of the plan: choose who to interview, then generate their questions. */
export function PeoplePicker({
  project,
  update,
  onDone,
}: {
  project: DiligenceProject;
  update: (fn: (p: DiligenceProject) => DiligenceProject) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Expert | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All");
  const [generating, setGenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const toggleNetwork = (id: string) =>
    update((p) => {
      const net = p.networks.find((n) => n.id === id)!;
      const connected = !net.connected;
      const networkExperts = NETWORK_EXPERTS.filter((e) => e.source === id);
      return {
        ...p,
        networks: p.networks.map((n) => (n.id === id ? { ...n, connected } : n)),
        experts: connected
          ? [...p.experts, ...networkExperts.filter((e) => !p.experts.some((x) => x.id === e.id))]
          : p.experts.filter((e) => e.source !== id),
      };
    });

  const saveDraft = () => {
    if (!draft) return;
    update((p) => ({
      ...p,
      experts: draft.id
        ? p.experts.map((e) =>
            e.id === draft.id
              ? { ...e, name: draft.name, phone: draft.phone, description: draft.description }
              : e,
          )
        : [
            ...p.experts,
            {
              id: uid("e"),
              name: draft.name,
              phone: draft.phone,
              description: draft.description,
              title: "Custom contact",
              source: "Custom",
            },
          ],
    }));
    setDraft(null);
  };

  // The plan's structure (hypotheses, who to call) comes from the template; the
  // opening questions for each person are written by Claude from the thesis and
  // their description (template questions stay if Claude is unreachable).
  const generate = async () => {
    setGenerating(true);
    const plan = await planWithInitialQuestions(project, generateMockResearchPlan(project));
    update((p) => ({ ...p, plan, interviews: [] }));
    setGenerating(false);
    onDone();
  };

  const filtered = project.experts.filter(
    (e) =>
      (source === "All" || e.source === source) &&
      (e.name + e.description + e.title).toLowerCase().includes(query.toLowerCase()),
  );
  const chosen = selectedExperts(project);
  const isChosen = (id: string) => chosen.some((e) => e.id === id);
  const toggleSelect = (id: string) =>
    update((p) => {
      const sel = p.selectedExpertIds ?? [];
      return {
        ...p,
        selectedExpertIds: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id],
      };
    });

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle
          title="Who to interview"
          description="Add your own contacts, or pick people from the directory below."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDraft({ name: "", phone: "", description: "" })}
            >
              <Plus /> Add Expert
            </Button>
          }
        />
        {chosen.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No experts selected yet"
            description="Add your own contacts, or select experts from the directory below."
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {chosen.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-2.5 rounded-md border bg-card px-3 py-2.5 text-sm"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.title}</p>
                  <div className="mt-1.5">
                    <SourceBadge source={e.source} />
                  </div>
                </div>
                {e.source !== "Custom" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${e.name}`}
                    onClick={() => toggleSelect(e.id)}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          title="Directory"
          description="Connect an expert network to add its experts here."
          action={
            <div className="flex flex-wrap gap-1.5">
              {project.networks.map((n) => (
                <Button
                  key={n.id}
                  size="sm"
                  variant={n.connected ? "secondary" : "ghost"}
                  aria-pressed={n.connected}
                  onClick={() => toggleNetwork(n.id)}
                >
                  {n.connected && <Check />} {n.name}
                </Button>
              ))}
            </div>
          }
        />
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or experience"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            {["All", "GLG", "AlphaSights", "Third Bridge", "Custom"].map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All sources" : s}
              </option>
            ))}
          </Select>
        </div>
        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No experts match. Connect a network or add a custom expert.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Description</th>
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 font-medium">Phone</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="flex items-center gap-1.5 font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.title}</p>
                    </td>
                    <td className="max-w-md px-5 py-3 text-muted-foreground">{e.description}</td>
                    <td className="px-5 py-3">
                      <SourceBadge source={e.source} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">{e.phone}</td>
                    <td className="px-5 py-2 text-right">
                      {e.source === "Custom" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() =>
                              setDraft({
                                id: e.id,
                                name: e.name,
                                phone: e.phone,
                                description: e.description,
                              })
                            }
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => setToDelete(e)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ) : isChosen(e.id) ? (
                        <Button variant="secondary" size="sm" onClick={() => toggleSelect(e.id)}>
                          <UserMinus /> Remove
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => toggleSelect(e.id)}>
                          <UserPlus /> Select
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <div className="flex items-center justify-between rounded-lg border bg-card p-5">
        <div>
          <p className="font-medium">Ready?</p>
          <p className="text-sm text-muted-foreground">
            Claude writes opening questions for each person, based on the claims.
          </p>
        </div>
        <Button
          size="lg"
          disabled={generating || chosen.length === 0}
          onClick={() => (project.plan ? setConfirmRegen(true) : generate())}
        >
          {project.plan ? "Regenerate questions" : "Generate questions"} <ArrowRight />
        </Button>
      </div>

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit expert" : "Add expert"}
        description="Custom contacts are only visible within this project."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button disabled={!draft?.name.trim()} onClick={saveDraft}>
              Save expert
            </Button>
          </>
        }
      >
        {draft && (
          <>
            <div>
              <Label>Name</Label>
              <Input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+1 (555) 010-0000"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Experience, relationship to the target, and why they are relevant"
              />
            </div>
          </>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() =>
          toDelete &&
          update((p) => ({ ...p, experts: p.experts.filter((e) => e.id !== toDelete.id) }))
        }
        title={`Delete ${toDelete?.name}?`}
        description="This contact will be removed from the project."
      />
      <ConfirmDialog
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        onConfirm={generate}
        title="Regenerate research plan?"
        description="The current plan, its edits and any interviews will be replaced."
        confirmLabel="Regenerate"
      />

      {generating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
          <Card className="w-96 p-6 text-center shadow-lg">
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <p className="mt-4 font-medium">Generating research plan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Claude is writing opening questions for {chosen.length} selected{" "}
              {chosen.length === 1 ? "person" : "people"} from the investment thesis…
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
