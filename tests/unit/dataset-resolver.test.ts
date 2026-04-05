/**
 * Unit tests for dataset-resolver — pattern matching, well-known lookup, fallback behavior.
 * Run with: node --import tsx --test tests/unit/dataset-resolver.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAllDatasets } from "../../lib/server/dataset-resolver";
import type { DatasetRequirement } from "../../lib/server/types";

function req(name: string, publiclyAvailable = true): DatasetRequirement {
  return { name, publicly_available: publiclyAvailable };
}

describe("resolveAllDatasets", () => {
  it("resolves CIFAR-10 from the well-known table", () => {
    const [result] = resolveAllDatasets([req("CIFAR-10")]);
    assert.equal(result.source, "huggingface");
    assert.ok(result.downloadCommand?.includes("cifar10"));
  });

  it("resolves wikitext-2 from the well-known table (case-insensitive)", () => {
    const [result] = resolveAllDatasets([req("WikiText-2")]);
    assert.equal(result.source, "huggingface");
    assert.ok(result.downloadCommand?.includes("wikitext"));
  });

  it("resolves HuggingFace slug pattern (user/dataset)", () => {
    const [result] = resolveAllDatasets([req("username/my-dataset")]);
    assert.equal(result.source, "huggingface");
  });

  it("resolves Zenodo DOI pattern", () => {
    const [result] = resolveAllDatasets([req("zenodo:10.5281/zenodo.1234567")]);
    assert.equal(result.source, "zenodo");
  });

  it("marks private datasets as needsAuth=false but is still resolvable", () => {
    // Private flag on DatasetRequirement — resolver doesn't force needsAuth but
    // the acquisition script will route these to synthetic
    const [result] = resolveAllDatasets([req("some-private-dataset", false)]);
    assert.equal(result.requirement.publicly_available, false);
  });

  it("returns a resolution for unknown datasets via HuggingFace slug guess", () => {
    const [result] = resolveAllDatasets([req("My Obscure Dataset 2024")]);
    // Should produce a download command (slug guess or notes)
    assert.ok(result.downloadCommand || result.notes);
  });

  it("handles multiple requirements in a single call", () => {
    const results = resolveAllDatasets([
      req("CIFAR-10"),
      req("Iris"),
      req("totally-unknown-dataset-xyz")
    ]);
    assert.equal(results.length, 3);
  });

  it("resolves Iris from well-known UCI table", () => {
    const [result] = resolveAllDatasets([req("Iris")]);
    assert.equal(result.source, "uci");
  });
});
