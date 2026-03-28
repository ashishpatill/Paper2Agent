"use client";

import type { ReportedResult } from "@/lib/server/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ResultsTable({ reportedResults }: { reportedResults: ReportedResult[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reported Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Experiment</th>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2">Direction</th>
                <th className="px-3 py-2">Condition</th>
              </tr>
            </thead>
            <tbody>
              {reportedResults.map((r, i) => (
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
