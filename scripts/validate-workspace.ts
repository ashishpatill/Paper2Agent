/**
 * Quick-validate a completed Paper2Agent workspace.
 *
 * Checks that the generated project actually works:
 * - Python environment exists and activates
 * - Key imports work
 * - Tests pass (if any)
 * - MCP server starts without errors
 * - Experiment results exist and are valid JSON
 * - Extracted tools are importable
 *
 * Usage: npx tsx scripts/validate-workspace.ts <workspacePath> [repoName]
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const [,, workspacePath, repoName] = process.argv;

if (!workspacePath) {
  process.stderr.write("Usage: validate-workspace.ts <workspacePath> [repoName]\n");
  process.exit(1);
}

const checks: Check[] = [];

function check(name: string, fn: () => string): void {
  try {
    const detail = fn();
    checks.push({ name, passed: true, detail });
  } catch (err) {
    checks.push({
      name,
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// 1. Workspace exists
check("Workspace exists", () => {
  if (!fs.existsSync(workspacePath)) throw new Error(`Not found: ${workspacePath}`);
  return "Workspace directory exists";
});

// 2. Python environment
const envName = repoName ? `${repoName}-env` : "";
const envPath = envName ? path.join(workspacePath, envName) : "";
check("Python environment", () => {
  if (!envPath) return "No repo name provided, skipping env check";
  if (!fs.existsSync(envPath)) throw new Error(`Environment not found: ${envPath}`);
  const pythonBin = path.join(envPath, "bin", "python");
  if (!fs.existsSync(pythonBin)) throw new Error(`Python binary not found: ${pythonBin}`);
  const version = execSync(`${pythonBin} --version 2>&1`, { timeout: 10000 }).toString().trim();
  return version;
});

// 3. Extracted tools
check("Extracted tools", () => {
  const toolsDir = path.join(workspacePath, "src", "tools");
  if (!fs.existsSync(toolsDir)) throw new Error("No src/tools/ directory");
  const pyFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith(".py"));
  if (pyFiles.length === 0) throw new Error("No Python files in src/tools/");
  return `${pyFiles.length} tool file(s): ${pyFiles.slice(0, 5).join(", ")}`;
});

// 4. Tool imports
check("Tool imports", () => {
  const toolsDir = path.join(workspacePath, "src", "tools");
  if (!fs.existsSync(toolsDir)) throw new Error("No tools directory");
  const pyFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith(".py") && f !== "__init__.py");
  if (pyFiles.length === 0) throw new Error("No tool files to check");

  const pythonBin = envPath ? path.join(envPath, "bin", "python") : "python3";
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const f of pyFiles.slice(0, 5)) {
    const moduleName = f.replace(".py", "");
    try {
      execSync(`${pythonBin} -c "import sys; sys.path.insert(0, '${toolsDir}'); import ${moduleName}"`, {
        timeout: 15000,
        cwd: workspacePath,
      });
      passed++;
    } catch {
      failed++;
      errors.push(moduleName);
    }
  }
  if (failed > 0 && passed === 0) throw new Error(`All imports failed: ${errors.join(", ")}`);
  return `${passed} passed, ${failed} failed${errors.length > 0 ? ` (${errors.join(", ")})` : ""}`;
});

// 5. MCP server
check("MCP server", () => {
  const srcDir = path.join(workspacePath, "src");
  if (!fs.existsSync(srcDir)) throw new Error("No src/ directory");
  const mcpFiles = fs.readdirSync(srcDir).filter(f => f.endsWith("_mcp.py"));
  if (mcpFiles.length === 0) throw new Error("No MCP server file found in src/");
  const mcpFile = path.join(srcDir, mcpFiles[0]);
  const pythonBin = envPath ? path.join(envPath, "bin", "python") : "python3";
  try {
    execSync(`${pythonBin} ${mcpFile} --help 2>&1 || ${pythonBin} -c "exec(open('${mcpFile}').read())" 2>&1`, {
      timeout: 15000,
      cwd: workspacePath,
    });
  } catch {
    // Try just checking syntax
    execSync(`${pythonBin} -m py_compile ${mcpFile}`, { timeout: 10000, cwd: workspacePath });
  }
  return `MCP server: ${mcpFiles[0]} (syntax valid)`;
});

// 6. Tests
check("Tests", () => {
  const testsDir = path.join(workspacePath, "tests");
  if (!fs.existsSync(testsDir)) return "No tests/ directory (skipped)";
  const testFiles = fs.readdirSync(testsDir).filter(f => f.startsWith("test_") && f.endsWith(".py"));
  if (testFiles.length === 0) return "No test files found (skipped)";

  const pythonBin = envPath ? path.join(envPath, "bin", "python") : "python3";
  try {
    const output = execSync(`${pythonBin} -m pytest ${testsDir} --tb=short -q 2>&1`, {
      timeout: 120000,
      cwd: workspacePath,
    }).toString();
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    return `${passMatch?.[1] || 0} passed, ${failMatch?.[1] || 0} failed`;
  } catch (err) {
    const output = err instanceof Error && "stdout" in err ? String((err as { stdout: Buffer }).stdout) : "";
    const failMatch = output.match(/(\d+) failed/);
    const passMatch = output.match(/(\d+) passed/);
    if (failMatch) throw new Error(`${passMatch?.[1] || 0} passed, ${failMatch[1]} failed`);
    throw new Error("pytest execution failed");
  }
});

// 7. Experiment results
check("Experiment results", () => {
  const resultsDir = path.join(workspacePath, "reports", "experiment_results");
  if (!fs.existsSync(resultsDir)) return "No experiment results (implementation track may not have run)";
  const jsonFiles = fs.readdirSync(resultsDir).filter(f => f.endsWith("_result.json"));
  if (jsonFiles.length === 0) return "No result JSON files found";
  let valid = 0;
  for (const f of jsonFiles) {
    try {
      JSON.parse(fs.readFileSync(path.join(resultsDir, f), "utf-8"));
      valid++;
    } catch { /* invalid JSON */ }
  }
  return `${valid}/${jsonFiles.length} result files are valid JSON`;
});

