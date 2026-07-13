import {
  ASSET_JSON_CONTENT_TYPE,
  ASSET_WGSL_CONTENT_TYPE,
  GPU_SHADER_STORE_FEATURE_FLAG,
  assertAssetId,
  assertAssetVersion,
  createAssetFileDescriptor,
  createGpuInterfaceAssetManifest,
  createGpuInterfaceRef,
  createShaderAssetManifest,
  createShaderValidationEvidenceAssetManifest,
  createShaderValidationEvidenceRef,
  createShaderVersionRef,
  isAssetSourceAdapter,
  validateGpuAssetFiles,
} from "@plasius/asset-contracts";
import type {
  AssetFileDescriptor,
  AssetFileRole,
  AssetSourceAdapter,
  GpuAssetManifest,
  GpuInterfaceAssetManifest,
  ShaderAssetManifest,
  ShaderValidationEvidenceAssetManifest,
} from "@plasius/asset-contracts";
import {
  canonicalizeGpuContract,
  computeSha256,
  computeShaderManifestCoreSha256,
  parseShaderVersionManifest,
} from "@plasius/gpu-shader";
import type {
  GeneratedGpuInterfaceArtifacts,
  GpuInterfaceRef,
  ShaderQualificationBundleManifest,
  ShaderValidationEvidence,
  ShaderValidationEvidenceAttestationRef,
  ShaderVersionManifest,
  ShaderVersionRef,
  Sha256Hex,
  StableWebGpuMatrixManifest,
} from "@plasius/gpu-shader";
import type { AdmittedQualificationBundle } from "@plasius/gpu-shader/node";

/** Version of the fail-closed shader-admission orchestration contract. */
export const SHADER_ADMISSION_CONTRACT_VERSION = "2026-07-13.v1" as const;

/** Mandatory stages executed for every admitted WGSL shader version. */
export const SHADER_ADMISSION_OPERATIONS = Object.freeze([
  "assemble-final-wgsl",
  "reflect-gpu-interface",
  "generate-gpu-artifacts",
  "validate-model-fixtures",
  "verify-stable-webgpu-evidence",
  "verify-evidence-attestation",
  "package-immutable-runtime",
] as const);

/** Remote rollout key shared with the shader store and runtime catalog. */
export { GPU_SHADER_STORE_FEATURE_FLAG };

/** One mandatory shader-admission operation. */
export type ShaderAdmissionOperation = typeof SHADER_ADMISSION_OPERATIONS[number];

/** Human-readable declaration of one mandatory admission step. */
export interface ShaderAdmissionStep {
  readonly operation: ShaderAdmissionOperation;
  readonly required: true;
  readonly description: string;
}

/** Storage-neutral plan for a single immutable shader version. */
export interface ShaderAdmissionPlan {
  readonly contractVersion: typeof SHADER_ADMISSION_CONTRACT_VERSION;
  readonly shaderId: string;
  readonly version: string;
  readonly featureFlagId: typeof GPU_SHADER_STORE_FEATURE_FLAG;
  readonly targetRuntime: "webgpu-wgsl";
  readonly steps: readonly ShaderAdmissionStep[];
}

/** Processing stage attached to a public admission diagnostic. */
export type ShaderAdmissionStage = ShaderAdmissionOperation | "validate-input" | "revalidate-receipt";

/** Stable, non-sensitive failure category returned by shader admission. */
export type ShaderAdmissionDiagnosticCode =
  | "invalid-input"
  | "bundle-admission-failed"
  | "matrix-evidence-invalid"
  | "attestation-invalid"
  | "runtime-package-invalid"
  | "receipt-invalid"
  | "aborted"
  | "timeout";

/** Sanitized failure information safe to return across a service boundary. */
export interface ShaderAdmissionDiagnostic {
  readonly code: ShaderAdmissionDiagnosticCode;
  readonly stage: ShaderAdmissionStage;
  readonly severity: "error";
  readonly message: string;
}

/** A digest-validated asset package that never exposes its retained byte buffers. */
export interface ValidatedGpuAssetPackage<TManifest extends GpuAssetManifest = GpuAssetManifest> {
  readonly manifest: TManifest;
  readonly filePaths: readonly string[];
  /** Returns a defensive copy or undefined when the path is undeclared. */
  readFile(path: string): Uint8Array | undefined;
  /** Returns a caller-owned map containing defensive byte copies. */
  copyFiles(): ReadonlyMap<string, Uint8Array>;
}

/** Same-process proof that exact shader artifacts passed every admission gate. */
export interface ShaderAdmissionReceipt {
  readonly contractVersion: typeof SHADER_ADMISSION_CONTRACT_VERSION;
  readonly plan: ShaderAdmissionPlan;
  readonly shaderId: string;
  readonly version: string;
  readonly modelAbiHash: Sha256Hex;
  readonly shaderAbiHash: Sha256Hex;
  readonly gpuInterface: GpuInterfaceRef;
  readonly shader: ShaderVersionRef;
  readonly generatedInterfaceArtifacts: GeneratedGpuInterfaceArtifacts;
  readonly qualification: {
    readonly evidenceId: string;
    readonly generatedAt: string;
    readonly dataBundleSha256: Sha256Hex;
    readonly shaderManifestCoreSha256: Sha256Hex;
    readonly interfaceManifestSha256: Sha256Hex;
    readonly compileUnitInventorySha256: Sha256Hex;
    readonly subjectBindingSha256: Sha256Hex;
    readonly matrixId: string;
    readonly matrixVersion: string;
    readonly matrixSha256: Sha256Hex;
    readonly requiredCompileUnitIds: readonly string[];
    readonly requiredCellIds: readonly string[];
    readonly moduleDigests: readonly { readonly moduleId: string; readonly sha256: Sha256Hex }[];
    readonly modelAbiHashes: readonly Sha256Hex[];
    readonly compileUnits: number;
    readonly cells: number;
    readonly expectedResults: number;
    readonly passedResults: number;
  };
  readonly assets: {
    readonly gpuInterface: ValidatedGpuAssetPackage<GpuInterfaceAssetManifest>;
    readonly shader: ValidatedGpuAssetPackage<ShaderAssetManifest>;
    readonly evidence: ValidatedGpuAssetPackage<ShaderValidationEvidenceAssetManifest>;
  };
}

