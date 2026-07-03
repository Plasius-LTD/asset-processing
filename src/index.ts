export const ASSET_PROCESSING_PACKAGE = "@plasius/asset-processing";

export const ASSET_PROCESSING_OPERATIONS = Object.freeze([
  "validate-gltf",
  "normalize-scale",
  "normalize-origin",
  "optimize-textures",
  "generate-lod",
  "generate-collision-proxy",
  "package-runtime",
] as const);

export const MIXAMO_FARM_ADVENTURE_CLIP_IDS = Object.freeze([
  "female-basic-locomotion-idle",
  "female-basic-locomotion-walking",
  "farming-dig-and-plant-seeds",
  "farming-watering",
  "farming-pick-fruit",
  "female-basic-locomotion-jump",
  "gestures-basic-happy-hand-gesture",
] as const);

export type AssetProcessingOperation = typeof ASSET_PROCESSING_OPERATIONS[number];
export type MixamoFarmAdventureClipId = typeof MIXAMO_FARM_ADVENTURE_CLIP_IDS[number];

export interface AssetProcessingStep {
  readonly operation: AssetProcessingOperation;
  readonly required: boolean;
  readonly description: string;
}

export interface AssetProcessingPlan {
  readonly assetId: string;
  readonly steps: readonly AssetProcessingStep[];
  readonly targetRuntime: "gpu-shared" | "game-runtime";
}

export interface GltfAnimationSamplerLike {
  readonly input?: number;
  readonly output?: number;
}

export interface GltfAnimationChannelLike {
  readonly sampler?: number;
  readonly target?: {
    readonly node?: number;
    readonly path?: string;
  };
}

export interface GltfAnimationLike {
  readonly name?: string;
  readonly samplers?: readonly GltfAnimationSamplerLike[];
  readonly channels?: readonly GltfAnimationChannelLike[];
}

export interface GltfAccessorLike {
  readonly min?: readonly number[];
  readonly max?: readonly number[];
  readonly count?: number;
}

export interface GltfNodeLike {
  readonly name?: string;
}

export interface GltfTextureInfoLike {
  readonly index?: number;
}

export interface GltfMaterialLike {
  readonly name?: string;
  readonly pbrMetallicRoughness?: {
    readonly baseColorTexture?: GltfTextureInfoLike;
  };
  readonly normalTexture?: GltfTextureInfoLike;
}

export interface GltfTextureLike {
  readonly source?: number;
}

export interface GltfImageLike {
  readonly name?: string;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly bufferView?: number;
}

export interface GltfMeshPrimitiveLike {
  readonly attributes?: Readonly<Record<string, number>>;
  readonly material?: number;
}

export interface GltfMeshLike {
  readonly primitives?: readonly GltfMeshPrimitiveLike[];
}

export interface GltfSkinLike {
  readonly joints?: readonly number[];
}

export interface GltfDocumentLike {
  readonly animations?: readonly GltfAnimationLike[];
  readonly accessors?: readonly GltfAccessorLike[];
  readonly nodes?: readonly GltfNodeLike[];
  readonly materials?: readonly GltfMaterialLike[];
  readonly textures?: readonly GltfTextureLike[];
  readonly images?: readonly GltfImageLike[];
  readonly meshes?: readonly GltfMeshLike[];
  readonly skins?: readonly GltfSkinLike[];
  readonly bufferViews?: readonly unknown[];
}

export interface MixamoAnimationMetadata {
  readonly clipId: string;
  readonly durationMs: number;
  readonly animatedNodeTargets: readonly string[];
  readonly rootTranslation: boolean;
  readonly skeletonCompatible: boolean;
  readonly usableForFarmAdventure: boolean;
  readonly movementProfile: MixamoAnimationMovementProfile;
  readonly quarantineReason?: string;
}

export type MixamoAnimationMotionMode =
  | "stationary"
  | "calibrated-in-place"
  | "root-authored"
  | "jump"
  | "modifier"
  | "invalid";

