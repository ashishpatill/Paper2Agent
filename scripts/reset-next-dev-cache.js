#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const devDir = path.join(process.cwd(), ".next", "dev");

try {
  fs.rmSync(devDir, { recursive: true, force: true });
} catch (error) {
  console.warn("[paper2agent] Could not clear .next/dev cache:", error.message);
}
