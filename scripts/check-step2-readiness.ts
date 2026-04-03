import { readFile } from "node:fs/promises";

import { classifyStep2Execution } from "../lib/server/setup-readiness";
import type { SetupReadinessReport } from "../lib/server/types";

async function main() {
  const [, , reportPath] = process.argv;

  if (!reportPath) {
    throw new Error("Usage: tsx scripts/check-step2-readiness.ts <setup-readiness.json>");
  }

  const report = JSON.parse(await readFile(reportPath, "utf8")) as SetupReadinessReport;
  const decision = classifyStep2Execution(report);

  process.stdout.write(`${decision.reason}\n`);

  if (decision.mode === "skip") {
    process.exit(10);
  }

  if (decision.mode === "fail") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