export interface MixamoAnimationMovementProfile {
  readonly motionMode: MixamoAnimationMotionMode;
  readonly durationMs: number;
  readonly rootTranslationDistance: number;
  readonly expectedSpeed: number;
  readonly strideLength: number;
  readonly footContactWindows: readonly [number, number][];
  readonly verticalBounds: readonly [number, number];
  readonly loopable: boolean;
  readonly worldDisplacementAllowed: boolean;
  readonly footSlideTolerance: number;
}

export interface MixamoAnimationMovementCalibration {
  readonly motionMode?: MixamoAnimationMotionMode;
  readonly strideLength?: number;
  readonly expectedSpeed?: number;
  readonly footContactWindows?: readonly [number, number][];
  readonly loopable?: boolean;
  readonly worldDisplacementAllowed?: boolean;
  readonly footSlideTolerance?: number;
  readonly quarantineReason?: string;
}

export interface GltfMaterialTextureMetadata {
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly embeddedImageCount: number;
  readonly externalImageCount: number;
  readonly baseColorTextureCount: number;
  readonly normalTextureCount: number;
  readonly meshPrimitiveCount: number;
  readonly skinnedPrimitiveCount: number;
  readonly uvPrimitiveCount: number;
  readonly normalPrimitiveCount: number;
  readonly hasSkin: boolean;
  readonly maxJointCount: number;
  readonly hasBaseColorTexture: boolean;
  readonly hasNormalTexture: boolean;
  readonly hasUv: boolean;
  readonly hasNormals: boolean;
  readonly missingTextureReferences: readonly string[];
}

export interface AssetValidationIssue {
  readonly code: "required" | "invalid-value" | "missing-reference";
  readonly path: string;
  readonly message: string;
}

export interface ProfessionalAssetValidationResult {
  readonly valid: boolean;
  readonly assetId: string;
  readonly issues: readonly AssetValidationIssue[];
  readonly metadata: GltfMaterialTextureMetadata;
}

export interface EnvironmentPropBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface EnvironmentPropValidationOptions {
  readonly bounds?: EnvironmentPropBounds;
  readonly groundTolerance?: number;
  readonly requireTexture?: boolean;
  readonly requireNormalTexture?: boolean;
}

export const MODEL_CONTENT_TYPES = Object.freeze({
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
});

export function resolveModelContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  const extension = Object.keys(MODEL_CONTENT_TYPES).find((candidate) => lower.endsWith(candidate));
  return extension ? MODEL_CONTENT_TYPES[extension as keyof typeof MODEL_CONTENT_TYPES] : "application/octet-stream";
}

function pushAssetIssue(
  issues: AssetValidationIssue[],
  issue: AssetValidationIssue,
): void {
  issues.push(issue);
}

function textureImage(document: GltfDocumentLike, textureIndex: number | undefined): GltfImageLike | undefined {
  if (typeof textureIndex !== "number") {
    return undefined;
  }
  const texture = document.textures?.[textureIndex];
  return typeof texture?.source === "number" ? document.images?.[texture.source] : undefined;
}

function hasImageBuffer(document: GltfDocumentLike, image: GltfImageLike | undefined): boolean {
  if (!image) {
    return false;
  }
  if (typeof image.uri === "string" && image.uri.trim().length > 0) {
    return true;
  }
  return typeof image.bufferView === "number" && Boolean(document.bufferViews?.[image.bufferView]);
}

