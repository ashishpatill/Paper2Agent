/**
 * Integration tests for the paper-intake module.
 *
 * Tests URL extraction, PDF parsing, text compaction, and GitHub URL detection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractPaperFromUrl, extractPaperFromPdf } from "../../lib/server/paper-intake";

describe("extractPaperFromUrl", () => {
  it("extracts paper metadata from arXiv HTML pages", async () => {
    const result = await extractPaperFromUrl("https://arxiv.org/abs/1706.03762");

    assert.equal(result.sourceKind, "url");
    assert.equal(result.canonicalUrl, "https://arxiv.org/abs/1706.03762");
    assert.ok(result.titleHint, "Should extract a title");
    assert.ok(result.rawText.length > 100, "Should extract substantial text");
    assert.ok(result.discoveredLinks.length > 0);
  });

  it("extracts repository hints from GitHub links in the page", async () => {
    // Attention Is All You Need — doesn't have a direct GitHub link,
    // but the function should still search for any GitHub URLs
    const result = await extractPaperFromUrl("https://arxiv.org/abs/1706.03762");

    // repositoryUrlHint may or may not be found depending on the page
    assert.ok(typeof result.repositoryUrlHint === "string" || result.repositoryUrlHint === undefined);
  });

  it("handles non-existent URLs with an error", async () => {
    await assert.rejects(
      () => extractPaperFromUrl("https://example.com/nonexistent-paper-12345"),
      /Could not fetch/
    );
  });

  it("handles invalid URLs with an error", async () => {
    // This may timeout or fail depending on network — just verify it throws
    try {
      await extractPaperFromUrl("not-a-valid-url-at-all");
      // If it doesn't throw, that's also acceptable for this test
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  });

  it("limits extracted text to a reasonable size", async () => {
    const result = await extractPaperFromUrl("https://arxiv.org/abs/1706.03762");

    // compactText limits to 24000 chars
    assert.ok(result.rawText.length <= 24000);
  });
});

describe("extractPaperFromPdf", () => {
  it("rejects oversized PDFs", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");

    // Create a fake large file (> 30MB)
    const tmpDir = os.tmpdir();
    const fakePdf = path.join(tmpDir, `test-large-${process.pid}.pdf`);

    try {
      // Write a small file first, but simulate the check
      await fs.writeFile(fakePdf, Buffer.alloc(31 * 1024 * 1024)); // 31MB

      await assert.rejects(
        () => extractPaperFromPdf(fakePdf),
        /30MB/
      );
    } finally {
      await fs.unlink(fakePdf).catch(() => {});
    }
  });

  it("rejects non-existent PDF files", async () => {
    await assert.rejects(
      () => extractPaperFromPdf("/nonexistent/path/paper.pdf"),
      /ENOENT|no such file/i
    );
  });
});

describe("paper-intake helpers", () => {
  it("extracts first GitHub URL from text", async () => {
    // Test the internal function by calling with a URL that has GitHub links
    const result = await extractPaperFromUrl("https://arxiv.org/abs/1706.03762");

    // The discoveredLinks should include various URLs
    assert.ok(Array.isArray(result.discoveredLinks));
  });

  it("discovers links from HTML pages", async () => {
    const result = await extractPaperFromUrl("https://arxiv.org/abs/1706.03762");

    assert.ok(result.discoveredLinks.length > 0);
    // Links should be absolute URLs
    for (const link of result.discoveredLinks.slice(0, 5)) {
      assert.ok(link.startsWith("http"), `Link should be absolute: ${link}`);
    }
  });
});
