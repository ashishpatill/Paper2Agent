import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildReplicationOutcomeReport } from "../lib/server/replication-outcome";

async function main() {
  const [, , workspacePath] = process.argv;

  if (!workspacePath) {
    throw new Error("Usage: tsx scripts/build-replication-outcome.ts <workspacePath>");
  }

  const report = await buildReplicationOutcomeReport(workspacePath);
  const reportPath = path.join(workspacePath, "reports", "replication-outcome.json");

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`${reportPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
