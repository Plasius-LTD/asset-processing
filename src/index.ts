export const ASSET_PROCESSING_PACKAGE = "@plasius/asset-processing";

export const ASSET_PROCESSING_OPERATIONS = Object.freeze([
  "validate-source-metadata",
  "validate-gltf",
  "convert-to-gltf",
  "normalize-orientation",
  "normalize-units",
  "normalize-scale",
  "normalize-origin",
  "optimize-textures",
  "generate-lod0",
  "generate-lod1",
  "generate-lod2",
  "generate-lod3",
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
export type AssetRuntimeForwardAxis = "-Z" | "+Z" | "-X" | "+X";
export type AssetRuntimeUpAxis = "Y" | "Z";

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

export interface RuntimeModelNormalizationContract {
  readonly outputFormat: "glb" | "gltf";
  readonly unit: "meter";
  readonly upAxis: AssetRuntimeUpAxis;
  readonly forwardAxis: AssetRuntimeForwardAxis;
  readonly origin: "floor-center" | "bounds-center";
  readonly stableDigests: boolean;
}

export interface LodBudget {
  readonly level: "lod0" | "lod1" | "lod2" | "lod3";
  readonly maxTriangles: number;
  readonly textureMaxSize: number;
}

export interface RemoteAssetProcessingPlan extends AssetProcessingPlan {
  readonly sourceFormat: "glb" | "gltf" | "obj" | "fbx" | "dae" | "stl" | "blend" | "unknown";
  readonly remoteWorkerQueue: string;
  readonly normalization: RuntimeModelNormalizationContract;
  readonly lodBudgets: readonly LodBudget[];
  readonly preserveRawSource: boolean;
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
  ".obj": "text/plain",
  ".fbx": "application/octet-stream",
  ".dae": "model/vnd.collada+xml",
  ".stl": "model/stl",
  ".blend": "application/octet-stream",
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
    { operation: "validate-source-metadata", required: true, description: "Validate source provenance, license evidence, and blob staging metadata." },
    { operation: "validate-gltf", required: true, description: "Validate glTF JSON, buffers, materials, and texture references." },
    { operation: "convert-to-gltf", required: true, description: "Convert supported source formats to canonical glTF or GLB when required." },
    { operation: "normalize-orientation", required: true, description: "Normalize the model to the runtime up and forward axis contract." },
    { operation: "normalize-units", required: true, description: "Normalize authored units to meters." },
    { operation: "normalize-scale", required: true, description: "Normalize bounds to the authored runtime scale contract." },
    { operation: "normalize-origin", required: true, description: "Normalize model origin and forward/up orientation." },
    { operation: "optimize-textures", required: true, description: "Validate and size texture assets for runtime budgets." },
    { operation: "generate-lod0", required: true, description: "Package the highest quality runtime LOD." },
    { operation: "generate-lod1", required: true, description: "Generate the first simplified runtime LOD." },
    { operation: "generate-lod2", required: true, description: "Generate the second simplified runtime LOD." },
    { operation: "generate-lod3", required: true, description: "Generate the lowest budget runtime LOD." },
    { operation: "generate-collision-proxy", required: true, description: "Generate collision and interaction proxy artifacts." },
    { operation: "package-runtime", required: true, description: "Assemble immutable runtime package and manifest inputs." },
  ]);

  return Object.freeze({
    assetId,
    targetRuntime: "gpu-shared",
    steps,
  });
}

export function createExternalModelProcessingPlan(
  assetId: string,
  input: Partial<Omit<RemoteAssetProcessingPlan, "assetId" | "steps" | "targetRuntime" | "normalization" | "lodBudgets" | "preserveRawSource">> &
    Partial<Pick<RemoteAssetProcessingPlan, "targetRuntime" | "normalization" | "lodBudgets" | "preserveRawSource">> = {}
): RemoteAssetProcessingPlan {
  const base = createDefaultProcessingPlan(assetId);
  const normalization: RuntimeModelNormalizationContract = Object.freeze({
    outputFormat: input.normalization?.outputFormat ?? "glb",
    unit: "meter",
    upAxis: input.normalization?.upAxis ?? "Y",
    forwardAxis: input.normalization?.forwardAxis ?? "-Z",
    origin: input.normalization?.origin ?? "floor-center",
    stableDigests: input.normalization?.stableDigests ?? true,
  });
  const lodBudgets = input.lodBudgets ?? [
    { level: "lod0", maxTriangles: 60000, textureMaxSize: 4096 },
    { level: "lod1", maxTriangles: 30000, textureMaxSize: 2048 },
    { level: "lod2", maxTriangles: 12000, textureMaxSize: 1024 },
    { level: "lod3", maxTriangles: 3000, textureMaxSize: 512 },
  ];
  validateLodBudgets(lodBudgets);

  return Object.freeze({
    ...base,
    targetRuntime: input.targetRuntime ?? "game-runtime",
    sourceFormat: input.sourceFormat ?? "unknown",
    remoteWorkerQueue: input.remoteWorkerQueue ?? "asset-processing",
    normalization,
    lodBudgets: Object.freeze(lodBudgets.map((budget) => Object.freeze({ ...budget }))),
    preserveRawSource: input.preserveRawSource ?? true,
  });
}

function validateLodBudgets(lodBudgets: readonly LodBudget[]): void {
  const expected = ["lod0", "lod1", "lod2", "lod3"];
  const levels = lodBudgets.map((budget) => budget.level);
  if (expected.some((level) => !levels.includes(level as LodBudget["level"]))) {
    throw new Error("External model processing requires lod0, lod1, lod2, and lod3 budgets.");
  }
  for (const budget of lodBudgets) {
    if (!Number.isInteger(budget.maxTriangles) || budget.maxTriangles <= 0) {
      throw new Error("LOD maxTriangles must be a positive integer.");
    }
    if (!Number.isInteger(budget.textureMaxSize) || budget.textureMaxSize <= 0) {
      throw new Error("LOD textureMaxSize must be a positive integer.");
    }
  }
}
