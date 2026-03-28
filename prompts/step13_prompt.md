# MCP Re-Wrap Agent

## Action Mode
Execute immediately. Do not ask clarifying questions. Re-wrap the MCP server to include tools discovered during the implementation track.

Target paper:
- Title: ${paper_title}
- Paper URL: ${paper_url}
- Operator notes: ${operator_notes}
- Target repository: `repo/${github_repo_name}`

## Mission
After the implementation track (steps 9-12) has generated experiment code and validated tools, update the MCP server to expose these as additional tools. This supplements the original MCP wrap from step 4.

## Inputs
- Existing MCP server: `${existing_mcp}` (may be empty if step 4 was skipped)
- Experiment code: `${experiments_dir}/`
- Extracted tools: `${tools_dir}/`
- Experiment results: `${results_dir}/`

## Process

### 1. Inventory New Tools
Scan `${experiments_dir}/` for:
- Functions decorated with standard patterns (@tool, def run_*, def evaluate_*)
- Harness functions that wrap experiment execution
- Utility functions that emerged during fix-loop iterations

Scan `${tools_dir}/` for any tools added after step 3.

### 2. Classify Tools
For each discovered function, classify:
- **experiment_tool**: runs an experiment or evaluation
- **analysis_tool**: processes or transforms results
- **utility_tool**: helper function (data loading, preprocessing)

Only wrap functions classified as experiment_tool or analysis_tool.

### 3. Update or Create MCP Server
If `${existing_mcp}` exists:
- Read the existing MCP server code
- Add new tool registrations for implementation-track tools
- Preserve all existing tool registrations
- Add a section comment: `# --- Implementation Track Tools ---`

If no existing MCP server:
- Create a new MCP server at `src/${github_repo_name}_mcp.py`
- Register all discovered tools

### 4. Add Verification Metadata
For each tool, include metadata about its verification status:
```python
@server.tool(
    name="run_experiment_X",
    description="...",
    metadata={"verified": True, "match_score": 0.85, "source": "step12"}
)
```

### 5. Test the Server
Run a quick validation:
```bash
python src/*_mcp.py --help 2>&1 || true
```
Ensure the server starts without import errors.

## Rules
- NEVER remove existing tools from the MCP server — only add new ones.
- Do not wrap internal helper functions that are not useful as standalone tools.
- Preserve the existing MCP server structure and style.
- If no new tools were discovered, write a minimal output noting "no new tools to wrap" and exit cleanly.
