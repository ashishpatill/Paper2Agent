/**
 * Evolution store — cross-run learning with time-decay.
 *
 * M2.7-Inspired: Run → Evaluate → Learn → Evolve → Repeat
 *
 * Persists lessons learned from pipeline runs as JSONL entries.
 * Each run creates its own scoped memory directory. Cross-run
 * aggregation deduplicates and weights lessons by success rate + recency.
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
  | "workaround"       // Temporary fix for a known issue
  | "strategy";        // Overall approach that succeeded

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

/** Per-run memory: captures everything about one pipeline execution */
export interface RunMemory {
  runId: string;
  paperTitle?: string;
  githubUrl?: string;
  operatorNotes?: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed" | "partial";
  steps: RunStepMemory[];
}

export interface RunStepMemory {
  stepNumber: number;
  stepName: string;
  status: "completed" | "failed" | "skipped" | "decomposed";
  attempts: number;
  errors: string[];
  fixes: string[];
  tokensUsed?: number;
  artifacts: string[]; // paths to generated files
  lessons: string[];   // distilled lessons from this step
}

/** Strategy pattern: successful approaches that can be replayed */
export interface StrategyPattern {
  id: string;
  signature: string;     // normalized problem signature (e.g. "step3-MissingDependency-conllu")
  stage: PipelineStage;
  strategy: string;      // what to do
  actions: string[];     // concrete actions to take
  successCount: number;
  failureCount: number;
  lastUsed: string;
  contexts: string[];    // repos/papers where this worked
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_STORE_DIR = ".paper2agent/local/evolution";
const RUN_MEMORY_DIR = ".paper2agent/local/runs";
const STRATEGIES_FILE = "strategies.jsonl";
const STORE_FILENAME = "lessons.jsonl";

// ---------------------------------------------------------------------------
// Evolution Store
// ---------------------------------------------------------------------------

export class EvolutionStore {
  private storePath: string;
  private halfLifeDays: number;
  private baseDir: string;

