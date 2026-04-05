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
  // Vision
  "imagenet": { source: "url", command: "# ImageNet requires manual download from https://image-net.org/", notes: "ImageNet requires academic registration" },
  "imagenet-1k": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('imagenet-1k', split='train', streaming=True); print('Streaming ImageNet available')\"", notes: "ImageNet-1K via HuggingFace (streaming)" },
  "coco": { source: "url", command: "wget http://images.cocodataset.org/annotations/annotations_trainval2017.zip -P data/ && wget http://images.cocodataset.org/zips/train2017.zip -P data/", notes: "COCO 2017 dataset" },
  "cifar-10": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('cifar10'); ds.save_to_disk('data/cifar10')\"", notes: "CIFAR-10 via HuggingFace" },
  "cifar-100": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('cifar100'); ds.save_to_disk('data/cifar100')\"", notes: "CIFAR-100 via HuggingFace" },
  "svhn": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('svhn', 'cropped_digits'); ds.save_to_disk('data/svhn')\"", notes: "SVHN via HuggingFace" },
  // NLP
  "penn treebank": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('ptb_text_only'); ds.save_to_disk('data/ptb')\"", notes: "Penn Treebank via HuggingFace" },
  "ptb": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('ptb_text_only'); ds.save_to_disk('data/ptb')\"", notes: "Penn Treebank via HuggingFace" },
  "wikitext-2": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('wikitext', 'wikitext-2-raw-v1'); ds.save_to_disk('data/wikitext-2')\"", notes: "WikiText-2 via HuggingFace" },
  "wikitext-103": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('wikitext', 'wikitext-103-raw-v1'); ds.save_to_disk('data/wikitext-103')\"", notes: "WikiText-103 via HuggingFace" },
  "sst-2": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('sst2'); ds.save_to_disk('data/sst2')\"", notes: "SST-2 sentiment via HuggingFace" },
  "bookcorpus": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('bookcorpus', streaming=True); print('Streaming BookCorpus available')\"", notes: "BookCorpus via HuggingFace (streaming, large)" },
  "common crawl": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('c4', 'en', streaming=True); print('Streaming C4/CommonCrawl available')\"", notes: "Common Crawl (C4) via HuggingFace streaming" },
  // Tabular / structured
  "iris": { source: "uci", command: "python -c \"from ucimlrepo import fetch_ucirepo; ds = fetch_ucirepo(id=53); import pandas as pd; pd.concat([ds.data.features, ds.data.targets], axis=1).to_csv('data/iris.csv', index=False)\"", notes: "Iris dataset via UCI ML repo" },
  "adult": { source: "uci", command: "python -c \"from ucimlrepo import fetch_ucirepo; ds = fetch_ucirepo(id=2); import pandas as pd; pd.concat([ds.data.features, ds.data.targets], axis=1).to_csv('data/adult.csv', index=False)\"", notes: "Adult/Census Income via UCI ML repo" },
  "breast cancer": { source: "uci", command: "python -c \"from ucimlrepo import fetch_ucirepo; ds = fetch_ucirepo(id=17); import pandas as pd; pd.concat([ds.data.features, ds.data.targets], axis=1).to_csv('data/breast_cancer.csv', index=False)\"", notes: "Breast Cancer Wisconsin via UCI ML repo" },
  "diabetes": { source: "huggingface", command: "python -c \"from sklearn.datasets import load_diabetes; import pandas as pd; d = load_diabetes(as_frame=True); d.frame.to_csv('data/diabetes.csv', index=False)\"", notes: "Diabetes dataset via sklearn" },
  "california housing": { source: "huggingface", command: "python -c \"from sklearn.datasets import fetch_california_housing; import pandas as pd; d = fetch_california_housing(as_frame=True); d.frame.to_csv('data/california_housing.csv', index=False)\"", notes: "California Housing via sklearn" },
  // Reinforcement learning
  "atari": { source: "url", command: "pip install ale-py && python -c \"import ale_py; print('Atari Learning Environment installed')\"", notes: "Atari via ALE-py (requires ROM files)" },
  "openai gym": { source: "url", command: "pip install gymnasium && python -c \"import gymnasium; print('Gymnasium installed')\"", notes: "OpenAI Gym/Gymnasium environments" },
  // Speech / audio
  "librispeech": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('librispeech_asr', 'clean', split='train.100'); ds.save_to_disk('data/librispeech_100h')\"", notes: "LibriSpeech 100h clean split via HuggingFace" },
  "commonvoice": { source: "huggingface", command: "python -c \"from datasets import load_dataset; ds = load_dataset('mozilla-foundation/common_voice_11_0', 'en', split='train'); ds.save_to_disk('data/commonvoice')\"", notes: "Mozilla Common Voice via HuggingFace" },
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

  // Fallback: try HuggingFace search + auto-load by slug, then synthetic
  const slug = req.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    ...base,
    source: "huggingface",
    needsAuth: false,
    notes: `Auto-guessing HuggingFace slug "${slug}" for "${req.name}". If this fails, a synthetic proxy will be generated.`,
    downloadCommand: [
      `python - <<'PYEOF'`,
      `import sys`,
      `try:`,
      `    from datasets import load_dataset`,
      `    ds = load_dataset("${slug}")`,
      `    ds.save_to_disk("data/${slug}")`,
      `    print("Downloaded: ${slug}")`,
      `except Exception as e:`,
      `    print(f"HuggingFace auto-load failed for '${slug}': {e}", file=sys.stderr)`,
      `    # Try huggingface_hub search as a second pass`,
      `    try:`,
      `        from huggingface_hub import list_datasets`,
      `        candidates = list(list_datasets(search="${req.name}", limit=3))`,
      `        if candidates:`,
      `            best = candidates[0].id`,
      `            print(f"Found candidate: {best}", file=sys.stderr)`,
      `            ds2 = load_dataset(best)`,
      `            ds2.save_to_disk(f"data/{best.split('/')[-1]}")`,
      `            print(f"Downloaded: {best}")`,
      `        else:`,
      `            sys.exit(1)`,
      `    except Exception as e2:`,
      `        print(f"Search also failed: {e2}", file=sys.stderr)`,
      `        sys.exit(1)`,
      `PYEOF`,
    ].join("\n"),
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
