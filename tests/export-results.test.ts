import test from "node:test";
import assert from "node:assert/strict";

import {
  exportJobSummaryCsv,
  exportStepOutcomesCsv,
  exportResultsComparisonCsv,
  exportGapAnalysisCsv,
  exportMarkdownReport,
  generateExport
} from "../lib/server/export-results";
import type { JobRecord, PipelineStepOutcome, ResultsComparison, GapAnalysis } from "../lib/server/types";

// ---------------------------------------------------------------------------
// CSV Export Tests
// ---------------------------------------------------------------------------

test("exportJobSummaryCsv produces valid CSV with headers", () => {
  const job: JobRecord = {
    id: "test-job-123",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    paperUrl: "https://arxiv.org/abs/1234.5678",
    repositoryUrl: "https://github.com/example/repo",
    projectName: "test-project",
    provider: "gemini",
    model: "gemini-2.5-flash",
    progressPercent: 100
  };

  const csv = exportJobSummaryCsv(job);
  const lines = csv.split("\n");

  assert.equal(lines[0], "JobID,Status,Title,SourceType,PaperURL,RepositoryURL,Provider,Model,ProgressPercent,CreatedAt,UpdatedAt,Error");
  assert.ok(lines[1].includes("test-job-123"));
  assert.ok(lines[1].includes("completed"));
  assert.ok(lines[1].includes("test-project"));
});

test("exportJobSummaryCsv handles special characters in values", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "failed",
    sourceType: "pdf",
    error: "Something went \"wrong\", very wrong",
    progressPercent: 50
  };

  const csv = exportJobSummaryCsv(job);
  // Values with commas and quotes should be properly escaped
  assert.ok(csv.includes('"'));
});

test("exportStepOutcomesCsv produces step data", () => {
  const outcomes: PipelineStepOutcome[] = [
    {
      stepNumber: 5,
      name: "Setup Python environment",
      outcome: "completed",
      attempts: 1,
      updatedAt: "2026-04-05T00:05:00Z"
    },
    {
      stepNumber: 12,
      name: "Gap analysis",
      outcome: "skipped",
      detail: "Track was tutorial",
      updatedAt: "2026-04-05T00:12:00Z"
    }
  ];

  const csv = exportStepOutcomesCsv(outcomes);
  const lines = csv.split("\n");

  assert.equal(lines[0], "Step,Name,Outcome,Attempts,Detail,UpdatedAt");
  assert.ok(lines[1].includes("5"));
  assert.ok(lines[1].includes("Setup Python environment"));
  assert.ok(lines[1].includes("completed"));
  assert.ok(lines[2].includes("skipped"));
});

test("exportStepOutcomesCsv handles empty array", () => {
  const csv = exportStepOutcomesCsv([]);
  assert.equal(csv, "");
});

test("exportResultsComparisonCsv produces comparison data", () => {
  const comparison: ResultsComparison = {
    overall_match: "strong",
    match_score: 0.95,
    comparisons: [
      {
        reported: { experiment: "exp1", metric: "accuracy", value: 0.92 },
        observed: { value: 0.90 },
        delta: 0.02,
        within_threshold: true,
        notes: "Within acceptable range"
      }
    ],
    summary: "Good match"
  };

  const csv = exportResultsComparisonCsv(comparison);
  const lines = csv.split("\n");

  assert.equal(lines[0], "Experiment,Metric,Reported Value,Observed Value,Delta,WithinThreshold,Notes");
  assert.ok(lines[1].includes("exp1"));
  assert.ok(lines[1].includes("accuracy"));
  assert.ok(lines[1].includes("0.92"));
});

test("exportResultsComparisonCsv handles missing comparison", () => {
  const csv = exportResultsComparisonCsv(undefined);
  assert.equal(csv, "");
});

test("exportResultsComparisonCsv handles missing observed values", () => {
  const comparison: ResultsComparison = {
    overall_match: "weak",
    match_score: 0.3,
    comparisons: [
      {
        reported: { experiment: "exp1", metric: "f1", value: 0.85 },
        observed: null,
        within_threshold: false,
        notes: "No observation available"
      }
    ],
    summary: "Poor match"
  };

  const csv = exportResultsComparisonCsv(comparison);
  assert.ok(csv.includes("N/A"));
});

