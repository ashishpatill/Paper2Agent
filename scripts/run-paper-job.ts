import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureAppDirectories, uploadsRoot } from "../lib/server/fs";
import { getJob, updateJob } from "../lib/server/jobs";
import { analyzePaper, chooseProvider } from "../lib/server/llm";
import { extractPaperFromPdf, extractPaperFromUrl } from "../lib/server/paper-intake";
import {
  diagnosePipelineFailure,
  getPipelinePaths,
  runPipeline,
  type PipelineProgressEvent
} from "../lib/server/pipeline";
import { assessRepositoryImplementability } from "../lib/server/repository-feasibility";
import { loadSecrets } from "../lib/server/secrets";
import { buildSkillGraph } from "../lib/skills/graph";
import type { JobRecord } from "../lib/server/types";

const HEARTBEAT_INTERVAL_MS = 15_000;
const STOPPED_SENTINEL = "__JOB_STOPPED__";

type JobProgressPatch = Partial<JobRecord>;

function isStoppedError(error: unknown) {
  return error instanceof Error && error.message === STOPPED_SENTINEL;
}

async function ensureJobCanContinue(jobId: string) {
  const current = await getJob(jobId);
  if (!current) {
    throw new Error(`Job ${jobId} was not found.`);
  }

  if (current.status === "stopped") {
    throw new Error(STOPPED_SENTINEL);
  }

  return current;
}

async function patchJob(jobId: string, patch: JobProgressPatch, options?: { markProgress?: boolean }) {
  const now = new Date().toISOString();

  return updateJob(jobId, (current) => {
    if (current.status === "stopped") {
      return current;
    }

    if (current.status === "paused" && patch.status === "running_pipeline") {
      return {
        ...current,
        lastHeartbeatAt: now
      };
    }

    return {
      ...current,
      ...patch,
      lastHeartbeatAt: now,
      lastProgressAt:
        options?.markProgress || patch.currentStage || patch.lastLogLine || patch.progressPercent !== undefined
          ? now
          : current.lastProgressAt
    };
  });
}