export function extractGltfMaterialTextureMetadata(document: GltfDocumentLike): GltfMaterialTextureMetadata {
  const missingTextureReferences: string[] = [];
  let baseColorTextureCount = 0;
  let normalTextureCount = 0;
  let meshPrimitiveCount = 0;
  let skinnedPrimitiveCount = 0;
  let uvPrimitiveCount = 0;
  let normalPrimitiveCount = 0;

  for (const [materialIndex, material] of (document.materials ?? []).entries()) {
    const baseColorIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (typeof baseColorIndex === "number") {
      baseColorTextureCount += 1;
      if (!hasImageBuffer(document, textureImage(document, baseColorIndex))) {
        missingTextureReferences.push(`materials[${materialIndex}].pbrMetallicRoughness.baseColorTexture`);
      }
    }

    const normalIndex = material.normalTexture?.index;
    if (typeof normalIndex === "number") {
      normalTextureCount += 1;
      if (!hasImageBuffer(document, textureImage(document, normalIndex))) {
        missingTextureReferences.push(`materials[${materialIndex}].normalTexture`);
      }
    }
  }

  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      meshPrimitiveCount += 1;
      const attributes = primitive.attributes ?? {};
      if (typeof attributes.TEXCOORD_0 === "number") {
        uvPrimitiveCount += 1;
      }
      if (typeof attributes.NORMAL === "number") {
        normalPrimitiveCount += 1;
      }
      if (typeof attributes.JOINTS_0 === "number" && typeof attributes.WEIGHTS_0 === "number") {
        skinnedPrimitiveCount += 1;
      }
    }
  }

  const embeddedImageCount = (document.images ?? []).filter((image) => typeof image.bufferView === "number").length;
  const externalImageCount = (document.images ?? []).filter((image) => typeof image.uri === "string" && image.uri.trim().length > 0).length;
  const maxJointCount = Math.max(0, ...(document.skins ?? []).map((skin) => skin.joints?.length ?? 0));

  return Object.freeze({
    materialCount: document.materials?.length ?? 0,
    textureCount: document.textures?.length ?? 0,
    imageCount: document.images?.length ?? 0,
    embeddedImageCount,
    externalImageCount,
    baseColorTextureCount,
    normalTextureCount,
    meshPrimitiveCount,
    skinnedPrimitiveCount,
    uvPrimitiveCount,
    normalPrimitiveCount,
    hasSkin: maxJointCount > 0 && skinnedPrimitiveCount > 0,
    maxJointCount,
    hasBaseColorTexture: baseColorTextureCount > 0,
    hasNormalTexture: normalTextureCount > 0,
    hasUv: uvPrimitiveCount > 0,
    hasNormals: normalPrimitiveCount > 0,
    missingTextureReferences: Object.freeze(missingTextureReferences),
  });
}

export function validateProfessionalCharacterAsset(
  assetId: string,
  document: GltfDocumentLike,
): ProfessionalAssetValidationResult {
  const metadata = extractGltfMaterialTextureMetadata(document);
  const issues: AssetValidationIssue[] = [];

  if (!metadata.hasSkin) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.skins",
      message: "professional characters must include a skin and weighted primitives.",
    });
  }
  if (!metadata.hasUv) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.meshes[*].primitives[*].attributes.TEXCOORD_0",
      message: "professional characters must include UV coordinates.",
    });
  }
  if (!metadata.hasNormals) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.meshes[*].primitives[*].attributes.NORMAL",
      message: "professional characters must include normals.",
    });
  }
  if (!metadata.hasBaseColorTexture) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.materials[*].pbrMetallicRoughness.baseColorTexture",
      message: "professional characters must include a diffuse/base-color texture.",
    });
  }
  if (!metadata.hasNormalTexture) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.materials[*].normalTexture",
      message: "professional characters must include a normal texture.",
    });
  }
  for (const reference of metadata.missingTextureReferences) {
    pushAssetIssue(issues, {
      code: "missing-reference",
      path: `$.${reference}`,
      message: "texture reference must resolve to an embedded or external image buffer.",
    });
  }

  return Object.freeze({
    valid: issues.length === 0,
    assetId,
    issues: Object.freeze(issues),
    metadata,
  });
}

export function validateProfessionalRootMotionProfile(
  metadata: MixamoAnimationMetadata,
  options: { readonly maxFootSlideTolerance?: number } = {},
): readonly AssetValidationIssue[] {
  const issues: AssetValidationIssue[] = [];
  const maxFootSlideTolerance = options.maxFootSlideTolerance ?? 0.08;
  const profile = metadata.movementProfile;

  if (!metadata.rootTranslation || profile.rootTranslationDistance <= 0.01) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.movementProfile.rootTranslationDistance",
      message: "professional travel clips must provide authored root translation.",
    });
  }
  if (profile.motionMode !== "root-authored" && profile.motionMode !== "jump") {
    pushAssetIssue(issues, {
      code: "invalid-value",
      path: "$.movementProfile.motionMode",
      message: "professional travel clips cannot use calibrated in-place movement.",
    });
  }
  if (!profile.worldDisplacementAllowed) {
    pushAssetIssue(issues, {
      code: "invalid-value",
      path: "$.movementProfile.worldDisplacementAllowed",
      message: "professional travel clips must allow world displacement.",
    });
  }
  if (profile.footSlideTolerance > maxFootSlideTolerance) {
    pushAssetIssue(issues, {
      code: "invalid-value",
      path: "$.movementProfile.footSlideTolerance",
      message: "professional travel clips exceed the foot-slide tolerance.",
    });
  }

  return Object.freeze(issues);
}