test("exportGapAnalysisCsv produces gap data", () => {
  const gapAnalysis: GapAnalysis = {
    coverage_score: 0.4,
    track: "implementation",
    covered_capabilities: ["tutorial execution"],
    uncovered_capabilities: ["experiment code"],
    gaps: [
      {
        capability: "data processing",
        description: "Paper uses custom data pipeline",
        complexity: "medium",
        requires_data: true
      }
    ],
    recommended_approach: "Implement from scratch"
  };

  const csv = exportGapAnalysisCsv(gapAnalysis);
  const lines = csv.split("\n");

  assert.equal(lines[0], "Capability,Description,Complexity,RequiresData");
  assert.ok(lines[1].includes("data processing"));
  assert.ok(lines[1].includes("medium"));
});

test("exportGapAnalysisCsv handles missing gap analysis", () => {
  const csv = exportGapAnalysisCsv(undefined);
  assert.equal(csv, "");
});

// ---------------------------------------------------------------------------
// Markdown Export Tests
// ---------------------------------------------------------------------------

test("exportMarkdownReport includes job summary", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    paperUrl: "https://arxiv.org/abs/1234.5678",
    repositoryUrl: "https://github.com/example/repo",
    projectName: "test-project",
    provider: "gemini",
    model: "gemini-2.5-flash",
    progressPercent: 100
  };

  const report = exportMarkdownReport(job);

  assert.ok(report.includes("# Paper2Agent Studio — Job Report"));
  assert.ok(report.includes("## Job Summary"));
  assert.ok(report.includes("| Status | completed |"));
  assert.ok(report.includes("| Project | test-project |"));
  assert.ok(report.includes("test-job"));
});

test("exportMarkdownReport includes step outcomes", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    progressPercent: 100
  };

  const stepOutcomes: PipelineStepOutcome[] = [
    {
      stepNumber: 5,
      name: "Setup env",
      outcome: "completed",
      updatedAt: "2026-04-05T00:05:00Z"
    }
  ];

  const report = exportMarkdownReport(job, { stepOutcomes });

  assert.ok(report.includes("## Pipeline Step Outcomes"));
  assert.ok(report.includes("✅ completed"));
  assert.ok(report.includes("Setup env"));
});

test("exportMarkdownReport includes footer with attribution", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    progressPercent: 100
  };

  const report = exportMarkdownReport(job);

  assert.ok(report.includes("Paper2Agent Studio"));
  assert.ok(report.includes("github.com/jmiao24/Paper2Agent"));
});

// ---------------------------------------------------------------------------
// generateExport Tests
// ---------------------------------------------------------------------------

test("generateExport returns CSV format", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    projectName: "my-project",
    progressPercent: 100
  };

  const result = generateExport(job, "csv");

  assert.ok(result.filename.endsWith(".csv"));
  assert.equal(result.mimeType, "text/csv");
  assert.ok(result.content.includes("JobID,Status,Title"));
  assert.ok(result.content.includes("my-project"));
});

test("generateExport returns Markdown format", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    projectName: "my-project",
    progressPercent: 100
  };

  const result = generateExport(job, "markdown");

  assert.ok(result.filename.endsWith(".md"));
  assert.equal(result.mimeType, "text/markdown");
  assert.ok(result.content.includes("# Paper2Agent Studio"));
});

test("generateExport filename is slugified", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    projectName: "My Complex Project Name!",
    progressPercent: 100
  };

  const result = generateExport(job, "csv");

  // Filename should contain slugified project name
  assert.ok(result.filename.includes("my-complex-project-name"));
});

test("generateExport includes step outcomes in CSV", () => {
  const job: JobRecord = {
    id: "test-job",
    createdAt: "2026-04-05T00:00:00Z",
    updatedAt: "2026-04-05T01:00:00Z",
    status: "completed",
    sourceType: "url",
    progressPercent: 100
  };

  const stepOutcomes: PipelineStepOutcome[] = [
    {
      stepNumber: 5,
      name: "Setup env",
      outcome: "completed",
      updatedAt: "2026-04-05T00:05:00Z"
    }
  ];

  const result = generateExport(job, "csv", { stepOutcomes });

  assert.ok(result.content.includes("# Step Outcomes"));
  assert.ok(result.content.includes("Setup env"));
});
