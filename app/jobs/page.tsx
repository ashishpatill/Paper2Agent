import Link from "next/link";
import { Loader2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listJobs } from "@/lib/server/jobs";
import { attachWorkspaceAssessment } from "@/lib/server/workspace-assessment";
import {
  workspaceAssessmentBadgeVariant,
  workspaceAssessmentLabel
} from "@/components/workspace-assessment-card";
import { LiveJobsRefresher } from "@/components/live-jobs-refresher";

const ACTIVE_STATUSES = new Set(["queued", "analyzing", "running_pipeline", "paused"]);

export default async function JobsListPage() {
  const jobs = await Promise.all((await listJobs()).map((job) => attachWorkspaceAssessment(job)));
  const hasActiveJobs = jobs.some((j) => ACTIVE_STATUSES.has(j.status));

  return (
    <div className="space-y-6">
      <LiveJobsRefresher hasActiveJobs={hasActiveJobs} />

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
        <div className="space-y-4">
          {jobs.map((job) => {
            const isActive = ACTIVE_STATUSES.has(job.status);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                <Card className="transition-colors hover:border-primary/30">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="truncate font-semibold leading-snug">
                          {job.analysis?.title || job.projectName || job.paperUrl || job.uploadedPdfName || job.id}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          {isActive && job.currentStage && (
                            <span className="flex items-center gap-1.5 text-foreground/70">
                              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                              {job.currentStage}
                            </span>
                          )}
                          {!isActive && job.error && (
                            <span className="truncate max-w-sm text-destructive/80 text-xs">{job.error}</span>
                          )}
                          {!isActive && !job.error && job.workspaceAssessment && (
                            <span>{job.workspaceAssessment.summary}</span>
                          )}
                          <span className="text-xs shrink-0">{formatRelativeTime(job.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-0.5">
                        {job.progressPercent != null && isActive && (
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
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
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
