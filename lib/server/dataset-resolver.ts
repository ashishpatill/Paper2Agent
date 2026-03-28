/**
 * Dataset resolver — maps paper dataset requirements to downloadable sources.
 *
 * Takes DatasetRequirement entries from paper analysis and resolves them
 * to concrete download instructions. Supports HuggingFace datasets,
 * Zenodo DOIs, UCI ML repository, and direct URLs.
 */

import type { DatasetRequirement } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DatasetSource =
  | "huggingface"
  | "zenodo"
  | "uci"
  | "url"
  | "kaggle"
  | "synthetic"
  | "unknown";

export interface ResolvedDataset {
  requirement: DatasetRequirement;
  source: DatasetSource;
  downloadUrl?: string;
  downloadCommand?: string;
  estimatedSizeMB?: number;
  format?: string;           // csv, json, parquet, tar.gz, etc.
  subsetName?: string;       // for HuggingFace dataset configs
  needsAuth: boolean;
  notes: string;
}

// ---------------------------------------------------------------------------
// Known dataset patterns
// ---------------------------------------------------------------------------

interface DatasetPattern {
  pattern: RegExp;
  source: DatasetSource;
  resolve: (name: string, match: RegExpMatchArray) => Partial<ResolvedDataset>;
}

const DATASET_PATTERNS: DatasetPattern[] = [
  // HuggingFace datasets (e.g., "squad", "glue/mrpc", "username/dataset")
  {
    pattern: /^(?:huggingface:|hf:)?([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)$/i,
    source: "huggingface",
    resolve: (_, m) => ({
      downloadCommand: `python -c "from datasets import load_dataset; ds = load_dataset('${m[1]}'); ds.save_to_disk('data/${m[1].split('/').pop()}')"`,
      notes: `HuggingFace dataset: ${m[1]}`,
    }),
  },
  // Well-known HuggingFace datasets (single name)
  {
    pattern: /^(squad|glue|mnli|snli|sst2|imdb|wikitext|c4|openwebtext|bookcorpus|cifar10|cifar100|mnist|fashion_mnist|ag_news|yelp_review|amazon_reviews|conll2003|wmt\d+)$/i,
    source: "huggingface",
    resolve: (name) => ({
      downloadCommand: `python -c "from datasets import load_dataset; ds = load_dataset('${name.toLowerCase()}'); ds.save_to_disk('data/${name.toLowerCase()}')"`,
      notes: `Well-known HuggingFace dataset: ${name}`,
    }),
  },
  // Zenodo DOIs
  {
    pattern: /(?:zenodo\.org\/records?\/|10\.5281\/zenodo\.)(\d+)/i,
    source: "zenodo",
    resolve: (_, m) => ({
      downloadUrl: `https://zenodo.org/api/records/${m[1]}/files`,
      downloadCommand: `curl -L "https://zenodo.org/api/records/${m[1]}/files" -o zenodo_${m[1]}.zip`,
      notes: `Zenodo record: ${m[1]}`,
    }),
  },
  // UCI ML Repository
  {
    pattern: /(?:archive\.ics\.uci\.edu|uci[- ]?ml|uci[- ]?repository)/i,
    source: "uci",
    resolve: (name) => ({
      notes: `UCI ML Repository dataset: ${name}. Use ucimlrepo package: pip install ucimlrepo`,
      downloadCommand: `python -c "from ucimlrepo import fetch_ucirepo; ds = fetch_ucirepo(name='${name}')"`,
    }),
  },
  // Kaggle datasets
  {
    pattern: /(?:kaggle\.com\/datasets?\/|kaggle:)([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)/i,
    source: "kaggle",
    resolve: (_, m) => ({
      downloadCommand: `kaggle datasets download -d ${m[1]} -p data/`,
      needsAuth: true,
      notes: `Kaggle dataset: ${m[1]}. Requires kaggle API credentials.`,
    }),
  },
  // Direct URLs (http/https)
  {
    pattern: /^(https?:\/\/.+)$/i,
    source: "url",
    resolve: (_, m) => {
      const url = m[1];
      const filename = url.split("/").pop() || "download";
      return {
        downloadUrl: url,
        downloadCommand: `curl -L "${url}" -o "data/${filename}"`,
        notes: `Direct download from URL`,
      };
    },
  },
];

// Well-known dataset name → source mapping for common datasets without URL
const WELLKNOWN_DATASETS: Record<string, { source: DatasetSource; command: string; notes: string }> = {
  "imagenet": { source: "url", command: "# ImageNet requires manual download from https://image-net.org/", notes: "ImageNet requires academic registration" },
  "coco": { source: "url", command: "python -c \"from pycocotools.coco import COCO; # see cocodataset.org\"", notes: "COCO dataset — download from cocodataset.org" },
  "penn treebank": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('ptb_text_only')\"", notes: "Penn Treebank via HuggingFace" },
  "ptb": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('ptb_text_only')\"", notes: "Penn Treebank via HuggingFace" },
};

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a single dataset requirement to download instructions.
 */
