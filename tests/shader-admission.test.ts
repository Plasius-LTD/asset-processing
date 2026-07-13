import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveAssetProcessingContentType,
} from "../src/index.js";
import {
  GPU_SHADER_STORE_FEATURE_FLAG,
  SHADER_ADMISSION_CONTRACT_VERSION,
  SHADER_ADMISSION_OPERATIONS,
  createShaderAdmissionPlan,
} from "../src/shader-admission.js";

describe("WGSL shader admission contracts", () => {
  it("defines a frozen, fail-closed admission plan in dependency order", () => {
    const plan = createShaderAdmissionPlan("shader-cartoon", "1.0.0");

    expect(SHADER_ADMISSION_CONTRACT_VERSION).toBe("2026-07-13.v1");
    expect(plan).toMatchObject({
      contractVersion: SHADER_ADMISSION_CONTRACT_VERSION,
      shaderId: "shader-cartoon",
      version: "1.0.0",
      featureFlagId: GPU_SHADER_STORE_FEATURE_FLAG,
      targetRuntime: "webgpu-wgsl",
    });
    expect(plan.steps.map((step) => step.operation)).toEqual(SHADER_ADMISSION_OPERATIONS);
    expect(plan.steps.every((step) => step.required)).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(Object.isFrozen(plan.steps[0])).toBe(true);
  });

  it("resolves canonical WGSL and JSON lifecycle content types without changing legacy model resolution", () => {
    expect(resolveAssetProcessingContentType("modules/material.wgsl")).toBe("text/wgsl; charset=utf-8");
    expect(resolveAssetProcessingContentType("shader/shader.json")).toBe("application/json");
    expect(resolveAssetProcessingContentType("profiles/cartoon.json")).toBe("application/json");
    expect(resolveAssetProcessingContentType("models/chair.gltf")).toBe("model/gltf+json");
    expect(resolveAssetProcessingContentType("models/chair.glb")).toBe("model/gltf-binary");
    expect(resolveAssetProcessingContentType("unknown.payload")).toBe("application/octet-stream");
  });

  it("rejects unsafe admission identities before processing starts", () => {
    expect(() => createShaderAdmissionPlan("Shader Cartoon", "1.0.0")).toThrow(/Shader id/u);
    expect(() => createShaderAdmissionPlan("shader-cartoon", "../latest")).toThrow(/Shader version/u);
  });

  it("keeps Node-only shader admission APIs off the browser-safe root", async () => {
    const root = await import("../src/index.js");

    expect(root).not.toHaveProperty("admitShaderQualification");
    expect(root).not.toHaveProperty("revalidateShaderAdmissionReceipt");
    expect(root).not.toHaveProperty("createShaderAdmissionPlan");
  });

  it("keeps the deadline referenced until an idle CLI receives its timeout result", () => {
    const admissionModule = pathToFileURL(resolve(process.cwd(), "src/shader-admission.ts")).href;
    const script = `
      const { admitShaderQualification } = await import(${JSON.stringify(admissionModule)});
      const bytes = new Uint8Array([1]);
      const result = await admitShaderQualification({
        sourceArchiveBytes: bytes,
        materializeQualificationBundle: async () => new Promise(() => undefined),
        matrixBytes: bytes,
        validationEvidenceBytes: bytes,
        validationEvidenceUri: "https://assets.example.invalid/evidence/smoke/1.0.0/evidence.json",
        attestationReferenceBytes: bytes,
        attestationReferenceUri: "https://assets.example.invalid/evidence/smoke/1.0.0/attestation.json",
        attestationBundleBytes: bytes,
        shaderManifestUri: "https://assets.example.invalid/shaders/smoke/1.0.0/shader.json",
        evidenceAssetVersion: "1.0.0",
        sourceAdapter: "local-import",
        createdAt: "2026-07-13T12:00:00.000Z",
        verifyCryptographicBundle: async () => true,
        timeoutMs: 10,
      });
      process.stdout.write(JSON.stringify(result));
    `;
    const run = spawnSync(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      script,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      ok: false,
      diagnostics: [{ code: "timeout", stage: "assemble-final-wgsl" }],
    });
  });
});
