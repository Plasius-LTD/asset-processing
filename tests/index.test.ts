import { describe, expect, it } from "vitest";
import {
  ASSET_PROCESSING_OPERATIONS,
  MODEL_CONVERSION_OPERATIONS,
  MIXAMO_FARM_ADVENTURE_CLIP_IDS,
  createModelConversionProcessingPlan,
  createDefaultProcessingPlan,
  extractGltfMaterialTextureMetadata,
  extractMixamoAnimationMetadata,
  isMixamoFarmAdventureClipId,
  resolveModelContentType,
  resolveAssetProcessingContentType,
  resolveModelSourceFormat,
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
    expect(resolveModelContentType("chair.OBJ")).toBe("model/obj");
    expect(resolveModelContentType("chair.mtl")).toBe("model/mtl");
    expect(resolveModelContentType("chair.fbx")).toBe("application/octet-stream");
    expect(resolveModelContentType("part.step")).toBe("model/step");
    expect(resolveModelContentType("part.stp")).toBe("model/step");
    expect(resolveModelContentType("part.iges")).toBe("model/iges");
    expect(resolveModelContentType("part.igs")).toBe("model/iges");
    expect(resolveModelContentType("building.ifc")).toBe("application/x-step");
    expect(resolveModelContentType("scene.usd")).toBe("application/octet-stream");
    expect(resolveModelContentType("scene.usda")).toBe("model/vnd.usda");
    expect(resolveModelContentType("scene.usdc")).toBe("application/octet-stream");
    expect(resolveModelContentType("scene.usdz")).toBe("model/vnd.usdz+zip");
    expect(resolveModelContentType("part.stp?download=1")).toBe("model/step");
    expect(resolveModelContentType("payload.bin")).toBe("application/octet-stream");
    expect(resolveModelContentType("notes.txt")).toBe("application/octet-stream");
    expect(resolveAssetProcessingContentType("chair.obj")).toBe("model/obj");
  });

  it("normalizes STEP and IGES extension aliases to canonical source formats", () => {
    expect(resolveModelSourceFormat("C:\\models\\part.STP?download=1")).toBe("step");
    expect(resolveModelSourceFormat("models/part.igs#preview")).toBe("iges");
    expect(resolveModelSourceFormat("notes.txt")).toBeUndefined();
  });

  it("creates a complete default processing plan", () => {
    const plan = createDefaultProcessingPlan("eames-lounge-chair-ottoman");
    expect(plan.steps.map((step) => step.operation)).toEqual(ASSET_PROCESSING_OPERATIONS);
    expect(plan.steps.every((step) => step.required)).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(plan.targetRuntime).toBe("gpu-shared");
  });

  it("creates immutable multi-format processing plans with explicit runtime policy", () => {
    expect(MODEL_CONVERSION_OPERATIONS).toEqual([
      "validate-model",
      "convert-model",
      "tessellate-cad",
      "optimize-textures",
      "generate-lod",
      "generate-collision-proxy",
      "package-runtime",
    ]);

    const gltfPlan = createModelConversionProcessingPlan({
      assetId: "building-42",
      sourceFormat: "gltf",
      targetFormat: "glb",
      targetRuntime: "gpu-shared",
      faultToleranceMode: "fail-closed",
      resourcePackagingPolicy: "relative-package",
    });

    expect(gltfPlan).toMatchObject({
      assetId: "building-42",
      featureFlag: "gpu.model.conversion.enabled",
      sourceFormat: "gltf",
      targetFormat: "glb",
      targetRuntime: "gpu-shared",
      faultToleranceMode: "fail-closed",
      resourcePackagingPolicy: "relative-package",
    });
    expect(gltfPlan.steps.map((step) => step.operation)).toEqual([
      "validate-model",
      "convert-model",
      "optimize-textures",
      "generate-lod",
      "generate-collision-proxy",
      "package-runtime",
    ]);
    expect(Object.isFrozen(gltfPlan)).toBe(true);
    expect(Object.isFrozen(gltfPlan.steps)).toBe(true);
    expect(gltfPlan.steps.every(Object.isFrozen)).toBe(true);
  });

  it("includes CAD tessellation and rejects invalid conversion policy inputs", () => {
    const cadPlan = createModelConversionProcessingPlan({
      assetId: "building-42",
      sourceFormat: "ifc",
      targetFormat: "glb",
      targetRuntime: "game-runtime",
      faultToleranceMode: "continue-with-diagnostics",
      resourcePackagingPolicy: "manifest-referenced",
    });

    expect(cadPlan.steps.map((step) => step.operation)).toContain("tessellate-cad");
    expect(() => createModelConversionProcessingPlan({
      assetId: "../unsafe",
      sourceFormat: "ifc",
      targetFormat: "glb",
      targetRuntime: "game-runtime",
      faultToleranceMode: "fail-closed",
      resourcePackagingPolicy: "manifest-referenced",
    })).toThrow(/asset id/iu);
    expect(() => createModelConversionProcessingPlan({
      assetId: "building-42",
      sourceFormat: "unknown" as "ifc",
      targetFormat: "glb",
      targetRuntime: "game-runtime",
      faultToleranceMode: "fail-closed",
      resourcePackagingPolicy: "manifest-referenced",
    })).toThrow(/source format/iu);
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

  it("reports missing base-color texture buffers and absent authored textures", () => {
    const missingBuffer = validateProfessionalCharacterAsset("missing-diffuse-buffer", {
      materials: [
        {
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
        },
      ],
      textures: [{ source: 0 }],
      images: [{ bufferView: 1 }],
      bufferViews: [],
      meshes: [
        {
          primitives: [
            {
              attributes: {
                NORMAL: 1,
                TEXCOORD_0: 2,
                JOINTS_0: 3,
                WEIGHTS_0: 4,
              },
            },
          ],
        },
      ],
      skins: [{ joints: [0, 1, 2] }],
    });

    expect(missingBuffer.valid).toBe(false);
    expect(missingBuffer.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required",
          path: "$.materials[*].normalTexture",
        }),
        expect.objectContaining({
          code: "missing-reference",
          path: "$.materials[0].pbrMetallicRoughness.baseColorTexture",
        }),
      ]),
    );

    const absentTexture = validateProfessionalCharacterAsset("untextured-character", {
      meshes: [{ primitives: [{ attributes: { NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 } }] }],
      skins: [{ joints: [0, 1, 2] }],
    });

    expect(absentTexture.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required", path: "$.materials[*].pbrMetallicRoughness.baseColorTexture" }),
        expect.objectContaining({ code: "required", path: "$.materials[*].normalTexture" }),
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

  it("rejects root-motion clips that cannot displace or exceed foot-slide tolerance", () => {
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
      {
        movementCalibration: {
          motionMode: "root-authored",
          worldDisplacementAllowed: false,
          footSlideTolerance: 0.2,
        },
      },
    );

    expect(validateProfessionalRootMotionProfile(rootAuthored)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-value", path: "$.movementProfile.worldDisplacementAllowed" }),
        expect.objectContaining({ code: "invalid-value", path: "$.movementProfile.footSlideTolerance" }),
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

  it("rejects environment props without meshes, normal textures, or valid bounds", () => {
    const invalid = validateEnvironmentPropAsset("bad-prop", {
      materials: [
        {
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
          normalTexture: { index: 1 },
        },
      ],
      textures: [{ source: 0 }, { source: 1 }],
      images: [{ uri: "diffuse.png" }, { bufferView: 9 }],
      bufferViews: [],
      meshes: [],
    }, {
      bounds: { min: [1, 0, 1], max: [1, 0, 1] },
      requireTexture: true,
      requireNormalTexture: true,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required", path: "$.meshes" }),
        expect.objectContaining({ code: "missing-reference", path: "$.materials[0].normalTexture" }),
        expect.objectContaining({ code: "invalid-value", path: "$.bounds" }),
      ]),
    );
  });
});
