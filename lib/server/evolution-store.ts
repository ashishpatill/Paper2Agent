/**
 * Evolution store — cross-run learning with time-decay.
 *
 * Persists lessons learned from pipeline runs as JSONL entries.
 * Each entry has a stage tag, timestamp, and content. Older entries
 * decay in relevance via a configurable half-life (default 30 days).
 * Inspired by AutoResearchClaw's evolution store pattern.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStage =
  | "environment"
  | "tutorial-scan"
  | "tutorial-execute"
  | "tool-extraction"
  | "mcp-wrap"
  | "gap-analysis"
  | "paper-coder"
  | "experiment-runner"
  | "results-comparator"
  | "fix-loop"
  | "mcp-rewrap"
  | "general";

export type LessonCategory =
  | "error-fix"        // A specific error and how it was resolved
  | "environment"      // Environment setup quirk (package version, OS issue)
  | "pattern"          // A code pattern that worked or failed
  | "performance"      // Timing/resource observation
  | "data"             // Dataset handling insight
  | "prompt"           // Prompt engineering insight
  | "workaround";      // Temporary fix for a known issue

export interface EvolutionEntry {
  id: string;
  timestamp: string;        // ISO 8601
  stage: PipelineStage;
  category: LessonCategory;
  paperSlug?: string;       // Which paper run this came from
  repoName?: string;        // Which repo was being processed
  lesson: string;           // Human-readable lesson
  context?: string;         // Additional detail (error message, code snippet)
  tags: string[];           // Searchable tags
}

export interface WeightedEntry extends EvolutionEntry {
  weight: number;           // 0-1, decayed by age
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_STORE_DIR = ".paper2agent/local/evolution";
const STORE_FILENAME = "lessons.jsonl";

// ---------------------------------------------------------------------------
// Evolution Store
// ---------------------------------------------------------------------------

export class EvolutionStore {
  private storePath: string;
  private halfLifeDays: number;

  constructor(baseDir: string, halfLifeDays = DEFAULT_HALF_LIFE_DAYS) {
    const storeDir = path.join(baseDir, DEFAULT_STORE_DIR);
    fs.mkdirSync(storeDir, { recursive: true });
    this.storePath = path.join(storeDir, STORE_FILENAME);
    this.halfLifeDays = halfLifeDays;

    // Create file if it doesn't exist
    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, "", "utf-8");
    }
  }

  /** Append a new lesson to the store */
  append(entry: Omit<EvolutionEntry, "id" | "timestamp">): EvolutionEntry {
    const full: EvolutionEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(this.storePath, JSON.stringify(full) + "\n", "utf-8");
    return full;
  }

  /** Read all entries (raw, no decay applied) */
  readAll(): EvolutionEntry[] {
    if (!fs.existsSync(this.storePath)) return [];
    const lines = fs.readFileSync(this.storePath, "utf-8").trim().split("\n");
    return lines
      .filter(line => line.length > 0)
      .map(line => {
        try { return JSON.parse(line) as EvolutionEntry; }
        catch { return null; }
      })
      .filter((e): e is EvolutionEntry => e !== null);
  }

  /** Query entries for a specific stage, with decay weights applied */
  queryByStage(stage: PipelineStage, limit = 10): WeightedEntry[] {
    const all = this.readAll();
    const now = Date.now();
    const matched = all
      .filter(e => e.stage === stage || e.stage === "general")
      .map(e => ({
        ...e,
        weight: this.computeDecay(now, new Date(e.timestamp).getTime()),
      }))
      .filter(e => e.weight > 0.01) // Drop entries with <1% relevance
      .sort((a, b) => b.weight - a.weight);

    return matched.slice(0, limit);
  }

  /** Query entries matching any of the given tags */
  queryByTags(tags: string[], limit = 10): WeightedEntry[] {
    const all = this.readAll();
    const now = Date.now();
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    return all
      .filter(e => e.tags.some(t => tagSet.has(t.toLowerCase())))
      .map(e => ({
        ...e,
        weight: this.computeDecay(now, new Date(e.timestamp).getTime()),
      }))
      .filter(e => e.weight > 0.01)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  /** Query entries from a specific paper/repo run */
  queryByRun(paperSlug?: string, repoName?: string, limit = 20): WeightedEntry[] {
    const all = this.readAll();
    const now = Date.now();
    return all
      .filter(e => {
        if (paperSlug && e.paperSlug !== paperSlug) return false;
        if (repoName && e.repoName !== repoName) return false;
        return true;
      })
      .map(e => ({
        ...e,
        weight: this.computeDecay(now, new Date(e.timestamp).getTime()),
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  /** Prune entries older than the cutoff or below minimum weight */
  prune(minWeight = 0.01): { removed: number; remaining: number } {
    const all = this.readAll();
    const now = Date.now();
    const kept = all.filter(e => {
      const weight = this.computeDecay(now, new Date(e.timestamp).getTime());
      return weight >= minWeight;
    });
    const removed = all.length - kept.length;

    // Rewrite the file with kept entries
    const content = kept.map(e => JSON.stringify(e)).join("\n") + (kept.length > 0 ? "\n" : "");
    fs.writeFileSync(this.storePath, content, "utf-8");

    return { removed, remaining: kept.length };
  }

  /** Get store statistics */
  stats(): { total: number; byStage: Record<string, number>; byCategory: Record<string, number>; oldestDays: number } {
    const all = this.readAll();
    const byStage: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let oldest = Date.now();

    for (const e of all) {
      byStage[e.stage] = (byStage[e.stage] || 0) + 1;
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      const ts = new Date(e.timestamp).getTime();
      if (ts < oldest) oldest = ts;
    }

    return {
      total: all.length,
      byStage,
      byCategory,
      oldestDays: all.length > 0 ? (Date.now() - oldest) / (1000 * 60 * 60 * 24) : 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private computeDecay(now: number, entryTime: number): number {
    const ageDays = (now - entryTime) / (1000 * 60 * 60 * 24);
    // Exponential decay: weight = 2^(-age/halfLife)
    return Math.pow(2, -ageDays / this.halfLifeDays);
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `evo_${ts}_${rand}`;
  }
}
