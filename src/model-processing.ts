import {
  CANONICAL_MODEL_COORDINATE_SYSTEM,
  MODEL_RESOLUTION_CONTRACT_VERSION,
  STATIC_WORLD_V1_MODEL_POLICY,
  createModelAssetRef,
  createModelProcessingManifest,
  type ModelAssemblyChildAssetRef,
  type ModelBoundsMetres,
  type ModelCollisionPolicyEvidence,
  type ModelCollisionRecord,
  type ModelConverterEvidence,
  type ModelFidelityEvidence,
  type ModelFidelityGateEvidence,
  type ModelLodLevel,
  type ModelLodRecord,
  type ModelProcessingManifest,
  type ModelResourceRef,
  type ModelTransform,
} from "@plasius/asset-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ATTESTATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
const CONTENT_ADDRESSED_GLB_PATTERN = /^mcp:\/\/models\/resolutions\/([A-Za-z0-9][A-Za-z0-9._~-]{0,127})\/candidates\/([A-Za-z0-9][A-Za-z0-9._~-]{0,127})\/artifacts\/sha256\/([a-f0-9]{64})\.glb$/u;
const CANONICAL_ORIGIN_TOLERANCE_METRES = 1e-6;
const MAX_PARTITIONS = 256;
const MAX_COMPONENTS = 256;
const FORMAT_MATRIX_ID = "provider-format-v1";
const ZERO_SHA256 = "0".repeat(64);

const FORMAT_ADAPTERS = Object.freeze({
  glb: "gltf-glb-adapter",
  gltf: "gltf-glb-adapter",
  obj: "assimp-importer",
  fbx: "assimp-importer",
  ply: "assimp-importer",
  stl: "assimp-importer",
  dae: "assimp-importer",
  "3ds": "assimp-importer",
  lwo: "assimp-importer",
  blend: "blender-lts",
  usd: "blender-lts",
  usdc: "blender-lts",
  usdz: "blender-lts",
  vsp3: "openvsp-sandbox",
} as const);

/** Automated source formats admitted by the signed v1 provider-format matrix. */
export const SUPPORTED_MODEL_SOURCE_FORMATS = Object.freeze(
  Object.keys(FORMAT_ADAPTERS).sort(),
) as readonly (keyof typeof FORMAT_ADAPTERS)[];

/** Ordered cleanup operations required before any runtime package is planned. */
export const CANONICAL_MODEL_CLEANUP_STEPS = Object.freeze([
  "validate-finite-geometry",
  "normalize-units-to-metres",
  "normalize-basis-y-up-minus-z-forward",
  "normalize-floor-centred-origin",
  "repair-counter-clockwise-outward-winding",
  "repair-normals-and-tangents",
  "sort-primitives-deterministically",
  "embed-and-validate-runtime-textures",
] as const);

/** One mandatory operation in the canonical cleanup sequence. */
export type CanonicalModelCleanupStep = typeof CANONICAL_MODEL_CLEANUP_STEPS[number];

/** Complete immutable limit and adaptive-LOD profile used by static world assets. */
export interface StaticWorldV1ProcessingProfile {
  readonly id: typeof STATIC_WORLD_V1_MODEL_POLICY.id;
  readonly maxTriangles: number;
  readonly maxBytes: number;
  readonly maxTextureBytes: number;
  readonly maxTextureDimensionPx: number;
  readonly maxPartitionCellMetres: number;
  readonly adaptiveLodThresholdTriangles: 10_000;
  readonly lodTargetRatios: readonly [0.5, 0.2, 0.08];
  readonly minimumRetainedLodTriangles: 512;
  readonly minimumLodReductionRatio: 0.3;
  readonly maximumProjectedErrorPx: 1.5;
  readonly transitionHysteresisRatio: 0.2;
}

/** Request-scoped limits that may only tighten the canonical defaults. */
export type StaticWorldV1ProcessingProfileOverrides = Partial<Pick<
  StaticWorldV1ProcessingProfile,
  | "maxTriangles"
  | "maxBytes"
  | "maxTextureBytes"
  | "maxTextureDimensionPx"
  | "maxPartitionCellMetres"
>>;

/** Canonical, unmodified static-world-v1 defaults. */
export const STATIC_WORLD_V1_PROCESSING_PROFILE: StaticWorldV1ProcessingProfile = deepFreeze({
  ...STATIC_WORLD_V1_MODEL_POLICY,
  adaptiveLodThresholdTriangles: 10_000,
  lodTargetRatios: [0.5, 0.2, 0.08],
  minimumRetainedLodTriangles: 512,
  minimumLodReductionRatio: 0.3,
  maximumProjectedErrorPx: 1.5,
  transitionHysteresisRatio: 0.2,
});

/** Signed provider-format policy evidence retained with a cleanup plan. */
export interface ModelFormatEvidence {
  readonly matrixId: typeof FORMAT_MATRIX_ID;
  readonly matrixVersion: string;
  readonly sourceFormat: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceContentHash: string;
  readonly targetFormat: "glb";
  readonly decision: "supported";
  readonly validatedAt: string;
  readonly decisionToken: string;
  readonly authoritativeScaleEvidenceSha256?: string;
}

/** Immutable cleanup plan. No caller-authored canonical result claims are trusted. */
export interface CanonicalModelCleanupPlan {
  readonly formatEvidence: ModelFormatEvidence;
  readonly profile: StaticWorldV1ProcessingProfile;
  readonly coordinateSystem: typeof CANONICAL_MODEL_COORDINATE_SYSTEM;
  readonly steps: readonly CanonicalModelCleanupStep[];
  readonly normalPolicy: "repair-or-generate";
  readonly tangentPolicy: "repair-or-generate";
  readonly primitiveOrder: "material-mesh-primitive-index";
  readonly texturePolicy: "embedded-validated-runtime-textures";
}

/** Whether a connected component may participate in static grid partitioning. */
export type ModelComponentMobility = "static" | "movable";

/** Cleaned connected geometry facts used by hybrid partition planning. */
export interface ModelGeometryComponentInput {
  readonly componentId: string;
  readonly semanticNodeId?: string;
  readonly connectedComponentId: string;
  readonly mobility: ModelComponentMobility;
  readonly boundsMetres: ModelBoundsMetres;
  readonly triangleCount: number;
  readonly byteLength: number;
  readonly textureByteLength: number;
  readonly maxTextureDimensionPx: number;
}

/** Stage at which one immutable leaf was preserved or created. */
export type ModelPartitionMethod = "semantic" | "connected" | "grid";

/** One planned leaf, preserving semantic/connected identity before grid splitting. */
export interface HybridModelPartition {
  readonly partitionId: string;
  readonly method: ModelPartitionMethod;
  readonly sourceComponentId: string;
  readonly semanticNodeId?: string;
  readonly connectedComponentId: string;
  readonly mobility: ModelComponentMobility;
  readonly boundsMetres: ModelBoundsMetres;
  readonly estimatedTriangleCount: number;
  readonly estimatedByteLength: number;
  readonly estimatedTextureByteLength: number;
  readonly maxTextureDimensionPx: number;
  readonly gridCell?: Readonly<{ readonly x: number; readonly z: number }>;
}

/** Border constraint shared by adjacent grid leaves at every retained LOD. */
export interface ModelPartitionSeamLock {
  readonly seamId: string;
  readonly axis: "X" | "Z";
  readonly coordinateMetres: number;
  readonly partitionIds: readonly [string, string];
  readonly attributes: readonly ["POSITION", "NORMAL", "TEXCOORD_0"];
  readonly lodConstraint: "lock-identical-border-vertices";
}

/** Deterministic semantic-first, connected-component, then grid partition plan. */
export interface HybridModelPartitionPlan {
  readonly strategy: "semantic-first-connected-then-grid";
  readonly kind: "leaf" | "assembly";
  readonly profile: StaticWorldV1ProcessingProfile;
  readonly sourceComponents: readonly ModelGeometryComponentInput[];
  readonly boundsMetres: ModelBoundsMetres;
  readonly partitions: readonly HybridModelPartition[];
  readonly seamLocks: readonly ModelPartitionSeamLock[];
}

/** Validated profile and cleaned components accepted by hybrid planning. */
export interface PlanHybridModelPartitionsInput {
  readonly profile: StaticWorldV1ProcessingProfile;
  readonly components: readonly ModelGeometryComponentInput[];
}

/** One simplifier result for a 50%, 20%, or 8% target. */
export interface AdaptiveModelLodAttemptInput {
  readonly resource: ModelResourceRef;
  readonly triangleCount: number;
  readonly geometricErrorMetres: number;
  readonly fidelityPassed: boolean;
}

/** Stable reason explaining why an attempted simplification was not retained. */
export type AdaptiveModelLodDiscardReason =
  | "fidelity-check-failed"
  | "below-minimum-triangles"
  | "insufficient-reduction"
  | "geometric-error-regressed";

/** Audit record for an attempted adaptive level and the exact result retained or discarded. */
export interface AdaptiveModelLodAttempt {
  readonly targetRatio: 0.5 | 0.2 | 0.08;
  readonly targetTriangleCount: number;
  readonly actualTriangleCount: number;
  readonly geometricErrorMetres: number;
  readonly resource: ModelResourceRef;
  readonly fidelityPassed: boolean;
  readonly retained: boolean;
  readonly retainedLevel?: ModelLodLevel;
  readonly reasonCode?: AdaptiveModelLodDiscardReason;
}

/** Validated contiguous LOD0..LOD3 set plus all simplifier attempt evidence. */
export interface AdaptiveModelLodPlan {
  readonly lods: readonly ModelLodRecord[];
  readonly attempts: readonly AdaptiveModelLodAttempt[];
  readonly projectedErrorLimitPx: 1.5;
  readonly transitionHysteresisRatio: 0.2;
}

/** Exact LOD0 and up to three simplifier outputs accepted by adaptive planning. */
export interface PlanAdaptiveModelLodsInput {
  readonly resolutionId: string;
  readonly candidateId: string;
  readonly lod0: ModelLodRecord;
  readonly attempts: readonly AdaptiveModelLodAttemptInput[];
}

/** Retained levels and projection facts used for runtime LOD guidance. */
export interface SelectAdaptiveModelLodInput {
  readonly lods: readonly ModelLodRecord[];
  readonly pixelsPerMetre: number;
  readonly previousLevel?: ModelLodLevel;
}

/** Deterministic projected-error selection and hysteresis result. */
export interface AdaptiveModelLodSelection {
  readonly level: ModelLodLevel;
  readonly projectedErrorPx: number;
  readonly thresholdPx: number;
  readonly transition: "selected" | "unchanged" | "held-finer" | "held-coarser";
}

/** Collision output explicitly derived independently from cleaned LOD0. */
export interface ModelCollisionPlan {
  readonly sourceLod0Sha256: string;
  readonly record: ModelCollisionRecord;
  readonly policy: ModelCollisionPolicyEvidence;
  readonly generatedSeparatelyFromLod0: true;
}

