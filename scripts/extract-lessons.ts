/**
 * CLI helper to extract lessons from a completed pipeline run.
 * Called at the end of Paper2Agent.sh:
 *   npx tsx scripts/extract-lessons.ts <baseDir> <workspacePath> [paperSlug] [repoName]
 */

import { EvolutionStore } from "../lib/server/evolution-store";
import { extractLessons } from "../lib/server/skill-transfer";

const [,, baseDir, workspacePath, paperSlug, repoName] = process.argv;

if (!baseDir || !workspacePath) {
  process.stderr.write("Usage: extract-lessons.ts <baseDir> <workspacePath> [paperSlug] [repoName]\n");
  process.exit(1);
}

const store = new EvolutionStore(baseDir);
const result = extractLessons(store, {
  workspacePath,
  paperSlug: paperSlug || undefined,
  repoName: repoName || undefined,
});

if (result.lessonsExtracted > 0) {
  process.stderr.write(`Extracted ${result.lessonsExtracted} lesson(s) from run\n`);
  for (const [cat, count] of Object.entries(result.categories)) {
    process.stderr.write(`  ${cat}: ${count}\n`);
  }
} else {
  process.stderr.write("No transferable lessons found in this run\n");
}

// Also print store stats
const stats = store.stats();
process.stderr.write(`Evolution store: ${stats.total} total entries across ${Object.keys(stats.byStage).length} stages\n`);
