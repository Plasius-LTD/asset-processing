import { describe, expect, it } from "vitest";
import {
  ASSET_PROCESSING_OPERATIONS,
  MIXAMO_FARM_ADVENTURE_CLIP_IDS,
  createDefaultProcessingPlan,
  createExternalModelProcessingPlan,
  extractMixamoAnimationMetadata,
  isMixamoFarmAdventureClipId,
  resolveModelContentType,
} from "../src/index.js";

describe("asset processing", () => {
  it("resolves runtime content types", () => {
    expect(resolveModelContentType("chair.gltf")).toBe("model/gltf+json");
    expect(resolveModelContentType("chair.glb")).toBe("model/gltf-binary");
    expect(resolveModelContentType("chair.obj")).toBe("text/plain");
    expect(resolveModelContentType("chair.dae")).toBe("model/vnd.collada+xml");
    expect(resolveModelContentType("chair.stl")).toBe("model/stl");
    expect(resolveModelContentType("texture.jpeg")).toBe("image/jpeg");
    expect(resolveModelContentType("texture.webp")).toBe("image/webp");
    expect(resolveModelContentType("payload.bin")).toBe("application/octet-stream");
    expect(resolveModelContentType("notes.txt")).toBe("application/octet-stream");
  });

  it("creates a complete default processing plan", () => {
    const plan = createDefaultProcessingPlan("eames-lounge-chair-ottoman");
    expect(plan.steps.map((step) => step.operation)).toEqual(ASSET_PROCESSING_OPERATIONS);
    expect(plan.steps.every((step) => step.required)).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(plan.targetRuntime).toBe("gpu-shared");
  });

  it("creates remote external processing plans with the canonical runtime model contract", () => {
    const plan = createExternalModelProcessingPlan("polyhaven-chair", {
      sourceFormat: "obj",
      remoteWorkerQueue: "asset-processing-high",
    });

    expect(plan.targetRuntime).toBe("game-runtime");
    expect(plan.sourceFormat).toBe("obj");
    expect(plan.remoteWorkerQueue).toBe("asset-processing-high");
    expect(plan.preserveRawSource).toBe(true);
    expect(plan.normalization).toEqual({
      outputFormat: "glb",
      unit: "meter",
      upAxis: "Y",
      forwardAxis: "-Z",
      origin: "floor-center",
      stableDigests: true,
    });
    expect(plan.lodBudgets.map((budget) => budget.level)).toEqual(["lod0", "lod1", "lod2", "lod3"]);
    expect(plan.steps.map((step) => step.operation)).toContain("normalize-orientation");
    expect(plan.steps.map((step) => step.operation)).toContain("generate-lod3");
    expect(Object.isFrozen(plan.normalization)).toBe(true);
    expect(Object.isFrozen(plan.lodBudgets)).toBe(true);
  });

  it("rejects incomplete LOD budget sets for external processing", () => {
    expect(() =>
      createExternalModelProcessingPlan("polyhaven-chair", {
        lodBudgets: [
          { level: "lod0", maxTriangles: 1000, textureMaxSize: 1024 },
          { level: "lod1", maxTriangles: 500, textureMaxSize: 512 },
        ],
      })
    ).toThrow(/lod0, lod1, lod2, and lod3/);
    expect(() =>
      createExternalModelProcessingPlan("polyhaven-chair", {
        lodBudgets: [
          { level: "lod0", maxTriangles: 1000, textureMaxSize: 1024 },
          { level: "lod1", maxTriangles: 500, textureMaxSize: 512 },
          { level: "lod2", maxTriangles: 0, textureMaxSize: 256 },
          { level: "lod3", maxTriangles: 100, textureMaxSize: 128 },
        ],
      })
    ).toThrow(/maxTriangles/);
  });

  it("extracts Mixamo animation metadata for renderer playback", () => {
    const metadata = extractMixamoAnimationMetadata(
      "female-basic-locomotion-walking",
      {
        nodes: [
          { name: "mixamorig:Hips" },
          { name: "mixamorig:LeftUpLeg" },
          { name: "mixamorig:RightArm" },
        ],
        accessors: [
          { max: [1.2] },
          { max: [2.4] },
        ],
        animations: [
          {
            name: "Walking",
            samplers: [{ input: 0 }, { input: 1 }],
            channels: [
              { sampler: 0, target: { node: 0, path: "translation" } },
              { sampler: 1, target: { node: 1, path: "rotation" } },
              { sampler: 1, target: { node: 2, path: "rotation" } },
            ],
          },
        ],
      },
    );

    expect(metadata).toEqual({
      clipId: "female-basic-locomotion-walking",
      durationMs: 2400,
      animatedNodeTargets: [
        "mixamorig:Hips",
        "mixamorig:LeftUpLeg",
        "mixamorig:RightArm",
      ],
      rootTranslation: true,
      skeletonCompatible: true,
      usableForFarmAdventure: true,
    });
  });

  it("keeps farm adventure clip ids explicit and detects incompatible skeletons", () => {
    expect(MIXAMO_FARM_ADVENTURE_CLIP_IDS).toContain("farming-watering");
    expect(isMixamoFarmAdventureClipId("gestures-basic-happy-hand-gesture")).toBe(true);
    expect(isMixamoFarmAdventureClipId("gestures-basic-acknowledging")).toBe(false);

    const metadata = extractMixamoAnimationMetadata(
      "farming-watering",
      {
        nodes: [{ name: "OtherRig:Hips" }],
        accessors: [{ max: [1] }],
        animations: [
          {
            samplers: [{ input: 0 }],
            channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
          },
        ],
      },
    );

    expect(metadata.rootTranslation).toBe(false);
    expect(metadata.skeletonCompatible).toBe(false);
    expect(metadata.usableForFarmAdventure).toBe(false);
  });
});
