import { describe, expect, it } from "vitest";
import {
  ASSET_PROCESSING_OPERATIONS,
  MIXAMO_FARM_ADVENTURE_CLIP_IDS,
  createDefaultProcessingPlan,
  extractGltfMaterialTextureMetadata,
  extractMixamoAnimationMetadata,
  isMixamoFarmAdventureClipId,
  resolveModelContentType,
  validateEnvironmentPropAsset,
  validateProfessionalCharacterAsset,
  validateProfessionalRootMotionProfile,
} from "../src/index.js";

const texturedSkinnedDocument = {
  bufferViews: [{ byteLength: 128 }, { byteLength: 256 }],
  images: [
    { name: "Peasant_Girl_diffuse.png", mimeType: "image/png", bufferView: 0 },
    { name: "Peasant_Girl_normal.png", mimeType: "image/png", bufferView: 1 },
  ],
  textures: [{ source: 0 }, { source: 1 }],
  materials: [
    {
      name: "Peasant_Girl",
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      normalTexture: { index: 1 },
    },
  ],
  meshes: [
    {
      primitives: [
        {
          material: 0,
          attributes: {
            POSITION: 0,
            NORMAL: 1,
            TEXCOORD_0: 2,
            JOINTS_0: 3,
            WEIGHTS_0: 4,
          },
        },
      ],
    },
  ],
  skins: [{ joints: Array.from({ length: 69 }, (_, index) => index) }],
};

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

  it("extracts GLB material and texture quality metadata for professional characters", () => {
    const metadata = extractGltfMaterialTextureMetadata(texturedSkinnedDocument);

    expect(metadata).toMatchObject({
      materialCount: 1,
      textureCount: 2,
      imageCount: 2,
      embeddedImageCount: 2,
      baseColorTextureCount: 1,
      normalTextureCount: 1,
      meshPrimitiveCount: 1,
      skinnedPrimitiveCount: 1,
      uvPrimitiveCount: 1,
      normalPrimitiveCount: 1,
      hasSkin: true,
      maxJointCount: 69,
      hasBaseColorTexture: true,
      hasNormalTexture: true,
      hasUv: true,
      hasNormals: true,
      missingTextureReferences: [],
    });

    const validation = validateProfessionalCharacterAsset("peasant-girl", texturedSkinnedDocument);
    expect(validation.valid).toBe(true);
    expect(validation.metadata.maxJointCount).toBe(69);
  });

  it("rejects professional character assets without UVs, skinning, or texture buffers", () => {
    const validation = validateProfessionalCharacterAsset("broken-character", {
      materials: [
        {
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
          normalTexture: { index: 1 },
        },
      ],
      textures: [{ source: 0 }, { source: 1 }],
      images: [{ bufferView: 0 }, { bufferView: 3 }],
      bufferViews: [{ byteLength: 128 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      skins: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required", path: "$.skins" }),
        expect.objectContaining({ code: "required", path: "$.meshes[*].primitives[*].attributes.TEXCOORD_0" }),
        expect.objectContaining({ code: "required", path: "$.meshes[*].primitives[*].attributes.NORMAL" }),
        expect.objectContaining({ code: "missing-reference", path: "$.materials[0].normalTexture" }),
      ]),
    );
  });

  it("accepts root-authored travel metadata and rejects calibrated in-place movement", () => {
    const rootAuthored = extractMixamoAnimationMetadata(
      "female-basic-locomotion-walking",
      {
        nodes: [{ name: "mixamorig:Hips" }],
        accessors: [
          { max: [1.2] },
          { min: [0, 0, 0], max: [0, 0, 2.4] },
        ],
        animations: [
          {
            samplers: [{ input: 0, output: 1 }],
            channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
          },
        ],
      },
    );

    expect(validateProfessionalRootMotionProfile(rootAuthored)).toEqual([]);

    const calibrated = extractMixamoAnimationMetadata(
      "female-basic-locomotion-walking",
      {
        nodes: [{ name: "mixamorig:Hips" }],
        accessors: [{ max: [1.2] }],
        animations: [
          {
            samplers: [{ input: 0 }],
            channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }],
          },
        ],
      },
      {
        movementCalibration: {
          motionMode: "calibrated-in-place",
          strideLength: 1,
          worldDisplacementAllowed: true,
        },
      },
    );

    expect(validateProfessionalRootMotionProfile(calibrated)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required", path: "$.movementProfile.rootTranslationDistance" }),
        expect.objectContaining({ code: "invalid-value", path: "$.movementProfile.motionMode" }),
      ]),
    );
  });

  it("validates textured grounded environment props", () => {
    const valid = validateEnvironmentPropAsset("farm-crate", texturedSkinnedDocument, {
      bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
      requireTexture: true,
      requireNormalTexture: true,
    });

    expect(valid.valid).toBe(true);

    const invalid = validateEnvironmentPropAsset("floating-tree", {
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      materials: [{}],
    }, {
      bounds: { min: [-1, 0.4, -1], max: [1, 3, 1] },
      requireTexture: true,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required", path: "$.materials[*].pbrMetallicRoughness.baseColorTexture" }),
        expect.objectContaining({ code: "invalid-value", path: "$.bounds.min[1]" }),
      ]),
    );
  });
});
