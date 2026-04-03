"use client";

import type { ReplicationOutcomeReport } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ReplicationOutcomeCard({ report }: { report: ReplicationOutcomeReport }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Replication Outcome</CardTitle>
          <Badge variant={badgeVariant(report.lifecycle)}>{label(report.lifecycle)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{report.summary}</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCell label="Track" value={report.track || "unknown"} />
          <MetricCell label="Experiment Files" value={String(report.implementation.experimentFiles)} />
          <MetricCell label="Experiments" value={String(report.experiments.total)} />
          <MetricCell
            label="Match Score"
            value={report.comparison.matchScore != null ? `${Math.round(report.comparison.matchScore * 100)}%` : "—"}
          />
          <MetricCell label="Validation" value={report.validation.overall || "not run"} />
        </div>

        <OutcomeList
          title="Blockers"
          items={report.blockers}
          empty="No explicit implementation blockers recorded yet."
        />
        <OutcomeList
          title="Next Steps"
          items={report.nextSteps}
          empty="No remaining implementation next steps recorded."
        />
      </CardContent>
    </Card>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function OutcomeList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <div key={item} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function label(lifecycle: ReplicationOutcomeReport["lifecycle"]) {
  const labels: Record<ReplicationOutcomeReport["lifecycle"], string> = {
    tutorial_only: "tutorial only",
    implementation_scaffolded: "code generated",
    experiments_partial: "experiments ran",
    results_compared: "results compared",
    replication_partial: "partial validation",
    replication_validated: "validated",
    replication_blocked: "blocked"
  };

  return labels[lifecycle];
}

function badgeVariant(lifecycle: ReplicationOutcomeReport["lifecycle"]) {
  if (lifecycle === "replication_validated") {
    return "success" as const;
  }
  if (lifecycle === "replication_blocked") {
    return "destructive" as const;
  }
  return "outline" as const;
}
