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
  } = {},
): MixamoAnimationMetadata {
  const animation = document.animations?.[0];
  const nodeNames = new Set<string>();
  let rootTranslation = false;
  let durationSeconds = 0;
  const expectedRoots = options.expectedRootNodeNames ?? ["mixamorig:Hips", "Hips", "mixamorigHips"];
  const skeletonPrefix = options.requiredSkeletonPrefix ?? "mixamorig";

  for (const channel of animation?.channels ?? []) {
    const node = typeof channel.target?.node === "number"
      ? document.nodes?.[channel.target.node]
      : undefined;
    const nodeName = node?.name ?? `node-${channel.target?.node ?? "unknown"}`;
    nodeNames.add(nodeName);

    if (channel.target?.path === "translation" && expectedRoots.includes(nodeName)) {
      rootTranslation = true;
    }

    const sampler = typeof channel.sampler === "number"
      ? animation?.samplers?.[channel.sampler]
      : undefined;
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

  return Object.freeze({
    clipId,
    durationMs: Math.round(durationSeconds * 1000),
    animatedNodeTargets: Object.freeze(animatedNodeTargets),
    rootTranslation,
    skeletonCompatible,
    usableForFarmAdventure: isMixamoFarmAdventureClipId(clipId) && skeletonCompatible,
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
