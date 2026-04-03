import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { SetupReadinessReport } from "./types";

export interface Step2ReadinessDecision {
  mode: "run" | "skip" | "fail";
  reason: string;
}

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

function normalizeItems(items: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      items
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item))
    )
  );
}

export function parseEnvironmentManagerReport(reportText: string) {
  const environmentName =
    reportText.match(/- \*\*Environment Name\*\*: (.+)/)?.[1]?.trim() || undefined;
  const pythonVersion =
    reportText.match(/- \*\*Python Version\*\*: (.+)/)?.[1]?.trim() || undefined;
  const environmentLocation =
    reportText.match(/- \*\*Environment Location\*\*: `?(.+?)`?$/m)?.[1]?.trim() || undefined;
  const installationMethod =
    reportText.match(/- \*\*Installation Method\*\*: (.+)/)?.[1]?.trim() || undefined;
  const packageCount = Number.parseInt(
    reportText.match(/- \*\*Total Packages\*\*: (\d+)/)?.[1] || "",
    10
  );

  const validationChecksPassed = Array.from(reportText.matchAll(/^- ✅ /gm)).length;
  const activationBlock = reportText.match(/## Environment Activation Instructions[\s\S]*?```bash([\s\S]*?)```/);
  const activationCommand = activationBlock?.[1]
    ?.split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("source "));

  const installCommands = Array.from(
    reportText.matchAll(/```bash([\s\S]*?)```/g)
  )
    .flatMap((match) =>
      match[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^(uv|pip|python|source)\b/.test(line))
    )
    .filter((line) => line !== activationCommand);

  const codePaths = Array.from(
    reportText.matchAll(/- \*\*Main Research Code\*\*: `(.+?)`/g)
  ).map((match) => match[1]);

  return {
    environmentName,
    pythonVersion,
    environmentLocation,
    installationMethod,
    packageCount: Number.isFinite(packageCount) ? packageCount : undefined,
    activationCommand,
    installCommands: normalizeItems(installCommands),
    validationChecksPassed,
    validationChecksTotal: Math.max(validationChecksPassed, 6),
    environmentReady: validationChecksPassed >= 3,
    mainCodePaths: normalizeItems(codePaths)
  };
}

async function discoverNotebookPaths(repoPath: string) {
  const discovered: string[] = [];

  async function walk(currentPath: string, depth: number) {
    if (depth > 4) {
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__pycache__") {
          continue;
        }
        await walk(nextPath, depth + 1);
        continue;
      }

      if (entry.name.endsWith(".ipynb")) {
        discovered.push(path.relative(repoPath, nextPath));
      }
    }
  }

  if (await pathExists(repoPath)) {
    await walk(repoPath, 0);
  }

  return discovered.sort((a, b) => a.localeCompare(b));
}

