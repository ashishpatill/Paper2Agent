import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { loadWorkspaceArtifacts } from "./results";
import { parseEnvironmentManagerReport } from "./setup-readiness";
import type { JobRecord, SetupReadiness, WorkspaceAssessment } from "./types";

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function loadPipelineMarkers(workspacePath?: string) {
  if (!workspacePath) {
    return new Set<string>();
  }

  const pipelineDir = path.join(workspacePath, ".pipeline");

  try {
    const entries = await readdir(pipelineDir, { withFileTypes: true });
    return new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  } catch {
    return new Set<string>();
  }
}

function fallbackSetupReadiness(reportText: string) {
  const parsedEnvironment = parseEnvironmentManagerReport(reportText);

  return {
    environmentName: parsedEnvironment.environmentName,
    pythonVersion: parsedEnvironment.pythonVersion,
    environmentReady: parsedEnvironment.environmentReady
  };
}

async function buildSetupReadiness(workspacePath?: string): Promise<SetupReadiness> {
  if (!workspacePath) {
    return {
      environmentReportFound: false,
      tutorialScanFound: false,
      environmentReady: false,
      tutorialCandidates: 0,
      reusableTutorials: 0
    };
  }

  const environmentReportPath = path.join(workspacePath, "reports", "environment-manager_results.md");
  const tutorialScanPath = path.join(workspacePath, "reports", "tutorial-scanner.json");

  const [environmentReportText, tutorialScanText, environmentReportFound, tutorialScanFound] =
    await Promise.all([
      readTextIfExists(environmentReportPath),
      readTextIfExists(tutorialScanPath),
      pathExists(environmentReportPath),
      pathExists(tutorialScanPath)
    ]);

  let tutorialCandidates = 0;
  let reusableTutorials = 0;
  if (tutorialScanText) {
    try {
      const parsed = JSON.parse(tutorialScanText) as {
        tutorials?: Array<{ include_in_tools?: boolean }>;
      };
      tutorialCandidates = parsed.tutorials?.length || 0;
      reusableTutorials =
        parsed.tutorials?.filter((tutorial) => tutorial.include_in_tools).length || 0;
    } catch {
      tutorialCandidates = 0;
      reusableTutorials = 0;
    }
  }

  const parsedEnvironment = fallbackSetupReadiness(environmentReportText);

  return {
    environmentReportFound,
    tutorialScanFound,
    environmentReady: parsedEnvironment.environmentReady,
    tutorialCandidates,
    reusableTutorials,
    environmentName: parsedEnvironment.environmentName,
    pythonVersion: parsedEnvironment.pythonVersion
  };
}

function uniqueItems(items: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      items
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item))
    )
  );
}

function buildRequirements(job: JobRecord) {
  const datasetRequirements =
    job.analysis?.datasets_required.map((dataset) => {
      const availability = dataset.publicly_available ? "publicly available" : "may require manual access";
      return `Dataset: ${dataset.name} (${availability})`;
    }) || [];

  return uniqueItems([
    ...(job.analysis?.setupNotes || []),
    ...datasetRequirements
  ]);
}

