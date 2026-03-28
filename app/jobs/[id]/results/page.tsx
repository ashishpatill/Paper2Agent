import { notFound } from "next/navigation";

import { getJob } from "@/lib/server/jobs";
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

  const hasAnalysis = Boolean(job.analysis);
  const hasGapData = Boolean(job.analysis?.capabilities?.length);

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
          <CoverageGauge analysis={job.analysis!} />

          {/* Reported Results vs Observed */}
          {job.analysis!.reported_results.length > 0 && (
            <ResultsTable reportedResults={job.analysis!.reported_results} />
          )}

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
