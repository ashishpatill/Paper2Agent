import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildSetupReadinessReport,
  classifyStep2Execution
} from "../lib/server/setup-readiness";

test("setup readiness report summarizes step 1 artifacts into structured data", async () => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "paper2agent-setup-readiness-"));

  try {
    await mkdir(path.join(workspacePath, "reports"), { recursive: true });
    await mkdir(path.join(workspacePath, "repo", "DemoRepo", "notebooks"), { recursive: true });

    await Promise.all([
      writeFile(
        path.join(workspacePath, "reports", "environment-manager_results.md"),
        [
          "# Environment Setup Results",
          "- **Environment Name**: DemoRepo-env",
          "- **Python Version**: 3.11.9",
          "- **Installation Method**: PyPI",
          "- **Total Packages**: 42",
          "- **Environment Location**: `/tmp/DemoRepo-env`",
          "",
          "## Environment Creation Commands",
          "```bash",
          "uv venv --python 3.11 DemoRepo-env",
          "source DemoRepo-env/bin/activate",
          "```",
          "",
          "## Success Validation",
          "- ✅ Environment created",
          "- ✅ Imports verified",
          "- ✅ Notebook tooling ready",
          "- ✅ Requirements generated",
          "",
          "### Project Structure",
          "- **Main Research Code**: `repo/DemoRepo/src/`",
        ].join("\n"),
        "utf8"
      ),
      writeFile(
        path.join(workspacePath, "reports", "tutorial-scanner.json"),
        JSON.stringify({
          scan_metadata: {
            success: true,
            success_reason: "Successfully scanned repository tutorials"
          },
          tutorials: [
            {
              path: "repo/DemoRepo/notebooks/tutorial.ipynb",
              include_in_tools: true,
              type: "notebook"
            },
            {
              path: "repo/DemoRepo/README.md",
              include_in_tools: false,
              type: "documentation"
            }
          ]
        }),
        "utf8"
      ),
      writeFile(
        path.join(workspacePath, "reports", "tutorial-scanner-include-in-tools.json"),
        JSON.stringify({
          tutorials: [
            { path: "repo/DemoRepo/notebooks/tutorial.ipynb" }
          ]
        }),
        "utf8"
      ),
      writeFile(path.join(workspacePath, "repo", "DemoRepo", "notebooks", "tutorial.ipynb"), "{}", "utf8")
    ]);

    const report = await buildSetupReadinessReport({
      workspacePath,
      repositoryName: "DemoRepo",
      tutorialFilter: "tutorial"
    });

    assert.equal(report.environment.ready, true);
    assert.equal(report.environment.environmentName, "DemoRepo-env");
    assert.equal(report.tutorials.success, true);
    assert.equal(report.tutorials.includedInTools, 1);
    assert.equal(report.tutorials.filterApplied, "tutorial");
    assert.ok(report.repository.notebookPaths.includes("notebooks/tutorial.ipynb"));
    assert.ok(report.requirements.includes("source DemoRepo-env/bin/activate"));
    assert.equal(report.blockers.length, 0);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("step 2 readiness classifier skips tutorial execution when no runnable tutorials were selected", () => {
  const decision = classifyStep2Execution({
    generatedAt: "2026-04-04T10:00:00.000Z",
    repository: {
      name: "DemoRepo",
      path: "repo/DemoRepo",
      mainCodePaths: [],
      notebookPaths: []
    },
    environment: {
      reportFound: true,
      ready: true,
      environmentName: "DemoRepo-env",
      pythonVersion: "3.11.9",
      installCommands: [],
      validationChecksPassed: 4,
      validationChecksTotal: 4
    },
    tutorials: {
      scanFound: true,
      includeListFound: true,
      success: true,
      totalScanned: 3,
      includedInTools: 0,
      runnableCandidates: 0,
      includedPaths: []
    },
    blockers: [],
    requirements: [],
    nextSteps: []
  });

  assert.equal(decision.mode, "skip");
  assert.match(decision.reason, /no runnable tutorials/i);
});

test("step 2 readiness classifier fails when setup has not proven the environment is ready", () => {
  const decision = classifyStep2Execution({
    generatedAt: "2026-04-04T10:00:00.000Z",
    repository: {
      name: "DemoRepo",
      path: "repo/DemoRepo",
      mainCodePaths: [],
      notebookPaths: []
    },
    environment: {
      reportFound: true,
      ready: false,
      environmentName: "DemoRepo-env",
      pythonVersion: "3.11.9",
      installCommands: [],
      validationChecksPassed: 1,
      validationChecksTotal: 4
    },
    tutorials: {
      scanFound: true,
      includeListFound: true,
      success: true,
      totalScanned: 3,
      includedInTools: 2,
      runnableCandidates: 2,
      includedPaths: ["repo/DemoRepo/notebooks/tutorial.ipynb"]
    },
    blockers: ["Environment report does not yet prove that the local environment is fully configured."],
    requirements: [],
    nextSteps: []
  });

  assert.equal(decision.mode, "fail");
  assert.match(decision.reason, /environment/i);
});