function buildMilestones(options: {
  job: JobRecord;
  markers: Set<string>;
  setup: SetupReadiness;
  hasWorkspace: boolean;
  hasGapAnalysis: boolean;
  hasExperimentResults: boolean;
  hasResultsComparison: boolean;
  hasValidation: boolean;
}) {
  const completed: string[] = [];

  if (options.job.analysis) {
    completed.push("Paper analyzed");
  }
  if (options.job.repositoryUrl) {
    completed.push("Repository identified");
  }
  if (options.hasWorkspace || ["01_setup_done", "02_clone_done", "03_folders_done", "04_context7_done"].every((marker) => options.markers.has(marker))) {
    completed.push("Workspace prepared");
  }
  if (options.setup.environmentReportFound && options.setup.tutorialScanFound) {
    completed.push("Initial setup inspected");
  }
  if (options.setup.environmentReady) {
    completed.push("Environment bootstrapped");
  }
  if (options.markers.has("05_step2_done")) {
    completed.push("Tutorial execution completed");
  }
  if (options.markers.has("05_step3_done")) {
    completed.push("Tool extraction completed");
  }
  if (options.markers.has("05_step4_done") || options.markers.has("06_mcp_done")) {
    completed.push("MCP packaging completed");
  }
  if (options.hasGapAnalysis || options.markers.has("05_step8_done")) {
    completed.push("Coverage and gap analysis completed");
  }
  if (options.hasExperimentResults || options.markers.has("05_step10_done")) {
    completed.push("Implementation experiments produced artifacts");
  }
  if (options.hasResultsComparison || options.markers.has("05_step11_done")) {
    completed.push("Observed results compared with the paper");
  }
  if (options.hasValidation) {
    completed.push("Workspace validation ran");
  }

  const remaining: string[] = [];

  if (!options.job.repositoryUrl) {
    remaining.push("Identify or confirm the implementation repository");
  }
  if (!options.hasWorkspace) {
    remaining.push("Prepare the local workspace");
  }
  if (!options.setup.environmentReady) {
    remaining.push("Create and verify the local environment");
  }
  if (!options.markers.has("05_step2_done")) {
    remaining.push("Run tutorial notebooks or executable examples");
  }
  if (!options.hasGapAnalysis) {
    remaining.push("Determine tutorial-only vs implementation-track coverage");
  }
  if (!options.hasExperimentResults) {
    remaining.push("Generate and run implementation experiments");
  }
  if (!options.hasResultsComparison && (options.job.analysis?.reported_results.length || 0) > 0) {
    remaining.push("Compare observed metrics against the paper's reported results");
  }
  if (!options.hasValidation || options.job.validationReport?.overall !== "pass") {
    remaining.push("Validate the workspace end to end");
  }

  return { completed, remaining };
}

function determineLifecycle(options: {
  job: JobRecord;
  markers: Set<string>;
  hasWorkspace: boolean;
  setup: SetupReadiness;
  hasExperimentResults: boolean;
  hasResultsComparison: boolean;
  hasValidation: boolean;
}) {
  if (options.job.status === "failed" || options.job.status === "stopped") {
    return "run_failed" as const;
  }
  if (!options.job.analysis) {
    return "paper_only" as const;
  }
  if (!options.job.repositoryUrl || options.job.status === "needs_repo") {
    return "repo_required" as const;
  }
  if (!options.hasWorkspace) {
    return "workspace_prepared" as const;
  }
  if (!options.setup.environmentReady) {
    return "workspace_prepared" as const;
  }
  if (options.job.validationReport?.overall === "pass") {
    return "validated_full" as const;
  }
  if (options.hasValidation || options.job.validationReport?.overall === "partial") {
    return "validated_partial" as const;
  }
  if (options.hasResultsComparison) {
    return "results_ready" as const;
  }
  if (options.hasExperimentResults) {
    return "implementation_in_progress" as const;
  }
  if (
    options.markers.has("05_step2_done") ||
    options.markers.has("05_step3_done") ||
    options.markers.has("05_step4_done")
  ) {
    return "tutorial_track_ready" as const;
  }
  if (options.setup.environmentReady) {
    return "setup_ready" as const;
  }

  return "paper_only" as const;
}

function buildSummary(options: {
  lifecycle: WorkspaceAssessment["lifecycle"];
  job: JobRecord;
  setup: SetupReadiness;
}) {
  switch (options.lifecycle) {
    case "repo_required":
      return "Paper analysis finished, but the system still needs a confirmed repository before setup can continue.";
    case "workspace_prepared":
      return "A workspace exists, but the project has not yet proven that the local environment is fully configured and runnable.";
    case "setup_ready":
      return "Initial setup artifacts exist, but the paper has not yet been implemented, compared, or validated.";
    case "implementation_in_progress":
      return "Implementation artifacts exist, but the run has not yet produced a verified comparison back to the paper.";
    case "results_ready":
      return "Comparison artifacts exist, but the workspace still lacks a passing end-to-end validation signal.";
    case "validated_partial":
      return "Validation ran, but the workspace still has unresolved failures or only partial confirmation.";
    case "validated_full":
      return "The workspace has both replication artifacts and a passing validation report.";
    case "run_failed":
      if (options.setup.environmentReady) {
        return "Initial setup completed, but the run stopped before the pipeline could finish implementation and validation.";
      }
      return options.job.error || "The run stopped before setup and replication could be confirmed.";
    case "paper_only":
      return "The paper has not yet been analyzed enough to determine implementation readiness.";
    case "tutorial_track_ready":
      if (options.setup.reusableTutorials > 0) {
        return `The repo exposes ${options.setup.reusableTutorials} tutorial/example candidates, but no implementation or validation artifacts are present yet.`;
      }
      return "The pipeline has not yet reached a point where it can confirm either tutorial execution or implementation results.";
  }
}

