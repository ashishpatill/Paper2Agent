#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function getCurrentRuntimePackageName() {
  const parts = [process.platform, process.arch];

  if (process.platform === "linux") {
    const { MUSL, familySync } = require("detect-libc");
    const family = familySync();

    if (family === MUSL) {
      parts.push("musl");
    } else if (process.arch === "arm") {
      parts.push("gnueabihf");
    } else {
      parts.push("gnu");
    }
  } else if (process.platform === "win32") {
    parts.push("msvc");
  }

  return `lightningcss-${parts.join("-")}`;
}

function getDesiredPackageNames() {
  if (process.platform === "darwin") {
    return ["lightningcss-darwin-arm64", "lightningcss-darwin-x64"];
  }

  return [getCurrentRuntimePackageName()];
}

function resolveInstalledVersion() {
  try {
    const entryPath = require.resolve("lightningcss");
    const packageJsonPath = path.join(path.dirname(entryPath), "..", "package.json");
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;
  } catch {
    console.error("lightningcss is not installed. Run npm install first.");
    process.exit(1);
  }
}

function hasRuntimePackage(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function installRuntimePackage(packageName, version) {
  console.warn(
    `[paper2agent] Missing ${packageName} for ${process.platform}/${process.arch}. Installing it now...`
  );

  execFileSync("npm", ["install", "--no-save", "--force", `${packageName}@${version}`], {
    stdio: "inherit"
  });
}

const version = resolveInstalledVersion();
const packageNames = getDesiredPackageNames();

for (const packageName of packageNames) {
  if (!hasRuntimePackage(packageName)) {
    installRuntimePackage(packageName, version);
  }
}