/** Exact LOD0 identity, collision output, and category-policy decision. */
export interface CreateModelCollisionPlanInput {
  readonly lod0Sha256: string;
  readonly record: ModelCollisionRecord;
  readonly policy: ModelCollisionPolicyEvidence;
}

/** Materialized child result required for every planned assembly partition. */
export interface ModelPartitionOutput {
  readonly partitionId: string;
  readonly assetRef: ModelAssemblyChildAssetRef;
  readonly transform: ModelTransform;
  readonly parentPartitionId?: string;
}

/** Complete validated evidence needed to build one parent processing manifest. */
export interface CreateCanonicalModelRuntimePlanInput {
  readonly resolutionId: string;
  readonly candidateId: string;
  readonly profile: StaticWorldV1ProcessingProfile;
  readonly cleanup: CanonicalModelCleanupPlan;
  readonly partitions: HybridModelPartitionPlan;
  readonly partitionOutputs: readonly ModelPartitionOutput[];
  readonly lods: AdaptiveModelLodPlan;
  readonly collision: ModelCollisionPlan;
  readonly textureByteLength: number;
  readonly maxTextureDimensionPx: number;
  readonly converter: ModelConverterEvidence;
  readonly fidelityEvidence: readonly ModelFidelityEvidence[];
  readonly fidelityGate: ModelFidelityGateEvidence;
  readonly processedAt: string;
}

/** Dependency role retained for atomic promotion and rollback. */
export type ModelRollbackClosureKind = "manifest" | "lod" | "collision" | "child-manifest";

/** Public-safe, immutable dependency entry used for atomic promotion and rollback. */
export interface ModelRollbackClosureEntry {
  readonly kind: ModelRollbackClosureKind;
  readonly uri: string;
  readonly sha256: string;
  readonly digestSubject: "manifest-identity" | "resource-bytes" | "asset-content";
  readonly contentType: "application/json" | "model/gltf-binary";
}

/** Canonical parent package plan returned to hosted processing orchestration. */
export interface CanonicalModelRuntimePlan {
  readonly manifest: ModelProcessingManifest;
  readonly manifestDigest: string;
  readonly cleanup: CanonicalModelCleanupPlan;
  readonly partitions: HybridModelPartitionPlan;
  readonly lods: AdaptiveModelLodPlan;
  readonly collision: ModelCollisionPlan;
  readonly runtimeArtifacts: readonly ModelResourceRef[];
  readonly rollbackClosure: readonly ModelRollbackClosureEntry[];
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const object = value as object;
  if (seen.has(object)) {
    return value;
  }
  seen.add(object);
  for (const child of Object.values(object)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

function assertRecord(value: unknown, fieldName: string): asserts value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
}

function assertExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], fieldName: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`${fieldName} contains unsupported fields.`);
  }
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function requireToken(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a bounded token.`);
  }
  return value;
}

function requirePathSegment(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !PATH_SEGMENT_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a safe model path segment.`);
  }
  return value;
}