/** Fail-closed result of admission or receipt revalidation. */
export type ShaderAdmissionResult =
  | { readonly ok: true; readonly value: ShaderAdmissionReceipt }
  | { readonly ok: false; readonly diagnostics: readonly ShaderAdmissionDiagnostic[] };

/** Exact inputs supplied to a trusted cryptographic evidence verifier. */
export interface ShaderEvidenceCryptographicVerificationInput {
  readonly ref: ShaderValidationEvidenceAttestationRef;
  readonly evidenceBytes: Uint8Array;
  readonly bundleBytes: Uint8Array;
  readonly signal: AbortSignal;
}

/** Trusted host capability for validating an external provenance bundle. */
export type ShaderEvidenceCryptographicVerifier = (
  input: ShaderEvidenceCryptographicVerificationInput,
) => Promise<boolean>;

/** Exact archive materialization request delivered only to trusted host code. */
export interface ShaderQualificationMaterializationInput {
  readonly sourceArchiveBytes: Uint8Array;
  readonly sourceArchiveSha256: Sha256Hex;
  readonly signal: AbortSignal;
}

/** Trusted host claim for the private directory materialized from exact bytes. */
export interface ShaderQualificationMaterialization {
  readonly directory: string;
  readonly sourceArchiveSha256: Sha256Hex;
}

/** Host-owned materializer; it must never be selected or implemented by request data. */
export type ShaderQualificationBundleMaterializer = (
  input: ShaderQualificationMaterializationInput,
) => Promise<ShaderQualificationMaterialization>;

/** Exact artifacts and trusted host capabilities required for admission. */
export interface ShaderAdmissionInput {
  /** Exact immutable intake archive bytes; its digest is never caller supplied. */
  readonly sourceArchiveBytes: Uint8Array;
  /** Trusted host capability that materializes only the exact archive passed to it. */
  readonly materializeQualificationBundle: ShaderQualificationBundleMaterializer;
  readonly matrixBytes: Uint8Array;
  readonly validationEvidenceBytes: Uint8Array;
  readonly validationEvidenceUri: string;
  readonly attestationReferenceBytes: Uint8Array;
  readonly attestationReferenceUri: string;
  readonly attestationBundleBytes: Uint8Array;
  readonly shaderManifestUri: string;
  readonly evidenceAssetVersion: string;
  readonly sourceAdapter: AssetSourceAdapter;
  readonly createdAt: string;
  readonly verifyCryptographicBundle: ShaderEvidenceCryptographicVerifier;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Inputs used to replay a trusted same-process receipt before promotion. */
export interface RevalidateShaderAdmissionReceiptInput {
  readonly receipt: ShaderAdmissionReceipt;
  readonly verifyCryptographicBundle: ShaderEvidenceCryptographicVerifier;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

interface ShaderAdmissionProof {
  readonly bundle: ShaderQualificationBundleManifest;
  readonly matrix: StableWebGpuMatrixManifest;
  readonly matrixBytes: Uint8Array;
  readonly evidence: ShaderValidationEvidence;
  readonly evidenceBytes: Uint8Array;
  readonly attestationRef: ShaderValidationEvidenceAttestationRef;
  readonly attestationReferenceBytes: Uint8Array;
  readonly attestationBundleBytes: Uint8Array;
  readonly dataBundleSha256: Sha256Hex;
}

const MAX_SOURCE_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_AGGREGATE_INPUT_BYTES = 96 * 1024 * 1024;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MATRIX_PATH = "qualification/matrix.json";
const INVENTORY_PATH = "qualification/compile-unit-inventory.json";
const ATTESTATION_BUNDLE_CONTENT_TYPE = "application/vnd.dev.sigstore.bundle+json";

const STEP_DESCRIPTIONS: Readonly<Record<ShaderAdmissionOperation, string>> = Object.freeze({
  "assemble-final-wgsl": "Reassemble every final WGSL compile unit from its declared fragments.",
  "reflect-gpu-interface": "Regenerate the GPU interface and ABI projections from final WGSL.",
  "generate-gpu-artifacts": "Generate schemas, types, byte constants, and CPU codec source.",
  "validate-model-fixtures": "Validate exact model interfaces, semantics, and layout probes.",
  "verify-stable-webgpu-evidence": "Require a passing result for every stable matrix cell and compile unit.",
  "verify-evidence-attestation": "Cryptographically verify evidence provenance and exact bytes.",
  "package-immutable-runtime": "Create digest-validated interface, shader, and evidence asset packages.",
});

const receiptProofs = new WeakMap<ShaderAdmissionReceipt, ShaderAdmissionProof>();

class AdmissionTimeoutError extends Error {
  constructor() {
    super("Shader admission exceeded its bounded timeout.");
    this.name = "AdmissionTimeoutError";
  }
}

class AdmissionAbortedError extends Error {
  constructor() {
    super("Shader admission was cancelled.");
    this.name = "AdmissionAbortedError";
  }
}

/** Creates the required processing plan without permitting optional admission stages. */
export function createShaderAdmissionPlan(shaderId: string, version: string): ShaderAdmissionPlan {
  let validatedShaderId: string;
  let validatedVersion: string;
  try {
    validatedShaderId = assertAssetId(shaderId);
  } catch (cause) {
    throw new TypeError("Shader id must be a lowercase kebab-case asset id.", { cause });
  }
  try {
    validatedVersion = assertAssetVersion(version);
  } catch (cause) {
    throw new TypeError("Shader version must be an immutable asset version.", { cause });
  }
  const steps = Object.freeze(SHADER_ADMISSION_OPERATIONS.map((operation) => Object.freeze({
    operation,
    required: true as const,
    description: STEP_DESCRIPTIONS[operation],
  })));
  return Object.freeze({
    contractVersion: SHADER_ADMISSION_CONTRACT_VERSION,
    shaderId: validatedShaderId,
    version: validatedVersion,
    featureFlagId: GPU_SHADER_STORE_FEATURE_FLAG,
    targetRuntime: "webgpu-wgsl",
    steps,
  });
}

/** Validates complete files and retains defensive copies behind a read-only package API. */
export async function createValidatedGpuAssetPackage<TManifest extends GpuAssetManifest>(
  manifest: TManifest,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<ValidatedGpuAssetPackage<TManifest>> {
  const retained = new Map<string, Uint8Array>();
  for (const [path, bytes] of files) {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError(`GPU asset package file ${path} must be bytes.`);
    }
    retained.set(path, copyBytes(bytes));
  }
  const validated = await validateGpuAssetFiles({ manifest, files: retained }) as TManifest;
  const filePaths = Object.freeze(validated.files.map((file) => file.path));
  return Object.freeze({
    manifest: validated,
    filePaths,
    readFile(path: string): Uint8Array | undefined {
      const bytes = retained.get(path);
      return bytes === undefined ? undefined : copyBytes(bytes);
    },
    copyFiles(): ReadonlyMap<string, Uint8Array> {
      return new Map([...retained].map(([path, bytes]) => [path, copyBytes(bytes)]));
    },
  });
}

/** Returns true only for a receipt created and retained by this module instance. */
export function isTrustedShaderAdmissionReceipt(value: unknown): value is ShaderAdmissionReceipt {
  return typeof value === "object" && value !== null && receiptProofs.has(value as ShaderAdmissionReceipt);
}

function assertBytes(value: unknown, label: string, maximum: number): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > maximum) {
    throw new TypeError(`${label} must be non-empty bytes within the ${maximum}-byte admission bound.`);
  }
  return value;
}

function copyBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function assertTimestamp(value: string, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO-8601 timestamp.`);
  }
  return value;
}

function parseCanonicalJsonBytes(bytes: Uint8Array, label: string): unknown {
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch (cause) {
    throw new TypeError(`${label} must be UTF-8 JSON.`, { cause });
  }
  assertJsonComplexity(value, label);
  if (canonicalizeGpuContract(value) !== text) {
    throw new TypeError(`${label} must use exact canonical JSON bytes.`);
  }
  return value;
}

function assertJsonComplexity(value: unknown, label: string): void {
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) {
      throw new TypeError(`${label} exceeds the bounded JSON structure limit.`);
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
    } else if (typeof current.value === "object" && current.value !== null) {
      for (const child of Object.values(current.value)) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}

function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeGpuContract(value));
}

function cloneCanonicalJson<T>(value: T): T {
  return JSON.parse(canonicalizeGpuContract(value)) as T;
}

function relativePathWithinVersionRoot(rootEntrypointUri: string, artifactUri: string, label: string): string {
  const rootEntrypoint = new URL(rootEntrypointUri);
  const artifact = new URL(artifactUri);
  const separator = rootEntrypoint.pathname.lastIndexOf("/");
  const root = rootEntrypoint.pathname.slice(0, separator);
  if (rootEntrypoint.protocol !== "https:"
    || artifact.protocol !== "https:"
    || rootEntrypoint.username
    || rootEntrypoint.password
    || artifact.username
    || artifact.password
    || rootEntrypoint.origin !== artifact.origin
    || rootEntrypoint.search
    || rootEntrypoint.hash
    || artifact.search
    || artifact.hash
    || !artifact.pathname.startsWith(`${root}/`)) {
    throw new TypeError(`${label} must share one immutable HTTPS version root.`);
  }
  const encodedSegments = artifact.pathname.slice(root.length + 1).split("/");
  if (encodedSegments.some((segment) => segment.length === 0)) {
    throw new TypeError(`${label} must identify a file below the immutable version root.`);
  }
  try {
    const segments = encodedSegments.map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
      || segment.includes("\0"))) {
      throw new TypeError(`${label} contains an unsafe path segment.`);
    }
    return segments.join("/");
  } catch (cause) {
    if (cause instanceof TypeError && cause.message.includes("unsafe path segment")) throw cause;
    throw new TypeError(`${label} contains invalid path encoding.`, { cause });
  }
}

function modulePathFromManifestUri(manifestUri: string, moduleUri: string): string {
  return relativePathWithinVersionRoot(manifestUri, moduleUri, "Shader module URI");
}

async function descriptor(input: {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly role: AssetFileRole;
  readonly moduleId?: string;
}): Promise<AssetFileDescriptor> {
  return createAssetFileDescriptor({
    path: input.path,
    byteLength: input.bytes.byteLength,
    sha256: await computeSha256(input.bytes),
    contentType: input.contentType,
    role: input.role,
    ...(input.moduleId === undefined ? {} : { moduleId: input.moduleId }),
  });
}

function createDeadline(parent: AbortSignal | undefined, timeoutMs: number | undefined): {
  readonly signal: AbortSignal;
  readonly assertActive: () => void;
  readonly dispose: () => void;
} {
  const duration = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_TIMEOUT_MS) {
    throw new TypeError(`Shader admission timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
  }
  const controller = new AbortController();
  const expiresAt = performance.now() + duration;
  const abortFromParent = (): void => controller.abort(new AdmissionAbortedError());
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new AdmissionTimeoutError()), duration);
  return {
    signal: controller.signal,
    assertActive: () => {
      if (!controller.signal.aborted && performance.now() >= expiresAt) {
        controller.abort(new AdmissionTimeoutError());
      }
      if (controller.signal.aborted) throw controller.signal.reason;
    },
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function abortable<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      complete();
    };
    const abort = (): void => finish(() => reject(signal.reason));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    let pending: Promise<T>;
    try {
      pending = Promise.resolve(start());
    } catch (cause) {
      finish(() => reject(cause));
      return;
    }
    pending.then(
      (value) => finish(() => resolve(value)),
      (cause: unknown) => finish(() => reject(cause)),
    );
  });
}

