/**
 * Results export module.
 *
 * Generates CSV and Markdown report exports for completed pipeline runs.
 * Markdown reports can be printed as PDF via browser print dialog.
 */

import type {
  JobRecord,
  PipelineStepOutcome,
  ReplicationOutcomeReport,
  ResultsComparison,
  ValidationReport,
  GapAnalysis
} from "./types";

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

interface CsvRow {
  [key: string]: string | number | boolean;
}

function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const escape = (val: string | number | boolean) => {
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }

  return lines.join("\n");
}

/** Export pipeline step outcomes as CSV */
export function exportStepOutcomesCsv(outcomes: PipelineStepOutcome[]): string {
  return toCsv(
    outcomes.map((step) => ({
      Step: step.stepNumber,
      Name: step.name,
      Outcome: step.outcome,
      Attempts: step.attempts ?? 1,
      Detail: step.detail ?? "",
      UpdatedAt: step.updatedAt
    }))
  );
}

/** Export experiment results comparison as CSV */
export function exportResultsComparisonCsv(comparison?: ResultsComparison): string {
  if (!comparison) return "";

  return toCsv(
    comparison.comparisons.map((c) => ({
      Experiment: c.reported.experiment,
      Metric: c.reported.metric,
      "Reported Value": c.reported.value,
      "Observed Value": c.observed?.value ?? "N/A",
      Delta: c.delta ?? "N/A",
      WithinThreshold: c.within_threshold ? "Yes" : "No",
      Notes: c.notes
    }))
  );
}

/** Export reported results from paper analysis as CSV */
export function exportReportedResultsCsv(
  reportedResults: Array<{ experiment: string; metric: string; value: number | string; direction?: string; condition?: string }>
): string {
  return toCsv(
    reportedResults.map((r) => ({
      Experiment: r.experiment,
      Metric: r.metric,
      Value: r.value,
      Direction: r.direction ?? "",
      Condition: r.condition ?? ""
    }))
  );
}

/** Export gap analysis as CSV */
export function exportGapAnalysisCsv(gapAnalysis?: GapAnalysis): string {
  if (!gapAnalysis) return "";

  return toCsv(
    gapAnalysis.gaps.map((g) => ({
      Capability: g.capability,
      Description: g.description,
      Complexity: g.complexity,
      RequiresData: g.requires_data ? "Yes" : "No"
    }))
  );
}

/** Export full job summary as CSV */
export function exportJobSummaryCsv(job: JobRecord): string {
  return toCsv([
    {
      JobID: job.id,
      Status: job.status,
      Title: job.projectName ?? "Unknown",
      SourceType: job.sourceType,
      PaperURL: job.paperUrl ?? "",
      RepositoryURL: job.repositoryUrl ?? "",
      Provider: job.provider ?? "",
      Model: job.model ?? "",
      ProgressPercent: job.progressPercent ?? 0,
      CreatedAt: job.createdAt,
      UpdatedAt: job.updatedAt,
      Error: job.error ?? ""
    }
  ]);
}

// ---------------------------------------------------------------------------
// Markdown Report Export (printable as PDF)
// ---------------------------------------------------------------------------

