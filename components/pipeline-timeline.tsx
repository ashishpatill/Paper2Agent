"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, SkipForward, XCircle } from "lucide-react";

import type { JobRecord, StepStatus } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PIPELINE_STEP_DEFINITIONS } from "@/lib/pipeline-steps";

export function PipelineTimeline({ job: initialJob }: { job: JobRecord }) {
  const [job, setJob] = useState(initialJob);
  const isRunning = ["queued", "analyzing", "running_pipeline"].includes(job.status);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (res.ok) setJob(await res.json());
    }, 3000);
    return () => clearInterval(interval);
  }, [job.id, isRunning]);

  const steps = job.pipelineProgress?.steps;
  const currentStep = job.pipelineProgress?.currentStep;
  const totalSteps = job.pipelineProgress?.totalSteps ?? PIPELINE_STEP_DEFINITIONS.length;
  const completedCount = steps?.filter((s) => s.status === "completed").length ?? 0;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pipeline Steps</CardTitle>
          {steps && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {completedCount}/{totalSteps} steps
            </span>
          )}
        </div>
        {steps && <Progress value={progressPct} className="mt-2" />}
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {steps && steps.length > 0
            ? steps.map((step) => <StepRow key={step.stepNumber} step={step} isCurrent={step.stepNumber === currentStep} />)
            : PIPELINE_STEP_DEFINITIONS.map((s) => (
                <div
                  key={s.stepNumber}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground"
                >
                  <Circle className="h-4 w-4 shrink-0 opacity-40" />
                  <span className="w-10 shrink-0 tabular-nums text-xs">{s.stepNumber}</span>
                  <span>{s.name}</span>
                </div>
              ))}
        </div>

        {job.pipelineProgress?.stalledSince && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
            Pipeline appears stalled. {job.pipelineProgress.stallDiagnosis || "No new output detected."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepRow({ step, isCurrent }: { step: StepStatus; isCurrent: boolean }) {
  const Icon = STATUS_ICONS[step.status];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        isCurrent && "bg-primary/5 ring-1 ring-primary/20",
        step.status === "failed" && "bg-destructive/5"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          step.status === "completed" && "text-success",
          step.status === "running" && "animate-spin text-primary",
          step.status === "failed" && "text-destructive",
          step.status === "skipped" && "text-muted-foreground",
          step.status === "pending" && "text-muted-foreground/50"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("font-medium", step.status === "pending" && "text-muted-foreground")}>
            <span className="mr-2 tabular-nums text-xs text-muted-foreground">{step.stepNumber}</span>
            {step.name}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {step.durationSeconds != null && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {step.durationSeconds < 60
                  ? `${step.durationSeconds.toFixed(1)}s`
                  : `${Math.round(step.durationSeconds / 60)}m`}
              </span>
            )}
            {step.status !== "pending" && step.status !== "completed" && (
              <Badge
                variant={step.status === "failed" ? "destructive" : "outline"}
                className="text-[10px]"
              >
                {step.status}
              </Badge>
            )}
          </div>
        </div>
        {step.lastOutput && isCurrent && (
          <p className="mt-1 truncate text-xs text-muted-foreground">{step.lastOutput}</p>
        )}
        {step.error && (
          <p className="mt-1 text-xs text-destructive">{step.error}</p>
        )}
      </div>
    </div>
  );
}

const STATUS_ICONS = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  skipped: SkipForward,
  failed: XCircle
} as const;