function diagnostic(cause: unknown, stage: ShaderAdmissionStage): ShaderAdmissionDiagnostic {
  let code: ShaderAdmissionDiagnosticCode;
  if (cause instanceof AdmissionTimeoutError) code = "timeout";
  else if (cause instanceof AdmissionAbortedError) code = "aborted";
  else if (stage === "validate-input") code = "invalid-input";
  else if (stage === "verify-stable-webgpu-evidence") code = "matrix-evidence-invalid";
  else if (stage === "verify-evidence-attestation") code = "attestation-invalid";
  else if (stage === "package-immutable-runtime") code = "runtime-package-invalid";
  else if (stage === "revalidate-receipt") code = "receipt-invalid";
  else code = "bundle-admission-failed";
  const messages: Readonly<Record<ShaderAdmissionDiagnosticCode, string>> = {
    "invalid-input": "Shader admission input is invalid.",
    "bundle-admission-failed": "Qualification bundle admission failed.",
    "matrix-evidence-invalid": "Stable WebGPU qualification evidence is invalid or incomplete.",
    "attestation-invalid": "Validation evidence attestation could not be verified.",
    "runtime-package-invalid": "Immutable shader package validation failed.",
    "receipt-invalid": "Shader admission receipt revalidation failed.",
    aborted: "Shader admission was cancelled.",
    timeout: "Shader admission exceeded its bounded timeout.",
  };
  const message = messages[code];
  return Object.freeze({ code, stage, severity: "error", message });
}

function failure(cause: unknown, stage: ShaderAdmissionStage): ShaderAdmissionResult {
  return Object.freeze({
    ok: false as const,
    diagnostics: Object.freeze([diagnostic(cause, stage)]),
  });
}

function moduleBytes(
  admitted: AdmittedQualificationBundle,
  moduleId: string,
): Uint8Array {
  const ref = admitted.manifest.modules.find((candidate) => candidate.moduleId === moduleId);
  const bytes = ref ? admitted.fileBytes.get(ref.path) : undefined;
  if (!ref || !bytes) throw new TypeError(`Admitted shader module ${moduleId} is missing exact bytes.`);
  return bytes;
}

