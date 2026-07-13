#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asset-processing-packcheck-"));
  try {
    const output = execFileSync("npm", [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      temporaryRoot,
      "--cache",
      path.join(temporaryRoot, "npm-cache"),
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const parsed = parseNpmPackJson(output);
    const packResult = Array.isArray(parsed) ? parsed[0] : undefined;
    const files = packResult?.files ?? [];
    const paths = files.map((entry) => entry.path);
    const requiredEntrypoints = [
      "dist/index.js",
      "dist/index.cjs",
      "dist/index.d.ts",
      "dist/shader-admission.js",
      "dist/shader-admission.cjs",
      "dist/shader-admission.d.ts",
    ];
    const missingEntrypoints = requiredEntrypoints.filter((filePath) => !paths.includes(filePath));
    if (missingEntrypoints.length > 0) {
      throw new Error(`Public package is missing required entrypoints: ${missingEntrypoints.join(", ")}`);
    }

    const forbiddenTarballPathPatterns = [
      {
        label: "private monorepo path",
        regex: /(?:^|\/)plasius-ltd-site(?:\/|$)/i,
      },
      {
        label: "private app runtime path",
        regex: /(?:^|\/)(frontend|backend|dashboard|infra)(?:\/|$)/i,
      },
      {
        label: "local settings artifact",
        regex: /(?:^|\/)local\.settings(?:\.[^/]+)?\.json$/i,
      },
      {
        label: "azure host artifact",
        regex: /(?:^|\/)host\.json$/i,
      },
      {
        label: "generated tsp artifact",
        regex: /(?:^|\/)tsp-output(?:\/|$)/i,
      },
    ];

    const forbiddenPaths = paths.filter((filePath) =>
      forbiddenTarballPathPatterns.some(({ regex }) => regex.test(filePath))
    );

    if (forbiddenPaths.length > 0) {
      throw new Error(`Public package contains forbidden paths: ${forbiddenPaths.join(", ")}`);
    }

    const forbiddenCodeReferencePatterns = [
      {
        label: "private monorepo reference",
        regex: /\bplasius-ltd-site\b/i,
      },
      {
        label: "Plasius Ltd private reference",
        regex: /\bplasius(?:\s+|-)ltd\b/i,
      },
      {
        label: "proprietary PGP artifact reference",
        regex: /\bpgp[-_a-z0-9]*\b/i,
      },
      {
        label: "proprietary Lunari artifact reference",
        regex: /\blunari\b/i,
      },
      {
        label: "proprietary Pixelverse artifact reference",
        regex: /\bpixelverse\b/i,
      },
    ];

    const codeRoots = ["src", "tests", "demo"];
    const codeExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);
    const violations = scanCodeReferences(
      codeRoots,
      codeExtensions,
      forbiddenCodeReferencePatterns
    );

    if (violations.length > 0) {
      throw new Error(`Public package contains forbidden code references: ${violations
        .map((violation) => `${violation.file}:${violation.line} (${violation.label})`)
        .join(", ")}`);
    }

    if (typeof packResult?.filename !== "string") {
      throw new Error("npm pack did not return a package filename.");
    }
    const tarballPath = path.join(temporaryRoot, packResult.filename);
    const consumerDirectory = path.join(temporaryRoot, "consumer");
    fs.mkdirSync(consumerDirectory, { recursive: true });
    execFileSync("npm", [
      "install",
      "--prefix",
      consumerDirectory,
      "--ignore-scripts",
      "--no-save",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      "--legacy-peer-deps",
      "--cache",
      path.join(temporaryRoot, "npm-cache"),
      tarballPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    verifyInstalledExportMap(consumerDirectory);
    verifyBrowserBoundaries(consumerDirectory);
    verifyNodeEntrypoints(consumerDirectory);

    console.log("Public package check passed.");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function verifyInstalledExportMap(consumerDirectory) {
  const installedManifestPath = path.join(
    consumerDirectory,
    "node_modules",
    "@plasius",
    "asset-processing",
    "package.json"
  );
  const installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, "utf8"));
  const shaderExport = installedManifest.exports?.["./shader-admission"];
  if (shaderExport?.types !== "./dist/shader-admission.d.ts"
    || shaderExport?.node?.import !== "./dist/shader-admission.js"
    || shaderExport?.node?.require !== "./dist/shader-admission.cjs"
    || shaderExport?.default !== null) {
    throw new Error("Packed shader admission export is not explicitly Node-only.");
  }
}

function verifyBrowserBoundaries(consumerDirectory) {
  const rootBuild = buildSync({
    stdin: {
      contents: 'import * as root from "@plasius/asset-processing"; globalThis.__assetProcessingSmoke = root;',
      resolveDir: consumerDirectory,
      sourcefile: "asset-processing-browser-smoke.mjs",
    },
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "browser",
    write: false,
  });
  if ((rootBuild.outputFiles[0]?.contents.byteLength ?? 0) === 0) {
    throw new Error("Packed browser-root smoke bundle was unexpectedly empty.");
  }

  let rejectedNodeSubpath = false;
  try {
    buildSync({
      stdin: {
        contents: 'import * as shader from "@plasius/asset-processing/shader-admission"; globalThis.__shaderSmoke = shader;',
        resolveDir: consumerDirectory,
        sourcefile: "asset-processing-node-subpath-browser-smoke.mjs",
      },
      bundle: true,
      format: "esm",
      logLevel: "silent",
      platform: "browser",
      write: false,
    });
  } catch {
    rejectedNodeSubpath = true;
  }
  if (!rejectedNodeSubpath) {
    throw new Error("Browser bundling unexpectedly resolved the Node-only shader admission subpath.");
  }
}

function verifyNodeEntrypoints(consumerDirectory) {
  const esmSmoke = `
    const root = await import("@plasius/asset-processing");
    const shader = await import("@plasius/asset-processing/shader-admission");
    const plan = shader.createShaderAdmissionPlan("smoke-shader", "1.0.0");
    if (typeof root.resolveModelContentType !== "function"
      || "admitShaderQualification" in root
      || plan.targetRuntime !== "webgpu-wgsl") process.exit(1);
  `;
  const cjsSmoke = `
    const root = require("@plasius/asset-processing");
    const shader = require("@plasius/asset-processing/shader-admission");
    const plan = shader.createShaderAdmissionPlan("smoke-shader", "1.0.0");
    if (typeof root.resolveModelContentType !== "function"
      || "admitShaderQualification" in root
      || plan.targetRuntime !== "webgpu-wgsl") process.exit(1);
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", esmSmoke], {
    cwd: consumerDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });
  execFileSync(process.execPath, ["--eval", cjsSmoke], {
    cwd: consumerDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseNpmPackJson(rawOutput) {
  const start = rawOutput.indexOf("[");
  const end = rawOutput.lastIndexOf("]");

  if (start < 0 || end < start) {
    throw new Error("Could not find npm pack JSON payload in command output.");
  }

  const jsonSlice = rawOutput.slice(start, end + 1);
  return JSON.parse(jsonSlice);
}

function scanCodeReferences(roots, extensions, patterns) {
  const allFiles = [];
  for (const root of roots) {
    allFiles.push(...collectFiles(path.resolve(process.cwd(), root), extensions));
  }

  const violations = [];
  for (const file of allFiles) {
    const contents = fs.readFileSync(file, "utf8");

    for (const pattern of patterns) {
      const matchIndex = contents.search(pattern.regex);
      if (matchIndex < 0) {
        continue;
      }

      const beforeMatch = contents.slice(0, matchIndex);
      const line = beforeMatch.split(/\r?\n/u).length;
      violations.push({
        file: path.relative(process.cwd(), file),
        line,
        label: pattern.label,
      });
      break;
    }
  }

  return violations;
}

function collectFiles(root, extensions) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "dist-cjs") {
        continue;
      }
      files.push(...collectFiles(fullPath, extensions));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
