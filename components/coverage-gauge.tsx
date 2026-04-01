"use client";

import type { GapAnalysis, PaperAnalysis } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CoverageGauge({
  analysis,
  gapAnalysis
}: {
  analysis: PaperAnalysis;
  gapAnalysis?: GapAnalysis | null;
}) {
  const capabilities = analysis.capabilities;
  const totalCount = capabilities.length;
  const coveragePercent =
    gapAnalysis?.coverage_score !== undefined
      ? Math.round(Math.max(0, Math.min(gapAnalysis.coverage_score, 1)) * 100)
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Coverage</CardTitle>
          {gapAnalysis ? (
            <Badge variant="outline">{formatTrack(gapAnalysis.track)}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary/20">
            <span className="text-lg font-bold tabular-nums">
              {coveragePercent !== null ? `${coveragePercent}%` : totalCount}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium">
              {coveragePercent !== null
                ? `${coveragePercent}% capability coverage`
                : `${totalCount} capabilities identified`}
            </p>
            <p className="text-xs text-muted-foreground">
              {gapAnalysis
                ? `${gapAnalysis.covered_capabilities.length} covered, ${gapAnalysis.uncovered_capabilities.length} uncovered`
                : "From paper analysis"}
            </p>
          </div>
        </div>

        {gapAnalysis ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 px-3 py-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Covered</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {gapAnalysis.covered_capabilities.length}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 px-3 py-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Remaining Gaps</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {gapAnalysis.uncovered_capabilities.length}
              </p>
            </div>
          </div>
        ) : null}

        {totalCount > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {gapAnalysis ? "Paper Capabilities" : "All Capabilities"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {capabilities.map((cap) => (
                <Badge key={cap} variant="outline" className="text-xs">
                  {cap}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {analysis.datasets_required.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Required Datasets
            </p>
            <div className="space-y-1">
              {analysis.datasets_required.map((ds, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium">{ds.name}</span>
                  <div className="flex items-center gap-2">
                    {ds.source && <span className="text-muted-foreground">{ds.source}</span>}
                    <Badge variant={ds.publicly_available ? "success" : "outline"} className="text-[10px]">
                      {ds.publicly_available ? "Public" : "Private"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {gapAnalysis?.recommended_approach ? (
          <div className="space-y-2 rounded-lg border border-border/50 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recommended Approach
            </p>
            <p className="text-sm text-muted-foreground">{gapAnalysis.recommended_approach}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatTrack(track: GapAnalysis["track"]) {
  return `${track} track`;
}