export function validateEnvironmentPropAsset(
  assetId: string,
  document: GltfDocumentLike,
  options: EnvironmentPropValidationOptions = {},
): ProfessionalAssetValidationResult {
  const metadata = extractGltfMaterialTextureMetadata(document);
  const issues: AssetValidationIssue[] = [];
  const requireTexture = options.requireTexture ?? true;
  const requireNormalTexture = options.requireNormalTexture ?? false;
  const groundTolerance = options.groundTolerance ?? 0.05;

  if (metadata.meshPrimitiveCount === 0) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.meshes",
      message: "environment props must include renderable mesh primitives.",
    });
  }
  if (requireTexture && !metadata.hasBaseColorTexture) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.materials[*].pbrMetallicRoughness.baseColorTexture",
      message: "environment props must include a diffuse/base-color texture.",
    });
  }
  if (requireNormalTexture && !metadata.hasNormalTexture) {
    pushAssetIssue(issues, {
      code: "required",
      path: "$.materials[*].normalTexture",
      message: "environment props must include a normal texture.",
    });
  }
  for (const reference of metadata.missingTextureReferences) {
    pushAssetIssue(issues, {
      code: "missing-reference",
      path: `$.${reference}`,
      message: "texture reference must resolve to an embedded or external image buffer.",
    });
  }

  const bounds = options.bounds;
  if (bounds) {
    const minY = bounds.min[1];
    if (!Number.isFinite(minY) || Math.abs(minY) > groundTolerance) {
      pushAssetIssue(issues, {
        code: "invalid-value",
        path: "$.bounds.min[1]",
        message: "environment props must be authored with their base at ground level.",
      });
    }
    if (bounds.min.some((axis, index) => !Number.isFinite(axis) || axis >= bounds.max[index]!)) {
      pushAssetIssue(issues, {
        code: "invalid-value",
        path: "$.bounds",
        message: "environment prop bounds must have finite min values lower than max values.",
      });
    }
  }

  return Object.freeze({
    valid: issues.length === 0,
    assetId,
    issues: Object.freeze(issues),
    metadata,
  });
}