  constructor(baseDir: string, halfLifeDays = DEFAULT_HALF_LIFE_DAYS) {
    this.baseDir = baseDir;
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

  // -------------------------------------------------------------------------
  // Run-Scoped Memory (M2.7-Inspired Persistent Memory)
  // -------------------------------------------------------------------------

  /** Create a new run memory file for a pipeline execution */
  createRunMemory(run: Omit<RunMemory, "steps">): string {
    const runDir = path.join(this.baseDir, RUN_MEMORY_DIR);
    fs.mkdirSync(runDir, { recursive: true });
    const runFile = path.join(runDir, `${run.runId}.json`);
    const memory: RunMemory = { ...run, steps: [] };
    fs.writeFileSync(runFile, JSON.stringify(memory, null, 2), "utf-8");
    return runFile;
  }

  /** Record a step outcome in the run memory */
  recordStep(runId: string, step: RunStepMemory): void {
    const runFile = path.join(this.baseDir, RUN_MEMORY_DIR, `${runId}.json`);
    if (!fs.existsSync(runFile)) return;
    const memory = JSON.parse(fs.readFileSync(runFile, "utf-8")) as RunMemory;
    // Update or append
    const existing = memory.steps.findIndex(s => s.stepNumber === step.stepNumber);
    if (existing >= 0) {
      memory.steps[existing] = step;
    } else {
      memory.steps.push(step);
    }
    fs.writeFileSync(runFile, JSON.stringify(memory, null, 2), "utf-8");
  }

  /** Complete a run (mark finished) */
  completeRun(runId: string, status: RunMemory["status"]): void {
    const runFile = path.join(this.baseDir, RUN_MEMORY_DIR, `${runId}.json`);
    if (!fs.existsSync(runFile)) return;
    const memory = JSON.parse(fs.readFileSync(runFile, "utf-8")) as RunMemory;
    memory.status = status;
    memory.completedAt = new Date().toISOString();
    fs.writeFileSync(runFile, JSON.stringify(memory, null, 2), "utf-8");
  }

  /** Get a run's memory */
  getRunMemory(runId: string): RunMemory | null {
    const runFile = path.join(this.baseDir, RUN_MEMORY_DIR, `${runId}.json`);
    if (!fs.existsSync(runFile)) return null;
    return JSON.parse(fs.readFileSync(runFile, "utf-8")) as RunMemory;
  }

  // -------------------------------------------------------------------------
  // Strategy Patterns (M2.7-Inspired: Learn successful approaches)
  // -------------------------------------------------------------------------

  /** Record a successful strategy */
  recordStrategy(strategy: Omit<StrategyPattern, "id" | "successCount" | "failureCount" | "lastUsed">): StrategyPattern {
    const runDir = path.join(this.baseDir, DEFAULT_STORE_DIR);
    fs.mkdirSync(runDir, { recursive: true });
    const strategiesFile = path.join(runDir, STRATEGIES_FILE);
    if (!fs.existsSync(strategiesFile)) {
      fs.writeFileSync(strategiesFile, "", "utf-8");
    }

    // Check if this signature already exists
    const existing = this.getStrategyBySignature(strategy.signature);
    if (existing) {
      existing.successCount++;
      existing.lastUsed = new Date().toISOString();
      // Merge contexts (deduplicate)
      const contextSet = new Set([...existing.contexts, ...strategy.contexts]);
      existing.contexts = Array.from(contextSet).slice(0, 10);
      // Update in file
      this.updateStrategy(existing);
      return existing;
    }

    const full: StrategyPattern = {
      ...strategy,
      id: `strat_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      successCount: 1,
      failureCount: 0,
      lastUsed: new Date().toISOString()
    };
    fs.appendFileSync(strategiesFile, JSON.stringify(full) + "\n", "utf-8");
    return full;
  }

  /** Record a failed strategy attempt */
  recordStrategyFailure(signature: string, stage: PipelineStage): void {
    const existing = this.getStrategyBySignature(signature);
    if (existing) {
      existing.failureCount++;
      existing.lastUsed = new Date().toISOString();
      this.updateStrategy(existing);
    }
  }

  /** Get best strategies for a stage, sorted by success rate */
  getStrategiesForStage(stage: PipelineStage, limit = 5): StrategyPattern[] {
    const strategies = this.loadAllStrategies();
    return strategies
      .filter(s => s.stage === stage && s.successCount > 0)
      .sort((a, b) => {
        const rateA = a.successCount / (a.successCount + a.failureCount);
        const rateB = b.successCount / (b.successCount + b.failureCount);
        return rateB - rateA;
      })
      .slice(0, limit);
  }

  /** Get known solution for a specific problem signature */
  getStrategyBySignature(signature: string): StrategyPattern | null {
    const strategies = this.loadAllStrategies();
    return strategies.find(s => s.signature === signature) || null;
  }

  /** Get lessons for a specific step/stage (for pre-step injection) */
  getLessonsForStep(stepName: string, stage: PipelineStage, limit = 5): WeightedEntry[] {
    const entries = this.queryByStage(stage, limit * 3);
    // Filter to entries relevant to this step
    const stepKeywords = stepName.toLowerCase().split(/[\s_-]+/);
    const scored = entries.map(e => {
      let score = e.weight;
      // Boost if tags or lesson text mentions this step
      const text = (e.lesson + " " + e.tags.join(" ")).toLowerCase();
      for (const kw of stepKeywords) {
        if (text.includes(kw)) score *= 1.5;
      }
      return { ...e, weight: Math.min(score, 1.0) };
    });
    return scored.sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private loadAllStrategies(): StrategyPattern[] {
    const runDir = path.join(this.baseDir, DEFAULT_STORE_DIR);
    const strategiesFile = path.join(runDir, STRATEGIES_FILE);
    if (!fs.existsSync(strategiesFile)) return [];
    const lines = fs.readFileSync(strategiesFile, "utf-8").trim().split("\n");
    return lines
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) as StrategyPattern; } catch { return null; } })
      .filter((s): s is StrategyPattern => s !== null);
  }

  private updateStrategy(strategy: StrategyPattern): void {
    const runDir = path.join(this.baseDir, DEFAULT_STORE_DIR);
    const strategiesFile = path.join(runDir, STRATEGIES_FILE);
    const lines = fs.readFileSync(strategiesFile, "utf-8").trim().split("\n");
    const updated = lines
      .filter(l => l.trim())
      .map(l => {
        try {
          const s = JSON.parse(l) as StrategyPattern;
          return s.id === strategy.id ? strategy : s;
        } catch { return l; }
      });
    fs.writeFileSync(strategiesFile, updated.join("\n") + "\n", "utf-8");
  }
}
