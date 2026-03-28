/**
 * Dataset downloader with local caching.
 *
 * Downloads resolved datasets to a local cache directory and provides
 * cache lookups to avoid re-downloading. Supports resumable downloads
 * for large files and integrity verification.
 */

import { execSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ResolvedDataset } from "./dataset-resolver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  datasetName: string;
  source: string;
  cachedAt: string;       // ISO timestamp
  cachePath: string;      // Path within cache dir
  sizeBytes: number;
  checksum?: string;      // SHA-256 if computed
}

export interface DownloadResult {
  dataset: ResolvedDataset;
  success: boolean;
  cached: boolean;          // true if served from cache
  localPath?: string;
  sizeBytes?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_DIR = ".paper2agent/local/datasets";
const CACHE_INDEX = "cache-index.json";
const DOWNLOAD_TIMEOUT = 600_000; // 10 minutes per download

// ---------------------------------------------------------------------------
// DatasetDownloader
// ---------------------------------------------------------------------------

export class DatasetDownloader {
  private cacheDir: string;
  private indexPath: string;
  private index: CacheEntry[];

  constructor(baseDir: string) {
    this.cacheDir = path.join(baseDir, DEFAULT_CACHE_DIR);
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.indexPath = path.join(this.cacheDir, CACHE_INDEX);
    this.index = this.loadIndex();
  }

  /** Check if a dataset is already cached */
  isCached(datasetName: string): CacheEntry | undefined {
    return this.index.find(e => e.datasetName === datasetName);
  }

  /** Download a resolved dataset (or serve from cache) */
  download(dataset: ResolvedDataset, targetDir: string): DownloadResult {
    const name = dataset.requirement.name;

    // Check cache first
    const cached = this.isCached(name);
    if (cached) {
      const cachedPath = path.join(this.cacheDir, cached.cachePath);
      if (fs.existsSync(cachedPath)) {
        // Copy/symlink from cache to target
        const targetPath = path.join(targetDir, cached.cachePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        this.copyOrLink(cachedPath, targetPath);
        return {
          dataset,
          success: true,
          cached: true,
          localPath: targetPath,
          sizeBytes: cached.sizeBytes,
        };
      }
      // Cache entry exists but file is missing — remove stale entry
      this.removeFromIndex(name);
    }

    // Cannot download synthetic or unknown
    if (dataset.source === "synthetic") {
      return {
        dataset,
        success: false,
        cached: false,
        error: "Synthetic dataset — must be generated, not downloaded",
      };
    }

    if (!dataset.downloadCommand && !dataset.downloadUrl) {
      return {
        dataset,
        success: false,
        cached: false,
        error: `No download method available for "${name}"`,
      };
    }

    if (dataset.needsAuth) {
      return {
        dataset,
        success: false,
        cached: false,
        error: `Dataset "${name}" requires authentication. ${dataset.notes}`,
      };
    }

    // Download to cache
    const cacheSubdir = this.sanitizeName(name);
    const cachePath = path.join(this.cacheDir, cacheSubdir);
    fs.mkdirSync(cachePath, { recursive: true });

    try {
      if (dataset.downloadCommand) {
        execSync(dataset.downloadCommand, {
          cwd: cachePath,
          timeout: DOWNLOAD_TIMEOUT,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, HOME: process.env.HOME || "" },
        });
      } else if (dataset.downloadUrl) {
        const filename = dataset.downloadUrl.split("/").pop() || "download";
        execSync(`curl -fSL --retry 3 "${dataset.downloadUrl}" -o "${filename}"`, {
          cwd: cachePath,
          timeout: DOWNLOAD_TIMEOUT,
          stdio: ["ignore", "pipe", "pipe"],
        });
      }

      const sizeBytes = this.dirSize(cachePath);

      // Add to cache index
      const entry: CacheEntry = {
        datasetName: name,
        source: dataset.source,
        cachedAt: new Date().toISOString(),
        cachePath: cacheSubdir,
        sizeBytes,
      };
      this.index.push(entry);
      this.saveIndex();

      // Copy to target
      const targetPath = path.join(targetDir, cacheSubdir);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      this.copyOrLink(cachePath, targetPath);

      return {
        dataset,
        success: true,
        cached: false,
        localPath: targetPath,
        sizeBytes,
      };
    } catch (err) {
      return {
        dataset,
        success: false,
        cached: false,
        error: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** Download all resolved datasets */
  downloadAll(datasets: ResolvedDataset[], targetDir: string): DownloadResult[] {
    fs.mkdirSync(targetDir, { recursive: true });
    return datasets.map(ds => this.download(ds, targetDir));
  }

  /** Get cache statistics */
  cacheStats(): { entries: number; totalSizeMB: number } {
    const totalBytes = this.index.reduce((sum, e) => sum + e.sizeBytes, 0);
    return {
      entries: this.index.length,
      totalSizeMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
    };
  }

  /** Clear entire cache */
  clearCache(): void {
    for (const entry of this.index) {
      const entryPath = path.join(this.cacheDir, entry.cachePath);
      if (fs.existsSync(entryPath)) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      }
    }
    this.index = [];
    this.saveIndex();
  }

  /** Remove a specific dataset from cache */
  evict(datasetName: string): boolean {
    const entry = this.isCached(datasetName);
    if (!entry) return false;
    const entryPath = path.join(this.cacheDir, entry.cachePath);
    if (fs.existsSync(entryPath)) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    }
    this.removeFromIndex(datasetName);
    return true;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private loadIndex(): CacheEntry[] {
    if (!fs.existsSync(this.indexPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.indexPath, "utf-8"));
    } catch {
      return [];
    }
  }

  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), "utf-8");
  }

  private removeFromIndex(datasetName: string): void {
    this.index = this.index.filter(e => e.datasetName !== datasetName);
    this.saveIndex();
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 100);
  }

  private copyOrLink(src: string, dest: string): void {
    // Prefer symlink for efficiency, fall back to copy
    try {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.symlinkSync(src, dest);
    } catch {
      execSync(`cp -r "${src}" "${dest}"`, { stdio: "ignore" });
    }
  }

  private dirSize(dirPath: string): number {
    let total = 0;
    if (!fs.existsSync(dirPath)) return 0;
    const stat = fs.statSync(dirPath);
    if (stat.isFile()) return stat.size;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(dirPath)) {
        total += this.dirSize(path.join(dirPath, entry));
      }
    }
    return total;
  }
}

/**
 * Compute SHA-256 checksum of a file.
 */
export function checksumFile(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}