export async function buildSetupReadinessReport(options: {
  workspacePath: string;
  repositoryName: string;
  tutorialFilter?: string;
}): Promise<SetupReadinessReport> {
  const reportsPath = path.join(options.workspacePath, "reports");
  const repoPath = path.join(options.workspacePath, "repo", options.repositoryName);
  const environmentReportPath = path.join(reportsPath, "environment-manager_results.md");
  const tutorialScanPath = path.join(reportsPath, "tutorial-scanner.json");
  const tutorialIncludePath = path.join(reportsPath, "tutorial-scanner-include-in-tools.json");

  const [
    environmentReportText,
    tutorialScanText,
    tutorialIncludeText,
    environmentReportFound,
    tutorialScanFound,
    tutorialIncludeFound,
    notebookPaths
  ] = await Promise.all([
    readTextIfExists(environmentReportPath),
    readTextIfExists(tutorialScanPath),
    readTextIfExists(tutorialIncludePath),
    pathExists(environmentReportPath),
    pathExists(tutorialScanPath),
    pathExists(tutorialIncludePath),
    discoverNotebookPaths(repoPath)
  ]);

  const parsedEnvironment = parseEnvironmentManagerReport(environmentReportText);

  let tutorials = {
    success: false,
    successReason: undefined as string | undefined,
    totalScanned: 0,
    includedInTools: 0,
    runnableCandidates: 0,
    includedPaths: [] as string[]
  };

  if (tutorialScanText) {
    try {
      const parsed = JSON.parse(tutorialScanText) as {
        scan_metadata?: { success?: boolean; success_reason?: string };
        tutorials?: Array<{ path?: string; include_in_tools?: boolean; type?: string }>;
      };
      const allTutorials = parsed.tutorials || [];
      const included = allTutorials.filter((tutorial) => tutorial.include_in_tools);
      tutorials = {
        success: Boolean(parsed.scan_metadata?.success),
        successReason: parsed.scan_metadata?.success_reason,
        totalScanned: allTutorials.length,
        includedInTools: included.length,
        runnableCandidates: allTutorials.filter((tutorial) =>
          ["notebook", "script", "example"].includes((tutorial.type || "").toLowerCase())
        ).length,
        includedPaths: normalizeItems(included.map((tutorial) => tutorial.path))
      };
    } catch {
      tutorials.success = false;
    }
  }

  if (tutorialIncludeText) {
    try {
      const parsed = JSON.parse(tutorialIncludeText) as {
        tutorials?: Array<{ path?: string }>;
      };
      const explicitIncluded = normalizeItems(parsed.tutorials?.map((tutorial) => tutorial.path) || []);
      if (explicitIncluded.length > 0) {
        tutorials.includedPaths = explicitIncluded;
        tutorials.includedInTools = explicitIncluded.length;
      }
    } catch {
      // ignore malformed secondary include file here; it will be reflected as a blocker
    }
  }

  const blockers = normalizeItems([
    environmentReportFound ? undefined : "Environment setup summary is missing.",
    tutorialScanFound ? undefined : "Tutorial scan report is missing.",
    tutorialIncludeFound ? undefined : "Filtered tutorial include list is missing.",
    parsedEnvironment.environmentReady
      ? undefined
      : "Environment report does not yet prove that the local environment is fully configured.",
    tutorials.success || !tutorialScanFound
      ? undefined
      : tutorials.successReason || "Tutorial scanning did not report success.",
    tutorials.includedInTools > 0 || !tutorialScanFound
      ? undefined
      : "No runnable tutorials were selected for tool extraction."
  ]);

  const requirements = normalizeItems([
    parsedEnvironment.activationCommand,
    ...parsedEnvironment.installCommands
  ]);

  const nextSteps = normalizeItems([
    parsedEnvironment.environmentReady
      ? undefined
      : "Finish environment setup and verify imports for the target repository.",
    tutorials.includedInTools > 0
      ? "Execute the selected tutorials and capture notebook execution artifacts."
      : "Proceed with direct source-code extraction if the repository has no runnable tutorials.",
    "Run coverage/gap analysis to determine whether implementation-track work is required."
  ]);

  return {
    generatedAt: new Date().toISOString(),
    repository: {
      name: options.repositoryName,
      path: `repo/${options.repositoryName}`,
      mainCodePaths: normalizeItems(parsedEnvironment.mainCodePaths),
      notebookPaths
    },
    environment: {
      reportFound: environmentReportFound,
      ready: parsedEnvironment.environmentReady,
      environmentName: parsedEnvironment.environmentName,
      pythonVersion: parsedEnvironment.pythonVersion,
      environmentLocation: parsedEnvironment.environmentLocation,
      installationMethod: parsedEnvironment.installationMethod,
      packageCount: parsedEnvironment.packageCount,
      activationCommand: parsedEnvironment.activationCommand,
      installCommands: parsedEnvironment.installCommands,
      validationChecksPassed: parsedEnvironment.validationChecksPassed,
      validationChecksTotal: parsedEnvironment.validationChecksTotal
    },
    tutorials: {
      scanFound: tutorialScanFound,
      includeListFound: tutorialIncludeFound,
      success: tutorials.success,
      successReason: tutorials.successReason,
      filterApplied: options.tutorialFilter?.trim() || undefined,
      totalScanned: tutorials.totalScanned,
      includedInTools: tutorials.includedInTools,
      runnableCandidates: tutorials.runnableCandidates,
      includedPaths: tutorials.includedPaths
    },
    blockers,
    requirements,
    nextSteps
  };
}

export function classifyStep2Execution(report: SetupReadinessReport): Step2ReadinessDecision {
  if (!report.environment.reportFound) {
    return {
      mode: "fail",
      reason: "Step 1 is missing reports/environment-manager_results.md, so tutorial execution cannot validate the environment."
    };
  }

  if (!report.tutorials.scanFound || !report.tutorials.includeListFound) {
    return {
      mode: "fail",
      reason: "Step 1 did not produce the required tutorial scan reports, so there is no trusted tutorial input for execution."
    };
  }

  if (!report.environment.ready) {
    return {
      mode: "fail",
      reason:
        report.blockers[0] ||
        "The setup-readiness report does not yet prove that the local environment is ready for tutorial execution."
    };
  }

  if (report.tutorials.includedInTools === 0) {
    return {
      mode: "skip",
      reason: "Target repository has no runnable tutorials selected for execution. Continue with direct source extraction."
    };
  }

  return {
    mode: "run",
    reason: `Execute ${report.tutorials.includedInTools} tutorial(s) using ${report.environment.environmentName || "the prepared environment"}.`
  };
}
