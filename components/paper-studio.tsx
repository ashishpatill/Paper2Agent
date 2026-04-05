"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Download,
  FileUp,
  KeyRound,
  Link2,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  Sparkles,
  Square
} from "lucide-react";

import type { JobRecord, SecretsSummary, SkillGraph } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkillGraphPanel } from "@/components/skill-graph-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const STATUS_PROGRESS: Record<JobRecord["status"], number> = {
  queued: 12,
  analyzing: 42,
  needs_repo: 68,
  running_pipeline: 84,
  paused: 84,
  stopped: 100,
  not_implementable: 100,
  completed: 100,
  failed: 100
};

function formatStatus(status: JobRecord["status"]) {
  return status.replace(/_/g, " ");
}

export function PaperStudio({
  initialJobs,
  initialSettings,
  defaultSkillGraph
}: {
  initialJobs: JobRecord[];
  initialSettings: SecretsSummary;
  defaultSkillGraph: SkillGraph;
}) {
  const latestJob = initialJobs[0] ?? null;
  const [activeTab, setActiveTab] = useState<"url" | "pdf">("url");
  const [jobs, setJobs] = useState(initialJobs);
  const [settings, setSettings] = useState(initialSettings);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialJobs[0]?.id ?? null);
  const [paperUrl, setPaperUrl] = useState(latestJob?.paperUrl ?? "");
  const [projectName, setProjectName] = useState(latestJob?.projectName ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(latestJob?.repositoryUrl ?? "");
  const [notes, setNotes] = useState(latestJob?.notes ?? "");
  const [isSubmitting, startSubmitting] = useTransition();
  const [isSavingSettings, startSavingSettings] = useTransition();
  const [isRetrying, startRetrying] = useTransition();
  const [isControlling, startControlling] = useTransition();
  const [controlAction, setControlAction] = useState<"pause" | "resume" | "stop" | null>(null);
  const [openSettings, setOpenSettings] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === jobId) ?? jobs[0] ?? null,
    [jobId, jobs]
  );
  const activeJobProgress = activeJob ? getJobProgress(activeJob) : 0;
  const activeJobStalled = activeJob ? isJobStalled(activeJob) : false;

  useEffect(() => {
    if (!activeJob || isTerminalStatus(activeJob.status)) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/${activeJob.id}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const nextJob = (await response.json()) as JobRecord;
      setJobs((current) => [nextJob, ...current.filter((job) => job.id !== nextJob.id)]);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeJob]);

  async function handleSubmit(formData: FormData) {
    setFormError(null);
    if (activeTab === "pdf" && !selectedFile) {
      setFormError("Choose a PDF file before creating the job.");
      return;
    }

    if (selectedFile) {
      formData.set("paperPdf", selectedFile);
    }

    const response = await fetch("/api/jobs", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const message = await response.text();
      setFormError(message);
      return;
    }

    const job = (await response.json()) as JobRecord;
    setJobId(job.id);
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    setSelectedFile(null);
  }

  async function handleSaveSettings(formData: FormData) {
    setSettingsError(null);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        geminiApiKey: formData.get("geminiApiKey"),
        openrouterApiKey: formData.get("openrouterApiKey"),
        geminiModel: formData.get("geminiModel"),
        openrouterModel: formData.get("openrouterModel"),
        preferredProvider: formData.get("preferredProvider")
      })
    });

    if (!response.ok) {
      const message = await response.text();
      setSettingsError(message);
      return;
    }

    const nextSettings = (await response.json()) as SecretsSummary;
    setSettings(nextSettings);
    setOpenSettings(false);
  }

  async function handleRetry(sourceJobId: string) {
    setFormError(null);

    const response = await fetch(`/api/jobs/${sourceJobId}/retry`, {
      method: "POST"
    });

    if (!response.ok) {
      const message = await response.text();
      setFormError(message);
      return;
    }

    const job = (await response.json()) as JobRecord;
    setJobId(job.id);
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
  }

  async function handleControlJob(job: JobRecord, action: "pause" | "resume" | "stop") {
    setFormError(null);
    setControlAction(action);

    const response = await fetch(`/api/jobs/${job.id}/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      const message = await response.text();
      setFormError(message);
      setControlAction(null);
      return;
    }

    const nextJob = (await response.json()) as JobRecord;
    setJobId(nextJob.id);
    setJobs((current) => [nextJob, ...current.filter((item) => item.id !== nextJob.id)]);
    setControlAction(null);
  }

  async function handleExport(jobId: string, format: "csv" | "markdown") {
    setFormError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/export?format=${format}`);
      if (!response.ok) {
        setFormError(await response.text());
        return;
      }

      // Extract filename from Content-Disposition header
      const disposition = response.headers.get("Content-Disposition");
      let filename = `job-export.${format === "csv" ? "csv" : "md"}`;
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Export failed");
    }
  }

  function loadJobIntoForm(job: JobRecord) {
    setActiveTab(job.sourceType);
    setPaperUrl(job.paperUrl || "");
    setProjectName(job.projectName || "");
    setRepositoryUrl(job.repositoryUrl || "");
    setNotes(job.notes || "");
    setSelectedFile(null);
    setFormError(null);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden border-primary/15">
          <CardContent className="relative p-8 sm:p-10">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(197,120,53,0.09),transparent_40%,rgba(109,163,124,0.12))]" />
            <div className="relative flex flex-col gap-8">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Paper2Agent Studio</Badge>
                <Badge variant="outline">Next.js + TypeScript</Badge>
                <Badge variant="outline">Codex + Claude Code ready</Badge>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">
                  Turn a paper link or PDF into a runnable agent workspace.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                  Paste a paper URL, drop a PDF, store your provider keys locally, and let the
                  existing Paper2Agent pipeline spin up a workspace when a code repository is
                  discoverable.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Dialog open={openSettings} onOpenChange={setOpenSettings}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="lg">
                      <KeyRound className="h-4 w-4" />
                      Provider keys
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Local model settings</DialogTitle>
                      <DialogDescription>
                        Keys are stored server-side in a gitignored local file and never sent back
                        to the client after save.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      className="mt-6 space-y-5"
                      action={(formData) =>
                        startSavingSettings(() => {
                          void handleSaveSettings(formData);
                        })
                      }
                    >
                      {settingsError ? (
                        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                          {settingsError}
                        </p>
                      ) : null}
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="geminiApiKey">Gemini API key</Label>
                          <Input
                            id="geminiApiKey"
                            name="geminiApiKey"
                            type="password"
                            placeholder={settings.hasGeminiKey ? "Saved locally" : "AIza..."}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="openrouterApiKey">OpenRouter API key</Label>
                          <Input
                            id="openrouterApiKey"
                            name="openrouterApiKey"
                            type="password"
                            placeholder={
                              settings.hasOpenRouterKey ? "Saved locally" : "sk-or-v1-..."
                            }
                          />
                        </div>
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="geminiModel">Gemini model</Label>
                          <Input
                            id="geminiModel"
                            name="geminiModel"
                            defaultValue={settings.geminiModel}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="openrouterModel">OpenRouter model</Label>
                          <Input
                            id="openrouterModel"
                            name="openrouterModel"
                            defaultValue={settings.openrouterModel}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Preferred provider</Label>
                        <Select defaultValue={settings.preferredProvider} name="preferredProvider">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gemini">Gemini</SelectItem>
                            <SelectItem value="openrouter">OpenRouter</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button disabled={isSavingSettings} type="submit" className="w-full">
                        {isSavingSettings ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Save local settings
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button asChild size="lg">
                  <a href="#create-agent">
                    Open studio
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime readiness</CardTitle>
            <CardDescription>
              These checks reflect the server-only settings available to the app right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <StatusRow
                label="Gemini key"
                ok={settings.hasGeminiKey}
                detail={settings.hasGeminiKey ? settings.geminiModel : "Not configured"}
              />
              <StatusRow
                label="OpenRouter key"
                ok={settings.hasOpenRouterKey}
                detail={settings.hasOpenRouterKey ? settings.openrouterModel : "Not configured"}
              />
              <StatusRow label="Paper pipeline" ok detail="Paper2Agent shell workflow available" />
              <StatusRow label="Secure storage" ok detail=".paper2agent/local/secrets.json" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="create-agent" className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create an agent</CardTitle>
            <CardDescription>
              Submit a paper URL or upload a PDF. You can optionally override the repository URL if
              you already know it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-6"
              action={(formData) =>
                startSubmitting(() => {
                  void handleSubmit(formData);
                })
              }
            >
              <input type="hidden" name="sourceType" value={activeTab} />
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "url" | "pdf")}>
                <TabsList>
                  <TabsTrigger value="url">
                    <Link2 className="mr-2 h-4 w-4" />
                    Paper URL
                  </TabsTrigger>
                  <TabsTrigger value="pdf">
                    <FileUp className="mr-2 h-4 w-4" />
                    PDF upload
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="paperUrl">Paper URL</Label>
                    <Input
                      id="paperUrl"
                      name="paperUrl"
                      value={paperUrl}
                      onChange={(event) => setPaperUrl(event.target.value)}
                      placeholder="https://arxiv.org/abs/..."
                      required={activeTab === "url"}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="pdf" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="paperPdf">Paper PDF</Label>
                    <Input
                      id="paperPdf"
                      name="paperPdf"
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                      required={activeTab === "pdf"}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project name</Label>
                  <Input
                    id="projectName"
                    name="projectName"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="alphagenome-agent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repositoryUrl">Repository URL override</Label>
                  <Input
                    id="repositoryUrl"
                    name="repositoryUrl"
                    value={repositoryUrl}
                    onChange={(event) => setRepositoryUrl(event.target.value)}
                    placeholder="https://github.com/org/repo"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes for the intake agent</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional guidance, for example preferred tutorials or benchmark extraction."
                />
              </div>

              <Button disabled={isSubmitting} type="submit" size="lg" className="w-full">
                {isSubmitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                Create agent job
              </Button>
              {formError ? (
                <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job tracker</CardTitle>
            <CardDescription>
              Background jobs analyze the paper first, then trigger the existing Paper2Agent shell
              pipeline if a repository can be found.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {activeJob ? (
              <div className="space-y-5 rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Active job</p>
                    <h3 className="text-xl font-semibold">
                      {activeJob.analysis?.title || activeJob.projectName || activeJob.paperUrl || activeJob.uploadedPdfName}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {activeJobStalled ? <Badge variant="outline">stalled</Badge> : null}
                    <Badge variant={activeJob.status === "completed" ? "success" : "default"}>
                      {formatStatus(activeJob.status)}
                    </Badge>
                  </div>
                </div>
                <Progress value={activeJobProgress} />
                <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Current stage
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {activeJob.currentStage || describeJobState(activeJob)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeJob.lastLogLine || "Waiting for the next pipeline event."}
                  </p>
                </div>
                {activeJobStalled ? (
                  <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">The pipeline looks stalled.</p>
                        <p className="text-xs text-amber-900/80">
                          No new pipeline output for {formatElapsed(activeJob.lastProgressAt || activeJob.updatedAt)}.
                          You can pause, resume, or stop the job from here.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {activeJob.analysis ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">{activeJob.analysis.summary}</p>
                    <div className="flex flex-wrap gap-2">
                      {activeJob.analysis.capabilities.slice(0, 4).map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                  <InfoLine label="Provider" value={activeJob.provider || "pending"} />
                  <InfoLine label="Model" value={activeJob.model || "pending"} />
                  <InfoLine label="Repository" value={activeJob.repositoryUrl || "detecting"} />
                  <InfoLine label="Workspace" value={activeJob.workspacePath || "pending"} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {describeJobState(activeJob)}
                    {" "}
                    Last update {formatRelativeTime(activeJob.updatedAt)}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadJobIntoForm(activeJob)}
                    >
                      Load Into Form
                    </Button>
                    {activeJob.status === "completed" && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleExport(activeJob.id, "markdown")}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Export Report
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleExport(activeJob.id, "csv")}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Export CSV
                        </Button>
                      </>
                    )}
                    {canPauseJob(activeJob) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isControlling}
                        onClick={() =>
                          startControlling(() => {
                            void handleControlJob(activeJob, "pause");
                          })
                        }
                      >
                        {isControlling && controlAction === "pause" ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                        Pause
                      </Button>
                    ) : null}
                    {activeJob.status === "paused" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isControlling}
                        onClick={() =>
                          startControlling(() => {
                            void handleControlJob(activeJob, "resume");
                          })
                        }
                      >
                        {isControlling && controlAction === "resume" ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Resume
                      </Button>
                    ) : null}
                    {canStopJob(activeJob) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/5"
                        disabled={isControlling}
                        onClick={() =>
                          startControlling(() => {
                            void handleControlJob(activeJob, "stop");
                          })
                        }
                      >
                        {isControlling && controlAction === "stop" ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                        Stop
                      </Button>
                    ) : null}
                    {canRetryJob(activeJob.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isRetrying}
                        onClick={() =>
                          startRetrying(() => {
                            void handleRetry(activeJob.id);
                          })
                        }
                      >
                        {isRetrying ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-4 w-4" />
                        )}
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
                {activeJob.implementability ? (
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Local feasibility
                      </p>
                      <Badge
                        variant={
                          activeJob.implementability.verdict === "implementable" ? "success" : "outline"
                        }
                      >
                        {activeJob.implementability.verdict}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground">{activeJob.implementability.summary}</p>
                    {activeJob.implementability.evidence.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Signals: {activeJob.implementability.evidence.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <JobField
                    label="Paper URL"
                    value={activeJob.paperUrl || (activeJob.sourceType === "pdf" ? "Uploaded PDF job" : "Not provided")}
                  />
                  <JobField label="Project name" value={activeJob.projectName || "Not set"} />
                  <JobField label="Repository override" value={activeJob.repositoryUrl || "Auto-detect"} />
                  <JobField label="Source" value={activeJob.sourceType === "pdf" ? activeJob.uploadedPdfName || "PDF upload" : "Paper URL"} />
                </div>
                <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Notes / Instructions
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {activeJob.notes || "No intake notes were provided for this job."}
                  </p>
                </div>
                {activeJob.error ? (
                  <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {activeJob.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
                Your first job will appear here as soon as you submit a paper.
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Recent jobs
                </h4>
              </div>
              <div className="grid gap-3">
                {jobs.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                    No jobs yet.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setJobId(job.id)}
                      className="rounded-[1.5rem] border border-border/70 bg-card px-4 py-4 text-left transition hover:border-primary/30 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {job.analysis?.title ||
                              job.projectName ||
                              job.paperUrl ||
                              job.uploadedPdfName ||
                              job.id}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {job.paperUrl || job.uploadedPdfName || "Awaiting analysis"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {job.currentStage ||
                              job.projectName ||
                              job.repositoryUrl ||
                              job.model ||
                              "No project details yet"}
                          </p>
                        </div> 
                        <Badge variant={job.status === "completed" ? "success" : "outline"}>
                          {formatStatus(job.status)}
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <SkillGraphPanel
        graph={activeJob?.analysis?.skillGraph || defaultSkillGraph}
        title={activeJob?.analysis?.skillGraph ? "Recommended skill graph for this paper" : "Base Paper2Agent skill graph"}
        description={
          activeJob?.analysis?.skillGraph
            ? "This graph shows which specialist capabilities are core, recommended, or optional for the active job."
            : "These skills explain how the product breaks a paper-to-agent workflow into reusable capabilities."
        }
      />
    </div>
  );
}

function StatusRow({
  label,
  ok,
  detail
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={ok ? "success" : "outline"}>{ok ? "Ready" : "Needed"}</Badge>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-border/70 bg-background/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="truncate font-medium text-foreground">{value}</p>
    </div>
  );
}

function JobField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-border/70 bg-background/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function getJobProgress(job: JobRecord) {
  return job.progressPercent ?? STATUS_PROGRESS[job.status];
}

function isTerminalStatus(status: JobRecord["status"]) {
  return ["completed", "failed", "needs_repo", "stopped", "not_implementable"].includes(status);
}

function canRetryJob(status: JobRecord["status"]) {
  return ["failed", "needs_repo", "completed", "stopped", "not_implementable"].includes(status);
}

function canPauseJob(job: JobRecord) {
  return ["analyzing", "running_pipeline"].includes(job.status) && Boolean(job.workerPid);
}

function canStopJob(job: JobRecord) {
  return ["queued", "analyzing", "running_pipeline", "paused"].includes(job.status);
}

function isJobStalled(job: JobRecord) {
  if (job.status !== "running_pipeline" || !job.lastProgressAt) {
    return false;
  }

  const lastProgressAt = new Date(job.lastProgressAt).getTime();
  return Number.isFinite(lastProgressAt) && Date.now() - lastProgressAt > 2 * 60_000;
}

function describeJobState(job: JobRecord) {
  switch (job.status) {
    case "queued":
      return "The job is waiting for the background worker to start.";
    case "analyzing":
      return "The app is reading the paper and asking the configured model to summarize it and infer a repository.";
    case "needs_repo":
      return "Paper analysis finished, but the pipeline cannot start until a repository URL is available.";
    case "running_pipeline":
      return "Paper2Agent.sh is now cloning the repo, creating the workspace, and running the Claude CLI pipeline. This can take a few minutes.";
    case "paused":
      return "The job is paused. Resume it to continue from the current pipeline state.";
    case "stopped":
      return "The job was stopped before the workspace completed.";
    case "not_implementable":
      return "The repo was flagged as out of scope for local implementation before the pipeline started.";
    case "completed":
      return "The Paper2Agent pipeline finished and the workspace is ready.";
    case "failed":
      return "The latest run ended with an error.";
    default:
      return "The job is in progress.";
  }
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "just now";
  }

  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 5) {
    return "just now";
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatElapsed(value: string) {
  return formatRelativeTime(value).replace(/\s+ago$/, "");
}