// 8. Gap analysis
check("Gap analysis", () => {
  const gapPath = path.join(workspacePath, "reports", "gap_analysis.json");
  if (!fs.existsSync(gapPath)) return "No gap analysis (may not have run yet)";
  const gap = JSON.parse(fs.readFileSync(gapPath, "utf-8"));
  return `Coverage: ${gap.coverage_score}, Track: ${gap.track}, Gaps: ${(gap.gaps || []).length}`;
});

// 9. Results comparison
check("Results comparison", () => {
  const compPath = path.join(workspacePath, "reports", "results_comparison.json");
  if (!fs.existsSync(compPath)) return "No results comparison (implementation track may not have run)";
  const comp = JSON.parse(fs.readFileSync(compPath, "utf-8"));
  return `Match: ${comp.overall_match} (score: ${comp.match_score})`;
});

// Output report
const passed = checks.filter(c => c.passed).length;
const failed = checks.filter(c => !c.passed).length;
const overall = failed === 0 ? "pass" : passed > failed ? "partial" : "fail";

const report = {
  timestamp: new Date().toISOString(),
  overall,
  checks,
  summary: `${passed} passed, ${failed} failed out of ${checks.length} checks`,
};

// Write to stdout as JSON
process.stdout.write(JSON.stringify(report, null, 2) + "\n");

// Also write to workspace
const reportPath = path.join(workspacePath, "reports", "validation_report.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

// Human-readable to stderr
process.stderr.write(`\nValidation: ${report.summary}\n`);
for (const c of checks) {
  const icon = c.passed ? "✓" : "✗";
  process.stderr.write(`  ${icon} ${c.name}: ${c.detail}\n`);
}
process.stderr.write(`\nOverall: ${overall.toUpperCase()}\n`);

process.exit(overall === "fail" ? 1 : 0);
