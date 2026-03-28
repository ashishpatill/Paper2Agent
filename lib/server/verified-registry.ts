/**
 * Anti-fabrication registry for experiment results.
 *
 * Every numeric value that appears in a final report must trace back to an
 * actual experiment artifact (log file, result JSON, or stdout capture).
 * The registry rejects values that cannot be verified against ground-truth
 * sources, preventing hallucinated or fabricated metrics.
 *
 * Inspired by AutoResearchClaw's verified_registry.py pattern.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifiedValue {
  metric: string;
  value: number;
  source: string;          // file path or "stdout:<experiment>"
  sourceType: "result_json" | "log_file" | "stdout" | "refinement_log";
  lineNumber?: number;     // line in source where value was found
  registeredAt: string;    // ISO timestamp
}

export interface RegistryValidation {
  claimed: { metric: string; value: number };
  verified: boolean;
  matchedEntry?: VerifiedValue;
  reason: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class VerifiedRegistry {
  private entries: Map<string, VerifiedValue[]> = new Map();
  private relativeTolerance: number;

  constructor(relativeTolerance = 0.01) {
    this.relativeTolerance = relativeTolerance;
  }

  /** Register a ground-truth value from an experiment artifact */
  register(entry: Omit<VerifiedValue, "registeredAt">): void {
    const full: VerifiedValue = {
      ...entry,
      registeredAt: new Date().toISOString(),
    };
    const existing = this.entries.get(entry.metric) || [];
    existing.push(full);
    this.entries.set(entry.metric, existing);
  }

  /** Validate a claimed metric value against the registry */
  validate(metric: string, claimedValue: number): RegistryValidation {
    const entries = this.entries.get(metric);
    if (!entries || entries.length === 0) {
      return {
        claimed: { metric, value: claimedValue },
        verified: false,
        reason: `No ground-truth entry found for metric "${metric}"`,
      };
    }

    // Check if any registered value matches within tolerance
    for (const entry of entries) {
      if (this.valuesMatch(entry.value, claimedValue)) {
        return {
          claimed: { metric, value: claimedValue },
          verified: true,
          matchedEntry: entry,
          reason: `Matches registered value ${entry.value} from ${entry.source}`,
        };
      }
    }

    // Check for reasonable transformations (percentage ↔ decimal, rounding)
    for (const entry of entries) {
      const transformed = this.checkTransformations(entry.value, claimedValue);
      if (transformed) {
        return {
          claimed: { metric, value: claimedValue },
          verified: true,
          matchedEntry: entry,
          reason: `Matches via ${transformed} of registered value ${entry.value} from ${entry.source}`,
        };
      }
    }

    const closest = entries.reduce((best, e) =>
      Math.abs(e.value - claimedValue) < Math.abs(best.value - claimedValue) ? e : best
    );

    return {
      claimed: { metric, value: claimedValue },
      verified: false,
      matchedEntry: closest,
      reason: `Closest registered value is ${closest.value} (delta: ${(claimedValue - closest.value).toFixed(6)}) from ${closest.source}`,
    };
  }

  /** Validate all metrics in a record, return array of validations */
  validateAll(metrics: Record<string, number>): RegistryValidation[] {
    return Object.entries(metrics).map(([metric, value]) =>
      this.validate(metric, value)
    );
  }

  /** Scan experiment result files and register all values found */
  scanResultFiles(resultsDir: string): number {
    let count = 0;
    if (!fs.existsSync(resultsDir)) return count;

    const files = fs.readdirSync(resultsDir).filter(f => f.endsWith("_result.json"));
    for (const file of files) {
      const filePath = path.join(resultsDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (data.metrics && typeof data.metrics === "object") {
          for (const [metric, value] of Object.entries(data.metrics)) {
            if (typeof value === "number") {
              this.register({
                metric,
                value,
                source: filePath,
                sourceType: "result_json",
              });
              count++;
            }
          }
        }
      } catch {
        // Skip malformed files
      }
    }
    return count;
  }

  /** Scan experiment log files for RESULT lines and register values */
  scanLogFiles(resultsDir: string): number {
    let count = 0;
    if (!fs.existsSync(resultsDir)) return count;

    const logFiles = fs.readdirSync(resultsDir).filter(f => f.endsWith(".log"));
    const resultPattern = /^RESULT\s+experiment=\S+\s+metric=(\S+)\s+value=([0-9.eE+-]+)/;

    for (const file of logFiles) {
      const filePath = path.join(resultsDir, file);
      try {
        const lines = fs.readFileSync(filePath, "utf-8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(resultPattern);
          if (match) {
            const value = parseFloat(match[2]);
            if (!isNaN(value)) {
              this.register({
                metric: match[1],
                value,
                source: filePath,
                sourceType: "log_file",
                lineNumber: i + 1,
              });
              count++;
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
    return count;
  }

  /** Scan refinement/fix-loop logs */
  scanRefinementLog(fixLoopDir: string): number {
    let count = 0;
    const statePath = path.join(fixLoopDir, "fix_loop_state.json");
    if (!fs.existsSync(statePath)) return count;

    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      if (Array.isArray(state.attempts)) {
        for (const attempt of state.attempts) {
          if (attempt.metrics && typeof attempt.metrics === "object") {
            for (const [metric, value] of Object.entries(attempt.metrics)) {
              if (typeof value === "number") {
                this.register({
                  metric,
                  value,
                  source: statePath,
                  sourceType: "refinement_log",
                });
                count++;
              }
            }
          }
        }
      }
    } catch {
      // Skip malformed file
    }
    return count;
  }

  /** Get all registered entries */
  getEntries(): Map<string, VerifiedValue[]> {
    return new Map(this.entries);
  }

  /** Export registry as JSON for persistence */
  toJSON(): Record<string, VerifiedValue[]> {
    const out: Record<string, VerifiedValue[]> = {};
    for (const [key, values] of this.entries) {
      out[key] = values;
    }
    return out;
  }

  /** Load registry from previously saved JSON */
  static fromJSON(
    data: Record<string, VerifiedValue[]>,
    relativeTolerance = 0.01
  ): VerifiedRegistry {
    const reg = new VerifiedRegistry(relativeTolerance);
    for (const [key, values] of Object.entries(data)) {
      reg.entries.set(key, values);
    }
    return reg;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private valuesMatch(registered: number, claimed: number): boolean {
    if (registered === 0 && claimed === 0) return true;
    if (registered === 0) return Math.abs(claimed) < 1e-9;
    return Math.abs(registered - claimed) / Math.abs(registered) <= this.relativeTolerance;
  }

  /** Check common transformations: percentage↔decimal, rounding */
  private checkTransformations(registered: number, claimed: number): string | null {
    // percentage → decimal (e.g., 95.5 → 0.955)
    if (this.valuesMatch(registered / 100, claimed)) {
      return "percentage-to-decimal";
    }
    // decimal → percentage (e.g., 0.955 → 95.5)
    if (this.valuesMatch(registered * 100, claimed)) {
      return "decimal-to-percentage";
    }
    // rounding to fewer decimal places
    for (const decimals of [0, 1, 2, 3]) {
      const rounded = parseFloat(registered.toFixed(decimals));
      if (this.valuesMatch(rounded, claimed)) {
        return `rounding-to-${decimals}-decimals`;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Convenience: build a registry from a workspace
// ---------------------------------------------------------------------------

/** Scan a project workspace and build a fully populated registry */
export function buildRegistryFromWorkspace(workspacePath: string): VerifiedRegistry {
  const registry = new VerifiedRegistry();
  const resultsDir = path.join(workspacePath, "reports", "experiment_results");
  const fixLoopDir = path.join(workspacePath, "reports", "fix_loop");

  registry.scanResultFiles(resultsDir);
  registry.scanLogFiles(resultsDir);
  registry.scanRefinementLog(fixLoopDir);

  return registry;
}
