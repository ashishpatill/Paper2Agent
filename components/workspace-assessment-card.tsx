import type { WorkspaceAssessment } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WorkspaceAssessmentCard({ assessment }: { assessment: WorkspaceAssessment }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Replication Readiness</CardTitle>
          <Badge variant={workspaceAssessmentBadgeVariant(assessment.lifecycle)}>
            {workspaceAssessmentLabel(assessment.lifecycle)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{assessment.summary}</p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Setup Evidence</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>
                Environment report: {assessment.setup.environmentReportFound ? "present" : "missing"}
              </p>
              <p>
                Tutorial scan: {assessment.setup.tutorialScanFound ? "present" : "missing"}
              </p>
              <p>
                Environment ready: {assessment.setup.environmentReady ? "yes" : "not yet proven"}
              </p>
              {assessment.setup.environmentName ? (
                <p>Environment name: {assessment.setup.environmentName}</p>
              ) : null}
              {assessment.setup.pythonVersion ? (
                <p>Python: {assessment.setup.pythonVersion}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tutorial Inventory</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>Candidates found: {assessment.setup.tutorialCandidates}</p>
              <p>Reusable examples: {assessment.setup.reusableTutorials}</p>
            </div>
          </div>
        </div>

        <AssessmentList title="Completed" items={assessment.completedMilestones} empty="No artifact-backed milestones yet." />
        <AssessmentList title="Remaining" items={assessment.remainingMilestones} empty="No major milestones remain." />
        <AssessmentList title="Blockers" items={assessment.blockers} empty="No explicit blockers detected from current artifacts." />
        <AssessmentList title="Requirements" items={assessment.requirements} empty="No explicit setup or dataset requirements were extracted yet." />
      </CardContent>
    </Card>
  );
}

function AssessmentList({
  title,
  items,
  empty
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <div key={item} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function workspaceAssessmentLabel(lifecycle: WorkspaceAssessment["lifecycle"]) {
  const labels: Record<WorkspaceAssessment["lifecycle"], string> = {
    paper_only: "paper only",
    repo_required: "repo required",
    workspace_prepared: "workspace only",
    setup_ready: "setup ready",
    tutorial_track_ready: "tutorial ready",
    implementation_in_progress: "implementation partial",
    results_ready: "results ready",
    validated_partial: "validated partial",
    validated_full: "validated full",
    run_failed: "run failed"
  };

  return labels[lifecycle];
}

export function workspaceAssessmentBadgeVariant(lifecycle: WorkspaceAssessment["lifecycle"]) {
  if (lifecycle === "validated_full") {
    return "success" as const;
  }
  if (lifecycle === "run_failed" || lifecycle === "repo_required") {
    return "destructive" as const;
  }
  return "outline" as const;
}