/** Generate a comprehensive Markdown report for a completed job */
export function exportMarkdownReport(
  job: JobRecord,
  options?: {
    stepOutcomes?: PipelineStepOutcome[];
    replicationOutcome?: ReplicationOutcomeReport;
    resultsComparison?: ResultsComparison;
    validationReport?: ValidationReport;
    gapAnalysis?: GapAnalysis;
  }
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Paper2Agent Studio — Job Report`);
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Job ID:** ${job.id}`);
  lines.push("");

  // Job Summary
  lines.push("## Job Summary");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Status | ${job.status} |`);
  lines.push(`| Project | ${job.projectName ?? "Unknown"} |`);
  lines.push(`| Source | ${job.sourceType === "url" ? "URL" : "PDF Upload"} |`);
  lines.push(`| Paper URL | ${job.paperUrl ?? "N/A"} |`);
  lines.push(`| Repository | ${job.repositoryUrl ?? "N/A"} |`);
  lines.push(`| Provider | ${job.provider ?? "N/A"} |`);
  lines.push(`| Model | ${job.model ?? "N/A"} |`);
  lines.push(`| Progress | ${job.progressPercent ?? 0}% |`);
  lines.push(`| Created | ${job.createdAt} |`);
  lines.push(`| Completed | ${job.updatedAt} |`);
  if (job.error) lines.push(`| Error | ${job.error} |`);
  lines.push("");

  // Pipeline Step Outcomes
  if (options?.stepOutcomes && options.stepOutcomes.length > 0) {
    lines.push("## Pipeline Step Outcomes");
    lines.push("");
    lines.push("| Step | Name | Outcome | Attempts | Detail |");
    lines.push("|------|------|---------|----------|--------|");
    for (const step of options.stepOutcomes) {
      const icon =
        step.outcome === "completed"
          ? "✅"
          : step.outcome === "skipped"
          ? "⏭️"
          : step.outcome === "failed_tolerated"
          ? "⚠️"
          : "❌";
      lines.push(
        `| ${step.stepNumber} | ${step.name} | ${icon} ${step.outcome} | ${step.attempts ?? 1} | ${step.detail ?? "—"} |`
      );
    }
    lines.push("");
  }

  // Replication Outcome
  if (options?.replicationOutcome) {
    const ro = options.replicationOutcome;
    lines.push("## Replication Outcome");
    lines.push("");
    lines.push(`**Track:** ${ro.track ?? "N/A"}`);
    lines.push(`**Lifecycle:** ${ro.lifecycle}`);
    lines.push("");
    lines.push("### Summary");
    lines.push("");
    lines.push(ro.summary);
    lines.push("");

    if (ro.implementation) {
      lines.push("### Implementation");
      lines.push("");
      lines.push(`- Experiment files generated: ${ro.implementation.experimentFiles}`);
      lines.push(`- Implementation required: ${ro.implementation.required ? "Yes" : "No"}`);
      lines.push("");
    }

    if (ro.experiments) {
      lines.push("### Experiments");
      lines.push("");
      lines.push(`- Total: ${ro.experiments.total}`);
      lines.push(`- Successful: ${ro.experiments.successful}`);
      lines.push(`- Partial: ${ro.experiments.partial}`);
      lines.push(`- Failed: ${ro.experiments.failed}`);
      lines.push(`- Crashed: ${ro.experiments.crashed}`);
      lines.push("");
    }

    if (ro.comparison && ro.comparison.found) {
      lines.push("### Results Comparison");
      lines.push("");
      lines.push(`- Overall match: ${ro.comparison.overallMatch ?? "N/A"}`);
      lines.push(`- Match score: ${ro.comparison.matchScore ?? "N/A"}`);
      lines.push("");
    }

    if (ro.fixLoop && ro.fixLoop.found) {
      lines.push("### Fix Loop");
      lines.push("");
      lines.push(`- Converged: ${ro.fixLoop.converged ? "Yes" : "No"}`);
      lines.push(`- Attempts: ${ro.fixLoop.currentAttempt ?? 0}/${ro.fixLoop.maxAttempts ?? 0}`);
      lines.push("");
    }

    if (ro.validation && ro.validation.found) {
      lines.push("### Validation");
      lines.push("");
      lines.push(`- Overall: ${ro.validation.overall ?? "N/A"}`);
      lines.push("");
    }

    if (ro.blockers.length > 0) {
      lines.push("### Blockers");
      lines.push("");
      for (const blocker of ro.blockers) {
        lines.push(`- ${blocker}`);
      }
      lines.push("");
    }

    if (ro.nextSteps.length > 0) {
      lines.push("### Next Steps");
      lines.push("");
      for (const step of ro.nextSteps) {
        lines.push(`- ${step}`);
      }
      lines.push("");
    }
  }

  // Results Comparison Detail
  if (options?.resultsComparison) {
    const rc = options.resultsComparison;
    lines.push("## Results Comparison Detail");
    lines.push("");
    lines.push(`**Overall Match:** ${rc.overall_match}`);
    lines.push(`**Match Score:** ${rc.match_score}`);
    lines.push("");

    for (const c of rc.comparisons) {
      lines.push(`### ${c.reported.experiment} — ${c.reported.metric}`);
      lines.push("");
      lines.push(`- Reported: ${c.reported.value}`);
      lines.push(`- Observed: ${c.observed?.value ?? "N/A"}`);
      if (c.delta !== undefined) lines.push(`- Delta: ${c.delta}`);
      lines.push(`- Within threshold: ${c.within_threshold ? "Yes" : "No"}`);
      if (c.notes) lines.push(`- Notes: ${c.notes}`);
      lines.push("");
    }
  }

  // Gap Analysis
  if (options?.gapAnalysis) {
    const ga = options.gapAnalysis;
    lines.push("## Gap Analysis");
    lines.push("");
    lines.push(`**Coverage Score:** ${(ga.coverage_score * 100).toFixed(1)}%`);
    lines.push(`**Track:** ${ga.track}`);
    lines.push("");

    if (ga.covered_capabilities.length > 0) {
      lines.push("### Covered Capabilities");
      lines.push("");
      for (const cap of ga.covered_capabilities) {
        lines.push(`- ✅ ${cap}`);
      }
      lines.push("");
    }

    if (ga.uncovered_capabilities.length > 0) {
      lines.push("### Uncovered Capabilities");
      lines.push("");
      for (const cap of ga.uncovered_capabilities) {
        lines.push(`- ❌ ${cap}`);
      }
      lines.push("");
    }

    if (ga.gaps.length > 0) {
      lines.push("### Gaps");
      lines.push("");
      lines.push("| Capability | Complexity | Requires Data | Description |");
      lines.push("|------------|-----------|---------------|-------------|");
      for (const g of ga.gaps) {
        lines.push(
          `| ${g.capability} | ${g.complexity} | ${g.requires_data ? "Yes" : "No"} | ${g.description} |`
        );
      }
      lines.push("");
    }

    if (ga.recommended_approach) {
      lines.push("### Recommended Approach");
      lines.push("");
      lines.push(ga.recommended_approach);
      lines.push("");
    }
  }

  // Validation Report
  if (options?.validationReport) {
    const vr = options.validationReport;
    lines.push("## Validation Report");
    lines.push("");
    lines.push(`**Overall:** ${vr.overall === "pass" ? "✅ Pass" : vr.overall === "partial" ? "⚠️ Partial" : "❌ Fail"}`);
    lines.push(`**Timestamp:** ${vr.timestamp}`);
    lines.push("");

    lines.push("| Check | Passed | Detail |");
    lines.push("|-------|--------|--------|");
    for (const check of vr.checks) {
      lines.push(`| ${check.name} | ${check.passed ? "✅" : "❌"} | ${check.detail} |`);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("*Report generated by Paper2Agent Studio. https://github.com/jmiao24/Paper2Agent*");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Export type helpers
// ---------------------------------------------------------------------------

export type ExportFormat = "csv" | "markdown";

export interface ExportResult {
  filename: string;
  mimeType: string;
  content: string;
}

/** Generate an export for a job in the specified format */
export function generateExport(
  job: JobRecord,
  format: ExportFormat,
  options?: {
    stepOutcomes?: PipelineStepOutcome[];
    replicationOutcome?: ReplicationOutcomeReport;
    resultsComparison?: ResultsComparison;
    validationReport?: ValidationReport;
    gapAnalysis?: GapAnalysis;
  }
): ExportResult {
  const slug = (job.projectName ?? job.id).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (format === "csv") {
    // Combine all CSV data into a multi-section CSV
    const sections: string[] = [];

    sections.push("# Job Summary");
    sections.push(exportJobSummaryCsv(job));
    sections.push("");

    if (options?.stepOutcomes && options.stepOutcomes.length > 0) {
      sections.push("# Step Outcomes");
      sections.push(exportStepOutcomesCsv(options.stepOutcomes));
      sections.push("");
    }

    if (options?.gapAnalysis) {
      sections.push("# Gap Analysis");
      sections.push(exportGapAnalysisCsv(options.gapAnalysis));
      sections.push("");
    }

    if (options?.resultsComparison) {
      sections.push("# Results Comparison");
      sections.push(exportResultsComparisonCsv(options.resultsComparison));
      sections.push("");
    }

    return {
      filename: `${slug}-results-${timestamp}.csv`,
      mimeType: "text/csv",
      content: sections.join("\n")
    };
  }

  // Markdown
  return {
    filename: `${slug}-report-${timestamp}.md`,
    mimeType: "text/markdown",
    content: exportMarkdownReport(job, options)
  };
}
