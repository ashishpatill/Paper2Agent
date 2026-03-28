"use client";

import { Activity, CheckCircle2, FileText, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatsCards({
  total,
  running,
  completed,
  failed
}: {
  total: number;
  running: number;
  completed: number;
  failed: number;
}) {
  const stats = [
    { label: "Total Jobs", value: total, icon: FileText, color: "text-foreground" },
    { label: "Running", value: running, icon: Activity, color: "text-primary" },
    { label: "Completed", value: completed, icon: CheckCircle2, color: "text-success" },
    { label: "Failed", value: failed, icon: XCircle, color: "text-destructive" }
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <stat.icon className={`h-5 w-5 shrink-0 ${stat.color}`} />
            <div>
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