export function resolveDataset(req: DatasetRequirement): ResolvedDataset {
  const base: ResolvedDataset = {
    requirement: req,
    source: "unknown",
    needsAuth: false,
    notes: "",
  };

  // If not publicly available, route to synthetic
  if (!req.publicly_available) {
    return {
      ...base,
      source: "synthetic",
      notes: `Dataset "${req.name}" is not publicly available. Will generate synthetic proxy data.`,
    };
  }

  // Try source URL/hint first
  const sourceHint = req.source || req.name;

  // Check well-known datasets by name
  const lowerName = req.name.toLowerCase().trim();
  if (WELLKNOWN_DATASETS[lowerName]) {
    const known = WELLKNOWN_DATASETS[lowerName];
    return {
      ...base,
      source: known.source,
      downloadCommand: known.command,
      notes: known.notes,
    };
  }

  // Try pattern matching on source hint
  for (const pattern of DATASET_PATTERNS) {
    const match = sourceHint.match(pattern.pattern);
    if (match) {
      const resolved = pattern.resolve(req.name, match);
      return {
        ...base,
        source: pattern.source,
        needsAuth: resolved.needsAuth ?? false,
        ...resolved,
      };
    }
  }

  // Try pattern matching on name
  if (sourceHint !== req.name) {
    for (const pattern of DATASET_PATTERNS) {
      const match = req.name.match(pattern.pattern);
      if (match) {
        const resolved = pattern.resolve(req.name, match);
        return {
          ...base,
          source: pattern.source,
          needsAuth: resolved.needsAuth ?? false,
          ...resolved,
        };
      }
    }
  }

  // Fallback: assume it might be a HuggingFace dataset
  return {
    ...base,
    source: "unknown",
    notes: `Could not resolve dataset "${req.name}". Try searching HuggingFace (huggingface.co/datasets) or providing a direct URL.`,
    downloadCommand: `# TODO: manually locate and download "${req.name}"`,
  };
}

/**
 * Resolve all dataset requirements from a paper analysis.
 */
export function resolveAllDatasets(requirements: DatasetRequirement[]): ResolvedDataset[] {
  return requirements.map(resolveDataset);
}

/**
 * Generate a data acquisition script from resolved datasets.
 */
export function generateAcquisitionScript(resolved: ResolvedDataset[]): string {
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Auto-generated data acquisition script",
    '# Generated by Paper2Agent dataset resolver',
    "",
    'DATA_DIR="${1:-.}/data"',
    'mkdir -p "$DATA_DIR"',
    'cd "$DATA_DIR"',
    "",
  ];

  for (const ds of resolved) {
    lines.push(`# --- ${ds.requirement.name} (${ds.source}) ---`);

    if (ds.source === "synthetic") {
      lines.push(`echo "SYNTHETIC: ${ds.requirement.name} — will be generated by experiment code"`);
      lines.push(`# ${ds.notes}`);
    } else if (ds.needsAuth) {
      lines.push(`echo "AUTH REQUIRED: ${ds.requirement.name}"`);
      lines.push(`# ${ds.notes}`);
      if (ds.downloadCommand) {
        lines.push(`# ${ds.downloadCommand}`);
      }
    } else if (ds.downloadCommand) {
      lines.push(`echo "Downloading: ${ds.requirement.name}..."`);
      lines.push(ds.downloadCommand);
    } else {
      lines.push(`echo "MANUAL: ${ds.requirement.name}"`);
      lines.push(`# ${ds.notes}`);
    }

    lines.push("");
  }

  lines.push('echo "Data acquisition complete"');
  return lines.join("\n");
}

/**
 * Parse a size estimate string into approximate MB.
 */
export function parseSizeEstimate(sizeStr?: string): number | undefined {
  if (!sizeStr) return undefined;
  const match = sizeStr.match(/([\d.]+)\s*(kb|mb|gb|tb|b)/i);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { b: 1 / (1024 * 1024), kb: 1 / 1024, mb: 1, gb: 1024, tb: 1024 * 1024 };
  return value * (multipliers[unit] || 1);
}
