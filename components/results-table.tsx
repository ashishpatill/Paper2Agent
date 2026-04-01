"use client";

import type { ReportedResult, ResultsComparison } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ResultsTable({
  reportedResults,
  comparison
}: {
  reportedResults: ReportedResult[];
  comparison?: ResultsComparison | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {comparison ? "Reported vs Observed Results" : "Reported Results"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Experiment</th>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2 text-right">Reported</th>
                {comparison ? <th className="px-3 py-2 text-right">Observed</th> : null}
                {comparison ? <th className="px-3 py-2 text-right">Delta</th> : null}
                <th className="px-3 py-2">{comparison ? "Match" : "Direction"}</th>
                <th className="px-3 py-2">{comparison ? "Notes" : "Condition"}</th>
              </tr>
            </thead>
            <tbody>
              {comparison
                ? comparison.comparisons.map((item, i) => (
                    <tr
                      key={`${item.reported.experiment}-${item.reported.metric}-${i}`}
                      className="border-b border-border/30 transition-colors hover:bg-accent/20"
                    >
                      <td className="px-3 py-2 text-xs">{item.reported.experiment}</td>
                      <td className="px-3 py-2 font-medium">{item.reported.metric}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {String(item.reported.value)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {item.observed ? String(item.observed.value) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {typeof item.delta === "number" ? item.delta.toFixed(4) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={item.within_threshold ? "success" : "destructive"} className="text-[10px]">
                          {item.within_threshold ? "Match" : "Mismatch"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{item.notes}</td>
                    </tr>
                  ))
                : reportedResults.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/30 transition-colors hover:bg-accent/20"
                    >
                      <td className="px-3 py-2 text-xs">{r.experiment}</td>
                      <td className="px-3 py-2 font-medium">{r.metric}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {String(r.value)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.direction ? r.direction.replace(/_/g, " ") : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.condition || "—"}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
