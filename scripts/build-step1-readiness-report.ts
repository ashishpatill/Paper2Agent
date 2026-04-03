import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildSetupReadinessReport } from "../lib/server/setup-readiness";

async function main() {
  const [, , workspacePath, repositoryName, tutorialFilter = ""] = process.argv;

  if (!workspacePath || !repositoryName) {
    throw new Error("Usage: tsx scripts/build-step1-readiness-report.ts <workspacePath> <repositoryName> [tutorialFilter]");
  }

  const report = await buildSetupReadinessReport({
    workspacePath,
    repositoryName,
    tutorialFilter
  });

  if (!report.environment.reportFound) {
    throw new Error("Step 1 did not produce reports/environment-manager_results.md");
  }

  if (!report.tutorials.scanFound || !report.tutorials.includeListFound) {
    throw new Error("Step 1 did not produce the required tutorial scan JSON reports");
  }

  const reportPath = path.join(workspacePath, "reports", "setup-readiness.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  process.stdout.write(`${reportPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