export function extractMixamoAnimationMetadata(
  clipId: string,
  document: GltfDocumentLike,
  options: {
    readonly expectedRootNodeNames?: readonly string[];
    readonly requiredSkeletonPrefix?: string;
    readonly movementCalibration?: MixamoAnimationMovementCalibration;
  } = {},
): MixamoAnimationMetadata {
  const animation = document.animations?.[0];
  const nodeNames = new Set<string>();
  let rootTranslation = false;
  let rootTranslationDistance = 0;
  let verticalMin = 0;
  let verticalMax = 0;
  let durationSeconds = 0;
  const expectedRoots = options.expectedRootNodeNames ?? ["mixamorig:Hips", "Hips", "mixamorigHips"];
  const skeletonPrefix = options.requiredSkeletonPrefix ?? "mixamorig";

  for (const channel of animation?.channels ?? []) {
    const node = typeof channel.target?.node === "number"
      ? document.nodes?.[channel.target.node]
      : undefined;
    const nodeName = node?.name ?? `node-${channel.target?.node ?? "unknown"}`;
    nodeNames.add(nodeName);
    const sampler = typeof channel.sampler === "number"
      ? animation?.samplers?.[channel.sampler]
      : undefined;

    if (channel.target?.path === "translation" && expectedRoots.includes(nodeName)) {
      rootTranslation = true;
      const outputAccessor = typeof sampler?.output === "number"
        ? document.accessors?.[sampler.output]
        : undefined;
      const min = outputAccessor?.min ?? [];
      const max = outputAccessor?.max ?? [];
      const horizontalDistance = Math.hypot(
        (max[0] ?? 0) - (min[0] ?? 0),
        (max[2] ?? 0) - (min[2] ?? 0),
      );
      rootTranslationDistance = Math.max(rootTranslationDistance, horizontalDistance);
      verticalMin = Math.min(verticalMin, min[1] ?? 0);
      verticalMax = Math.max(verticalMax, max[1] ?? 0);
    }

    const inputAccessor = typeof sampler?.input === "number"
      ? document.accessors?.[sampler.input]
      : undefined;
    const maxTime = inputAccessor?.max?.[0];
    if (typeof maxTime === "number" && Number.isFinite(maxTime)) {
      durationSeconds = Math.max(durationSeconds, maxTime);
    }
  }

  const animatedNodeTargets = [...nodeNames].sort();
  const skeletonCompatible = animatedNodeTargets.some((target) => target.startsWith(skeletonPrefix));
  const calibration = options.movementCalibration;
  const calibratedStride = Math.max(0, calibration?.strideLength ?? 0);
  const motionMode =
    calibration?.motionMode
    ?? (rootTranslationDistance > 0.01
      ? (clipId.includes("jump") ? "jump" : "root-authored")
      : calibratedStride > 0
        ? "calibrated-in-place"
        : "stationary");
  const distance = rootTranslationDistance > 0 ? rootTranslationDistance : calibratedStride;
  const durationMs = Math.round(durationSeconds * 1000);
  const expectedSpeed = Math.max(
    0,
    calibration?.expectedSpeed ?? (durationMs > 0 ? distance / (durationMs / 1000) : 0),
  );
  const defaultWorldDisplacementAllowed =
    motionMode === "root-authored" || motionMode === "calibrated-in-place" || motionMode === "jump";
  const worldDisplacementAllowed =
    calibration?.worldDisplacementAllowed ?? defaultWorldDisplacementAllowed;
  const quarantineReason =
    calibration?.quarantineReason
    ?? (motionMode === "invalid" ? "clip marked invalid for adventure playback" : undefined);
  const movementProfile = Object.freeze({
    motionMode,
    durationMs,
    rootTranslationDistance,
    expectedSpeed,
    strideLength: calibratedStride,
    footContactWindows: Object.freeze([...(calibration?.footContactWindows ?? [])]),
    verticalBounds: Object.freeze([verticalMin, verticalMax] as const),
    loopable: calibration?.loopable ?? (motionMode === "stationary" || motionMode === "calibrated-in-place"),
    worldDisplacementAllowed,
    footSlideTolerance: calibration?.footSlideTolerance ?? 0.05,
  });

  return Object.freeze({
    clipId,
    durationMs,
    animatedNodeTargets: Object.freeze(animatedNodeTargets),
    rootTranslation,
    skeletonCompatible,
    usableForFarmAdventure: isMixamoFarmAdventureClipId(clipId) && skeletonCompatible && !quarantineReason,
    movementProfile,
    ...(quarantineReason ? { quarantineReason } : {}),
  });
}

export function isMixamoFarmAdventureClipId(clipId: string): clipId is MixamoFarmAdventureClipId {
  return (MIXAMO_FARM_ADVENTURE_CLIP_IDS as readonly string[]).includes(clipId);
}

export function createDefaultProcessingPlan(assetId: string): AssetProcessingPlan {
  const steps: readonly AssetProcessingStep[] = Object.freeze([
    { operation: "validate-gltf", required: true, description: "Validate glTF JSON, buffers, materials, and texture references." },
    { operation: "normalize-scale", required: true, description: "Normalize bounds to the authored runtime scale contract." },
    { operation: "normalize-origin", required: true, description: "Normalize model origin and forward/up orientation." },
    { operation: "optimize-textures", required: true, description: "Validate and size texture assets for runtime budgets." },
    { operation: "generate-lod", required: true, description: "Generate LOD artifacts or explicit LOD placeholders." },
    { operation: "generate-collision-proxy", required: true, description: "Generate collision and interaction proxy artifacts." },
    { operation: "package-runtime", required: true, description: "Assemble immutable runtime package and manifest inputs." },
  ]);

  return Object.freeze({
    assetId,
    targetRuntime: "gpu-shared",
    steps,
  });
}
