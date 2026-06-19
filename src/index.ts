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

export type AssetProcessingOperation = typeof ASSET_PROCESSING_OPERATIONS[number];

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
