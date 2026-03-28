/**
 * Synthetic proxy dataset generator.
 *
 * When a paper's required dataset is unavailable (proprietary, too large,
 * access-restricted), this module generates a synthetic proxy that matches
 * the described statistical properties. The proxy is sufficient for
 * validating that experiment code runs correctly and produces reasonable
 * outputs, even if the numeric results won't exactly match the paper.
 */

import * as fs from "fs";
import * as path from "path";
import type { DatasetRequirement } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataShape = "tabular" | "text" | "image_like" | "time_series" | "graph";

export interface SyntheticConfig {
  /** Dataset shape */
  shape: DataShape;
  /** Number of samples to generate */
  numSamples: number;
  /** Number of features (for tabular) */
  numFeatures?: number;
  /** Number of classes (for classification tasks) */
  numClasses?: number;
  /** Sequence length (for text/time series) */
  sequenceLength?: number;
  /** Image dimensions [H, W, C] (for image_like) */
  imageDims?: [number, number, number];
  /** Feature names (for tabular) */
  featureNames?: string[];
  /** Random seed for reproducibility */
  seed?: number;
}

export interface SyntheticResult {
  requirement: DatasetRequirement;
  config: SyntheticConfig;
  outputPath: string;
  scriptPath: string;
  numSamples: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Infer a reasonable synthetic config from a dataset requirement.
 */
export function inferConfig(req: DatasetRequirement): SyntheticConfig {
  const name = req.name.toLowerCase();
  const size = req.size_estimate?.toLowerCase() || "";

  // Infer sample count from size estimate
  let numSamples = 1000; // default
  if (size.includes("million") || size.includes("m ")) numSamples = 10000;
  else if (size.includes("thousand") || size.includes("k ")) numSamples = 5000;
  else if (size.includes("hundred")) numSamples = 500;
  else if (size.includes("gb")) numSamples = 10000;
  else if (size.includes("mb")) numSamples = 2000;

  // Infer shape from name/context
  if (name.match(/image|cifar|mnist|imagenet|coco|visual|photo/)) {
    return {
      shape: "image_like",
      numSamples,
      imageDims: [32, 32, 3],
      numClasses: 10,
      seed: 42,
    };
  }

  if (name.match(/text|nlp|squad|glue|sentiment|review|news|wiki|book|corpus/)) {
    return {
      shape: "text",
      numSamples,
      sequenceLength: 128,
      numClasses: 2,
      seed: 42,
    };
  }

  if (name.match(/time.?series|temporal|stock|weather|sensor|signal/)) {
    return {
      shape: "time_series",
      numSamples,
      sequenceLength: 100,
      numFeatures: 5,
      seed: 42,
    };
  }

  if (name.match(/graph|network|social|citation|molecule/)) {
    return {
      shape: "graph",
      numSamples: Math.min(numSamples, 500),
      numFeatures: 10,
      numClasses: 3,
      seed: 42,
    };
  }

  // Default: tabular
  return {
    shape: "tabular",
    numSamples,
    numFeatures: 10,
    numClasses: 2,
    seed: 42,
  };
}

/**
 * Generate a Python script that creates the synthetic dataset.
 */
export function generateScript(config: SyntheticConfig, datasetName: string): string {
  const seed = config.seed ?? 42;

  switch (config.shape) {
    case "tabular":
      return generateTabularScript(config, datasetName, seed);
    case "text":
      return generateTextScript(config, datasetName, seed);
    case "image_like":
      return generateImageScript(config, datasetName, seed);
    case "time_series":
      return generateTimeSeriesScript(config, datasetName, seed);
    case "graph":
      return generateGraphScript(config, datasetName, seed);
    default:
      return generateTabularScript(config, datasetName, seed);
  }
}

/**
 * Generate a synthetic dataset for a requirement.
 * Writes a Python generation script to the target directory.
 */
export function generateSyntheticDataset(
  req: DatasetRequirement,
  targetDir: string,
  configOverride?: Partial<SyntheticConfig>
): SyntheticResult {
  const config = { ...inferConfig(req), ...configOverride };
  const safeName = req.name.toLowerCase().replace(/[^a-z0-9_]/g, "_").substring(0, 50);

  fs.mkdirSync(targetDir, { recursive: true });

  const scriptContent = generateScript(config, safeName);
  const scriptPath = path.join(targetDir, `generate_${safeName}.py`);
  fs.writeFileSync(scriptPath, scriptContent, "utf-8");

  return {
    requirement: req,
    config,
    outputPath: path.join(targetDir, safeName),
    scriptPath,
    numSamples: config.numSamples,
    notes: `Synthetic ${config.shape} proxy for "${req.name}" (${config.numSamples} samples). Run: python ${scriptPath}`,
  };
}

// ---------------------------------------------------------------------------
// Script generators
// ---------------------------------------------------------------------------

function generateTabularScript(config: SyntheticConfig, name: string, seed: number): string {
  const features = config.numFeatures || 10;
  const classes = config.numClasses || 2;
  const featureNames = config.featureNames
    ? `[${config.featureNames.map(f => `"${f}"`).join(", ")}]`
    : `[f"feature_{i}" for i in range(${features})]`;

  return `"""Synthetic tabular proxy dataset: ${name}"""
import numpy as np
import pandas as pd
import os

np.random.seed(${seed})

n_samples = ${config.numSamples}
n_features = ${features}
n_classes = ${classes}

# Generate features with realistic correlations
X = np.random.randn(n_samples, n_features)
# Add some correlations between features
X[:, 1] = X[:, 0] * 0.7 + np.random.randn(n_samples) * 0.3
X[:, 2] = X[:, 0] * 0.3 + X[:, 1] * 0.5 + np.random.randn(n_samples) * 0.2

# Generate labels based on features
weights = np.random.randn(n_features)
logits = X @ weights
if n_classes == 2:
    y = (logits > np.median(logits)).astype(int)
else:
    y = np.digitize(logits, np.percentile(logits, np.linspace(0, 100, n_classes + 1)[1:-1]))

feature_names = ${featureNames}
df = pd.DataFrame(X, columns=feature_names[:n_features])
df["label"] = y

# Save
os.makedirs("${name}", exist_ok=True)
df.to_csv("${name}/data.csv", index=False)

# Train/test split
train_idx = np.random.choice(n_samples, size=int(n_samples * 0.8), replace=False)
test_idx = np.setdiff1d(np.arange(n_samples), train_idx)
df.iloc[train_idx].to_csv("${name}/train.csv", index=False)
df.iloc[test_idx].to_csv("${name}/test.csv", index=False)

print(f"Generated synthetic tabular dataset: {n_samples} samples, {n_features} features, {n_classes} classes")
print(f"Saved to ${name}/")
`;
}

function generateTextScript(config: SyntheticConfig, name: string, seed: number): string {
  const seqLen = config.sequenceLength || 128;
  const classes = config.numClasses || 2;

  return `"""Synthetic text proxy dataset: ${name}"""
import numpy as np
import json
import os

np.random.seed(${seed})

n_samples = ${config.numSamples}
n_classes = ${classes}
seq_length = ${seqLen}

# Simple vocabulary-based text generation
vocab = ["the", "a", "is", "was", "are", "were", "have", "has", "had",
         "not", "but", "and", "or", "if", "then", "this", "that", "it",
         "to", "of", "in", "for", "on", "with", "at", "by", "from",
         "good", "bad", "great", "poor", "best", "worst", "nice", "terrible",
         "data", "model", "result", "method", "approach", "analysis", "study"]

samples = []
for i in range(n_samples):
    words = np.random.choice(vocab, size=min(seq_length, np.random.randint(10, seq_length)))
    text = " ".join(words)
    label = np.random.randint(0, n_classes)
    samples.append({"text": text, "label": int(label), "id": i})

os.makedirs("${name}", exist_ok=True)

# Split
split_idx = int(n_samples * 0.8)
train = samples[:split_idx]
test = samples[split_idx:]

with open("${name}/train.json", "w") as f:
    json.dump(train, f)
with open("${name}/test.json", "w") as f:
    json.dump(test, f)

print(f"Generated synthetic text dataset: {n_samples} samples, {n_classes} classes")
print(f"Saved to ${name}/")
`;
}

function generateImageScript(config: SyntheticConfig, name: string, seed: number): string {
  const [h, w, c] = config.imageDims || [32, 32, 3];
  const classes = config.numClasses || 10;

  return `"""Synthetic image-like proxy dataset: ${name}"""
import numpy as np
import os

np.random.seed(${seed})

n_samples = ${config.numSamples}
n_classes = ${classes}
img_shape = (${h}, ${w}, ${c})

# Generate simple patterned images (class determines pattern)
os.makedirs("${name}", exist_ok=True)

images = np.zeros((n_samples, *img_shape), dtype=np.uint8)
labels = np.random.randint(0, n_classes, n_samples)

for i in range(n_samples):
    c_idx = labels[i]
    # Each class gets a different base pattern
    base = np.random.randint(20 * c_idx, 20 * c_idx + 40, img_shape, dtype=np.uint8)
    noise = np.random.randint(0, 30, img_shape, dtype=np.uint8)
    images[i] = np.clip(base.astype(int) + noise.astype(int), 0, 255).astype(np.uint8)

# Split
split_idx = int(n_samples * 0.8)
np.savez_compressed("${name}/train.npz", images=images[:split_idx], labels=labels[:split_idx])
np.savez_compressed("${name}/test.npz", images=images[split_idx:], labels=labels[split_idx:])

print(f"Generated synthetic image dataset: {n_samples} samples, {img_shape} shape, {n_classes} classes")
print(f"Saved to ${name}/")
`;
}

function generateTimeSeriesScript(config: SyntheticConfig, name: string, seed: number): string {
  const seqLen = config.sequenceLength || 100;
  const features = config.numFeatures || 5;

  return `"""Synthetic time series proxy dataset: ${name}"""
import numpy as np
import os

np.random.seed(${seed})

n_samples = ${config.numSamples}
seq_length = ${seqLen}
n_features = ${features}

os.makedirs("${name}", exist_ok=True)

# Generate time series with trends, seasonality, and noise
data = np.zeros((n_samples, seq_length, n_features))
for i in range(n_samples):
    t = np.linspace(0, 4 * np.pi, seq_length)
    for f in range(n_features):
        trend = np.random.randn() * 0.01 * t
        seasonal = np.sin(t * (f + 1) * np.random.uniform(0.5, 2.0)) * np.random.uniform(0.5, 2.0)
        noise = np.random.randn(seq_length) * 0.3
        data[i, :, f] = trend + seasonal + noise

# Split
split_idx = int(n_samples * 0.8)
np.savez_compressed("${name}/train.npz", data=data[:split_idx])
np.savez_compressed("${name}/test.npz", data=data[split_idx:])

print(f"Generated synthetic time series dataset: {n_samples} samples, {seq_length} steps, {n_features} features")
print(f"Saved to ${name}/")
`;
}

function generateGraphScript(config: SyntheticConfig, name: string, seed: number): string {
  const features = config.numFeatures || 10;
  const classes = config.numClasses || 3;

  return `"""Synthetic graph proxy dataset: ${name}"""
import numpy as np
import json
import os

np.random.seed(${seed})

n_graphs = ${config.numSamples}
n_classes = ${classes}
n_features = ${features}

os.makedirs("${name}", exist_ok=True)

graphs = []
for i in range(n_graphs):
    n_nodes = np.random.randint(10, 50)
    # Random node features
    features = np.random.randn(n_nodes, n_features).tolist()
    # Random edges (Erdos-Renyi)
    p_edge = 0.15
    edges = []
    for u in range(n_nodes):
        for v in range(u + 1, n_nodes):
            if np.random.rand() < p_edge:
                edges.append([u, v])
    label = int(np.random.randint(0, n_classes))
    graphs.append({"id": i, "nodes": features, "edges": edges, "label": label, "num_nodes": n_nodes})

# Split
split_idx = int(n_graphs * 0.8)
with open("${name}/train.json", "w") as f:
    json.dump(graphs[:split_idx], f)
with open("${name}/test.json", "w") as f:
    json.dump(graphs[split_idx:], f)

print(f"Generated synthetic graph dataset: {n_graphs} graphs, {n_classes} classes")
print(f"Saved to ${name}/")
`;
}
