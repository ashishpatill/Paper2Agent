import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCards } from "@/components/stats-cards";
import { listJobs } from "@/lib/server/jobs";
import { getSecretsSummary } from "@/lib/server/secrets";

export default async function DashboardPage() {
  const [jobs, settings] = await Promise.all([listJobs(), getSecretsSummary()]);

  const running = jobs.filter((j) => ["queued", "analyzing", "running_pipeline"].includes(j.status));
  const completed = jobs.filter((j) => j.status === "completed");
  const failed = jobs.filter((j) => j.status === "failed");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Paper2Agent Studio
        </h1>
        <p className="text-muted-foreground">
          Open-source paper implementation engine — turn any ML paper into validated, runnable agents.
        </p>
      </div>

      <StatsCards
        total={jobs.length}
        running={running.length}
        completed={completed.length}
        failed={failed.length}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Jobs</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jobs">
                View all
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No jobs yet. Create your first one to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 5).map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 transition-colors hover:bg-accent/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {job.analysis?.title || job.projectName || job.paperUrl || job.id}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.currentStage || formatStatus(job.status)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "success"
                          : job.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                      className="ml-3 shrink-0"
                    >
                      {formatStatus(job.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Start + Readiness */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Start</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    1
                  </span>
                  <span>
                    Configure provider keys or connect Claude Code CLI in{" "}
                    <Link href="/settings" className="font-medium text-primary hover:underline">
                      Settings
                    </Link>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    2
                  </span>
                  <span>Create a new job with a paper URL or PDF</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    3
                  </span>
                  <span>Watch the 16-step pipeline implement, execute, and validate</span>
                </li>
              </ol>
              <Button asChild className="w-full">
                <Link href="/new">
                  <Plus className="h-4 w-4" />
                  New Job
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Runtime Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ReadinessRow
                label="API Provider"
                ok={settings.hasGeminiKey || settings.hasOpenRouterKey}
                detail={
                  settings.hasGeminiKey
                    ? `Gemini (${settings.geminiModel})`
                    : settings.hasOpenRouterKey
                      ? `OpenRouter (${settings.openrouterModel})`
                      : "Not configured"
                }
              />
              <ReadinessRow label="Pipeline" ok detail="Paper2Agent shell workflow available" />
              <ReadinessRow label="Secure Storage" ok detail=".paper2agent/local/secrets.json" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReadinessRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? "success" : "outline"} className="shrink-0">
        {ok ? "Ready" : "Needed"}
      </Badge>
    </div>
  );
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}
