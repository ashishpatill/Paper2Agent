import { notFound } from "next/navigation";

import { getJob } from "@/lib/server/jobs";
import { loadWorkspaceArtifacts } from "@/lib/server/results";
import { CoverageGauge } from "@/components/coverage-gauge";
import { ResultsTable } from "@/components/results-table";
import { FixLoopHistory } from "@/components/fix-loop-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ResultsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const artifacts = await loadWorkspaceArtifacts(job.workspacePath);

  const hasAnalysis = Boolean(job.analysis);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
          Results
        </h1>
        <p className="text-sm text-muted-foreground">
          {job.analysis?.title || job.projectName || job.id}
        </p>
      </div>

      {!hasAnalysis ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No analysis results yet. The pipeline needs to complete analysis first.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Gap Analysis */}
          <CoverageGauge analysis={job.analysis!} gapAnalysis={artifacts.gapAnalysis} />

          {artifacts.resultsComparison ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Comparison Summary</CardTitle>
                  <Badge
                    variant={
                      artifacts.resultsComparison.overall_match === "strong"
                        ? "success"
                        : artifacts.resultsComparison.overall_match === "approximate"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {artifacts.resultsComparison.overall_match}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 px-3 py-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Match Score</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {(artifacts.resultsComparison.match_score * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/50 px-3 py-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Comparisons</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {artifacts.resultsComparison.comparisons.length}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{artifacts.resultsComparison.summary}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* Reported Results vs Observed */}
          {job.analysis!.reported_results.length > 0 && (
            <ResultsTable
              reportedResults={job.analysis!.reported_results}
              comparison={artifacts.resultsComparison}
            />
          )}

          {artifacts.experimentSummary ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Experiment Run Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <SummaryCell label="Total" value={artifacts.experimentSummary.total_experiments} />
                  <SummaryCell label="Successful" value={artifacts.experimentSummary.successful} />
                  <SummaryCell label="Partial" value={artifacts.experimentSummary.partial} />
                  <SummaryCell label="Failed" value={artifacts.experimentSummary.failed} />
                  <SummaryCell label="Crashed" value={artifacts.experimentSummary.crashed} />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {artifacts.experimentResults.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Experiment Artifacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {artifacts.experimentResults.map((result) => (
                  <div
                    key={`${result.experiment}-${result.result_file || result.timestamp || "result"}`}
                    className="rounded-lg border border-border/50 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{result.experiment}</p>
                        <p className="text-xs text-muted-foreground">
                          {result.timestamp ? new Date(result.timestamp).toLocaleString() : "Timestamp unavailable"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          result.status === "success"
                            ? "success"
                            : result.status === "partial"
                              ? "outline"
                              : "destructive"
                        }
                      >
                        {result.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(result.metrics).length > 0 ? (
                        Object.entries(result.metrics).map(([metric, value]) => (
                          <Badge key={metric} variant="outline">
                            {metric}: {String(value)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No metrics captured.</span>
                      )}
                    </div>
                    {result.errors && result.errors.length > 0 ? (
                      <p className="mt-3 text-xs text-destructive">{result.errors[0]}</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {artifacts.fixLoopState ? <FixLoopHistory state={artifacts.fixLoopState} /> : null}

          {/* Validation Report */}
          {job.validationReport && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Workspace Validation</CardTitle>
                  <Badge
                    variant={job.validationReport.overall === "pass" ? "success" : "destructive"}
                  >
                    {job.validationReport.overall}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {job.validationReport.checks.map((check, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm"
                    >
                      <span>{check.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{check.detail}</span>
                        <Badge variant={check.passed ? "success" : "destructive"} className="text-[10px]">
                          {check.passed ? "PASS" : "FAIL"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