function startHeartbeat(jobId: string) {
  return setInterval(() => {
    void updateJob(jobId, (current) => {
      if (!["queued", "analyzing", "running_pipeline"].includes(current.status)) {
        return current;
      }

      return {
        ...current,
        lastHeartbeatAt: new Date().toISOString()
      };
    }).catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);
}

function progressFromPipelineEvent(event: PipelineProgressEvent) {
  if (!event.stepNumber || !event.totalSteps) {
    return 55;
  }

  const completedSteps = event.phase === "complete" ? event.stepNumber : event.stepNumber - 0.45;
  const pipelineShare = Math.max(0, Math.min(completedSteps / event.totalSteps, 1));
  return Math.round(50 + pipelineShare * 45);
}

async function handlePipelineProgress(jobId: string, pipelinePaths: ReturnType<typeof getPipelinePaths>, event: PipelineProgressEvent) {
  const stage =
    event.stepNumber && event.stepLabel
      ? `Step ${event.stepNumber}/${event.totalSteps}: ${event.stepLabel}`
      : "Paper2Agent is running.";

  await patchJob(
    jobId,
    {
      status: "running_pipeline",
      workspacePath: pipelinePaths.workspacePath,
      logPath: pipelinePaths.logPath,
      currentStage: stage,
      lastLogLine: event.line,
      progressPercent: progressFromPipelineEvent(event)
    },
    { markProgress: true }
  );
}

async function main() {
  const jobId = process.argv[2];

  if (!jobId) {
    throw new Error("A job id is required.");
  }

  await ensureAppDirectories();
  const heartbeat = startHeartbeat(jobId);

  try {
    const job = await ensureJobCanContinue(jobId);
    const secrets = await loadSecrets();
    const chosen = chooseProvider(secrets);

    if (!chosen) {
      await updateJob(jobId, (current) => ({
        ...current,
        status: "failed",
        workerPid: undefined,
        resumeStatus: undefined,
        currentStage: "Model configuration missing.",
        progressPercent: 100,
        error: "No Gemini or OpenRouter API key is configured."
      }));
      return;
    }

    await patchJob(
      jobId,
      {
        status: "analyzing",
        provider: chosen.provider,
        model: chosen.model,
        currentStage: "Reading the paper and preparing analysis.",
        progressPercent: 22,
        error: undefined
      },
      { markProgress: true }
    );

    await ensureJobCanContinue(jobId);

    const source =
      job.sourceType === "pdf" && job.uploadedPdfName
        ? await extractPaperFromPdf(path.join(uploadsRoot, jobId, job.uploadedPdfName))
        : await extractPaperFromUrl(job.paperUrl || "");

    await patchJob(
      jobId,
      {
        currentStage: `Analyzing the paper with ${chosen.provider}.`,
        progressPercent: 34
      },
      { markProgress: true }
    );

    await ensureJobCanContinue(jobId);

    const analysis = await analyzePaper({
      provider: chosen.provider,
      model: chosen.model,
      apiKey:
        chosen.provider === "gemini"
          ? secrets.geminiApiKey || ""
          : secrets.openrouterApiKey || "",
      sourceText: source.rawText,
      titleHint: source.titleHint,
      repositoryUrlHint: job.repositoryUrl || source.repositoryUrlHint,
      sourceUrl: job.paperUrl,
      notes: job.notes
    });

    const enrichedAnalysis = {
      ...analysis,
      skillGraph: buildSkillGraph({
        analysis,
        hasRepositoryUrl: Boolean(job.repositoryUrl || analysis.repositoryUrl || source.repositoryUrlHint)
      })
    };

    const analysisDir = path.join(process.cwd(), ".paper2agent", "jobs", jobId);
    await mkdir(analysisDir, { recursive: true });

    const analysisPath = path.join(analysisDir, "paper-analysis.json");
    const paperTextPath = path.join(analysisDir, "paper-text.txt");

    await writeFile(analysisPath, JSON.stringify(enrichedAnalysis, null, 2), "utf8");
    await writeFile(paperTextPath, source.rawText, "utf8");

    await patchJob(
      jobId,
      {
        analysis: enrichedAnalysis,
        analysisPath,
        paperTextPath,
        currentStage: "Paper analysis complete.",
        progressPercent: 42
      },
      { markProgress: true }
    );

    const repositoryUrl = currentRepoUrl(
      job.repositoryUrl,
      enrichedAnalysis.repositoryUrl,
      source.repositoryUrlHint
    );

    if (!repositoryUrl) {
      await updateJob(jobId, (current) => ({
        ...current,
        status: "needs_repo",
        workerPid: undefined,
        resumeStatus: undefined,
        repositoryUrl: undefined,
        currentStage: "A repository could not be confidently identified from the paper.",
        progressPercent: 68
      }));
      return;
    }

    await patchJob(
      jobId,
      {
        repositoryUrl,
        currentStage: "Checking whether the repository is feasible to implement locally.",
        progressPercent: 48
      },
      { markProgress: true }
    );

    await ensureJobCanContinue(jobId);

    const implementability = await assessRepositoryImplementability({
      repositoryUrl,
      analysis: enrichedAnalysis,
      notes: job.notes
    });

    if (implementability.verdict === "blocked") {
      await updateJob(jobId, (current) => ({
        ...current,
        status: "not_implementable",
        workerPid: undefined,
        resumeStatus: undefined,
        repositoryUrl,
        implementability,
        currentStage: "Stopped by the local feasibility preflight.",
        progressPercent: 70,
        error: implementability.summary
      }));
      return;
    }

    const pipelinePaths = getPipelinePaths({
      jobId,
      projectSlug: job.projectName || enrichedAnalysis.projectSlug || jobId
    });

    await patchJob(
      jobId,
      {
        status: "running_pipeline",
        repositoryUrl,
        implementability,
        workspacePath: pipelinePaths.workspacePath,
        logPath: pipelinePaths.logPath,
        currentStage:
          implementability.verdict === "risky"
            ? "Pipeline starting with high-risk local feasibility warnings."
            : "Launching the Paper2Agent shell pipeline.",
        lastLogLine: "Paper2Agent.sh is starting.",
        progressPercent: 50
      },
      { markProgress: true }
    );

    let pipeline;
    try {
      pipeline = await runPipeline({
        jobId,
        repositoryUrl,
        projectSlug: job.projectName || enrichedAnalysis.projectSlug || jobId,
        paperUrl: job.paperUrl,
        paperTitle: enrichedAnalysis.title,
        notes: job.notes,
        onProgress: async (event) => {
          await handlePipelineProgress(jobId, pipelinePaths, event);
        }
      });
    } catch (error) {
      const current = await getJob(jobId);
      if (current?.status === "stopped") {
        return;
      }

      const diagnosis = await diagnosePipelineFailure({
        workspacePath: pipelinePaths.workspacePath,
        logPath: pipelinePaths.logPath
      }).catch(() => undefined);

      await updateJob(jobId, (active) => ({
        ...active,
        status: "failed",
        workerPid: undefined,
        resumeStatus: undefined,
        repositoryUrl,
        workspacePath: pipelinePaths.workspacePath,
        logPath: pipelinePaths.logPath,
        currentStage: "The Paper2Agent pipeline failed.",
        progressPercent: 100,
        error:
          diagnosis ||
          (error instanceof Error ? error.message : "Paper2Agent pipeline failed unexpectedly.")
      }));
      return;
    }

    const latest = await getJob(jobId);
    if (latest?.status === "stopped") {
      return;
    }

    await updateJob(jobId, (current) => ({
      ...current,
      status: "completed",
      workerPid: undefined,
      resumeStatus: undefined,
      logPath: pipeline.logPath,
      workspacePath: pipeline.workspacePath,
      repositoryUrl,
      currentStage: "The workspace is ready.",
      progressPercent: 100
    }));
  } finally {
    clearInterval(heartbeat);
  }
}

function currentRepoUrl(...candidates: Array<string | undefined>) {
  return candidates.find((value) => Boolean(value && value.startsWith("http")));
}

main().catch(async (error) => {
  const jobId = process.argv[2];

  if (jobId && !isStoppedError(error)) {
    const current = await getJob(jobId).catch(() => null);
    if (current && current.status !== "stopped") {
      await updateJob(jobId, (active) => ({
        ...active,
        status: "failed",
        workerPid: undefined,
        resumeStatus: undefined,
        currentStage: "The background worker crashed.",
        progressPercent: 100,
        error: error instanceof Error ? error.message : "Unexpected error"
      })).catch(() => undefined);
    }
  }

  if (!isStoppedError(error)) {
    console.error(error);
    process.exit(1);
  }
});
