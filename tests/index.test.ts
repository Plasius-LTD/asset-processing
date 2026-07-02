import { describe, expect, it } from "vitest";
import {
  ASSET_PROCESSING_OPERATIONS,
  MIXAMO_FARM_ADVENTURE_CLIP_IDS,
  createDefaultProcessingPlan,
  extractMixamoAnimationMetadata,
  isMixamoFarmAdventureClipId,
  resolveModelContentType,
} from "../src/index.js";

describe("asset processing", () => {
  it("resolves runtime content types", () => {
    expect(resolveModelContentType("chair.gltf")).toBe("model/gltf+json");
    expect(resolveModelContentType("chair.glb")).toBe("model/gltf-binary");
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
      {
        movementCalibration: {
          motionMode: "calibrated-in-place",
          strideLength: 1.2,
          expectedSpeed: 1,
          footContactWindows: [[0.12, 0.28], [0.62, 0.78]],
          loopable: true,
          worldDisplacementAllowed: true,
        },
      },
    );

    expect(metadata).toMatchObject({
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
      movementProfile: {
        motionMode: "calibrated-in-place",
        durationMs: 2400,
        rootTranslationDistance: 0,
        expectedSpeed: 1,
        strideLength: 1.2,
        footContactWindows: [[0.12, 0.28], [0.62, 0.78]],
        verticalBounds: [0, 0],
        loopable: true,
        worldDisplacementAllowed: true,
        footSlideTolerance: 0.05,
      },
    });
  });

  it("keeps farm adventure clip ids explicit and detects incompatible skeletons", () => {
    expect(MIXAMO_FARM_ADVENTURE_CLIP_IDS).toContain("farming-watering");
    expect(isMixamoFarmAdventureClipId("gestures-basic-happy-hand-gesture")).toBe(false);
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

  it("quarantines invalid clips and marks stationary actions as non-displacing", () => {
    const stationary = extractMixamoAnimationMetadata(
      "farming-watering",
      {
        nodes: [{ name: "mixamorig:Hips" }],
        accessors: [{ max: [1.6] }, { min: [0, 0, 0], max: [0.01, 0.02, 0.01] }],
        animations: [
          {
            samplers: [{ input: 0, output: 1 }],
            channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
          },
        ],
      },
      {
        movementCalibration: {
          motionMode: "stationary",
          worldDisplacementAllowed: false,
          footSlideTolerance: 0.03,
        },
      },
    );

    expect(stationary.movementProfile.motionMode).toBe("stationary");
    expect(stationary.movementProfile.worldDisplacementAllowed).toBe(false);
    expect(stationary.movementProfile.rootTranslationDistance).toBeLessThan(0.02);
    expect(stationary.usableForFarmAdventure).toBe(true);

    const invalid = extractMixamoAnimationMetadata(
      "gestures-basic-happy-hand-gesture",
      {
        nodes: [{ name: "mixamorig:Hips" }],
        accessors: [{ max: [1] }],
        animations: [
          {
            samplers: [{ input: 0 }],
            channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }],
          },
        ],
      },
      {
        movementCalibration: {
          motionMode: "invalid",
          quarantineReason: "gesture pack hips baseline is incompatible with Peasant Girl",
        },
      },
    );

    expect(invalid.usableForFarmAdventure).toBe(false);
    expect(invalid.quarantineReason).toMatch(/incompatible/u);
    expect(invalid.movementProfile.motionMode).toBe("invalid");
  });
});
