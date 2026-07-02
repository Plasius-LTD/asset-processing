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

export interface GltfDocumentLike {
  readonly animations?: readonly GltfAnimationLike[];
  readonly accessors?: readonly GltfAccessorLike[];
  readonly nodes?: readonly GltfNodeLike[];
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
