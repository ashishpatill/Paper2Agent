"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle, LoaderCircle, MessageSquare, Pause, Play, RefreshCcw, Square, Trash2 } from "lucide-react";

import type { JobRecord } from "@/lib/server/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JobActions({ job }: { job: JobRecord }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPause = ["analyzing", "running_pipeline"].includes(job.status) && Boolean(job.workerPid);
  const canResume = job.status === "paused";
  const canStop = ["queued", "analyzing", "running_pipeline", "paused"].includes(job.status);
  const canRetry = ["failed", "needs_repo", "completed", "stopped", "not_implementable"].includes(job.status);
  const canDelete = ["failed", "needs_repo", "completed", "stopped", "not_implementable"].includes(job.status);
  const canValidate = job.status === "completed" && Boolean(job.workspacePath);
  const canFeedback = ["running_pipeline", "paused"].includes(job.status);

  async function handleControl(controlAction: "pause" | "resume" | "stop") {
    setError(null);
    setAction(controlAction);
    const res = await fetch(`/api/jobs/${job.id}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: controlAction })
    });
    if (!res.ok) setError(await res.text());
    router.refresh();
  }

  async function handleRetry() {
    setError(null);
    setAction("retry");
    const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const newJob = (await res.json()) as JobRecord;
    router.push(`/jobs/${newJob.id}`);
  }

  async function handleDelete() {
    if (!confirm("Delete this job permanently? This cannot be undone.")) return;
    setError(null);
    setAction("delete");
    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    router.push("/jobs");
  }

  async function handleValidate() {
    setError(null);
    setAction("validate");
    const res = await fetch(`/api/jobs/${job.id}/validate`, { method: "POST" });
    if (!res.ok) setError(await res.text());
    router.refresh();
  }

  async function handleFeedback() {
    if (!feedbackMsg.trim()) return;
    setError(null);
    setAction("feedback");
    const res = await fetch(`/api/jobs/${job.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: feedbackMsg })
    });
    if (!res.ok) setError(await res.text());
    else {
      setFeedbackMsg("");
      setFeedbackOpen(false);
    }
    router.refresh();
  }

  function wrap(fn: () => Promise<void>) {
    return () => startTransition(() => { void fn(); });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canPause && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={wrap(() => handleControl("pause"))}>
            {isPending && action === "pause" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            Pause
          </Button>
        )}
        {canResume && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={wrap(() => handleControl("resume"))}>
            {isPending && action === "resume" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Resume
          </Button>
        )}
        {canStop && (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive/5"
            disabled={isPending}
            onClick={wrap(() => handleControl("stop"))}
          >
            {isPending && action === "stop" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            Stop
          </Button>
        )}
        {canRetry && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={wrap(handleRetry)}>
            {isPending && action === "retry" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Retry
          </Button>
        )}
        {canValidate && (
          <Button variant="outline" size="sm" disabled={isPending} onClick={wrap(handleValidate)}>
            {isPending && action === "validate" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Validate
          </Button>
        )}
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive/5"
            disabled={isPending}
            onClick={wrap(handleDelete)}
          >
            {isPending && action === "delete" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        )}
        {canFeedback && (
          <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(!feedbackOpen)}>
            <MessageSquare className="h-4 w-4" />
            Feedback
          </Button>
        )}
      </div>

      {feedbackOpen && (
        <div className="flex gap-2">
          <Input
            value={feedbackMsg}
            onChange={(e) => setFeedbackMsg(e.target.value)}
            placeholder="Send a hint or instruction to the pipeline..."
            onKeyDown={(e) => { if (e.key === "Enter") wrap(handleFeedback)(); }}
          />
          <Button size="sm" disabled={isPending || !feedbackMsg.trim()} onClick={wrap(handleFeedback)}>
            Send
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {job.validationReport && (
        <div className="rounded-lg border border-border/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Validation Report</span>
            <span className={job.validationReport.overall === "pass" ? "text-success" : "text-destructive"}>
              {job.validationReport.overall}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {job.validationReport.checks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{check.passed ? "PASS" : "FAIL"}</span>
                <span>{check.name}: {check.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