function requireVersion(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a bounded version token.`);
  }
  return value;
}

function requireSha256(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireAttestationToken(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !ATTESTATION_TOKEN_PATTERN.test(value)) {
    throw new Error(`${fieldName} decision token must contain 32 to 256 URL-safe characters.`);
  }
  return value;
}

function requireTimestamp(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length > 64 || Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }
  if (new Date(value).toISOString() !== value) {
    throw new Error(`${fieldName} must be a canonical UTC timestamp.`);
  }
  return value;
}

function requireInteger(value: unknown, fieldName: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${fieldName} must be a safe integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}

function requireFinite(value: unknown, fieldName: string, minimum = -Number.MAX_VALUE): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  return value;
}

function cloneBounds(value: unknown, fieldName: string): ModelBoundsMetres {
  assertRecord(value, fieldName);
  assertExactKeys(value, ["min", "max"], fieldName);
  if (!Array.isArray(value.min) || value.min.length !== 3 || !Array.isArray(value.max) || value.max.length !== 3) {
    throw new Error(`${fieldName} must contain finite three-axis min and max bounds.`);
  }
  const min = value.min.map((axis, index) => requireFinite(axis, `${fieldName}.min[${index}]`)) as [number, number, number];
  const max = value.max.map((axis, index) => requireFinite(axis, `${fieldName}.max[${index}]`)) as [number, number, number];
  if (min.some((axis, index) => axis >= max[index]!)) {
    throw new Error(`${fieldName} max values must be greater than min values.`);
  }
  return { min, max };
}

function cloneTransform(value: unknown, fieldName: string): ModelTransform {
  assertRecord(value, fieldName);
  assertExactKeys(value, ["translationMetres", "rotationQuaternion", "scale"], fieldName);
  if (!Array.isArray(value.translationMetres) || value.translationMetres.length !== 3
    || !Array.isArray(value.rotationQuaternion) || value.rotationQuaternion.length !== 4
    || !Array.isArray(value.scale) || value.scale.length !== 3) {
    throw new Error(`${fieldName} must contain translation, quaternion, and scale tuples.`);
  }
  const translationMetres = value.translationMetres.map((axis, index) => requireFinite(axis, `${fieldName}.translationMetres[${index}]`)) as [number, number, number];
  const rotationQuaternion = value.rotationQuaternion.map((axis, index) => requireFinite(axis, `${fieldName}.rotationQuaternion[${index}]`, -1)) as [number, number, number, number];
  if (rotationQuaternion.some((axis) => axis > 1) || Math.abs(Math.hypot(...rotationQuaternion) - 1) > 1e-4) {
    throw new Error(`${fieldName}.rotationQuaternion must be normalized.`);
  }
  const scale = value.scale.map((axis, index) => requireFinite(axis, `${fieldName}.scale[${index}]`, Number.EPSILON)) as [number, number, number];
  return { translationMetres, rotationQuaternion, scale };
}

function profileLimit(
  value: unknown,
  fieldName: keyof StaticWorldV1ProcessingProfileOverrides,
  maximum: number,
  integer: boolean,
): number {
  if (typeof value === "number" && value <= 0) {
    throw new Error(`StaticWorldV1ProcessingProfile.${fieldName} must be positive.`);
  }
  const validated = integer
    ? requireInteger(value, `StaticWorldV1ProcessingProfile.${fieldName}`, 1, Number.MAX_SAFE_INTEGER)
    : requireFinite(value, `StaticWorldV1ProcessingProfile.${fieldName}`, Number.EPSILON);
  if (validated > maximum) {
    throw new Error("static-world-v1 request profiles may tighten limits but cannot raise them.");
  }
  return validated;
}

/** Creates static-world-v1 defaults or a request-scoped profile that only tightens them. */
export function createStaticWorldV1ProcessingProfile(
  overrides: StaticWorldV1ProcessingProfileOverrides = {},
): StaticWorldV1ProcessingProfile {
  const overrideInput: unknown = overrides;
  assertRecord(overrideInput, "StaticWorldV1ProcessingProfileOverrides");
  assertExactKeys(overrideInput, [
    "maxTriangles",
    "maxBytes",
    "maxTextureBytes",
    "maxTextureDimensionPx",
    "maxPartitionCellMetres",
  ], "StaticWorldV1ProcessingProfileOverrides");
  const maxTriangles = overrides.maxTriangles === undefined
    ? STATIC_WORLD_V1_MODEL_POLICY.maxTriangles
    : profileLimit(overrides.maxTriangles, "maxTriangles", STATIC_WORLD_V1_MODEL_POLICY.maxTriangles, true);
  const maxBytes = overrides.maxBytes === undefined
    ? STATIC_WORLD_V1_MODEL_POLICY.maxBytes
    : profileLimit(overrides.maxBytes, "maxBytes", STATIC_WORLD_V1_MODEL_POLICY.maxBytes, true);
  const requestedTextureBytes = overrides.maxTextureBytes === undefined
    ? Math.min(STATIC_WORLD_V1_MODEL_POLICY.maxTextureBytes, maxBytes)
    : profileLimit(
      overrides.maxTextureBytes,
      "maxTextureBytes",
      STATIC_WORLD_V1_MODEL_POLICY.maxTextureBytes,
      true,
    );
  if (requestedTextureBytes > maxBytes) {
    throw new Error("static-world-v1 maxTextureBytes must not exceed maxBytes.");
  }
  const maxTextureDimensionPx = overrides.maxTextureDimensionPx === undefined
    ? STATIC_WORLD_V1_MODEL_POLICY.maxTextureDimensionPx
    : profileLimit(
      overrides.maxTextureDimensionPx,
      "maxTextureDimensionPx",
      STATIC_WORLD_V1_MODEL_POLICY.maxTextureDimensionPx,
      true,
    );
  const maxPartitionCellMetres = overrides.maxPartitionCellMetres === undefined
    ? STATIC_WORLD_V1_MODEL_POLICY.maxPartitionCellMetres
    : profileLimit(
      overrides.maxPartitionCellMetres,
      "maxPartitionCellMetres",
      STATIC_WORLD_V1_MODEL_POLICY.maxPartitionCellMetres,
      false,
    );

  return deepFreeze({
    id: STATIC_WORLD_V1_MODEL_POLICY.id,
    maxTriangles,
    maxBytes,
    maxTextureBytes: requestedTextureBytes,
    maxTextureDimensionPx,
    maxPartitionCellMetres,
    adaptiveLodThresholdTriangles: 10_000,
    lodTargetRatios: [0.5, 0.2, 0.08],
    minimumRetainedLodTriangles: 512,
    minimumLodReductionRatio: 0.3,
    maximumProjectedErrorPx: 1.5,
    transitionHysteresisRatio: 0.2,
  });
}

function validateProcessingProfile(value: unknown): StaticWorldV1ProcessingProfile {
  assertRecord(value, "StaticWorldV1ProcessingProfile");
  assertExactKeys(value, [
    "id",
    "maxTriangles",
    "maxBytes",
    "maxTextureBytes",
    "maxTextureDimensionPx",
    "maxPartitionCellMetres",
    "adaptiveLodThresholdTriangles",
    "lodTargetRatios",
    "minimumRetainedLodTriangles",
    "minimumLodReductionRatio",
    "maximumProjectedErrorPx",
    "transitionHysteresisRatio",
  ], "StaticWorldV1ProcessingProfile");
  if (value.id !== STATIC_WORLD_V1_MODEL_POLICY.id
    || value.adaptiveLodThresholdTriangles !== 10_000
    || value.minimumRetainedLodTriangles !== 512
    || value.minimumLodReductionRatio !== 0.3
    || value.maximumProjectedErrorPx !== 1.5
    || value.transitionHysteresisRatio !== 0.2
    || !Array.isArray(value.lodTargetRatios)
    || value.lodTargetRatios.length !== 3
    || value.lodTargetRatios[0] !== 0.5
    || value.lodTargetRatios[1] !== 0.2
    || value.lodTargetRatios[2] !== 0.08) {
    throw new Error("processing profile is incompatible with static-world-v1.");
  }
  return createStaticWorldV1ProcessingProfile({
    maxTriangles: value.maxTriangles as number,
    maxBytes: value.maxBytes as number,
    maxTextureBytes: value.maxTextureBytes as number,
    maxTextureDimensionPx: value.maxTextureDimensionPx as number,
    maxPartitionCellMetres: value.maxPartitionCellMetres as number,
  });
}

/** Validates signed format-matrix evidence and fails closed for metadata-only or drifted formats. */
export function validateModelFormatEvidence(input: unknown): ModelFormatEvidence {
  assertRecord(input, "ModelFormatEvidence");
  assertExactKeys(input, [
    "matrixId",
    "matrixVersion",
    "sourceFormat",
    "adapterId",
    "adapterVersion",
    "sourceContentHash",
    "targetFormat",
    "decision",
    "validatedAt",
    "decisionToken",
    "authoritativeScaleEvidenceSha256",
  ], "ModelFormatEvidence");
  if (input.matrixId !== FORMAT_MATRIX_ID || input.decision !== "supported" || input.targetFormat !== "glb") {
    throw new Error("unsupported-source-format: signed provider-format evidence does not admit canonical GLB conversion.");
  }
  if (typeof input.sourceFormat !== "string" || !Object.hasOwn(FORMAT_ADAPTERS, input.sourceFormat)) {
    throw new Error("unsupported-source-format: no released automated adapter is enabled for the source format.");
  }
  const sourceFormat = input.sourceFormat as keyof typeof FORMAT_ADAPTERS;
  if (input.adapterId !== FORMAT_ADAPTERS[sourceFormat]) {
    throw new Error("ModelFormatEvidence adapter does not match the signed provider-format matrix.");
  }
  const authoritativeScaleEvidenceSha256 = input.authoritativeScaleEvidenceSha256 === undefined
    ? undefined
    : requireSha256(input.authoritativeScaleEvidenceSha256, "ModelFormatEvidence.authoritativeScaleEvidenceSha256");
  if (sourceFormat === "vsp3" && authoritativeScaleEvidenceSha256 === undefined) {
    throw new Error("VSP3 format evidence requires authoritative scale evidence.");
  }
  return deepFreeze({
    matrixId: FORMAT_MATRIX_ID,
    matrixVersion: requireVersion(input.matrixVersion, "ModelFormatEvidence.matrixVersion"),
    sourceFormat,
    adapterId: requireToken(input.adapterId, "ModelFormatEvidence.adapterId"),
    adapterVersion: requireVersion(input.adapterVersion, "ModelFormatEvidence.adapterVersion"),
    sourceContentHash: requireSha256(input.sourceContentHash, "ModelFormatEvidence.sourceContentHash"),
    targetFormat: "glb",
    decision: "supported",
    validatedAt: requireTimestamp(input.validatedAt, "ModelFormatEvidence.validatedAt"),
    decisionToken: requireAttestationToken(input.decisionToken, "ModelFormatEvidence"),
    ...(authoritativeScaleEvidenceSha256 === undefined ? {} : { authoritativeScaleEvidenceSha256 }),
  });
}

/** Creates the immutable cleanup contract shared by every source adapter. */
export function createCanonicalModelCleanupPlan(input: {
  readonly formatEvidence: ModelFormatEvidence;
  readonly profile: StaticWorldV1ProcessingProfile;
}): CanonicalModelCleanupPlan {
  const formatEvidence = validateModelFormatEvidence(input.formatEvidence);
  const profile = validateProcessingProfile(input.profile);
  return deepFreeze({
    formatEvidence,
    profile,
    coordinateSystem: CANONICAL_MODEL_COORDINATE_SYSTEM,
    steps: [...CANONICAL_MODEL_CLEANUP_STEPS],
    normalPolicy: "repair-or-generate",
    tangentPolicy: "repair-or-generate",
    primitiveOrder: "material-mesh-primitive-index",
    texturePolicy: "embedded-validated-runtime-textures",
  });
}

function validateComponent(input: unknown, index: number): ModelGeometryComponentInput {
  const fieldName = `ModelGeometryComponentInput[${index}]`;
  assertRecord(input, fieldName);
  assertExactKeys(input, [
    "componentId",
    "semanticNodeId",
    "connectedComponentId",
    "mobility",
    "boundsMetres",
    "triangleCount",
    "byteLength",
    "textureByteLength",
    "maxTextureDimensionPx",
  ], fieldName);
  if (input.mobility !== "static" && input.mobility !== "movable") {
    throw new Error(`${fieldName}.mobility must be static or movable.`);
  }
  const semanticNodeId = input.semanticNodeId === undefined
    ? undefined
    : requireToken(input.semanticNodeId, `${fieldName}.semanticNodeId`);
  const byteLength = requireInteger(input.byteLength, `${fieldName}.byteLength`, 1, Number.MAX_SAFE_INTEGER);
  const textureByteLength = requireInteger(
    input.textureByteLength,
    `${fieldName}.textureByteLength`,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const maxTextureDimensionPx = requireInteger(
    input.maxTextureDimensionPx,
    `${fieldName}.maxTextureDimensionPx`,
    0,
    32_768,
  );
  if (textureByteLength > byteLength || (textureByteLength === 0) !== (maxTextureDimensionPx === 0)) {
    throw new Error(`${fieldName} texture evidence is inconsistent with byte evidence.`);
  }
  return {
    componentId: requirePathSegment(input.componentId, `${fieldName}.componentId`),
    ...(semanticNodeId === undefined ? {} : { semanticNodeId }),
    connectedComponentId: requireToken(input.connectedComponentId, `${fieldName}.connectedComponentId`),
    mobility: input.mobility,
    boundsMetres: cloneBounds(input.boundsMetres, `${fieldName}.boundsMetres`),
    triangleCount: requireInteger(input.triangleCount, `${fieldName}.triangleCount`, 1, 1_000_000_000),
    byteLength,
    textureByteLength,
    maxTextureDimensionPx,
  };
}

function unionBounds(components: readonly ModelGeometryComponentInput[]): ModelBoundsMetres {
  const first = components[0]!;
  const min: [number, number, number] = [...first.boundsMetres.min];
  const max: [number, number, number] = [...first.boundsMetres.max];
  for (const component of components.slice(1)) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, component.boundsMetres.min[axis]!);
      max[axis] = Math.max(max[axis]!, component.boundsMetres.max[axis]!);
    }
  }
  if (Math.abs(min[1]) > CANONICAL_ORIGIN_TOLERANCE_METRES
    || Math.abs((min[0] + max[0]) / 2) > CANONICAL_ORIGIN_TOLERANCE_METRES
    || Math.abs((min[2] + max[2]) / 2) > CANONICAL_ORIGIN_TOLERANCE_METRES) {
    throw new Error("canonical partition bounds must be finite and floor-centred on X/Z with minY zero.");
  }
  return { min, max };
}

function exceedsLeafLimits(component: ModelGeometryComponentInput, profile: StaticWorldV1ProcessingProfile): boolean {
  const width = component.boundsMetres.max[0] - component.boundsMetres.min[0];
  const depth = component.boundsMetres.max[2] - component.boundsMetres.min[2];
  return width > profile.maxPartitionCellMetres
    || depth > profile.maxPartitionCellMetres
    || component.triangleCount > profile.maxTriangles
    || component.byteLength > profile.maxBytes
    || component.textureByteLength > profile.maxTextureBytes;
}

function encodeGridCoordinate(value: number): string {
  return value < 0 ? `n${Math.abs(value)}` : `p${value}`;
}

function encodeComponentOrdinal(index: number): string {
  return `c${index.toString().padStart(3, "0")}`;
}

interface GridPartitionInternal extends HybridModelPartition {
  readonly gridCell: Readonly<{ readonly x: number; readonly z: number }>;
}

function gridIndexRange(minimum: number, maximum: number, cellMetres: number): readonly number[] {
  const start = Math.floor(minimum / cellMetres);
  const calculatedEnd = Math.ceil(maximum / cellMetres) - 1;
  const end = Math.max(start, calculatedEnd);
  const count = end - start + 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || !Number.isSafeInteger(count) || count < 1 || count > MAX_PARTITIONS) {
    throw new Error("partition grid extent exceeds the bounded static-world-v1 planning range.");
  }
  return Array.from({ length: count }, (_, offset) => start + offset);
}

function distributeInteger(total: number, index: number, count: number): number {
  const base = Math.floor(total / count);
  return base + (index < total % count ? 1 : 0);
}

function createGridPartitions(
  component: ModelGeometryComponentInput,
  profile: StaticWorldV1ProcessingProfile,
  componentIndex: number,
): readonly GridPartitionInternal[] {
  const xCells = gridIndexRange(component.boundsMetres.min[0], component.boundsMetres.max[0], profile.maxPartitionCellMetres);
  const zCells = gridIndexRange(component.boundsMetres.min[2], component.boundsMetres.max[2], profile.maxPartitionCellMetres);
  if (xCells.length * zCells.length > MAX_PARTITIONS) {
    throw new Error("partition grid extent exceeds the 256-leaf closure limit.");
  }
  const cells = xCells.flatMap((x) => zCells.map((z) => ({ x, z })));
  if (cells.length < 2 || cells.length > MAX_PARTITIONS
    || component.triangleCount < cells.length
    || component.byteLength < cells.length) {
    throw new Error("oversized static geometry cannot be safely grid partitioned within static-world-v1 limits.");
  }
  return cells.map((cell, index) => {
    const minX = Math.max(component.boundsMetres.min[0], cell.x * profile.maxPartitionCellMetres);
    const maxX = Math.min(component.boundsMetres.max[0], (cell.x + 1) * profile.maxPartitionCellMetres);
    const minZ = Math.max(component.boundsMetres.min[2], cell.z * profile.maxPartitionCellMetres);
    const maxZ = Math.min(component.boundsMetres.max[2], (cell.z + 1) * profile.maxPartitionCellMetres);
    const partition: GridPartitionInternal = {
      partitionId: `part-${encodeComponentOrdinal(componentIndex)}-x${encodeGridCoordinate(cell.x)}-z${encodeGridCoordinate(cell.z)}`,
      method: "grid",
      sourceComponentId: component.componentId,
      ...(component.semanticNodeId === undefined ? {} : { semanticNodeId: component.semanticNodeId }),
      connectedComponentId: component.connectedComponentId,
      mobility: "static",
      boundsMetres: {
        min: [minX, component.boundsMetres.min[1], minZ],
        max: [maxX, component.boundsMetres.max[1], maxZ],
      },
      estimatedTriangleCount: distributeInteger(component.triangleCount, index, cells.length),
      estimatedByteLength: distributeInteger(component.byteLength, index, cells.length),
      estimatedTextureByteLength: distributeInteger(component.textureByteLength, index, cells.length),
      maxTextureDimensionPx: component.maxTextureDimensionPx,
      gridCell: cell,
    };
    if (partition.estimatedTriangleCount > profile.maxTriangles
      || partition.estimatedByteLength > profile.maxBytes
      || partition.estimatedTextureByteLength > profile.maxTextureBytes) {
      throw new Error("grid partition still exceeds static-world-v1 leaf limits.");
    }
    return partition;
  });
}

function createUnsplitPartition(component: ModelGeometryComponentInput, componentIndex: number): HybridModelPartition {
  return {
    partitionId: `part-${encodeComponentOrdinal(componentIndex)}`,
    method: component.semanticNodeId === undefined ? "connected" : "semantic",
    sourceComponentId: component.componentId,
    ...(component.semanticNodeId === undefined ? {} : { semanticNodeId: component.semanticNodeId }),
    connectedComponentId: component.connectedComponentId,
    mobility: component.mobility,
    boundsMetres: component.boundsMetres,
    estimatedTriangleCount: component.triangleCount,
    estimatedByteLength: component.byteLength,
    estimatedTextureByteLength: component.textureByteLength,
    maxTextureDimensionPx: component.maxTextureDimensionPx,
  };
}

function createSeamLocks(
  partitions: readonly HybridModelPartition[],
  cellMetres: number,
  sourceComponents: readonly ModelGeometryComponentInput[],
): readonly ModelPartitionSeamLock[] {
  const locks: ModelPartitionSeamLock[] = [];
  const sourceIndexes = new Map(sourceComponents.map((component, index) => [component.componentId, index]));
  const gridGroups = new Map<string, GridPartitionInternal[]>();
  for (const partition of partitions) {
    if (partition.method !== "grid" || partition.gridCell === undefined) continue;
    const existing = gridGroups.get(partition.sourceComponentId) ?? [];
    existing.push(partition as GridPartitionInternal);
    gridGroups.set(partition.sourceComponentId, existing);
  }
  for (const [componentId, group] of [...gridGroups.entries()].sort(([left], [right]) => compareCodeUnits(left, right))) {
    const componentIndex = sourceIndexes.get(componentId);
    if (componentIndex === undefined) {
      throw new Error("grid seam planning requires immutable source-component evidence.");
    }
    const componentToken = encodeComponentOrdinal(componentIndex);
    const byCell = new Map(group.map((partition) => [
      `${partition.gridCell.x},${partition.gridCell.z}`,
      partition,
    ]));
    for (const partition of [...group].sort((left, right) => compareCodeUnits(left.partitionId, right.partitionId))) {
      const xNeighbour = byCell.get(`${partition.gridCell.x + 1},${partition.gridCell.z}`);
      if (xNeighbour !== undefined) {
        locks.push({
          seamId: `seam-${componentToken}-x${encodeGridCoordinate(partition.gridCell.x + 1)}-z${encodeGridCoordinate(partition.gridCell.z)}`,
          axis: "X",
          coordinateMetres: (partition.gridCell.x + 1) * cellMetres,
          partitionIds: [partition.partitionId, xNeighbour.partitionId],
          attributes: ["POSITION", "NORMAL", "TEXCOORD_0"],
          lodConstraint: "lock-identical-border-vertices",
        });
      }
      const zNeighbour = byCell.get(`${partition.gridCell.x},${partition.gridCell.z + 1}`);
      if (zNeighbour !== undefined) {
        locks.push({
          seamId: `seam-${componentToken}-z${encodeGridCoordinate(partition.gridCell.z + 1)}-x${encodeGridCoordinate(partition.gridCell.x)}`,
          axis: "Z",
          coordinateMetres: (partition.gridCell.z + 1) * cellMetres,
          partitionIds: [partition.partitionId, zNeighbour.partitionId],
          attributes: ["POSITION", "NORMAL", "TEXCOORD_0"],
          lodConstraint: "lock-identical-border-vertices",
        });
      }
    }
  }
  return locks.sort((left, right) => compareCodeUnits(left.seamId, right.seamId));
}

function compareModelComponents(
  left: ModelGeometryComponentInput,
  right: ModelGeometryComponentInput,
): number {
  return compareCodeUnits(
    left.semanticNodeId ?? left.connectedComponentId,
    right.semanticNodeId ?? right.connectedComponentId,
  )
    || compareCodeUnits(left.connectedComponentId, right.connectedComponentId)
    || compareCodeUnits(left.componentId, right.componentId);
}

function expectedPartitionsForSource(
  component: ModelGeometryComponentInput,
  profile: StaticWorldV1ProcessingProfile,
  componentIndex: number,
): readonly HybridModelPartition[] {
  if (component.maxTextureDimensionPx > profile.maxTextureDimensionPx) {
    throw new Error("source component texture dimensions exceed the static-world-v1 texture limit.");
  }
  const oversized = exceedsLeafLimits(component, profile);
  if (component.mobility === "movable" && oversized) {
    const width = component.boundsMetres.max[0] - component.boundsMetres.min[0];
    const depth = component.boundsMetres.max[2] - component.boundsMetres.min[2];
    if (width > profile.maxPartitionCellMetres || depth > profile.maxPartitionCellMetres) {
      throw new Error("movable objects cannot be clipped across static partition cells.");
    }
    throw new Error("movable object exceeds static-world-v1 leaf limits and cannot be split.");
  }
  return oversized
    ? createGridPartitions(component, profile, componentIndex)
    : [createUnsplitPartition(component, componentIndex)];
}

function validatePartitionsAgainstSources(
  partitions: readonly HybridModelPartition[],
  sourceComponents: readonly ModelGeometryComponentInput[],
  profile: StaticWorldV1ProcessingProfile,
): void {
  const groups = new Map<string, HybridModelPartition[]>();
  for (const partition of partitions) {
    const group = groups.get(partition.sourceComponentId) ?? [];
    group.push(partition);
    groups.set(partition.sourceComponentId, group);
  }
  const sourceIds = new Set(sourceComponents.map((component) => component.componentId));
  if ([...groups.keys()].some((sourceId) => !sourceIds.has(sourceId))) {
    throw new Error("partition sourceComponentId values must reference immutable source-component evidence.");
  }
  for (const [componentIndex, source] of sourceComponents.entries()) {
    const actual = [...(groups.get(source.componentId) ?? [])]
      .sort((left, right) => compareCodeUnits(left.partitionId, right.partitionId));
    const expected = [...expectedPartitionsForSource(source, profile, componentIndex)]
      .sort((left, right) => compareCodeUnits(left.partitionId, right.partitionId));
    if (JSON.stringify(canonicalize(actual)) !== JSON.stringify(canonicalize(expected))) {
      const description = expected[0]?.method === "grid"
        ? "grid partition bounds, cells, estimates, and source identity"
        : "source component must produce exactly one deterministic unsplit partition";
      throw new Error(`${description} must exactly match immutable source-component evidence.`);
    }
  }
}

/** Plans semantic/connected leaves first, then seam-locked 32 m grid leaves when required. */
export function planHybridModelPartitions(input: PlanHybridModelPartitionsInput): HybridModelPartitionPlan {
  const profile = validateProcessingProfile(input.profile);
  if (!Array.isArray(input.components) || input.components.length < 1 || input.components.length > MAX_COMPONENTS) {
    throw new Error(`hybrid partition planning requires one to ${MAX_COMPONENTS} components.`);
  }
  const components = input.components
    .map(validateComponent)
    .sort(compareModelComponents);
  if (new Set(components.map((component) => component.componentId)).size !== components.length) {
    throw new Error("hybrid partition componentId values must be unique.");
  }
  const boundsMetres = unionBounds(components);
  const partitions: HybridModelPartition[] = [];
  for (const [componentIndex, component] of components.entries()) {
    partitions.push(...expectedPartitionsForSource(component, profile, componentIndex));
  }
  if (partitions.length > MAX_PARTITIONS || new Set(partitions.map((partition) => partition.partitionId)).size !== partitions.length) {
    throw new Error("hybrid partition plan exceeds the unique 256-leaf closure limit.");
  }
  const orderedPartitions = partitions.sort((left, right) => compareCodeUnits(left.partitionId, right.partitionId));
  const seamLocks = createSeamLocks(orderedPartitions, profile.maxPartitionCellMetres, components);
  return validateHybridModelPartitionPlan({
    strategy: "semantic-first-connected-then-grid",
    kind: orderedPartitions.length === 1 ? "leaf" : "assembly",
    profile,
    sourceComponents: components,
    boundsMetres,
    partitions: orderedPartitions,
    seamLocks,
  });
}

function parseContentAddressedGlb(resource: unknown, fieldName: string): {
  readonly resource: ModelResourceRef;
  readonly resolutionId: string;
  readonly candidateId: string;
} {
  assertRecord(resource, fieldName);
  assertExactKeys(resource, ["uri", "byteLength", "sha256", "contentType"], fieldName);
  const sha256 = requireSha256(resource.sha256, `${fieldName}.sha256`);
  if (resource.contentType !== "model/gltf-binary" || typeof resource.uri !== "string") {
    throw new Error(`${fieldName} must be a canonical GLB resource.`);
  }
  const match = CONTENT_ADDRESSED_GLB_PATTERN.exec(resource.uri);
  if (match === null || match[3] !== sha256) {
    throw new Error(`${fieldName} must use its exact content-addressed candidate GLB URI.`);
  }
  return {
    resource: {
      uri: resource.uri,
      byteLength: requireInteger(resource.byteLength, `${fieldName}.byteLength`, 1, Number.MAX_SAFE_INTEGER),
      sha256,
      contentType: "model/gltf-binary",
    },
    resolutionId: match[1]!,
    candidateId: match[2]!,
  };
}

function cloneLodRecord(value: unknown, index: number): ModelLodRecord & {
  readonly resolutionId: string;
  readonly candidateId: string;
} {
  const fieldName = `ModelLodRecord[${index}]`;
  assertRecord(value, fieldName);
  assertExactKeys(value, ["level", "resource", "triangleCount", "geometricErrorMetres"], fieldName);
  if (typeof value.geometricErrorMetres === "number"
    && Number.isFinite(value.geometricErrorMetres)
    && value.geometricErrorMetres < 0) {
    throw new Error("LOD geometric error must be non-negative.");
  }
  const parsedResource = parseContentAddressedGlb(value.resource, `${fieldName}.resource`);
  return {
    level: requireInteger(value.level, `${fieldName}.level`, 0, 3) as ModelLodLevel,
    resource: parsedResource.resource,
    triangleCount: requireInteger(value.triangleCount, `${fieldName}.triangleCount`, 1, 1_000_000_000),
    geometricErrorMetres: requireFinite(value.geometricErrorMetres, `${fieldName}.geometricErrorMetres`, 0),
    resolutionId: parsedResource.resolutionId,
    candidateId: parsedResource.candidateId,
  };
}

/** Validates exact, contiguous, monotonic adaptive LOD records and content-addressed GLBs. */
export function validateAdaptiveModelLods(input: readonly ModelLodRecord[]): readonly ModelLodRecord[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4) {
    throw new Error("adaptive LODs must contain one to four contiguous levels beginning with LOD0.");
  }
  const parsed = input.map(cloneLodRecord);
  const resolutionId = parsed[0]!.resolutionId;
  const candidateId = parsed[0]!.candidateId;
  for (const [index, lod] of parsed.entries()) {
    if (lod.level !== index) {
      throw new Error("adaptive LOD levels must be contiguous and begin with LOD0.");
    }
    if (lod.resolutionId !== resolutionId || lod.candidateId !== candidateId) {
      throw new Error("adaptive LOD resources must share one resolution and candidate scope.");
    }
    if (index === 0 && lod.geometricErrorMetres !== 0) {
      throw new Error("LOD0 geometric error must be zero.");
    }
    const previous = parsed[index - 1];
    if (previous !== undefined) {
      if (lod.triangleCount > Math.floor(previous.triangleCount * 0.7)) {
        throw new Error("adaptive LOD triangle ordering must reduce the preceding level by at least 30%.");
      }
      if (lod.triangleCount < 512) {
        throw new Error("adaptive retained LOD levels must contain at least 512 triangles.");
      }
      if (lod.geometricErrorMetres < previous.geometricErrorMetres) {
        throw new Error("adaptive LOD geometric error ordering must be monotonic non-decreasing.");
      }
    }
  }
  if (new Set(parsed.map((lod) => lod.resource.uri)).size !== parsed.length
    || new Set(parsed.map((lod) => lod.resource.sha256)).size !== parsed.length) {
    throw new Error("adaptive LOD resources and hashes must be unique.");
  }
  return deepFreeze(parsed.map(({ resolutionId: _resolutionId, candidateId: _candidateId, ...lod }) => lod));
}

/** Applies the 50%, 20%, and 8% attempts and retains only fidelity-safe useful levels. */
export function planAdaptiveModelLods(input: PlanAdaptiveModelLodsInput): AdaptiveModelLodPlan {
  const resolutionId = requirePathSegment(input.resolutionId, "PlanAdaptiveModelLodsInput.resolutionId");
  const candidateId = requirePathSegment(input.candidateId, "PlanAdaptiveModelLodsInput.candidateId");
  if (!Array.isArray(input.attempts) || input.attempts.length > 3) {
    throw new Error("adaptive LOD planning accepts at most three simplifier attempts.");
  }
  const lod0Parsed = cloneLodRecord(input.lod0, 0);
  if (lod0Parsed.level !== 0 || lod0Parsed.geometricErrorMetres !== 0) {
    throw new Error("adaptive LOD planning requires LOD0 with zero geometric error.");
  }
  if (lod0Parsed.resolutionId !== resolutionId || lod0Parsed.candidateId !== candidateId) {
    throw new Error("LOD0 must be scoped to the requested resolution and candidate.");
  }
  const requiresAdaptiveAttempts = lod0Parsed.triangleCount
    >= STATIC_WORLD_V1_PROCESSING_PROFILE.adaptiveLodThresholdTriangles;
  if (requiresAdaptiveAttempts && input.attempts.length !== 3) {
    throw new Error("LOD0 at or above the adaptive threshold requires exactly three simplifier attempts.");
  }
  if (!requiresAdaptiveAttempts && input.attempts.length !== 0) {
    throw new Error("LOD0 below the adaptive threshold must not include simplifier attempts.");
  }
  const lod0: ModelLodRecord = {
    level: 0,
    resource: lod0Parsed.resource,
    triangleCount: lod0Parsed.triangleCount,
    geometricErrorMetres: 0,
  };
  const ratios = STATIC_WORLD_V1_PROCESSING_PROFILE.lodTargetRatios;
  const retained: ModelLodRecord[] = [lod0];
  const attempts: AdaptiveModelLodAttempt[] = [];
  const seenResources = new Set([lod0.resource.uri, lod0.resource.sha256]);
  for (const [index, attemptInput] of input.attempts.entries()) {
    assertRecord(attemptInput, `AdaptiveModelLodAttemptInput[${index}]`);
    assertExactKeys(attemptInput, ["resource", "triangleCount", "geometricErrorMetres", "fidelityPassed"], `AdaptiveModelLodAttemptInput[${index}]`);
    const resource = parseContentAddressedGlb(attemptInput.resource, `AdaptiveModelLodAttemptInput[${index}].resource`);
    if (resource.resolutionId !== resolutionId || resource.candidateId !== candidateId) {
      throw new Error("adaptive LOD attempt resources must share the requested candidate scope.");
    }
    if (seenResources.has(resource.resource.uri) || seenResources.has(resource.resource.sha256)) {
      throw new Error("adaptive LOD attempt resources and hashes must be unique.");
    }
    seenResources.add(resource.resource.uri);
    seenResources.add(resource.resource.sha256);
    const triangleCount = requireInteger(
      attemptInput.triangleCount,
      `AdaptiveModelLodAttemptInput[${index}].triangleCount`,
      1,
      1_000_000_000,
    );
    const geometricErrorMetres = requireFinite(
      attemptInput.geometricErrorMetres,
      `AdaptiveModelLodAttemptInput[${index}].geometricErrorMetres`,
      0,
    );
    if (typeof attemptInput.fidelityPassed !== "boolean") {
      throw new Error(`AdaptiveModelLodAttemptInput[${index}].fidelityPassed must be boolean.`);
    }
    const targetRatio = ratios[index]!;
    const previous = retained[retained.length - 1]!;
    let reasonCode: AdaptiveModelLodDiscardReason | undefined;
    if (!attemptInput.fidelityPassed) {
      reasonCode = "fidelity-check-failed";
    } else if (triangleCount < STATIC_WORLD_V1_PROCESSING_PROFILE.minimumRetainedLodTriangles) {
      reasonCode = "below-minimum-triangles";
    } else if (triangleCount > Math.floor(previous.triangleCount * (1 - STATIC_WORLD_V1_PROCESSING_PROFILE.minimumLodReductionRatio))) {
      reasonCode = "insufficient-reduction";
    } else if (geometricErrorMetres < previous.geometricErrorMetres) {
      reasonCode = "geometric-error-regressed";
    }
    const retainedLevel = reasonCode === undefined ? retained.length as ModelLodLevel : undefined;
    if (retainedLevel !== undefined) {
      retained.push({
        level: retainedLevel,
        resource: resource.resource,
        triangleCount,
        geometricErrorMetres,
      });
    }
    attempts.push({
      targetRatio,
      targetTriangleCount: Math.max(1, Math.floor(lod0.triangleCount * targetRatio)),
      actualTriangleCount: triangleCount,
      geometricErrorMetres,
      resource: resource.resource,
      fidelityPassed: attemptInput.fidelityPassed,
      retained: reasonCode === undefined,
      ...(retainedLevel === undefined ? {} : { retainedLevel }),
      ...(reasonCode === undefined ? {} : { reasonCode }),
    });
  }
  return validateAdaptiveModelLodPlan({
    lods: validateAdaptiveModelLods(retained),
    attempts,
    projectedErrorLimitPx: 1.5,
    transitionHysteresisRatio: 0.2,
  });
}

/** Selects the coarsest level at <=1.5 px, with 20% transition hysteresis. */
export function selectAdaptiveModelLod(input: SelectAdaptiveModelLodInput): AdaptiveModelLodSelection {
  const lods = validateAdaptiveModelLods(input.lods);
  const pixelsPerMetre = requireFinite(input.pixelsPerMetre, "SelectAdaptiveModelLodInput.pixelsPerMetre", Number.EPSILON);
  const threshold = STATIC_WORLD_V1_PROCESSING_PROFILE.maximumProjectedErrorPx;
  let selected = lods[0]!;
  for (const lod of lods) {
    if (lod.geometricErrorMetres * pixelsPerMetre <= threshold) selected = lod;
  }
  let transition: AdaptiveModelLodSelection["transition"] = "selected";
  if (input.previousLevel !== undefined) {
    const previous = lods.find((lod) => lod.level === input.previousLevel);
    if (previous === undefined) {
      throw new Error("previousLevel must identify a retained adaptive LOD.");
    }
    if (selected.level === previous.level) {
      transition = "unchanged";
    } else if (selected.level > previous.level
      && selected.geometricErrorMetres * pixelsPerMetre > threshold * (1 - STATIC_WORLD_V1_PROCESSING_PROFILE.transitionHysteresisRatio)) {
      selected = previous;
      transition = "held-finer";
    } else if (selected.level < previous.level
      && previous.geometricErrorMetres * pixelsPerMetre <= threshold * (1 + STATIC_WORLD_V1_PROCESSING_PROFILE.transitionHysteresisRatio)) {
      selected = previous;
      transition = "held-coarser";
    }
  }
  return deepFreeze({
    level: selected.level,
    projectedErrorPx: selected.geometricErrorMetres * pixelsPerMetre,
    thresholdPx: threshold,
    transition,
  });
}

function validateCollisionPolicy(value: unknown): ModelCollisionPolicyEvidence {
  assertRecord(value, "ModelCollisionPolicyEvidence");
  assertExactKeys(value, ["profileId", "profileVersion", "disposition", "category", "decisionToken"], "ModelCollisionPolicyEvidence");
  if (value.disposition !== "proxy-required" && value.disposition !== "none-allowed") {
    throw new Error("collision policy disposition must require a proxy or explicitly allow none.");
  }
  return {
    profileId: requireToken(value.profileId, "ModelCollisionPolicyEvidence.profileId"),
    profileVersion: requireVersion(value.profileVersion, "ModelCollisionPolicyEvidence.profileVersion"),
    disposition: value.disposition,
    category: requireToken(value.category, "ModelCollisionPolicyEvidence.category"),
    decisionToken: requireAttestationToken(value.decisionToken, "ModelCollisionPolicyEvidence"),
  };
}

/** Validates collision as a separate LOD0-derived artifact and enforces signed category policy. */
export function createModelCollisionPlan(input: CreateModelCollisionPlanInput): ModelCollisionPlan {
  const sourceLod0Sha256 = requireSha256(input.lod0Sha256, "CreateModelCollisionPlanInput.lod0Sha256");
  const policy = validateCollisionPolicy(input.policy);
  assertRecord(input.record, "ModelCollisionRecord");
  assertExactKeys(input.record, ["kind", "resource"], "ModelCollisionRecord");
  if (!(["none", "box", "convex-hull", "triangle-mesh", "compound"] as const).includes(input.record.kind as never)) {
    throw new Error("ModelCollisionRecord.kind is unsupported.");
  }
  if (input.record.kind === "none") {
    if (input.record.resource !== undefined || policy.disposition !== "none-allowed") {
      throw new Error("collision none requires an explicit none-allowed policy; proxy-required categories must emit a proxy.");
    }
    return deepFreeze({
      sourceLod0Sha256,
      record: { kind: "none" },
      policy,
      generatedSeparatelyFromLod0: true,
    });
  }
  if (policy.disposition !== "proxy-required" || input.record.resource === undefined) {
    throw new Error("non-empty collision output requires proxy-required policy and a proxy resource.");
  }
  const resource = parseContentAddressedGlb(input.record.resource, "ModelCollisionRecord.resource").resource;
  if (resource.sha256 === sourceLod0Sha256) {
    throw new Error("collision proxy evidence must be separate and distinct from cleaned LOD0.");
  }
  return deepFreeze({
    sourceLod0Sha256,
    record: { kind: input.record.kind, resource },
    policy,
    generatedSeparatelyFromLod0: true,
  });
}

/** Revalidates a serialized hybrid plan, including complete seam-lock evidence. */
export function validateHybridModelPartitionPlan(value: unknown): HybridModelPartitionPlan {
  assertRecord(value, "HybridModelPartitionPlan");
  assertExactKeys(value, [
    "strategy",
    "kind",
    "profile",
    "sourceComponents",
    "boundsMetres",
    "partitions",
    "seamLocks",
  ], "HybridModelPartitionPlan");
  if (value.strategy !== "semantic-first-connected-then-grid" || (value.kind !== "leaf" && value.kind !== "assembly")) {
    throw new Error("HybridModelPartitionPlan strategy or kind is invalid.");
  }
  const profile = validateProcessingProfile(value.profile);
  if (!Array.isArray(value.sourceComponents)
    || value.sourceComponents.length < 1
    || value.sourceComponents.length > MAX_COMPONENTS) {
    throw new Error(`HybridModelPartitionPlan requires one to ${MAX_COMPONENTS} immutable source components.`);
  }
  const sourceComponents = value.sourceComponents
    .map(validateComponent)
    .sort(compareModelComponents);
  if (new Set(sourceComponents.map((component) => component.componentId)).size !== sourceComponents.length) {
    throw new Error("HybridModelPartitionPlan source componentId values must be unique.");
  }
  const boundsMetres = cloneBounds(value.boundsMetres, "HybridModelPartitionPlan.boundsMetres");
  const sourceBounds = unionBounds(sourceComponents);
  if (JSON.stringify(sourceBounds) !== JSON.stringify(boundsMetres)) {
    throw new Error("HybridModelPartitionPlan parent bounds must equal immutable source component bounds.");
  }
  if (!Array.isArray(value.partitions) || value.partitions.length < 1 || value.partitions.length > MAX_PARTITIONS) {
    throw new Error("HybridModelPartitionPlan must contain one to 256 partitions.");
  }
  const partitions = value.partitions.map((partition, index) => {
    const fieldName = `HybridModelPartitionPlan.partitions[${index}]`;
    assertRecord(partition, fieldName);
    assertExactKeys(partition, [
      "partitionId",
      "method",
      "sourceComponentId",
      "semanticNodeId",
      "connectedComponentId",
      "mobility",
      "boundsMetres",
      "estimatedTriangleCount",
      "estimatedByteLength",
      "estimatedTextureByteLength",
      "maxTextureDimensionPx",
      "gridCell",
    ], fieldName);
    if (!(["semantic", "connected", "grid"] as const).includes(partition.method as never)
      || (partition.mobility !== "static" && partition.mobility !== "movable")) {
      throw new Error(`${fieldName} method or mobility is invalid.`);
    }
    if (partition.method === "grid" && partition.mobility !== "static") {
      throw new Error("movable-object clipping is forbidden in hybrid partition plans.");
    }
    const semanticNodeId = partition.semanticNodeId === undefined
      ? undefined
      : requireToken(partition.semanticNodeId, `${fieldName}.semanticNodeId`);
    let gridCell: Readonly<{ readonly x: number; readonly z: number }> | undefined;
    if (partition.gridCell !== undefined) {
      assertRecord(partition.gridCell, `${fieldName}.gridCell`);
      assertExactKeys(partition.gridCell, ["x", "z"], `${fieldName}.gridCell`);
      gridCell = {
        x: requireInteger(partition.gridCell.x, `${fieldName}.gridCell.x`, -1_000_000, 1_000_000),
        z: requireInteger(partition.gridCell.z, `${fieldName}.gridCell.z`, -1_000_000, 1_000_000),
      };
    }
    if ((partition.method === "grid") !== (gridCell !== undefined)) {
      throw new Error(`${fieldName} grid partitions require gridCell evidence and unsplit partitions forbid it.`);
    }
    const method = partition.method as ModelPartitionMethod;
    const mobility = partition.mobility as ModelComponentMobility;
    return {
      partitionId: requirePathSegment(partition.partitionId, `${fieldName}.partitionId`),
      method,
      sourceComponentId: requirePathSegment(partition.sourceComponentId, `${fieldName}.sourceComponentId`),
      ...(semanticNodeId === undefined ? {} : { semanticNodeId }),
      connectedComponentId: requireToken(partition.connectedComponentId, `${fieldName}.connectedComponentId`),
      mobility,
      boundsMetres: cloneBounds(partition.boundsMetres, `${fieldName}.boundsMetres`),
      estimatedTriangleCount: requireInteger(partition.estimatedTriangleCount, `${fieldName}.estimatedTriangleCount`, 1, profile.maxTriangles),
      estimatedByteLength: requireInteger(partition.estimatedByteLength, `${fieldName}.estimatedByteLength`, 1, profile.maxBytes),
      estimatedTextureByteLength: requireInteger(partition.estimatedTextureByteLength, `${fieldName}.estimatedTextureByteLength`, 0, profile.maxTextureBytes),
      maxTextureDimensionPx: requireInteger(partition.maxTextureDimensionPx, `${fieldName}.maxTextureDimensionPx`, 0, profile.maxTextureDimensionPx),
      ...(gridCell === undefined ? {} : { gridCell }),
    } satisfies HybridModelPartition;
  });
  if (new Set(partitions.map((partition) => partition.partitionId)).size !== partitions.length
    || value.kind !== (partitions.length === 1 ? "leaf" : "assembly")) {
    throw new Error("HybridModelPartitionPlan kind and unique partition closure are inconsistent.");
  }
  for (const partition of partitions) {
    const width = partition.boundsMetres.max[0] - partition.boundsMetres.min[0];
    const depth = partition.boundsMetres.max[2] - partition.boundsMetres.min[2];
    if (width > profile.maxPartitionCellMetres + CANONICAL_ORIGIN_TOLERANCE_METRES
      || depth > profile.maxPartitionCellMetres + CANONICAL_ORIGIN_TOLERANCE_METRES) {
      throw new Error("hybrid partition leaves must fit the configured X/Z partition cell without movable clipping.");
    }
  }
  validatePartitionsAgainstSources(partitions, sourceComponents, profile);
  if (!Array.isArray(value.seamLocks) || value.seamLocks.length > MAX_PARTITIONS * 2) {
    throw new Error("HybridModelPartitionPlan seam locks must be bounded.");
  }
  const partitionIds = new Set(partitions.map((partition) => partition.partitionId));
  const seamLocks = value.seamLocks.map((lock, index) => {
    const fieldName = `HybridModelPartitionPlan.seamLocks[${index}]`;
    assertRecord(lock, fieldName);
    assertExactKeys(lock, ["seamId", "axis", "coordinateMetres", "partitionIds", "attributes", "lodConstraint"], fieldName);
    if ((lock.axis !== "X" && lock.axis !== "Z")
      || !Array.isArray(lock.partitionIds) || lock.partitionIds.length !== 2
      || !lock.partitionIds.every((id) => typeof id === "string" && partitionIds.has(id))
      || lock.partitionIds[0] === lock.partitionIds[1]
      || !Array.isArray(lock.attributes)
      || lock.attributes.join(",") !== "POSITION,NORMAL,TEXCOORD_0"
      || lock.lodConstraint !== "lock-identical-border-vertices") {
      throw new Error(`${fieldName} must lock two existing grid partitions and all seam attributes.`);
    }
    return {
      seamId: requireToken(lock.seamId, `${fieldName}.seamId`),
      axis: lock.axis as "X" | "Z",
      coordinateMetres: requireFinite(lock.coordinateMetres, `${fieldName}.coordinateMetres`),
      partitionIds: [lock.partitionIds[0], lock.partitionIds[1]] as [string, string],
      attributes: ["POSITION", "NORMAL", "TEXCOORD_0"] as const,
      lodConstraint: "lock-identical-border-vertices" as const,
    };
  });
  if (new Set(seamLocks.map((lock) => lock.seamId)).size !== seamLocks.length) {
    throw new Error("HybridModelPartitionPlan seamId values must be unique.");
  }
  const expectedSeamLocks = createSeamLocks(partitions, profile.maxPartitionCellMetres, sourceComponents);
  const orderedSeamLocks = [...seamLocks].sort((left, right) => compareCodeUnits(left.seamId, right.seamId));
  if (JSON.stringify(orderedSeamLocks) !== JSON.stringify(expectedSeamLocks)) {
    throw new Error("HybridModelPartitionPlan must include every deterministic grid seam lock exactly once.");
  }
  const derivedBounds = unionBounds(partitions.map((partition) => ({
    componentId: partition.partitionId,
    connectedComponentId: partition.connectedComponentId,
    mobility: partition.mobility,
    boundsMetres: partition.boundsMetres,
    triangleCount: partition.estimatedTriangleCount,
    byteLength: partition.estimatedByteLength,
    textureByteLength: partition.estimatedTextureByteLength,
    maxTextureDimensionPx: partition.maxTextureDimensionPx,
  })));
  if (JSON.stringify(derivedBounds) !== JSON.stringify(boundsMetres)) {
    throw new Error("HybridModelPartitionPlan parent bounds must equal the complete partition closure bounds.");
  }
  return deepFreeze({
    strategy: "semantic-first-connected-then-grid",
    kind: value.kind as "leaf" | "assembly",
    profile,
    sourceComponents,
    boundsMetres,
    partitions: [...partitions].sort((left, right) => compareCodeUnits(left.partitionId, right.partitionId)),
    seamLocks: orderedSeamLocks,
  });
}

/** Revalidates all adaptive attempt audit evidence against the retained LOD set. */
export function validateAdaptiveModelLodPlan(value: unknown): AdaptiveModelLodPlan {
  assertRecord(value, "AdaptiveModelLodPlan");
  assertExactKeys(value, ["lods", "attempts", "projectedErrorLimitPx", "transitionHysteresisRatio"], "AdaptiveModelLodPlan");
  if (value.projectedErrorLimitPx !== 1.5 || value.transitionHysteresisRatio !== 0.2
    || !Array.isArray(value.attempts) || value.attempts.length > 3) {
    throw new Error("AdaptiveModelLodPlan must use the static-world-v1 error limit, hysteresis, and bounded attempts.");
  }
  if (!Array.isArray(value.lods)) {
    throw new Error("AdaptiveModelLodPlan.lods must be an array.");
  }
  const lods = validateAdaptiveModelLods(value.lods as ModelLodRecord[]);
  const requiresAdaptiveAttempts = lods[0]!.triangleCount
    >= STATIC_WORLD_V1_PROCESSING_PROFILE.adaptiveLodThresholdTriangles;
  if (requiresAdaptiveAttempts && value.attempts.length !== 3) {
    throw new Error("AdaptiveModelLodPlan requires exactly three attempts for LOD0 at or above the adaptive threshold.");
  }
  if (!requiresAdaptiveAttempts && value.attempts.length !== 0) {
    throw new Error("AdaptiveModelLodPlan below the adaptive threshold must contain zero attempts.");
  }
  const lodScope = parseContentAddressedGlb(lods[0]!.resource, "AdaptiveModelLodPlan.lods[0].resource");
  const retainedByLevel = new Map(lods.slice(1).map((lod) => [lod.level, lod]));
  const ratios = STATIC_WORLD_V1_PROCESSING_PROFILE.lodTargetRatios;
  const seenResources = new Set([lods[0]!.resource.uri, lods[0]!.resource.sha256]);
  let previousRetained = lods[0]!;
  let nextRetainedLevel = 1;
  const attempts = value.attempts.map((attempt, index) => {
    const fieldName = `AdaptiveModelLodPlan.attempts[${index}]`;
    assertRecord(attempt, fieldName);
    assertExactKeys(attempt, [
      "targetRatio",
      "targetTriangleCount",
      "actualTriangleCount",
      "geometricErrorMetres",
      "resource",
      "fidelityPassed",
      "retained",
      "retainedLevel",
      "reasonCode",
    ], fieldName);
    const targetRatio = ratios[index]!;
    if (attempt.targetRatio !== targetRatio || typeof attempt.fidelityPassed !== "boolean" || typeof attempt.retained !== "boolean") {
      throw new Error(`${fieldName} target ratio or boolean evidence is invalid.`);
    }
    const parsedResource = parseContentAddressedGlb(attempt.resource, `${fieldName}.resource`);
    const resource = parsedResource.resource;
    if (parsedResource.resolutionId !== lodScope.resolutionId || parsedResource.candidateId !== lodScope.candidateId) {
      throw new Error(`${fieldName} must share the retained LOD candidate scope.`);
    }
    if (seenResources.has(resource.uri) || seenResources.has(resource.sha256)) {
      throw new Error(`${fieldName} must use a unique simplifier resource and hash.`);
    }
    seenResources.add(resource.uri);
    seenResources.add(resource.sha256);
    const actualTriangleCount = requireInteger(attempt.actualTriangleCount, `${fieldName}.actualTriangleCount`, 1, 1_000_000_000);
    const geometricErrorMetres = requireFinite(attempt.geometricErrorMetres, `${fieldName}.geometricErrorMetres`, 0);
    const targetTriangleCount = requireInteger(attempt.targetTriangleCount, `${fieldName}.targetTriangleCount`, 1, 1_000_000_000);
    if (targetTriangleCount !== Math.max(1, Math.floor(lods[0]!.triangleCount * targetRatio))) {
      throw new Error(`${fieldName} target triangle count must match its static-world-v1 ratio.`);
    }
    let expectedReason: AdaptiveModelLodDiscardReason | undefined;
    if (!attempt.fidelityPassed) {
      expectedReason = "fidelity-check-failed";
    } else if (actualTriangleCount < STATIC_WORLD_V1_PROCESSING_PROFILE.minimumRetainedLodTriangles) {
      expectedReason = "below-minimum-triangles";
    } else if (actualTriangleCount > Math.floor(
      previousRetained.triangleCount * (1 - STATIC_WORLD_V1_PROCESSING_PROFILE.minimumLodReductionRatio),
    )) {
      expectedReason = "insufficient-reduction";
    } else if (geometricErrorMetres < previousRetained.geometricErrorMetres) {
      expectedReason = "geometric-error-regressed";
    }
    if (attempt.retained !== (expectedReason === undefined)) {
      throw new Error(`${fieldName} retained outcome must match the adaptive LOD policy.`);
    }
    let retainedLevel: ModelLodLevel | undefined;
    let reasonCode: AdaptiveModelLodDiscardReason | undefined;
    if (attempt.retained) {
      retainedLevel = requireInteger(attempt.retainedLevel, `${fieldName}.retainedLevel`, 1, 3) as ModelLodLevel;
      if (attempt.reasonCode !== undefined || retainedLevel !== nextRetainedLevel) {
        throw new Error(`${fieldName} retained attempts must not include a discard reason.`);
      }
      const retained = retainedByLevel.get(retainedLevel);
      if (retained === undefined || retained.resource.uri !== resource.uri
        || retained.triangleCount !== actualTriangleCount
        || retained.geometricErrorMetres !== geometricErrorMetres) {
        throw new Error(`${fieldName} retained evidence must exactly match its LOD record.`);
      }
      previousRetained = retained;
      nextRetainedLevel += 1;
    } else {
      const reasons: readonly AdaptiveModelLodDiscardReason[] = [
        "fidelity-check-failed",
        "below-minimum-triangles",
        "insufficient-reduction",
        "geometric-error-regressed",
      ];
      if (typeof attempt.reasonCode !== "string" || !reasons.includes(attempt.reasonCode as AdaptiveModelLodDiscardReason)
        || attempt.reasonCode !== expectedReason
        || attempt.retainedLevel !== undefined) {
        throw new Error(`${fieldName} discarded attempts require one bounded reason and no retained level.`);
      }
      reasonCode = attempt.reasonCode as AdaptiveModelLodDiscardReason;
    }
    return {
      targetRatio,
      targetTriangleCount,
      actualTriangleCount,
      geometricErrorMetres,
      resource,
      fidelityPassed: attempt.fidelityPassed,
      retained: attempt.retained,
      ...(retainedLevel === undefined ? {} : { retainedLevel }),
      ...(reasonCode === undefined ? {} : { reasonCode }),
    } satisfies AdaptiveModelLodAttempt;
  });
  if (attempts.filter((attempt) => attempt.retained).length !== lods.length - 1) {
    throw new Error("AdaptiveModelLodPlan retained attempts must cover every nonzero LOD exactly once.");
  }
  return deepFreeze({
    lods,
    attempts,
    projectedErrorLimitPx: 1.5,
    transitionHysteresisRatio: 0.2,
  });
}

function validateAssemblyChildAssetRef(value: unknown, fieldName: string): ModelAssemblyChildAssetRef {
  assertRecord(value, fieldName);
  if (value.disposition !== "staged-derived") {
    return createModelAssetRef(value);
  }
  assertExactKeys(value, [
    "disposition",
    "derivedId",
    "kind",
    "contentHash",
    "processingManifestUri",
  ], fieldName);
  if (value.kind !== "leaf" || typeof value.processingManifestUri !== "string"
    || !value.processingManifestUri.startsWith("mcp://models/")
    || /[?#\\]/u.test(value.processingManifestUri)) {
    throw new Error(`${fieldName} must be a safe staged-derived leaf reference.`);
  }
  return {
    disposition: "staged-derived",
    derivedId: requirePathSegment(value.derivedId, `${fieldName}.derivedId`),
    kind: "leaf",
    contentHash: requireSha256(value.contentHash, `${fieldName}.contentHash`),
    processingManifestUri: value.processingManifestUri,
  };
}

function validatePartitionOutputs(
  outputs: readonly ModelPartitionOutput[],
  partitions: HybridModelPartitionPlan,
): readonly ModelPartitionOutput[] {
  if (!Array.isArray(outputs) || outputs.length > MAX_PARTITIONS) {
    throw new Error("partition outputs must be a bounded array.");
  }
  if (partitions.kind === "leaf") {
    if (outputs.length !== 0) {
      throw new Error("leaf processing plans must not include assembly partition outputs.");
    }
    return deepFreeze([]);
  }
  const byPartitionId = new Map<string, ModelPartitionOutput>();
  for (const [index, output] of outputs.entries()) {
    assertRecord(output, `ModelPartitionOutput[${index}]`);
    assertExactKeys(output, ["partitionId", "assetRef", "transform", "parentPartitionId"], `ModelPartitionOutput[${index}]`);
    const partitionId = requirePathSegment(output.partitionId, `ModelPartitionOutput[${index}].partitionId`);
    if (byPartitionId.has(partitionId)) {
      throw new Error("partition output IDs must be unique.");
    }
    const parentPartitionId = output.parentPartitionId === undefined
      ? undefined
      : requirePathSegment(output.parentPartitionId, `ModelPartitionOutput[${index}].parentPartitionId`);
    byPartitionId.set(partitionId, {
      partitionId,
      assetRef: validateAssemblyChildAssetRef(output.assetRef, `ModelPartitionOutput[${index}].assetRef`),
      transform: cloneTransform(output.transform, `ModelPartitionOutput[${index}].transform`),
      ...(parentPartitionId === undefined ? {} : { parentPartitionId }),
    });
  }
  const ordered = partitions.partitions.map((partition) => byPartitionId.get(partition.partitionId));
  if (ordered.some((output) => output === undefined) || byPartitionId.size !== partitions.partitions.length) {
    throw new Error("missing or unexpected partition output prevents an atomic assembly closure.");
  }
  return deepFreeze(ordered as ModelPartitionOutput[]);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256Json(value: unknown): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("standards-based Web Crypto SHA-256 is unavailable.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function contentHashForChild(assetRef: ModelAssemblyChildAssetRef): string {
  return requireSha256(assetRef.contentHash, "ModelPartitionOutput.assetRef.contentHash");
}

function manifestUriForChild(assetRef: ModelAssemblyChildAssetRef): string {
  if ("disposition" in assetRef) {
    return assetRef.processingManifestUri;
  }
  return assetRef.runtimeManifestUri;
}

function validateRuntimeResourceScope(resource: ModelResourceRef, resolutionId: string, candidateId: string): void {
  const parsed = parseContentAddressedGlb(resource, "runtime artifact");
  if (parsed.resolutionId !== resolutionId || parsed.candidateId !== candidateId) {
    throw new Error("runtime artifacts must share the processing resolution and candidate scope.");
  }
}

function orderedFidelityEvidence(input: readonly ModelFidelityEvidence[]): readonly ModelFidelityEvidence[] {
  const order = ["geometry", "materials", "textures", "rigging", "animation", "metadata"];
  return [...input].sort((left, right) => order.indexOf(left.aspect) - order.indexOf(right.aspect));
}

function manifestPayloadForDigest(
  manifest: ModelProcessingManifest,
): Omit<ModelProcessingManifest, "manifestId"> {
  const { manifestId: _manifestId, ...payload } = manifest;
  return {
    ...payload,
    converter: {
      ...manifest.converter,
      diagnostics: [...manifest.converter.diagnostics].sort((left, right) => (
        compareCodeUnits(left.severity, right.severity)
        || compareCodeUnits(left.code, right.code)
        || compareCodeUnits(left.message, right.message)
      )),
      losses: [...manifest.converter.losses].sort((left, right) => (
        compareCodeUnits(left.severity, right.severity)
        || compareCodeUnits(left.code, right.code)
        || compareCodeUnits(left.message, right.message)
      )),
    },
    fidelityEvidence: orderedFidelityEvidence(manifest.fidelityEvidence),
  };
}

/** Builds and contract-validates a deterministic GLB-only parent/child runtime closure. */
export async function createCanonicalModelRuntimePlan(
  input: CreateCanonicalModelRuntimePlanInput,
): Promise<CanonicalModelRuntimePlan> {
  const resolutionId = requirePathSegment(input.resolutionId, "CreateCanonicalModelRuntimePlanInput.resolutionId");
  const candidateId = requirePathSegment(input.candidateId, "CreateCanonicalModelRuntimePlanInput.candidateId");
  const profile = validateProcessingProfile(input.profile);
  const cleanup = createCanonicalModelCleanupPlan({
    formatEvidence: input.cleanup.formatEvidence,
    profile: input.cleanup.profile,
  });
  if (JSON.stringify(cleanup.profile) !== JSON.stringify(profile)) {
    throw new Error("cleanup and runtime processing profiles must match exactly.");
  }
  const partitions = validateHybridModelPartitionPlan(input.partitions);
  if (JSON.stringify(partitions.profile) !== JSON.stringify(profile)) {
    throw new Error("partition and runtime processing profiles must match exactly.");
  }
  const partitionOutputs = validatePartitionOutputs(input.partitionOutputs, partitions);
  const lods = validateAdaptiveModelLodPlan(input.lods);
  const lodRecords = lods.lods;
  const lod0 = lodRecords[0]!;
  for (const lod of lodRecords) validateRuntimeResourceScope(lod.resource, resolutionId, candidateId);
  if (partitions.kind === "leaf" && lodRecords.some((lod) => (
    lod.triangleCount > profile.maxTriangles || lod.resource.byteLength > profile.maxBytes
  ))) {
    throw new Error("canonical leaf GLB triangles or bytes exceed the selected static-world-v1 runtime limits.");
  }
  const textureByteLength = requireInteger(
    input.textureByteLength,
    "CreateCanonicalModelRuntimePlanInput.textureByteLength",
    0,
    partitions.kind === "leaf" ? profile.maxTextureBytes : Number.MAX_SAFE_INTEGER,
  );
  const maxTextureDimensionPx = requireInteger(
    input.maxTextureDimensionPx,
    "CreateCanonicalModelRuntimePlanInput.maxTextureDimensionPx",
    0,
    profile.maxTextureDimensionPx,
  );
  if (textureByteLength > lod0.resource.byteLength
    || (textureByteLength === 0) !== (maxTextureDimensionPx === 0)) {
    throw new Error("runtime texture evidence is inconsistent with the LOD0 package.");
  }
  const collision = createModelCollisionPlan({
    lod0Sha256: input.collision.sourceLod0Sha256,
    record: input.collision.record,
    policy: input.collision.policy,
  });
  if (collision.sourceLod0Sha256 !== lod0.resource.sha256) {
    throw new Error("collision plan must be derived from this exact cleaned LOD0.");
  }
  if (collision.record.resource !== undefined) {
    validateRuntimeResourceScope(collision.record.resource, resolutionId, candidateId);
  }
  const evidence = validateModelFormatEvidence(cleanup.formatEvidence);
  const children = partitionOutputs.map((output) => ({
    instanceId: output.partitionId,
    ...(output.parentPartitionId === undefined ? {} : { parentInstanceId: output.parentPartitionId }),
    assetRef: output.assetRef,
    transform: output.transform,
  }));
  const bounds = partitions.boundsMetres;
  const processedAt = requireTimestamp(input.processedAt, "CreateCanonicalModelRuntimePlanInput.processedAt");
  const validatedSnapshot = createModelProcessingManifest({
    contractVersion: MODEL_RESOLUTION_CONTRACT_VERSION,
    manifestId: "model-manifest-pending",
    resolutionId,
    candidateId,
    kind: partitions.kind,
    contentHash: lod0.resource.sha256,
    closureHash: partitions.kind === "leaf" ? lod0.resource.sha256 : ZERO_SHA256,
    coordinateSystem: CANONICAL_MODEL_COORDINATE_SYSTEM,
    technicalProfile: {
      boundsMetres: bounds,
      dimensionsMetres: {
        width: bounds.max[0] - bounds.min[0],
        height: bounds.max[1] - bounds.min[1],
        depth: bounds.max[2] - bounds.min[2],
      },
      triangleCount: lod0.triangleCount,
      byteLength: lod0.resource.byteLength,
      textureByteLength,
      maxTextureDimensionPx,
      lodCount: lodRecords.length,
      hasCollision: collision.record.kind !== "none",
      partitionCount: partitions.kind === "leaf" ? 1 : children.length,
      partitionCellMetres: profile.maxPartitionCellMetres,
    },
    lods: lodRecords,
    collision: collision.record,
    collisionPolicy: collision.policy,
    children,
    converter: input.converter,
    fidelityEvidence: input.fidelityEvidence,
    fidelityGate: input.fidelityGate,
    processedAt,
  });
  if (validatedSnapshot.converter.sourceContentHash !== evidence.sourceContentHash) {
    throw new Error("format evidence source hash must match converter source evidence.");
  }
  if (validatedSnapshot.converter.id !== evidence.adapterId
    || validatedSnapshot.converter.version !== evidence.adapterVersion
    || validatedSnapshot.converter.sourceFormat !== evidence.sourceFormat
    || validatedSnapshot.converter.targetFormat !== evidence.targetFormat
    || validatedSnapshot.converter.outputContentHash !== lod0.resource.sha256) {
    throw new Error("converter evidence is incompatible with signed format evidence or canonical LOD0.");
  }
  if (validatedSnapshot.fidelityGate.outcome === "blocked") {
    throw new Error("blocked fidelity evidence cannot produce a canonical runtime plan.");
  }
  if (Date.parse(processedAt) < Math.max(
    Date.parse(evidence.validatedAt),
    Date.parse(validatedSnapshot.fidelityGate.evaluatedAt),
  )) {
    throw new Error("processedAt must not precede format or fidelity policy evidence.");
  }
  const closureHash = partitions.kind === "leaf"
    ? lod0.resource.sha256
    : await sha256Json({
      parentContentHash: lod0.resource.sha256,
      lods: validatedSnapshot.lods.map((lod) => lod.resource.sha256),
      collision: validatedSnapshot.collision.resource?.sha256 ?? null,
      children: validatedSnapshot.children.map((child) => ({
        instanceId: child.instanceId,
        parentInstanceId: child.parentInstanceId ?? null,
        contentHash: contentHashForChild(child.assetRef),
        manifestUri: manifestUriForChild(child.assetRef),
        transform: child.transform,
      })),
    });
  const validatedDraft = createModelProcessingManifest({
    ...validatedSnapshot,
    manifestId: "model-manifest-pending",
    closureHash,
  });
  const manifestPayload = manifestPayloadForDigest(validatedDraft);
  const manifestDigest = await sha256Json(manifestPayload);
  const manifest = createModelProcessingManifest({
    ...manifestPayload,
    manifestId: `model-manifest-${manifestDigest}`,
  });
  const runtimeArtifacts = [
    ...manifest.lods.map((lod) => lod.resource),
    ...(manifest.collision.resource === undefined ? [] : [manifest.collision.resource]),
  ];
  const rollbackClosure = await collectModelRollbackClosure(manifest, manifestDigest);
  return deepFreeze({
    manifest,
    manifestDigest,
    cleanup,
    partitions,
    lods,
    collision,
    runtimeArtifacts,
    rollbackClosure,
  });
}

/** Revalidates the manifest digest and rebuilds the exact closure used by atomic rollback. */
export async function collectModelRollbackClosure(
  manifestInput: ModelProcessingManifest,
  manifestDigestInput: string,
): Promise<readonly ModelRollbackClosureEntry[]> {
  const manifest = createModelProcessingManifest(manifestInput);
  const manifestDigest = requireSha256(manifestDigestInput, "manifestDigest");
  const computedDigest = await sha256Json(manifestPayloadForDigest(manifest));
  if (computedDigest !== manifestDigest || manifest.manifestId !== `model-manifest-${computedDigest}`) {
    throw new Error("manifestDigest must exactly bind the deterministic model manifest identity.");
  }
  const entries: ModelRollbackClosureEntry[] = [{
    kind: "manifest",
    uri: `mcp://models/resolutions/${manifest.resolutionId}/candidates/${manifest.candidateId}/manifest`,
    sha256: manifestDigest,
    digestSubject: "manifest-identity",
    contentType: "application/json",
  }];
  entries.push(...manifest.lods.map((lod) => ({
    kind: "lod" as const,
    uri: lod.resource.uri,
    sha256: lod.resource.sha256,
    digestSubject: "resource-bytes" as const,
    contentType: "model/gltf-binary" as const,
  })));
  if (manifest.collision.resource !== undefined) {
    entries.push({
      kind: "collision",
      uri: manifest.collision.resource.uri,
      sha256: manifest.collision.resource.sha256,
      digestSubject: "resource-bytes",
      contentType: "model/gltf-binary",
    });
  }
  entries.push(...[...manifest.children]
    .sort((left, right) => compareCodeUnits(left.instanceId, right.instanceId))
    .map((child) => ({
      kind: "child-manifest" as const,
      uri: manifestUriForChild(child.assetRef),
      sha256: contentHashForChild(child.assetRef),
      digestSubject: "asset-content" as const,
      contentType: "application/json" as const,
    })));
  const uniqueEntries: ModelRollbackClosureEntry[] = [];
  const byUri = new Map<string, ModelRollbackClosureEntry>();
  for (const entry of entries) {
    const existing = byUri.get(entry.uri);
    if (existing === undefined) {
      byUri.set(entry.uri, entry);
      uniqueEntries.push(entry);
      continue;
    }
    if (existing.sha256 !== entry.sha256
      || existing.digestSubject !== entry.digestSubject
      || existing.contentType !== entry.contentType
      || existing.kind !== entry.kind) {
      throw new Error("rollback closure contains conflicting duplicate resource references.");
    }
  }
  return deepFreeze(uniqueEntries);
}
