"use client";

import type { SkillGraph, SkillGraphNode, SkillStage } from "@/lib/server/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STAGES: Array<{ id: SkillStage; label: string; description: string }> = [
  {
    id: "discover",
    label: "Discover",
    description: "Understand the paper and find the right repository surface."
  },
  {
    id: "build",
    label: "Build",
    description: "Execute examples and extract reusable tools."
  },
  {
    id: "package",
    label: "Package",
    description: "Wrap the extracted capabilities for tool-aware assistants."
  },
  {
    id: "verify",
    label: "Verify",
    description: "Check quality and benchmark the resulting agent."
  },
  {
    id: "operate",
    label: "Operate",
    description: "Use the graph to decide which specialist should act next."
  }
];

const levelClassNames: Record<SkillGraphNode["level"], string> = {
  core: "border-primary/35 bg-primary/8",
  recommended: "border-accent/50 bg-accent/15",
  optional: "border-border/70 bg-card/70"
};

export function SkillGraphPanel({
  graph,
  title,
  description
}: {
  graph: SkillGraph;
  title: string;
  description: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-background/60">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        <div className="grid gap-4 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const stageNodes = graph.nodes.filter((node) => node.stage === stage.id);

            return (
              <div key={stage.id} className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {stage.label}
                  </h3>
                  <p className="text-xs text-muted-foreground">{stage.description}</p>
                </div>
                <div className="space-y-3">
                  {stageNodes.map((node) => (
                    <div
                      key={node.id}
                      className={cn(
                        "rounded-[1.35rem] border p-4 shadow-sm transition",
                        levelClassNames[node.level]
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold">{node.title}</h4>
                        <Badge variant={node.level === "core" ? "default" : node.level === "recommended" ? "success" : "outline"}>
                          {node.level}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{node.summary}</p>
                      <p className="mt-3 text-xs text-muted-foreground">{node.reason}</p>
                      {(node.codexSkill || node.claudeAgent) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {node.codexSkill ? (
                            <Badge variant="outline">Codex: {node.codexSkill}</Badge>
                          ) : null}
                          {node.claudeAgent ? (
                            <Badge variant="outline">Claude: {node.claudeAgent}</Badge>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Recommended Codex skills
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {graph.recommendedCodexSkills.length > 0 ? (
                graph.recommendedCodexSkills.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No extra Codex skills selected yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Recommended Claude specialists
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {graph.recommendedClaudeAgents.length > 0 ? (
                graph.recommendedClaudeAgents.map((agent) => (
                  <Badge key={agent} variant="outline">
                    {agent}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No extra Claude specialists selected yet.</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