async function buildAssetPackages(input: {
  readonly admitted: AdmittedQualificationBundle;
  readonly shaderManifest: ShaderVersionManifest;
  readonly shaderManifestBytes: Uint8Array;
  readonly shaderManifestUri: string;
  readonly evidence: ShaderValidationEvidence;
  readonly evidenceBytes: Uint8Array;
  readonly evidenceRef: ReturnType<typeof createShaderValidationEvidenceRef>;
  readonly attestationRef: ShaderValidationEvidenceAttestationRef;
  readonly attestationReferenceBytes: Uint8Array;
  readonly attestationBundleBytes: Uint8Array;
  readonly matrixBytes: Uint8Array;
  readonly evidenceAssetVersion: string;
  readonly sourceAdapter: AssetSourceAdapter;
  readonly createdAt: string;
}): Promise<ShaderAdmissionReceipt["assets"]> {
  const interfacePath = input.admitted.manifest.gpuInterfaceManifest.path;
  const interfaceBytes = input.admitted.fileBytes.get(interfacePath);
  if (!interfaceBytes) throw new TypeError("Admitted GPU interface manifest bytes are missing.");
  parseCanonicalJsonBytes(interfaceBytes, "GPU interface manifest");
  const interfaceEntrypoint = relativePathWithinVersionRoot(
    input.shaderManifest.gpuInterface.manifestUri,
    input.shaderManifest.gpuInterface.manifestUri,
    "GPU interface URI",
  );
  const interfaceFile = await descriptor({
    path: interfaceEntrypoint,
    bytes: interfaceBytes,
    contentType: ASSET_JSON_CONTENT_TYPE,
    role: "gpu-interface-manifest",
  });
  const interfaceManifest = createGpuInterfaceAssetManifest({
    assetKind: "gpu-interface",
    assetId: input.admitted.gpuInterface.interfaceId,
    version: input.admitted.gpuInterface.interfaceVersion,
    entrypoint: interfaceEntrypoint,
    files: [interfaceFile],
    sourceAdapter: input.sourceAdapter,
    createdAt: input.createdAt,
    gpuInterfaceManifest: input.admitted.gpuInterface,
  });
  const gpuInterface = await createValidatedGpuAssetPackage(
    interfaceManifest,
    new Map([[interfaceEntrypoint, interfaceBytes]]),
  );

  const shaderEntrypoint = relativePathWithinVersionRoot(
    input.shaderManifestUri,
    input.shaderManifestUri,
    "Shader manifest URI",
  );
  const shaderFiles = new Map<string, Uint8Array>([[shaderEntrypoint, input.shaderManifestBytes]]);
  const shaderDescriptors: AssetFileDescriptor[] = [await descriptor({
    path: shaderEntrypoint,
    bytes: input.shaderManifestBytes,
    contentType: ASSET_JSON_CONTENT_TYPE,
    role: "shader-manifest",
  })];
  for (const module of input.shaderManifest.modules) {
    const bytes = moduleBytes(input.admitted, module.moduleId);
    if (bytes.byteLength !== module.byteLength || await computeSha256(bytes) !== module.sha256) {
      throw new TypeError(`Shader module ${module.moduleId} bytes differ after admission.`);
    }
    const path = modulePathFromManifestUri(input.shaderManifestUri, module.uri);
    if (shaderFiles.has(path)) throw new TypeError(`Shader runtime package path ${path} is duplicated.`);
    shaderFiles.set(path, bytes);
    shaderDescriptors.push(await descriptor({
      path,
      bytes,
      contentType: ASSET_WGSL_CONTENT_TYPE,
      role: "wgsl",
      moduleId: module.moduleId,
    }));
  }
  const shaderManifest = createShaderAssetManifest({
    assetKind: "shader",
    assetId: input.shaderManifest.shaderId,
    version: input.shaderManifest.version,
    entrypoint: shaderEntrypoint,
    files: shaderDescriptors,
    sourceAdapter: input.sourceAdapter,
    createdAt: input.createdAt,
    shaderManifest: input.shaderManifest,
  });
  const shader = await createValidatedGpuAssetPackage(shaderManifest, shaderFiles);

  const evidenceEntrypoint = relativePathWithinVersionRoot(
    input.evidenceRef.uri,
    input.evidenceRef.uri,
    "Validation evidence URI",
  );
  const attestationPath = relativePathWithinVersionRoot(
    input.evidenceRef.uri,
    input.evidenceRef.attestationRef.uri,
    "Validation evidence attestation URI",
  );
  if (input.attestationRef.evidence.name !== evidenceEntrypoint.split("/").at(-1)) {
    throw new TypeError("Attestation evidence filename differs from the evidence URI.");
  }
  const attestationBundlePath = `qualification/${input.attestationRef.attestation.bundle.name}`;
  const inventoryBytes = canonicalBytes(input.admitted.manifest.inventory);
  const evidenceFiles = new Map<string, Uint8Array>([
    [evidenceEntrypoint, input.evidenceBytes],
    [attestationPath, input.attestationReferenceBytes],
    [attestationBundlePath, input.attestationBundleBytes],
    [MATRIX_PATH, input.matrixBytes],
    [INVENTORY_PATH, inventoryBytes],
  ]);
  if (evidenceFiles.size !== 5) throw new TypeError("Evidence package paths must be distinct.");
  const evidenceDescriptors = await Promise.all([
    descriptor({ path: evidenceEntrypoint, bytes: input.evidenceBytes, contentType: ASSET_JSON_CONTENT_TYPE, role: "shader-validation-evidence" }),
    descriptor({ path: attestationPath, bytes: input.attestationReferenceBytes, contentType: ASSET_JSON_CONTENT_TYPE, role: "shader-validation-attestation" }),
    descriptor({ path: attestationBundlePath, bytes: input.attestationBundleBytes, contentType: ATTESTATION_BUNDLE_CONTENT_TYPE, role: "metadata" }),
    descriptor({ path: MATRIX_PATH, bytes: input.matrixBytes, contentType: ASSET_JSON_CONTENT_TYPE, role: "shader-matrix" }),
    descriptor({ path: INVENTORY_PATH, bytes: inventoryBytes, contentType: ASSET_JSON_CONTENT_TYPE, role: "shader-compile-unit-inventory" }),
  ]);
  if (await computeSha256(inventoryBytes) !== input.evidence.subject.compileUnitInventorySha256) {
    throw new TypeError("Packaged compile-unit inventory digest differs from validation evidence.");
  }
  const evidenceManifest = createShaderValidationEvidenceAssetManifest({
    assetKind: "shader-validation-evidence",
    assetId: input.evidence.evidenceId,
    version: input.evidenceAssetVersion,
    entrypoint: evidenceEntrypoint,
    files: evidenceDescriptors,
    sourceAdapter: input.sourceAdapter,
    createdAt: input.createdAt,
    validationEvidence: input.evidenceRef,
  });
  const evidence = await createValidatedGpuAssetPackage(evidenceManifest, evidenceFiles);
  return Object.freeze({ gpuInterface, shader, evidence });
}

/**
 * Admits exact qualification bytes and produces only fully verified immutable
 * GPU assets. It never accepts caller-authored layouts, ABI hashes, or pass flags.
 */
