import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Pencil } from "lucide-react";
import { useState } from "react";
import {
  Button,
  buttonVariants,
  Card,
  Input,
  Label,
  SectionTitle,
  Textarea,
} from "@/components/ui-kit";
import { useProject } from "@/lib/store";
import { allHypotheses, generateMockResearchPlan } from "@/lib/mock-service";

export const Route = createFileRoute("/projects/$projectId/")({
  component: Claims,
});

function Claims() {
  const { projectId } = Route.useParams();
  const { project, update } = useProject(projectId);
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState("");
  const [thesis, setThesis] = useState("");
  if (!project) return null;

  // Before a plan exists, show the claims the plan will be generated with.
  const claims = project.plan ? allHypotheses(project) : generateMockResearchPlan(project).hypotheses;

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle
          title="Claims to test"
          description={
            project.plan
              ? "Fixed by the plan. To change them, edit the thesis, then regenerate questions on Plan."
              : "Taken from the thesis: each line written as “Label: We believe …” becomes one claim."
          }
          action={
            <Link to="/projects/$projectId/plan" params={{ projectId }} className={buttonVariants({ size: "sm" })}>
              Next: plan interviews <ArrowRight />
            </Link>
          }
        />
        <Card className="divide-y text-sm">
          {claims.map((h, i) => (
            <div key={h.id} className="flex gap-3 px-5 py-3">
              <span className="font-mono text-xs leading-5 text-muted-foreground">H{i + 1}</span>
              <div>
                <p className="font-medium">{h.title}</p>
                <p className="text-muted-foreground">{h.description}</p>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <Card className="p-6">
        <SectionTitle
          title="Investment thesis"
          action={
            !editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCompany(project.company);
                  setThesis(project.thesis);
                  setEditing(true);
                }}
              >
                <Pencil /> Edit
              </Button>
            )
          }
        />
        {editing ? (
          <div className="space-y-4">
            <div>
              <Label>Target Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div>
              <Label>Investment Thesis</Label>
              <Textarea rows={16} value={thesis} onChange={(e) => setThesis(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  update((p) => ({ ...p, company: company.trim() || p.company, thesis }));
                  setEditing(false);
                }}
              >
                Save changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-line font-serif text-[15px] leading-relaxed text-foreground/90">
            {project.thesis || "No thesis provided."}
          </div>
        )}
      </Card>
    </div>
  );
}
