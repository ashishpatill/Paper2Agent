import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "path";

import { getJob, updateJob } from "@/lib/server/jobs";
import type { ValidationReport } from "@/lib/server/types";
import { buildReplicationOutcomeReport } from "@/lib/server/replication-outcome";

async function refreshReplicationOutcome(workspacePath: string) {
  const replicationOutcome = await buildReplicationOutcomeReport(workspacePath);
  const outcomePath = path.join(workspacePath, "reports", "replication-outcome.json");
  await mkdir(path.dirname(outcomePath), { recursive: true });
  await writeFile(outcomePath, JSON.stringify(replicationOutcome, null, 2), "utf8");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const job = await getJob(id);

  if (!job) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  if (!job.workspacePath) {
    return new NextResponse("No workspace path — job may not have run yet.", { status: 400 });
  }

  // Derive repo name from workspace
  const repoName = job.projectName || job.analysis?.projectSlug || "";

  try {
    const output = execSync(
      `npx tsx scripts/validate-workspace.ts "${job.workspacePath}" "${repoName}"`,
      {
        cwd: process.cwd(),
        timeout: 180_000,
        encoding: "utf-8",
      }
    );

    const report = JSON.parse(output) as ValidationReport;

    // Save to job record
    await updateJob(id, (current) => ({
      ...current,
      validationReport: report,
    }));
    await refreshReplicationOutcome(job.workspacePath);

    return NextResponse.json(report);
  } catch (err) {
    // Validation script may exit non-zero for failures but still produce JSON
    const errOutput = err instanceof Error && "stdout" in err
      ? String((err as { stdout: string }).stdout)
      : "";

    try {
      const report = JSON.parse(errOutput) as ValidationReport;
      await updateJob(id, (current) => ({
        ...current,
        validationReport: report,
      }));
      await refreshReplicationOutcome(job.workspacePath);
      return NextResponse.json(report);
    } catch {
      return NextResponse.json(
        { overall: "fail", checks: [], error: "Validation script failed to run" },
        { status: 500 }
      );
    }
  }
}