export async function admitShaderQualification(input: ShaderAdmissionInput): Promise<ShaderAdmissionResult> {
  let stage: ShaderAdmissionStage = "validate-input";
  let deadline: ReturnType<typeof createDeadline> | undefined;
  try {
    if (typeof input !== "object" || input === null) throw new TypeError("Shader admission input must be an object.");
    const sourceArchiveInput = assertBytes(input.sourceArchiveBytes, "sourceArchiveBytes", MAX_SOURCE_ARCHIVE_BYTES);
    const matrixInput = assertBytes(input.matrixBytes, "matrixBytes", MAX_JSON_ARTIFACT_BYTES);
    const evidenceInput = assertBytes(input.validationEvidenceBytes, "validationEvidenceBytes", MAX_JSON_ARTIFACT_BYTES);
    const attestationReferenceInput = assertBytes(input.attestationReferenceBytes, "attestationReferenceBytes", MAX_JSON_ARTIFACT_BYTES);
    const attestationBundleInput = assertBytes(input.attestationBundleBytes, "attestationBundleBytes", MAX_JSON_ARTIFACT_BYTES);
    const aggregateInputBytes = sourceArchiveInput.byteLength
      + matrixInput.byteLength
      + evidenceInput.byteLength
      + attestationReferenceInput.byteLength
      + attestationBundleInput.byteLength;
    if (!Number.isSafeInteger(aggregateInputBytes) || aggregateInputBytes > MAX_AGGREGATE_INPUT_BYTES) {
      throw new TypeError("Shader admission artifacts exceed the aggregate byte budget.");
    }
    const evidenceAssetVersion = assertAssetVersion(input.evidenceAssetVersion);
    const createdAt = assertTimestamp(input.createdAt, "createdAt");
    const validationEvidenceUri = input.validationEvidenceUri;
    const attestationReferenceUri = input.attestationReferenceUri;
    const shaderManifestUri = input.shaderManifestUri;
    const sourceAdapter = input.sourceAdapter;
    const materializeQualificationBundle = input.materializeQualificationBundle;
    const verifyCryptographicBundle = input.verifyCryptographicBundle;
    if (typeof materializeQualificationBundle !== "function") {
      throw new TypeError("materializeQualificationBundle is required.");
    }
    if (typeof verifyCryptographicBundle !== "function") {
      throw new TypeError("verifyCryptographicBundle is required.");
    }
    if (!isAssetSourceAdapter(sourceAdapter)) {
      throw new TypeError("sourceAdapter is not supported.");
    }
    relativePathWithinVersionRoot(validationEvidenceUri, validationEvidenceUri, "Validation evidence URI");
    relativePathWithinVersionRoot(attestationReferenceUri, attestationReferenceUri, "Attestation reference URI");
    relativePathWithinVersionRoot(shaderManifestUri, shaderManifestUri, "Shader manifest URI");
    deadline = createDeadline(input.signal, input.timeoutMs);
    const admissionSignal = deadline.signal;
    stage = "assemble-final-wgsl";
    deadline.assertActive();
    const sourceArchiveBytes = copyBytes(sourceArchiveInput);
    const matrixBytes = copyBytes(matrixInput);
    const evidenceBytes = copyBytes(evidenceInput);
    const attestationReferenceBytes = copyBytes(attestationReferenceInput);
    const attestationBundleBytes = copyBytes(attestationBundleInput);
    deadline.assertActive();
    const dataBundleSha256 = await abortable(() => computeSha256(sourceArchiveBytes), admissionSignal);
    deadline.assertActive();
    const materialization = await abortable(() => materializeQualificationBundle({
      sourceArchiveBytes,
      sourceArchiveSha256: dataBundleSha256,
      signal: admissionSignal,
    }), admissionSignal);
    const retainedArchiveSha256 = await abortable(() => computeSha256(sourceArchiveBytes), admissionSignal);
    const qualificationBundleDirectory = materialization?.directory;
    if (typeof qualificationBundleDirectory !== "string"
      || qualificationBundleDirectory.trim().length === 0
      || materialization.sourceArchiveSha256 !== dataBundleSha256
      || retainedArchiveSha256 !== dataBundleSha256) {
      throw new TypeError("Trusted qualification materialization does not bind the exact source archive.");
    }
    const nodeTools = await abortable(() => import("@plasius/gpu-shader/node"), admissionSignal);
    const admitted = await abortable(
      () => nodeTools.admitQualificationBundle(qualificationBundleDirectory),
      admissionSignal,
    );
    const plan = createShaderAdmissionPlan(admitted.shaderManifestCore.shaderId, admitted.shaderManifestCore.version);

    stage = "reflect-gpu-interface";
    const interfaceBytes = admitted.fileBytes.get(admitted.manifest.gpuInterfaceManifest.path);
    if (!interfaceBytes) throw new TypeError("Admitted GPU interface manifest bytes are missing.");
    parseCanonicalJsonBytes(interfaceBytes, "GPU interface manifest");
    const exactInterfaceRef = await abortable(() => createGpuInterfaceRef({
      manifest: admitted.gpuInterface,
      manifestBytes: interfaceBytes,
      manifestUri: admitted.shaderManifestCore.gpuInterface.manifestUri,
    }), admissionSignal);
    if (canonicalizeGpuContract(exactInterfaceRef) !== canonicalizeGpuContract(admitted.shaderManifestCore.gpuInterface)) {
      throw new TypeError("Shader core GPU interface reference differs from regenerated exact bytes.");
    }

    stage = "generate-gpu-artifacts";
    const generatedInterfaceArtifacts = Object.freeze({
      ...nodeTools.generateGpuInterfaceArtifacts(admitted.gpuInterface),
    });

    stage = "validate-model-fixtures";
    if (admitted.modelFixtures.size === 0) {
      throw new TypeError("Stored shaders require at least one admitted model compatibility fixture.");
    }

    stage = "verify-stable-webgpu-evidence";
    const testingTools = await abortable(() => import("@plasius/gpu-shader/testing"), admissionSignal);
    const matrixValue = parseCanonicalJsonBytes(matrixBytes, "Stable WebGPU matrix");
    const parsedMatrix = testingTools.validateStableWebGpuMatrix(matrixValue);
    if (!parsedMatrix.ok) throw new TypeError(parsedMatrix.diagnostics.map((item) => item.message).join("; "));
    const evidenceValue = parseCanonicalJsonBytes(evidenceBytes, "Shader validation evidence");
    const validatedEvidence = await abortable(() => testingTools.validateShaderValidationEvidence({
      evidence: evidenceValue,
      bundle: admitted.manifest,
      matrix: parsedMatrix.value,
      matrixBytes,
      dataBundleSha256,
      requirePassed: true,
    }), admissionSignal);
    if (!validatedEvidence.ok) {
      throw new TypeError(validatedEvidence.diagnostics.map((item) => item.message).join("; "));
    }
    const evidence = validatedEvidence.value;
    if (Date.parse(createdAt) < Date.parse(evidence.generatedAt)) {
      throw new TypeError("Asset creation timestamp cannot predate validation evidence.");
    }

    stage = "verify-evidence-attestation";
    const attestationRefValue = parseCanonicalJsonBytes(attestationReferenceBytes, "Evidence attestation reference");
    const verifiedAttestation = await abortable(() => testingTools.verifyShaderValidationEvidenceAttestation({
      ref: attestationRefValue,
      evidenceBytes,
      bundleBytes: attestationBundleBytes,
      verifyCryptographicBundle: async (context) => {
        const verified = await abortable(() => verifyCryptographicBundle({
          ref: cloneCanonicalJson(context.ref),
          evidenceBytes: copyBytes(context.evidenceBytes),
          bundleBytes: copyBytes(context.bundleBytes),
          signal: admissionSignal,
        }), admissionSignal);
        return verified === true;
      },
    }), admissionSignal);
    if (!verifiedAttestation.ok) {
      throw new TypeError(verifiedAttestation.diagnostics.map((item) => item.message).join("; "));
    }
    const attestationRef = verifiedAttestation.value;
    const [evidenceSha256, attestationReferenceSha256] = await abortable(() => Promise.all([
      computeSha256(evidenceBytes),
      computeSha256(attestationReferenceBytes),
    ]), admissionSignal);
    const evidenceRef = createShaderValidationEvidenceRef({
      evidenceId: evidence.evidenceId,
      uri: validationEvidenceUri,
      sha256: evidenceSha256,
      matrixId: evidence.matrixRef.matrixId,
      matrixVersion: evidence.matrixRef.version,
      matrixSha256: evidence.matrixRef.sha256,
      attestationRef: {
        uri: attestationReferenceUri,
        sha256: attestationReferenceSha256,
      },
    });

    stage = "package-immutable-runtime";
    const shaderManifest = parseShaderVersionManifest({
      ...admitted.shaderManifestCore,
      validationEvidence: evidenceRef,
      additionalValidationEvidence: [],
    });
    const shaderManifestBytes = canonicalBytes(shaderManifest);
    const shaderRef = await abortable(() => createShaderVersionRef({
      manifest: shaderManifest,
      manifestBytes: shaderManifestBytes,
      manifestUri: shaderManifestUri,
    }), admissionSignal);
    const shaderManifestCoreSha256 = await abortable(
      () => computeShaderManifestCoreSha256(shaderManifest),
      admissionSignal,
    );
    if (shaderManifestCoreSha256 !== admitted.manifest.subject.shaderManifestCore.sha256) {
      throw new TypeError("Final shader manifest core digest differs from the qualified subject.");
    }
    const assets = await abortable(() => buildAssetPackages({
      admitted,
      shaderManifest,
      shaderManifestBytes,
      shaderManifestUri,
      evidence,
      evidenceBytes,
      evidenceRef,
      attestationRef,
      attestationReferenceBytes,
      attestationBundleBytes,
      matrixBytes,
      evidenceAssetVersion,
      sourceAdapter,
      createdAt,
    }), admissionSignal);
    const qualification = Object.freeze({
      evidenceId: evidence.evidenceId,
      generatedAt: evidence.generatedAt,
      dataBundleSha256,
      shaderManifestCoreSha256,
      interfaceManifestSha256: admitted.manifest.subject.interfaceManifestSha256,
      compileUnitInventorySha256: admitted.manifest.subject.compileUnitInventorySha256,
      subjectBindingSha256: evidence.subjectBindingSha256,
      matrixId: evidence.matrixRef.matrixId,
      matrixVersion: evidence.matrixRef.version,
      matrixSha256: evidence.matrixRef.sha256,
      requiredCompileUnitIds: Object.freeze([...admitted.manifest.subject.requiredCompileUnitIds]),
      requiredCellIds: Object.freeze([...admitted.manifest.subject.requiredCellIds]),
      moduleDigests: Object.freeze(admitted.manifest.subject.modules.map((module) => Object.freeze({ ...module }))),
      modelAbiHashes: Object.freeze([...admitted.manifest.subject.modelAbiHashes]),
      compileUnits: evidence.counts.compileUnits,
      cells: evidence.counts.cells,
      expectedResults: evidence.counts.expectedResults,
      passedResults: evidence.counts.passedResults,
    });
    const receipt = Object.freeze({
      contractVersion: SHADER_ADMISSION_CONTRACT_VERSION,
      plan,
      shaderId: shaderManifest.shaderId,
      version: shaderManifest.version,
      modelAbiHash: admitted.gpuInterface.modelAbiHash,
      shaderAbiHash: shaderManifest.shaderAbiHash,
      gpuInterface: exactInterfaceRef,
      shader: shaderRef,
      generatedInterfaceArtifacts,
      qualification,
      assets,
    });
    deadline.assertActive();
    receiptProofs.set(receipt, Object.freeze({
      bundle: admitted.manifest,
      matrix: parsedMatrix.value,
      matrixBytes: copyBytes(matrixBytes),
      evidence,
      evidenceBytes: copyBytes(evidenceBytes),
      attestationRef,
      attestationReferenceBytes: copyBytes(attestationReferenceBytes),
      attestationBundleBytes: copyBytes(attestationBundleBytes),
      dataBundleSha256,
    }));
    return Object.freeze({ ok: true as const, value: receipt });
  } catch (cause) {
    return failure(cause, stage);
  } finally {
    deadline?.dispose();
  }
}

