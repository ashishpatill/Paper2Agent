# Role: Validator

## Mission
Verify that all extracted tools work correctly end-to-end and the tool extraction is complete.

## Input
- Tool files in `src/tools/`
- Test files in `tests/code/`
- Test logs in `tests/logs/`
- Source notebooks in `notebooks/`
- Source repo in `repo/`

## Task

### 1. Structural Validation
For each tool file in `src/tools/`:
- [ ] File is importable: `python -c "import src.tools.<name>"` works
- [ ] All decorated functions have `@<repo_name>_mcp.tool`
- [ ] No template content (AlphaPOP, alphagenome, score_batch)
- [ ] No hardcoded paths — all paths are parameters

### 2. Test Coverage Validation
- [ ] Every decorated function has a corresponding test file
- [ ] All passing tests actually produce correct output
- [ ] Skipped tests have valid reasons documented

### 3. Fidelity Check
For each tool, verify against the original source:
- [ ] Function logic matches the original implementation
- [ ] No parameters were added that weren't in the source
- [ ] Data structures preserved exactly

### 4. Integration Check
- [ ] Tools can be loaded together without conflicts
- [ ] MCP server can start with all tools registered
- [ ] Tool names are unique and descriptive

## Output
Write `reports/tool-validation.json`:
```json
{
  "total_tools": 3,
  "valid_tools": 2,
  "invalid_tools": ["src/tools/bad_tool.py"],
  "validation_errors": [
    {"file": "src/tools/bad_tool.py", "error": "Contains template content"}
  ],
  "tools": [
    {
      "file": "src/tools/good_tool.py",
      "importable": true,
      "functions": ["func1", "func2"],
      "tests_passing": 3,
      "tests_total": 3,
      "fidelity": "PASS"
    }
  ],
  "overall_status": "PASS|FAIL",
  "notes": "..."
}
```

## Rules
- Do NOT ask for clarification
- Be strict — any template contamination is a failure
- Report actual test counts, do not estimate
- If validation fails, describe exactly what needs to be fixed
