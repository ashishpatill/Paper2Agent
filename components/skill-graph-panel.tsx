"use client";

import { useMemo } from "react";
import { ArrowDownToLine } from "lucide-react";

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
    id: "implement",
    label: "Implement",
    description: "Generate, run, and validate experiment code from the paper."
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

/** Build a lookup: skillId → list of skills that depend on it (used-by) */
function buildDependencyMaps(edges: SkillGraph["edges"]) {
  const requires = new Map<string, string[]>();  // skill → what it requires
  const usedBy = new Map<string, string[]>();    // skill → what uses it

  for (const edge of edges) {
    const reqList = requires.get(edge.to) || [];
    reqList.push(edge.from);
    requires.set(edge.to, reqList);

    const usedList = usedBy.get(edge.from) || [];
    usedList.push(edge.to);
    usedBy.set(edge.from, usedList);
  }

  return { requires, usedBy };
}

/** Humanize a skill ID into a short title fragment */
function humanizeId(id: string) {
  return id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SkillGraphPanel({
  graph,
  title,
  description
}: {
  graph: SkillGraph;
  title: string;
  description: string;
}) {
  const { requires, usedBy } = useMemo(
    () => buildDependencyMaps(graph.edges),
    [graph.edges]
  );

  // Build a node title lookup for dependency badges
  const nodeTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of graph.nodes) {
      map.set(node.id, node.title);
    }
    return map;
  }, [graph.nodes]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-background/60">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        {/* Dependency Legend */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
          <ArrowDownToLine className="h-3.5 w-3.5" />
          <span className="font-medium">Dependencies flow left → right across stages.</span>
          <span>Each card shows what it <strong>requires</strong> (←) and what <strong>uses it</strong> (→).</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-6">
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
                  {stageNodes.map((node) => {
                    const nodeRequires = requires.get(node.id) || [];
                    const nodeUsedBy = usedBy.get(node.id) || [];

                    return (
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

                        {/* Dependency badges */}
                        {(nodeRequires.length > 0 || nodeUsedBy.length > 0) && (
                          <div className="mt-3 space-y-1.5 border-t border-border/30 pt-2">
                            {nodeRequires.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                  Requires
                                </span>
                                {nodeRequires.map((dep) => (
                                  <Badge key={`${node.id}-req-${dep}`} variant="outline" className="text-[10px]">
                                    ← {nodeTitles.get(dep) || humanizeId(dep)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {nodeUsedBy.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                  Used by
                                </span>
                                {nodeUsedBy.map((user) => (
                                  <Badge key={`${node.id}-used-${user}`} variant="secondary" className="text-[10px]">
                                    → {nodeTitles.get(user) || humanizeId(user)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

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
                    );
                  })}
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