function buildBlockers(options: {
  job: JobRecord;
  setup: SetupReadiness;
  setupReportBlockers: string[];
  hasExperimentResults: boolean;
  hasResultsComparison: boolean;
}) {
  const blockers: string[] = [];

  if (options.job.error) {
    blockers.push(options.job.error);
  }
  if (!options.job.repositoryUrl) {
    blockers.push("A concrete repository still needs to be identified or confirmed.");
  }
  if (!options.setup.environmentReady) {
    blockers.push("The run does not yet have artifact-backed proof that the local environment is fully configured.");
  }
  if (!options.hasExperimentResults) {
    blockers.push("No experiment-result artifacts have been generated yet.");
  }
  if (!options.hasResultsComparison && (options.job.analysis?.reported_results.length || 0) > 0) {
    blockers.push("No comparison artifact exists yet to show whether observed results match the paper.");
  }
  blockers.push(...options.setupReportBlockers);
  if (options.job.validationReport?.overall === "fail") {
    const failedChecks = options.job.validationReport.checks
      .filter((check) => !check.passed)
      .slice(0, 3)
      .map((check) => `${check.name}: ${check.detail}`);
    blockers.push(...failedChecks);
  }
  if (options.job.implementability?.verdict === "blocked") {
    blockers.push(options.job.implementability.summary);
  } else if (options.job.implementability?.verdict === "risky") {
    blockers.push(`Local replication risk: ${options.job.implementability.summary}`);
  }

  return uniqueItems(blockers);
}

export async function buildWorkspaceAssessment(job: JobRecord): Promise<WorkspaceAssessment> {
  const hasWorkspace = job.workspacePath ? await pathExists(job.workspacePath) : false;
  const [markers, fallbackSetup, artifacts] = await Promise.all([
    loadPipelineMarkers(job.workspacePath),
    buildSetupReadiness(job.workspacePath),
    loadWorkspaceArtifacts(job.workspacePath)
  ]);

  const setup = artifacts.setupReadiness
    ? {
        environmentReportFound: artifacts.setupReadiness.environment.reportFound,
        tutorialScanFound: artifacts.setupReadiness.tutorials.scanFound,
        environmentReady: artifacts.setupReadiness.environment.ready,
        tutorialCandidates: artifacts.setupReadiness.tutorials.totalScanned,
        reusableTutorials: artifacts.setupReadiness.tutorials.includedInTools,
        environmentName: artifacts.setupReadiness.environment.environmentName,
        pythonVersion: artifacts.setupReadiness.environment.pythonVersion
      }
    : fallbackSetup;

  const hasExperimentResults =
    Boolean(artifacts.experimentSummary) || artifacts.experimentResults.length > 0;
  const hasResultsComparison = Boolean(artifacts.resultsComparison);
  const hasValidation = Boolean(job.validationReport);

  const lifecycle = determineLifecycle({
    job,
    markers,
    hasWorkspace,
    setup,
    hasExperimentResults,
    hasResultsComparison,
    hasValidation
  });

  const { completed, remaining } = buildMilestones({
    job,
    markers,
    setup,
    hasWorkspace,
    hasGapAnalysis: Boolean(artifacts.gapAnalysis),
    hasExperimentResults,
    hasResultsComparison,
    hasValidation
  });

  return {
    lifecycle,
    summary: buildSummary({
      lifecycle,
      job,
      setup
    }),
    completedMilestones: completed,
    remainingMilestones: uniqueItems([
      ...remaining,
      ...(artifacts.setupReadiness?.nextSteps || [])
    ]),
    blockers: buildBlockers({
      job,
      setup,
      setupReportBlockers: artifacts.setupReadiness?.blockers || [],
      hasExperimentResults,
      hasResultsComparison
    }),
    requirements: uniqueItems([
      ...buildRequirements(job),
      ...(artifacts.setupReadiness?.requirements || [])
    ]),
    setup
  };
}

export async function attachWorkspaceAssessment(job: JobRecord): Promise<JobRecord> {
  return {
    ...job,
    workspaceAssessment: await buildWorkspaceAssessment(job)
  };
}
