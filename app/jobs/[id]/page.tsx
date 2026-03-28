import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { JobActions } from "@/components/job-actions";
import { getJob } from "@/lib/server/jobs";

export default async function JobDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const progress = job.progressPercent ?? STATUS_PROGRESS[job.status] ?? 0;
  const isRunning = ["queued", "analyzing", "running_pipeline"].includes(job.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            {job.analysis?.title || job.projectName || job.paperUrl || job.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {job.currentStage || describeStatus(job.status)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              job.status === "completed"
                ? "success"
                : job.status === "failed"
                  ? "destructive"
                  : "outline"
            }
          >
            {job.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Pipeline Progress</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {/* Sub-page navigation */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/jobs/${id}/pipeline`}>
            Pipeline View
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/jobs/${id}/results`}>
            Results
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/jobs/${id}/logs`}>
            Logs
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      {/* Actions */}
      <JobActions job={job} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Paper Analysis */}
        {job.analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paper Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{job.analysis.summary}</p>
              {job.analysis.capabilities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Capabilities
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.analysis.capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {job.analysis.reported_results.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Reported Results
                  </p>
                  <div className="space-y-1">
                    {job.analysis.reported_results.slice(0, 5).map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded border border-border/50 px-3 py-1.5 text-xs"
                      >
                        <span className="text-muted-foreground">{r.metric}</span>
                        <span className="font-mono font-medium">{String(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Job Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <MetaRow label="Job ID" value={job.id} />
            <MetaRow label="Source" value={job.sourceType === "pdf" ? job.uploadedPdfName || "PDF" : job.paperUrl || "—"} />
            <MetaRow label="Repository" value={job.repositoryUrl || "Auto-detect"} />
            <MetaRow label="Provider" value={job.provider || "Pending"} />
            <MetaRow label="Model" value={job.model || "Pending"} />
            <MetaRow label="Workspace" value={job.workspacePath || "Pending"} />
            <MetaRow label="Created" value={new Date(job.createdAt).toLocaleString()} />
            <MetaRow label="Updated" value={new Date(job.updatedAt).toLocaleString()} />

            {job.implementability && (
              <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Feasibility
                  </span>
                  <Badge
                    variant={job.implementability.verdict === "implementable" ? "success" : "outline"}
                  >
                    {job.implementability.verdict}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{job.implementability.summary}</p>
              </div>
            )}

            {job.notes && (
              <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </span>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{job.notes}</p>
              </div>
            )}

            {job.error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {job.error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  );
}

function describeStatus(status: string) {
  const descriptions: Record<string, string> = {
    queued: "Waiting for the background worker to start.",
    analyzing: "Reading the paper and inferring repository.",
    needs_repo: "Analysis complete — waiting for a repository URL.",
    running_pipeline: "Pipeline is running.",
    paused: "Job is paused.",
    stopped: "Job was stopped.",
    not_implementable: "Flagged as out of scope.",
    completed: "Pipeline finished — workspace is ready.",
    failed: "The run ended with an error."
  };
  return descriptions[status] || "In progress.";
}

const STATUS_PROGRESS: Record<string, number> = {
  queued: 5,
  analyzing: 20,
  needs_repo: 35,
  running_pipeline: 50,
  paused: 50,
  stopped: 100,
  not_implementable: 100,
  completed: 100,
  failed: 100
};