/** Replays evidence, attestation, core-digest, and asset-byte gates for an in-memory receipt. */
export async function revalidateShaderAdmissionReceipt(
  input: RevalidateShaderAdmissionReceiptInput,
): Promise<ShaderAdmissionResult> {
  let deadline: ReturnType<typeof createDeadline> | undefined;
  try {
    if (typeof input !== "object" || input === null || typeof input.verifyCryptographicBundle !== "function") {
      throw new TypeError("Receipt revalidation input and cryptographic verifier are required.");
    }
    const proof = receiptProofs.get(input.receipt);
    if (!proof) throw new TypeError("Shader admission receipt was not created by this module instance.");
    deadline = createDeadline(input.signal, input.timeoutMs);
    await abortable(() => Promise.all([
      validateGpuAssetFiles({ manifest: input.receipt.assets.gpuInterface.manifest, files: input.receipt.assets.gpuInterface.copyFiles() }),
      validateGpuAssetFiles({ manifest: input.receipt.assets.shader.manifest, files: input.receipt.assets.shader.copyFiles() }),
      validateGpuAssetFiles({ manifest: input.receipt.assets.evidence.manifest, files: input.receipt.assets.evidence.copyFiles() }),
    ]), deadline.signal);
    const testingTools = await abortable(() => import("@plasius/gpu-shader/testing"), deadline.signal);
    const matrix = testingTools.validateStableWebGpuMatrix(
      parseCanonicalJsonBytes(proof.matrixBytes, "Retained stable WebGPU matrix"),
    );
    if (!matrix.ok) throw new TypeError(matrix.diagnostics.map((item) => item.message).join("; "));
    if (canonicalizeGpuContract(matrix.value) !== canonicalizeGpuContract(proof.matrix)) {
      throw new TypeError("Retained matrix differs from the admitted matrix.");
    }
    const evidenceValue = parseCanonicalJsonBytes(proof.evidenceBytes, "Retained validation evidence");
    const evidence = await abortable(() => testingTools.validateShaderValidationEvidence({
      evidence: evidenceValue,
      bundle: proof.bundle,
      matrix: matrix.value,
      matrixBytes: proof.matrixBytes,
      dataBundleSha256: proof.dataBundleSha256,
      requirePassed: true,
    }), deadline.signal);
    if (!evidence.ok) throw new TypeError(evidence.diagnostics.map((item) => item.message).join("; "));
    if (canonicalizeGpuContract(evidence.value) !== canonicalizeGpuContract(proof.evidence)) {
      throw new TypeError("Retained evidence differs from the admitted evidence.");
    }
    const attestationValue = parseCanonicalJsonBytes(
      proof.attestationReferenceBytes,
      "Retained attestation reference",
    );
    const attestation = await abortable(() => testingTools.verifyShaderValidationEvidenceAttestation({
      ref: attestationValue,
      evidenceBytes: proof.evidenceBytes,
      bundleBytes: proof.attestationBundleBytes,
      verifyCryptographicBundle: async (context) => {
        const verified = await abortable(() => input.verifyCryptographicBundle({
          ref: cloneCanonicalJson(context.ref),
          evidenceBytes: copyBytes(context.evidenceBytes),
          bundleBytes: copyBytes(context.bundleBytes),
          signal: deadline!.signal,
        }), deadline!.signal);
        return verified === true;
      },
    }), deadline.signal);
    if (!attestation.ok) throw new TypeError(attestation.diagnostics.map((item) => item.message).join("; "));
    if (canonicalizeGpuContract(attestation.value) !== canonicalizeGpuContract(proof.attestationRef)) {
      throw new TypeError("Retained attestation reference differs from the admitted reference.");
    }
    const coreHash = await abortable(
      () => computeShaderManifestCoreSha256(input.receipt.assets.shader.manifest.shaderManifest),
      deadline.signal,
    );
    if (coreHash !== input.receipt.qualification.shaderManifestCoreSha256
      || coreHash !== proof.bundle.subject.shaderManifestCore.sha256
      || input.receipt.qualification.subjectBindingSha256 !== evidence.value.subjectBindingSha256
      || input.receipt.qualification.passedResults !== evidence.value.counts.expectedResults) {
      throw new TypeError("Shader admission receipt proof fields are stale or incomplete.");
    }
    deadline.assertActive();
    return Object.freeze({ ok: true as const, value: input.receipt });
  } catch (cause) {
    return failure(cause, "revalidate-receipt");
  } finally {
    deadline?.dispose();
  }
}
