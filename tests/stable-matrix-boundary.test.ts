import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  SUPPORTED_STABLE_WEBGPU_MATRIX_POLICIES,
  computeSha256,
} from "@plasius/gpu-shader";
import { validateStableWebGpuMatrix } from "@plasius/gpu-shader/testing";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const shaderPackageJson = require.resolve("@plasius/gpu-shader/package.json");
const stableMatrixPath = resolve(
  dirname(shaderPackageJson),
  "matrices/stable-webgpu-2026-07-13.json",
);

describe("packaged stable WebGPU matrix boundary", () => {
  it("accepts the exact released matrix and rejects an incomplete physical fleet", async () => {
    const matrixBytes = new Uint8Array(await readFile(stableMatrixPath));
    const matrixValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(matrixBytes)) as unknown;
    const policy = SUPPORTED_STABLE_WEBGPU_MATRIX_POLICIES[0];
    expect(policy).toBeDefined();
    expect(await computeSha256(matrixBytes)).toBe(policy?.matrixSha256);

    const validated = validateStableWebGpuMatrix(matrixValue);
    expect(validated.ok, validated.ok ? undefined : JSON.stringify(validated.diagnostics)).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.cells).toHaveLength(16);
    expect(validated.value.cells.filter((cell) => cell.adapter.kind === "physical")).toHaveLength(15);
    expect(validated.value.cells.every((cell) => cell.blocking)).toBe(true);

    const incomplete = {
      ...validated.value,
      cells: validated.value.cells.slice(0, -1),
    };
    const rejected = validateStableWebGpuMatrix(incomplete);
    expect(rejected.ok).toBe(false);
  });
});
