import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listJobs } from "@/lib/server/jobs";
import { attachWorkspaceAssessment } from "@/lib/server/workspace-assessment";
import {
  workspaceAssessmentBadgeVariant,
  workspaceAssessmentLabel
} from "@/components/workspace-assessment-card";

export default async function JobsListPage() {
  const jobs = await Promise.all((await listJobs()).map((job) => attachWorkspaceAssessment(job)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            Jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button asChild>
          <Link href="/new">
            <Plus className="h-4 w-4" />
            New Job
          </Link>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No jobs yet.</p>
            <Button asChild className="mt-4">
              <Link href="/new">Create your first job</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="block">
              <Card className="transition-colors hover:border-primary/30">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="truncate text-sm font-semibold">
                        {job.analysis?.title || job.projectName || job.paperUrl || job.uploadedPdfName || job.id}
                      </p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {job.currentStage && <span>{job.currentStage}</span>}
                      {job.workspaceAssessment && <span>{job.workspaceAssessment.summary}</span>}
                      {job.repositoryUrl && (
                        <span className="truncate max-w-48">{job.repositoryUrl}</span>
                      )}
                      <span>{formatRelativeTime(job.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {job.progressPercent != null && !isTerminal(job.status) && (
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {job.progressPercent}%
                      </span>
                    )}
                    {job.workspaceAssessment ? (
                      <Badge variant={workspaceAssessmentBadgeVariant(job.workspaceAssessment.lifecycle)}>
                        {workspaceAssessmentLabel(job.workspaceAssessment.lifecycle)}
                      </Badge>
                    ) : null}
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function isTerminal(status: string) {
  return ["completed", "failed", "stopped", "not_implementable", "needs_repo"].includes(status);
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const s = Math.round(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
