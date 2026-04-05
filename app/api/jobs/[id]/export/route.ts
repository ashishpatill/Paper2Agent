import { NextResponse } from "next/server";

import { generateExport } from "@/lib/server/export-results";
import { getJob } from "@/lib/server/jobs";
import type { ExportFormat } from "@/lib/server/export-results";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;
  const job = await getJob(id);

  if (!job) {
    return new NextResponse("Job not found.", { status: 404 });
  }

  // Parse query parameters
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") as ExportFormat) || "markdown";

  if (format !== "csv" && format !== "markdown") {
    return new NextResponse("Invalid format. Use 'csv' or 'markdown'.", { status: 400 });
  }

  // Gather all available data for the export
  const exportOptions = {
    stepOutcomes: job.pipelineStepOutcomes?.steps,
    replicationOutcome: undefined, // Would need to load from workspace
    resultsComparison: undefined, // Would need to load from workspace
    validationReport: job.validationReport,
    gapAnalysis: job.analysis?.skillGraph ? {
      coverage_score: 0,
      track: "tutorial" as const,
      covered_capabilities: job.analysis.capabilities,
      uncovered_capabilities: [],
      gaps: [],
      recommended_approach: ""
    } : undefined
  };

  const result = generateExport(job, format, exportOptions);

  // Return as downloadable file
  return new NextResponse(result.content, {
    headers: {
      "Content-Type": result.mimeType,
      "Content-Disposition": `attachment; filename="${result.filename}"`
    }
  });
}
