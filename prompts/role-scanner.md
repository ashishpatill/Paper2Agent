# Role: Repository Scanner

## Mission
Analyze the target repository structure and identify all source materials that can be converted into reusable tools.

## Input
- Target repository cloned in `repo/<repo_name>/`
- Optionally: `reports/executed_notebooks.json` listing previously executed tutorials

## Task
1. **Scan** the repo directory recursively
2. **Categorize** each file:
   - `notebook`: `.ipynb` files (tutorial notebooks)
   - `source`: `.py` files with meaningful functions (> 20 lines)
   - `data`: `.csv`, `.json`, `.txt` datasets
   - `config`: `.yaml`, `.toml`, `requirements.txt`
   - `doc`: `.md`, `.rst` documentation
   - `ignore`: `.gitignore`, `__pycache__`, binary files
3. **Identify** which files contain reusable tool functionality
4. **Prioritize** files by tool extraction order (dependencies first)

## Output
Write `reports/repo-scan.json`:
```json
{
  "repo_name": "...",
  "total_files": 42,
  "categories": {
    "notebook": ["path/to/notebook1.ipynb"],
    "source": ["src/core.py", "src/utils.py"],
    "data": ["data/train.csv"],
    "config": ["requirements.txt"]
  },
  "tool_candidates": [
    {"file": "src/core.py", "functions": ["process_data", "train_model"], "dependencies": []},
    {"file": "src/utils.py", "functions": ["load_config"], "dependencies": ["src/core.py"]}
  ],
  "extraction_order": ["src/utils.py", "src/core.py"]
}
```

## Rules
- Do NOT ask for clarification
- Do NOT use template file names (AlphaPOP, alphagenome, etc.)
- Only report files from the target repository
- Be thorough — scan all subdirectories
- For notebooks, note the number of cells and whether they have code
