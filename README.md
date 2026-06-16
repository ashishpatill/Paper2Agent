<p align="center">
  <img src="./logo/paper2agent_logo.png" alt="Paper2Agent Studio Logo" width="600" />
</p>

<p align="center">
  <strong>An Autonomous Agent Orchestration Platform to Replicate, Implement, and Validate Research Papers.</strong>
</p>

<p align="center">
  <a href="https://github.com/ashishpatill/Paper2Agent/stargazers"><img src="https://img.shields.io/github/stars/ashishpatill/Paper2Agent?style=for-the-badge&color=gold" alt="GitHub Stars"/></a>
  <a href="https://github.com/ashishpatill/Paper2Agent/network/members"><img src="https://img.shields.io/github/forks/ashishpatill/Paper2Agent?style=for-the-badge&color=blue" alt="GitHub Forks"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ashishpatill/Paper2Agent?style=for-the-badge&color=green" alt="MIT License"/></a>
  <br/>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python&logoColor=white" alt="Python"/></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Supported-blue?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/></a>
</p>

---

## 🌟 Overview

**Paper2Agent Studio** is a local-first workbench that turns scientific literature into functional, verified code. By extending the original research-agent pipeline, it introduces a robust Next.js orchestration application, Docker sandboxing, automatic dataset acquisition, and a self-healing iteration loop.

Whether a paper has an existing codebase with missing tools, or requires writing experiments entirely from scratch, Paper2Agent Studio automatically routes, generates, and validates the implementation.

---


## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| 🖥️ **Local-First Web Studio** | A sleek, responsive Next.js dashboard to upload PDFs/URLs, configure API keys locally, queue runs, and inspect detailed live outputs. |
| 🔀 **Two-Track Intelligent Routing** | Computes a codebase coverage score to dynamically run the **Tutorial Track** (tool extraction) or the **Implementation Track** (direct experiment coding). |
| 🩺 **Self-Healing Pipeline Recovery** | An autonomous debugger that classifies pipeline failures into 10 categories (e.g., NaN/Inf, missing dependencies, runtime errors) and automatically executes targeted solutions. |
| 📦 **Dataset Auto-Acquisition** | Automatically resolves and caches datasets from Hugging Face, Kaggle, Zenodo, UCI, or falls back to synthetic proxy data generators. |
| 🧠 **Cross-Run Evolution Store** | A persistent learning database that transfers lessons, prompts, and skill updates from past executions to optimize future runs. |
| 🛡️ **Docker Execution Sandbox** | Runs generated code in isolated, resource-constrained environments with strict network policies to prevent execution side-effects. |
| 🔍 **Anti-Fabrication Registry** | A verification ledger that traces every reported metric directly to execution artifacts to prevent LLM metric hallucination. |

---


## 📐 Architecture & Execution Flow

Paper2Agent Studio operates on a unified agentic feedback loop:

```mermaid
graph TD
    A[Paper Intake: PDF / URL] --> B[Paper Analyzer & Repo Inference]
    B --> C{Coverage Score Assessment}
    C -->|Score >= 0.7| D[Tutorial Track: Steps 1-7]
    C -->|Score < 0.3| E[Implementation Track: Steps 8-12]
    C -->|0.3 <= Score < 0.7| F[Hybrid Execution]
    
    D --> G[Extract Tools & Wrap MCP]
    E --> H[Gap Analysis & Paper Coder]
    
    H --> I[Experiment Runner in Sandbox]
    I --> J[Results Comparator & Registry]
    J --> K{Verification Metrics Match?}
    
    K -->|No: Iterate| L[Fix Loop: Max 3 Retries]
    L --> I
    K -->|Yes / Maxed| M[MCP Re-wrap: Step 13]
    
    F --> D
    F --> E
    G --> N[Evaluated Workspace]
    M --> N
    
    %% Self Healing Loop
    I -.->|Failure Detected| O[Self-Healing Recovery]
    O -.->|Apply Solution| I
```

---

## ⚡ Quick Start

### 📋 Prerequisites

Ensure you have the following installed on your local machine:
- **Node.js** 20+
- **Python** 3.10+
- **Docker** (optional, recommended for sandboxed execution)
- **Claude CLI** (installed and authenticated)

### ⚙️ Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ashishpatill/Paper2Agent.git
   cd Paper2Agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   *Note: API keys can also be configured directly and securely in the web application UI.*

### 🖥️ Running the Studio

Start the local Next.js development server:
```bash
./run-app.sh dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to launch the studio dashboard!

---

