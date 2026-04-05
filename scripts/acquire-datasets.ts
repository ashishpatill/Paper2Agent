/**
 * CLI helper for dataset acquisition.
 * Called by step 9 (paper coder) before generating experiment code.
 *
 * Usage: npx tsx scripts/acquire-datasets.ts <baseDir> <workspacePath> [paperAnalysisPath]
 *
 * Reads datasets_required from the paper analysis, resolves sources,
 * downloads public datasets, and generates synthetic proxies for unavailable ones.
 */

import * as fs from "fs";
import * as path from "path";
import { resolveAllDatasets, generateAcquisitionScript } from "../lib/server/dataset-resolver";
import { DatasetDownloader } from "../lib/server/dataset-downloader";
import { generateSyntheticDataset } from "../lib/server/synthetic-data";
import type { DatasetRequirement } from "../lib/server/types";

const [,, baseDir, workspacePath, paperAnalysisPath] = process.argv;

if (!baseDir || !workspacePath) {
  process.stderr.write("Usage: acquire-datasets.ts <baseDir> <workspacePath> [paperAnalysisPath]\n");
  process.exit(1);
}

// Load dataset requirements
let requirements: DatasetRequirement[] = [];

if (paperAnalysisPath && fs.existsSync(paperAnalysisPath)) {
  try {
    const analysis = JSON.parse(fs.readFileSync(paperAnalysisPath, "utf-8"));
    requirements = analysis.datasets_required || [];
  } catch (err) {
    process.stderr.write(`Failed to parse paper analysis: ${err}\n`);
  }
}

// Also check gap analysis for data requirements
const gapPath = path.join(workspacePath, "reports", "gap_analysis.json");
if (fs.existsSync(gapPath)) {
  try {
    const gap = JSON.parse(fs.readFileSync(gapPath, "utf-8"));
    if (Array.isArray(gap.gaps)) {
      for (const g of gap.gaps) {
        if (g.requires_data && g.capability) {
          // Check if already in requirements
          if (!requirements.some(r => r.name.toLowerCase() === g.capability.toLowerCase())) {
            requirements.push({
              name: g.capability,
              publicly_available: true, // Assume public unless stated otherwise
            });
          }
        }
      }
    }
  } catch { /* skip */ }
}

if (requirements.length === 0) {
  process.stderr.write("No dataset requirements found — skipping acquisition\n");
  process.exit(0);
}

process.stderr.write(`Found ${requirements.length} dataset requirement(s)\n`);

// Resolve sources
const resolved = resolveAllDatasets(requirements);
const dataDir = path.join(workspacePath, "data");
fs.mkdirSync(dataDir, { recursive: true });

// Generate acquisition script for reference
const scriptContent = generateAcquisitionScript(resolved);
const scriptPath = path.join(dataDir, "acquire_data.sh");
fs.writeFileSync(scriptPath, scriptContent, "utf-8");
fs.chmodSync(scriptPath, "755");
process.stderr.write(`Wrote acquisition script: ${scriptPath}\n`);

// Download what we can
const downloader = new DatasetDownloader(baseDir);
let downloaded = 0;
let synthetic = 0;
let failed = 0;

for (const ds of resolved) {
  if (ds.source === "synthetic" || (!ds.requirement.publicly_available)) {
    // Generate synthetic proxy
    const result = generateSyntheticDataset(ds.requirement, dataDir);
    process.stderr.write(`  SYNTHETIC: ${ds.requirement.name} → ${result.scriptPath}\n`);
    synthetic++;
    continue;
  }

  if (ds.needsAuth) {
    process.stderr.write(`  SKIP (auth required): ${ds.requirement.name}\n`);
    // Generate synthetic fallback
    const result = generateSyntheticDataset(ds.requirement, dataDir);
    process.stderr.write(`    → Generated synthetic fallback: ${result.scriptPath}\n`);
    synthetic++;
    continue;
  }

  if (!ds.downloadCommand && !ds.downloadUrl) {
    process.stderr.write(`  SKIP (no download method): ${ds.requirement.name}\n`);
    failed++;
    continue;
  }

  const result = downloader.download(ds, dataDir);
  if (result.success) {
    const label = result.cached ? "CACHED" : "DOWNLOADED";
    process.stderr.write(`  ${label}: ${ds.requirement.name} → ${result.localPath}\n`);
    downloaded++;
  } else {
    process.stderr.write(`  FAILED: ${ds.requirement.name} — ${result.error}\n`);
    // Generate synthetic fallback
    const synthResult = generateSyntheticDataset(ds.requirement, dataDir);
    process.stderr.write(`    → Generated synthetic fallback: ${synthResult.scriptPath}\n`);
    synthetic++;
  }
}

// Summary
process.stderr.write(`\nDataset acquisition: ${downloaded} downloaded, ${synthetic} synthetic, ${failed} failed\n`);

const stats = downloader.cacheStats();
process.stderr.write(`Cache: ${stats.entries} entries, ${stats.totalSizeMB} MB\n`);

// Write structured report for UI consumption
const syntheticDatasets: string[] = [];
const downloadedDatasets: string[] = [];
const failedDatasets: string[] = [];

for (const ds of resolved) {
  if (!ds.requirement.publicly_available || ds.needsAuth) {
    syntheticDatasets.push(ds.requirement.name);
  } else if (!ds.downloadCommand && !ds.downloadUrl) {
    failedDatasets.push(ds.requirement.name);
  } else {
    downloadedDatasets.push(ds.requirement.name);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  total: resolved.length,
  downloaded: downloadedDatasets.length,
  synthetic: syntheticDatasets.length,
  failed: failedDatasets.length,
  downloadedDatasets,
  syntheticDatasets,
  failedDatasets,
};

const reportsDir = path.join(workspacePath, "reports");
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(path.join(reportsDir, "dataset-acquisition.json"), JSON.stringify(report, null, 2), "utf-8");
process.stderr.write(`Wrote dataset acquisition report: ${path.join(reportsDir, "dataset-acquisition.json")}\n`);
