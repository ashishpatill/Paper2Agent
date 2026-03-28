"use client";

import type { PaperAnalysis } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CoverageGauge({ analysis }: { analysis: PaperAnalysis }) {
  const capabilities = analysis.capabilities;
  const totalCount = capabilities.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Capabilities</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary/20">
            <span className="text-lg font-bold tabular-nums">{totalCount}</span>
          </div>
          <div>
            <p className="text-sm font-medium">{totalCount} capabilities identified</p>
            <p className="text-xs text-muted-foreground">
              From paper analysis
            </p>
          </div>
        </div>

        {totalCount > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              All Capabilities
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
      </CardContent>
    </Card>
  );
}
