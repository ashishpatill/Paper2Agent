"use client";

import type { FixLoopState } from "@/lib/server/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FixLoopHistory({ state }: { state: FixLoopState }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Fix Loop</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              Attempt {state.current_attempt}/{state.max_attempts}
            </span>
            <Badge variant={state.converged ? "success" : "outline"}>
              {state.converged ? "Converged" : "In progress"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {state.convergence_reason && (
          <p className="mb-4 text-sm text-muted-foreground">{state.convergence_reason}</p>
        )}

        <div className="space-y-2">
          {state.attempts.map((attempt) => {
            const isBest = state.best_attempt?.attempt_number === attempt.attempt_number;
            return (
              <div
                key={attempt.attempt_number}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                  isBest
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center tabular-nums text-xs text-muted-foreground">
                    #{attempt.attempt_number}
                  </span>
                  <Badge
                    variant={
                      attempt.status === "success"
                        ? "success"
                        : attempt.status === "failed" || attempt.status === "crashed"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {attempt.status}
                  </Badge>
                  {isBest && (
                    <Badge variant="outline" className="text-[10px] text-primary">
                      best
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {Object.entries(attempt.metrics).slice(0, 3).map(([key, val]) => (
                    <span key={key} className="text-xs text-muted-foreground">
                      {key}: <span className="font-mono tabular-nums">{String(val)}</span>
                    </span>
                  ))}
                  {attempt.duration_seconds != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {attempt.duration_seconds < 60
                        ? `${attempt.duration_seconds.toFixed(1)}s`
                        : `${Math.round(attempt.duration_seconds / 60)}m`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
