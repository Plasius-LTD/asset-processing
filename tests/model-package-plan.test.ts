import { describe, expect, it } from "vitest";
import {
  ASSET_PROCESSING_OPERATIONS,
  MODEL_CONVERSION_OPERATIONS,
  MODEL_SOURCE_FORMATS,
  createDefaultProcessingPlan,
  createModelConversionProcessingPlan,
  createModelPackageProcessingPlan,
  type CreateModelConversionProcessingPlanInput,
} from "../src/index.js";

const input: CreateModelConversionProcessingPlanInput = {
  assetId: "synthetic-model",
  sourceFormat: "gltf",
  targetFormat: "glb",
  targetRuntime: "gpu-shared",
  faultToleranceMode: "fail-closed",
  resourcePackagingPolicy: "relative-package",
};

describe("explicit model package processing", () => {
  it.each(MODEL_SOURCE_FORMATS)("requires manifest qualification before packaging %s", (sourceFormat) => {
    const plan = createModelPackageProcessingPlan({ ...input, sourceFormat });
    const operations = plan.steps.map((step) => step.operation);
    expect(operations).toEqual([
      "validate-model", "convert-model",
      ...(["step", "iges", "ifc"].includes(sourceFormat) ? ["tessellate-cad"] : []),
      "optimize-textures", "generate-lod", "generate-collision-proxy",
      "resource-manifest", "package-runtime",
    ]);
    expect(plan.steps.every((step) => step.required)).toBe(true);
    expect(plan.steps.find((step) => step.operation === "resource-manifest")?.description)
      .toMatch(/qualify.*resource.*manifest/iu);
  });

  it.each(["embedded", "relative-package", "manifest-referenced"] as const)("retains %s and every other policy", (resourcePackagingPolicy) => {
    const request = { ...input, sourceFormat: "ifc" as const, targetFormat: "usd" as const,
      targetRuntime: "game-runtime" as const, faultToleranceMode: "continue-with-diagnostics" as const,
      resourcePackagingPolicy };
    const plan = createModelPackageProcessingPlan(request);
    expect(plan).toMatchObject({ ...request, contractVersion: "model-package-plan-v1",
      featureFlag: "gpu.model.conversion.enabled" });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(plan.steps.every(Object.isFrozen)).toBe(true);
    const manifestStep = plan.steps.find((step) => step.operation === "resource-manifest");
    if (manifestStep === undefined) throw new Error("Missing required manifest step");
    expect(Reflect.set(manifestStep, "required", false)).toBe(false);
    expect(Reflect.set(plan, "assetId", "changed")).toBe(false);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    expect(createModelPackageProcessingPlan(request)).toEqual(plan);
    request.assetId = "later-identity";
    expect(plan.assetId).toBe("synthetic-model");
  });

  it("leaves both existing public plans and their operation catalogs unchanged", () => {
    expect(ASSET_PROCESSING_OPERATIONS).toEqual([
      "validate-gltf", "normalize-scale", "normalize-origin", "optimize-textures",
      "generate-lod", "generate-collision-proxy", "package-runtime",
    ]);
    expect(MODEL_CONVERSION_OPERATIONS).toEqual([
      "validate-model", "convert-model", "tessellate-cad", "optimize-textures",
      "generate-lod", "generate-collision-proxy", "package-runtime",
    ]);
    const legacy = createDefaultProcessingPlan(input.assetId);
    const previous = createModelConversionProcessingPlan(input);
    createModelPackageProcessingPlan(input);
    expect(createDefaultProcessingPlan(input.assetId)).toEqual(legacy);
    expect(createModelConversionProcessingPlan(input)).toEqual(previous);
    expect(previous.contractVersion).toBe("model-conversion-plan-v1");
    expect(previous.steps.map((step) => step.operation)).not.toContain("resource-manifest");
    expect(legacy.steps.map((step) => step.operation)).toEqual(ASSET_PROCESSING_OPERATIONS);
  });

  it.each([
    null, [], "synthetic", { ...input, assetId: ["synthetic"] },
    { ...input, assetId: "../synthetic" }, { ...input, sourceFormat: "unknown" },
    { ...input, targetFormat: "unknown" }, { ...input, targetRuntime: "unknown" },
    { ...input, faultToleranceMode: "unknown" }, { ...input, resourcePackagingPolicy: "unknown" },
  ])("retains the existing bounded validation for invalid input %#", (value) => {
    const call = (fn: (request: CreateModelConversionProcessingPlanInput) => unknown) => {
      try { fn(value as CreateModelConversionProcessingPlanInput); }
      catch (error) { return error; }
      throw new Error("Expected validation failure");
    };
    const previous = call(createModelConversionProcessingPlan);
    const current = call(createModelPackageProcessingPlan);
    expect(previous).toBeInstanceOf(TypeError);
    expect(current).toBeInstanceOf(TypeError);
    expect((current as Error).message).toBe((previous as Error).message);
  });

  it("uses the validated primitive identity once without coercion or a second caller read", () => {
    let reads = 0;
    const request = { ...input };
    Object.defineProperty(request, "assetId", { get() { reads++; return reads === 1 ? "synthetic-model" : ["changed"]; } });
    expect(createModelPackageProcessingPlan(request).assetId).toBe("synthetic-model");
    expect(reads).toBe(1);
    let coerced = false;
    const assetId = { toString() { coerced = true; return "synthetic-model"; } };
    expect(() => createModelPackageProcessingPlan({ ...input, assetId } as unknown as CreateModelConversionProcessingPlanInput))
      .toThrow("Model conversion asset ID is invalid.");
    expect(coerced).toBe(false);
  });
});
