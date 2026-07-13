import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@plasius/gpu-shader/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plasius/gpu-shader/node")>();
  return { ...actual, admitQualificationBundle: vi.fn() };
});

vi.mock("@plasius/gpu-shader/testing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plasius/gpu-shader/testing")>();
  return {
    ...actual,
    validateStableWebGpuMatrix: vi.fn(),
    validateShaderValidationEvidence: vi.fn(),
    verifyShaderValidationEvidenceAttestation: vi.fn(),
  };
});

import {
  SHADER_COMPILE_UNIT_VERSION,
  SHADER_VALIDATION_EVIDENCE_VERSION,
  SHADER_VERSION_MANIFEST_VERSION,
  SUPPORTED_STABLE_WEBGPU_MATRIX_POLICIES,
  canonicalizeGpuContract,
  computeGpuAbiHash,
  computeSha256,
  computeShaderManifestCoreSha256,
} from "@plasius/gpu-shader";
import type {
  GpuInterfaceManifest,
  GpuInterfaceRef,
  SerializableGpuComputePipelineDescriptor,
  ShaderQualificationBundleManifest,
  ShaderValidationEvidence,
  ShaderValidationEvidenceAttestationRef,
  ShaderVersionManifestCore,
  Sha256Hex,
  StableWebGpuMatrixManifest,
} from "@plasius/gpu-shader";
import {
  admitQualificationBundle,
  reflectGpuInterface,
} from "@plasius/gpu-shader/node";
import {
  validateShaderValidationEvidence,
  validateStableWebGpuMatrix,
  verifyShaderValidationEvidenceAttestation,
} from "@plasius/gpu-shader/testing";
import {
  admitShaderQualification,
  createValidatedGpuAssetPackage,
  isTrustedShaderAdmissionReceipt,
  revalidateShaderAdmissionReceipt,
} from "../src/shader-admission.js";
import type {
  ShaderAdmissionInput,
  ShaderAdmissionReceipt,
} from "../src/shader-admission.js";

const WGSL = `
struct ModelData {
  value: vec4f,
}

@group(0) @binding(0) var<storage, read_write> model: ModelData;

@compute @workgroup_size(1)
fn main() {
  model.value.x = model.value.x + 1.0;
}
`.trim();

const pipeline: SerializableGpuComputePipelineDescriptor = {
  kind: "compute",
  pipelineId: "model-compute",
  layout: {
    bindGroups: [{
      group: 0,
      entries: [{
        group: 0,
        binding: 0,
        resource: {
          kind: "buffer",
          addressSpace: "storage",
          access: "read_write",
          recordName: "ModelData",
          minimumBindingSize: 16,
        },
        visibility: ["compute"],
      }],
    }],
  },
  compute: { moduleId: "compute", entryPoint: "main", constants: {} },
};

interface AdmissionFixture {
  readonly admitted: Awaited<ReturnType<typeof import("@plasius/gpu-shader/node")["admitQualificationBundle"]>>;
  readonly matrix: StableWebGpuMatrixManifest;
  readonly matrixBytes: Uint8Array;
  readonly evidence: ShaderValidationEvidence;
  readonly evidenceBytes: Uint8Array;
  readonly attestationRef: ShaderValidationEvidenceAttestationRef;
  readonly attestationReferenceBytes: Uint8Array;
  readonly attestationBundleBytes: Uint8Array;
  readonly input: ShaderAdmissionInput;
}

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(canonicalizeGpuContract(value));

async function createFixture(): Promise<AdmissionFixture> {
  const gpuInterface: GpuInterfaceManifest = await reflectGpuInterface({
    interfaceId: "model-interface",
    interfaceVersion: "1.0.0",
    modules: [{ moduleId: "compute", source: WGSL }],
    pipelines: [pipeline],
    modelFacingRecordNames: ["ModelData"],
    modelFacingBindings: [{ moduleId: "compute", group: 0, binding: 0, semantic: "model.data" }],
    semantics: [{
      semantic: "model.data",
      source: { kind: "binding", moduleId: "compute", group: 0, binding: 0 },
    }],
  });
  const interfaceBytes = encode(gpuInterface);
  const interfaceSha256 = await computeSha256(interfaceBytes);
  const gpuInterfaceRef: GpuInterfaceRef = {
    interfaceId: gpuInterface.interfaceId,
    interfaceVersion: gpuInterface.interfaceVersion,
    manifestUri: "https://assets.example.invalid/interfaces/model-interface/1.0.0/interface.json",
    manifestSha256: interfaceSha256,
    interfaceAbiHash: gpuInterface.interfaceAbiHash,
    modelAbiHash: gpuInterface.modelAbiHash,
  };
  const moduleBytes = new TextEncoder().encode(WGSL);
  const moduleSha256 = await computeSha256(moduleBytes);
  const requirements = {
    semantics: ["model.data"],
    features: [],
    limits: [
      { name: "maxBindGroups", comparator: "at-least" as const, value: 1 },
      { name: "maxBindingsPerBindGroup", comparator: "at-least" as const, value: 1 },
      { name: "maxComputeWorkgroupSizeX", comparator: "at-least" as const, value: 1 },
      { name: "maxComputeWorkgroupSizeY", comparator: "at-least" as const, value: 1 },
      { name: "maxComputeWorkgroupSizeZ", comparator: "at-least" as const, value: 1 },
      { name: "maxComputeInvocationsPerWorkgroup", comparator: "at-least" as const, value: 1 },
      { name: "maxStorageBuffersPerShaderStage", comparator: "at-least" as const, value: 1 },
      { name: "maxStorageBufferBindingSize", comparator: "at-least" as const, value: 16 },
    ],
    formats: [],
  };
  const shaderAbiHash = await computeGpuAbiHash({
    kind: "shader",
    interface: gpuInterface,
    pipelines: [pipeline],
    requirements,
  });
  const shaderManifestCore: ShaderVersionManifestCore = {
    contractVersion: SHADER_VERSION_MANIFEST_VERSION,
    shaderId: "shader-cartoon",
    version: "1.0.0",
    modules: [{
      moduleId: "compute",
      uri: "https://assets.example.invalid/shaders/shader-cartoon/1.0.0/modules/compute.wgsl",
      byteLength: moduleBytes.byteLength,
      sha256: moduleSha256,
      contentType: "text/wgsl; charset=utf-8",
    }],
    gpuInterface: gpuInterfaceRef,
    pipelines: [pipeline],
    renderRoles: [{ role: "material", pipelineIds: [pipeline.pipelineId] }],
    compatibleModelInterfaces: [{
      interfaceId: gpuInterface.interfaceId,
      interfaceVersion: gpuInterface.interfaceVersion,
      manifestSha256: interfaceSha256,
      interfaceAbiHash: gpuInterface.interfaceAbiHash,
      modelAbiHash: gpuInterface.modelAbiHash,
    }],
    requirements,
    shaderAbiHash,
  };
  const inventory = {
    contractVersion: SHADER_COMPILE_UNIT_VERSION,
    inventoryId: "shader-cartoon",
    version: "1.0.0",
    repository: "Example-Org/shader-cartoon",
    fragments: [],
    compileUnits: [],
  };
  const inventorySha256 = await computeSha256(canonicalizeGpuContract(inventory));
  const coreSha256 = await computeShaderManifestCoreSha256(shaderManifestCore);
  const policy = SUPPORTED_STABLE_WEBGPU_MATRIX_POLICIES[0];
  if (!policy) throw new Error("Stable policy fixture is unavailable.");
  const matrix = {
    contractVersion: "1.0.0",
    matrixId: policy.matrixId,
    version: policy.matrixVersion,
    policy: {
      coverage: "all-cells-required",
      unavailable: "fail",
      skipped: "fail",
      timeout: "fail",
      deviceLoss: "fail",
      requiredPhysicalCellCount: 15,
      requiredBlockingCellCount: 16,
    },
    cells: [],
  } as StableWebGpuMatrixManifest;
  const matrixBytes = encode(matrix);
  const sourceArchiveBytes = Uint8Array.from([1, 2, 3, 4]);
  const dataBundleSha256 = await computeSha256(sourceArchiveBytes);
  const bundle = {
    contractVersion: "1.0.0",
    inventory,
    subject: {
      shaderManifestCore: {
        shaderId: shaderManifestCore.shaderId,
        version: shaderManifestCore.version,
        sha256: coreSha256,
      },
      compileUnitInventorySha256: inventorySha256,
      shaderAbiHash,
      interfaceManifestSha256: interfaceSha256,
      modelAbiHashes: [gpuInterface.modelAbiHash],
      modules: [{ moduleId: "compute", sha256: moduleSha256 }],
      requiredCompileUnitIds: ["shader-cartoon-main"],
      requiredCellIds: ["ubuntu-swiftshader-chromium"],
    },
    shaderManifestCorePath: "shader-core.json",
    gpuInterfaceManifest: { path: "interface.json", sha256: interfaceSha256 },
    modelCompatibilityFixtures: [],
    modules: [{ moduleId: "compute", path: "compute.wgsl", sha256: moduleSha256 }],
    fixtures: [],
  } as unknown as ShaderQualificationBundleManifest;
  const evidence = {
    contractVersion: SHADER_VALIDATION_EVIDENCE_VERSION,
    evidenceId: "qualification-cartoon",
    status: "passed",
    generatedAt: "2026-07-13T11:00:00.000Z",
    subjectBindingSha256: "9".repeat(64) as Sha256Hex,
    subject: { ...bundle.subject, dataBundleSha256 },
    matrixRef: {
      matrixId: policy.matrixId,
      version: policy.matrixVersion,
      sha256: policy.matrixSha256 as Sha256Hex,
    },
    toolchain: {
      packageVersion: "0.1.0",
      reflectorVersion: "1.5.0",
      harness: { id: "trusted-harness", version: "1.0.0", sha256: "8".repeat(64) as Sha256Hex },
    },
    qualificationPreflightProvenance: {},
    counts: { compileUnits: 1, cells: 16, expectedResults: 16, passedResults: 16 },
    cellRuns: [],
    results: [],
  } as unknown as ShaderValidationEvidence;
  const evidenceBytes = encode(evidence);
  const attestationBundleBytes = new TextEncoder().encode("{\"bundle\":true}");
  const attestationRef = {
    contractVersion: SHADER_VALIDATION_EVIDENCE_VERSION,
    kind: "shader-validation-evidence-attestation-ref",
    evidence: { name: "evidence.json", sha256: await computeSha256(evidenceBytes) },
    attestation: {
      id: "attestation-cartoon",
      url: "https://github.com/Example-Org/shader-cartoon/attestations/123",
      bundle: { name: "attestation-bundle.json", sha256: await computeSha256(attestationBundleBytes) },
    },
    producer: {
      repository: "Example-Org/shader-cartoon",
      runId: "123",
      runAttempt: 1,
      trustedWorkflowRepository: "Example-Org/gpu-shader",
      trustedWorkflowRef: "Example-Org/gpu-shader/.github/workflows/qualify.yml@refs/tags/v0.1.0",
      trustedWorkflowSha: "7".repeat(40),
    },
  } as unknown as ShaderValidationEvidenceAttestationRef;
  const attestationReferenceBytes = encode(attestationRef);
  const admitted = {
    root: "/trusted/extraction",
    manifest: bundle,
    shaderManifestCore,
    fixtures: new Map(),
    gpuInterface,
    modelFixtures: new Map([["model-fixture", {}]]),
    fileBytes: new Map([
      ["interface.json", interfaceBytes],
      ["compute.wgsl", moduleBytes],
    ]),
  } as unknown as AdmissionFixture["admitted"];
  return {
    admitted,
    matrix,
    matrixBytes,
    evidence,
    evidenceBytes,
    attestationRef,
    attestationReferenceBytes,
    attestationBundleBytes,
    input: {
      sourceArchiveBytes,
      materializeQualificationBundle: vi.fn(async ({ sourceArchiveSha256 }) => ({
        directory: "/trusted/extraction",
        sourceArchiveSha256,
      })),
      matrixBytes,
      validationEvidenceBytes: evidenceBytes,
      validationEvidenceUri: "https://assets.example.invalid/evidence/qualification-cartoon/1.0.0/evidence.json",
      attestationReferenceBytes,
      attestationReferenceUri: "https://assets.example.invalid/evidence/qualification-cartoon/1.0.0/attestation-ref.json",
      attestationBundleBytes,
      shaderManifestUri: "https://assets.example.invalid/shaders/shader-cartoon/1.0.0/shader.json",
      evidenceAssetVersion: "1.0.0",
      sourceAdapter: "local-import",
      createdAt: "2026-07-13T12:00:00.000Z",
      verifyCryptographicBundle: vi.fn(async () => true),
      timeoutMs: 5_000,
    },
  };
}

const mockedAdmitBundle = vi.mocked(admitQualificationBundle);
const mockedValidateMatrix = vi.mocked(validateStableWebGpuMatrix);
const mockedValidateEvidence = vi.mocked(validateShaderValidationEvidence);
const mockedVerifyAttestation = vi.mocked(verifyShaderValidationEvidenceAttestation);

function installSuccessfulToolchain(fixture: AdmissionFixture): void {
  mockedAdmitBundle.mockResolvedValue(fixture.admitted);
  mockedValidateMatrix.mockReturnValue({ ok: true, value: fixture.matrix });
  mockedValidateEvidence.mockResolvedValue({ ok: true, value: fixture.evidence });
  mockedVerifyAttestation.mockImplementation(async (input) => {
    const verified = await input.verifyCryptographicBundle({
      ref: fixture.attestationRef,
      evidenceBytes: input.evidenceBytes,
      bundleBytes: input.bundleBytes,
    });
    return verified
      ? { ok: true, value: fixture.attestationRef }
      : { ok: false, diagnostics: [{ code: "invalid-contract", severity: "error", message: "External build-provenance cryptographic verification failed." }] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WGSL shader admission flow", () => {
  it("returns defensive, digest-validated interface, shader, and evidence packages", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const expectedArchiveBytes = fixture.input.sourceArchiveBytes.slice();
    const expectedArchiveSha256 = await computeSha256(expectedArchiveBytes);

    const result = await admitShaderQualification(fixture.input);

    expect(result.ok, result.ok ? undefined : JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(isTrustedShaderAdmissionReceipt(result.value)).toBe(true);
    expect(result.value.qualification).toMatchObject({
      evidenceId: "qualification-cartoon",
      compileUnits: 1,
      cells: 16,
      expectedResults: 16,
      passedResults: 16,
    });
    expect(result.value.assets.gpuInterface.manifest.assetKind).toBe("gpu-interface");
    expect(result.value.assets.shader.manifest.assetKind).toBe("shader");
    expect(result.value.assets.evidence.manifest.assetKind).toBe("shader-validation-evidence");
    expect(result.value.assets.shader.filePaths).toEqual(["shader.json", "modules/compute.wgsl"]);
    expect(result.value.assets.evidence.filePaths).toEqual([
      "evidence.json",
      "attestation-ref.json",
      "qualification/attestation-bundle.json",
      "qualification/matrix.json",
      "qualification/compile-unit-inventory.json",
    ]);
    expect(result.value.assets.evidence.filePaths).not.toContain("qualification/source-bundle");
    expect(result.value.generatedInterfaceArtifacts.jsonSchemas).toContain("ModelData");
    expect(result.value.qualification.dataBundleSha256).toBe(expectedArchiveSha256);

    const materializer = vi.mocked(fixture.input.materializeQualificationBundle);
    expect(materializer).toHaveBeenCalledOnce();
    const materializationInput = materializer.mock.calls[0]?.[0];
    expect(materializationInput).toBeDefined();
    expect(materializationInput?.sourceArchiveBytes).toEqual(expectedArchiveBytes);
    expect(materializationInput?.sourceArchiveBytes).not.toBe(fixture.input.sourceArchiveBytes);
    expect(materializationInput?.sourceArchiveSha256).toBe(expectedArchiveSha256);
    expect(materializationInput?.signal).toBeInstanceOf(AbortSignal);
    expect(materializationInput?.signal.aborted).toBe(false);

    expect(mockedAdmitBundle).toHaveBeenCalledExactlyOnceWith("/trusted/extraction");
    expect(mockedValidateMatrix).toHaveBeenCalledExactlyOnceWith(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fixture.matrixBytes)),
    );
    const evidenceValidationInput = mockedValidateEvidence.mock.calls[0]?.[0];
    expect(evidenceValidationInput).toBeDefined();
    expect(evidenceValidationInput?.evidence).toEqual(fixture.evidence);
    expect(evidenceValidationInput?.bundle).toBe(fixture.admitted.manifest);
    expect(evidenceValidationInput?.matrix).toBe(fixture.matrix);
    expect(evidenceValidationInput?.matrixBytes).toEqual(fixture.matrixBytes);
    expect(evidenceValidationInput?.matrixBytes).not.toBe(fixture.input.matrixBytes);
    expect(evidenceValidationInput?.dataBundleSha256).toBe(expectedArchiveSha256);
    expect(evidenceValidationInput?.requirePassed).toBe(true);

    expect(mockedVerifyAttestation).toHaveBeenCalledOnce();
    const attestationValidationInput = mockedVerifyAttestation.mock.calls[0]?.[0];
    expect(attestationValidationInput).toBeDefined();
    expect(attestationValidationInput?.ref).toEqual(fixture.attestationRef);
    expect(attestationValidationInput?.evidenceBytes).toEqual(fixture.evidenceBytes);
    expect(attestationValidationInput?.evidenceBytes).not.toBe(fixture.input.validationEvidenceBytes);
    expect(attestationValidationInput?.bundleBytes).toEqual(fixture.attestationBundleBytes);
    expect(attestationValidationInput?.bundleBytes).not.toBe(fixture.input.attestationBundleBytes);

    const cryptographicVerifier = vi.mocked(fixture.input.verifyCryptographicBundle);
    expect(cryptographicVerifier).toHaveBeenCalledOnce();
    const cryptographicVerificationInput = cryptographicVerifier.mock.calls[0]?.[0];
    expect(cryptographicVerificationInput).toBeDefined();
    expect(cryptographicVerificationInput?.ref).toEqual(fixture.attestationRef);
    expect(cryptographicVerificationInput?.ref).not.toBe(fixture.attestationRef);
    expect(cryptographicVerificationInput?.evidenceBytes).toEqual(fixture.evidenceBytes);
    expect(cryptographicVerificationInput?.evidenceBytes).not.toBe(attestationValidationInput?.evidenceBytes);
    expect(cryptographicVerificationInput?.bundleBytes).toEqual(fixture.attestationBundleBytes);
    expect(cryptographicVerificationInput?.bundleBytes).not.toBe(attestationValidationInput?.bundleBytes);
    expect(cryptographicVerificationInput?.signal).toBe(materializationInput?.signal);

    const firstCopy = result.value.assets.shader.readFile("modules/compute.wgsl");
    expect(firstCopy).toBeDefined();
    firstCopy![0] = 0;
    expect(result.value.assets.shader.readFile("modules/compute.wgsl")?.[0]).not.toBe(0);

    const revalidated = await revalidateShaderAdmissionReceipt({
      receipt: result.value,
      verifyCryptographicBundle: vi.fn(async () => true),
    });
    expect(revalidated).toEqual({ ok: true, value: result.value });
  });

  it("copies Buffer-backed package inputs and outputs without shared memory", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const admission = await admitShaderQualification(fixture.input);
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;
    const bufferFiles = new Map([...admission.value.assets.shader.copyFiles()].map(
      ([path, bytes]) => [path, Buffer.from(bytes)] as const,
    ));
    const validatedPackage = await createValidatedGpuAssetPackage(
      admission.value.assets.shader.manifest,
      bufferFiles,
    );
    const modulePath = "modules/compute.wgsl";
    const expectedModule = new Uint8Array(bufferFiles.get(modulePath)!);

    bufferFiles.get(modulePath)!.fill(0);
    expect(validatedPackage.readFile(modulePath)).toEqual(expectedModule);

    const readCopy = validatedPackage.readFile(modulePath)!;
    readCopy.fill(0);
    expect(validatedPackage.readFile(modulePath)).toEqual(expectedModule);

    const mapCopy = validatedPackage.copyFiles();
    mapCopy.get(modulePath)!.fill(0);
    expect(validatedPackage.readFile(modulePath)).toEqual(expectedModule);
  });

  it.each([
    "Shader module digest differs.",
    "Shader ABI hash differs from regenerated final WGSL.",
    "Model fixture lacks shader-required semantics.",
    "Compile unit lacks a structured layout probe.",
  ])("fails closed when trusted bundle admission rejects: %s", async (message) => {
    const fixture = await createFixture();
    mockedAdmitBundle.mockRejectedValue(new TypeError(message));

    const result = await admitShaderQualification(fixture.input);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "bundle-admission-failed",
        stage: "assemble-final-wgsl",
        message: "Qualification bundle admission failed.",
      }],
    });
    expect(JSON.stringify(result)).not.toContain(message);
  });

  it("rejects a materializer result that does not bind the exact archive digest", async () => {
    const fixture = await createFixture();
    const materializer = vi.fn(async () => ({
      directory: "/trusted/extraction",
      sourceArchiveSha256: "a".repeat(64) as Sha256Hex,
    }));

    const result = await admitShaderQualification({
      ...fixture.input,
      materializeQualificationBundle: materializer,
    });

    expect(materializer).toHaveBeenCalledOnce();
    expect(mockedAdmitBundle).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "bundle-admission-failed", stage: "assemble-final-wgsl" }],
    });
  });

  it("rejects a trusted materializer that mutates the admission-owned archive snapshot", async () => {
    const fixture = await createFixture();
    const materializer = vi.fn(async ({ sourceArchiveBytes, sourceArchiveSha256 }) => {
      sourceArchiveBytes[0] ^= 0xff;
      return { directory: "/trusted/extraction", sourceArchiveSha256 };
    });

    const result = await admitShaderQualification({
      ...fixture.input,
      materializeQualificationBundle: materializer,
    });

    expect(mockedAdmitBundle).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "bundle-admission-failed", stage: "assemble-final-wgsl" }],
    });
  });

  it("fails closed for incomplete, skipped, timed-out, or unavailable matrix evidence", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    mockedValidateEvidence.mockResolvedValue({
      ok: false,
      diagnostics: [{
        code: "invalid-contract",
        severity: "error",
        message: "Evidence does not satisfy the required passed gate.",
      }],
    });

    const result = await admitShaderQualification(fixture.input);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "matrix-evidence-invalid", stage: "verify-stable-webgpu-evidence" }],
    });
  });

  it("fails closed when the versioned stable matrix itself is rejected", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    mockedValidateMatrix.mockReturnValue({
      ok: false,
      diagnostics: [{
        code: "invalid-contract",
        severity: "error",
        message: "Stable matrix is incomplete.",
      }],
    });

    const result = await admitShaderQualification(fixture.input);

    expect(mockedValidateEvidence).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "matrix-evidence-invalid", stage: "verify-stable-webgpu-evidence" }],
    });
  });

  it("rejects a shader-core interface reference that differs from regenerated bytes", async () => {
    const fixture = await createFixture();
    const admitted = {
      ...fixture.admitted,
      shaderManifestCore: {
        ...fixture.admitted.shaderManifestCore,
        gpuInterface: {
          ...fixture.admitted.shaderManifestCore.gpuInterface,
          manifestSha256: "a".repeat(64) as Sha256Hex,
        },
      },
    } as AdmissionFixture["admitted"];
    mockedAdmitBundle.mockResolvedValue(admitted);

    const result = await admitShaderQualification(fixture.input);

    expect(mockedValidateMatrix).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "bundle-admission-failed", stage: "reflect-gpu-interface" }],
    });
  });

  it("rejects an admitted shader with no compatible model fixtures", async () => {
    const fixture = await createFixture();
    mockedAdmitBundle.mockResolvedValue({
      ...fixture.admitted,
      modelFixtures: new Map(),
    } as AdmissionFixture["admitted"]);

    const result = await admitShaderQualification(fixture.input);

    expect(mockedValidateMatrix).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "bundle-admission-failed", stage: "validate-model-fixtures" }],
    });
  });

  it("rejects asset creation metadata that predates its validation evidence", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);

    const result = await admitShaderQualification({
      ...fixture.input,
      createdAt: "2026-07-13T10:59:59.999Z",
    });

    expect(mockedVerifyAttestation).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "matrix-evidence-invalid", stage: "verify-stable-webgpu-evidence" }],
    });
  });

  it("rejects a final shader core digest that differs from the qualified subject", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    mockedAdmitBundle.mockResolvedValue({
      ...fixture.admitted,
      manifest: {
        ...fixture.admitted.manifest,
        subject: {
          ...fixture.admitted.manifest.subject,
          shaderManifestCore: {
            ...fixture.admitted.manifest.subject.shaderManifestCore,
            sha256: "a".repeat(64) as Sha256Hex,
          },
        },
      },
    } as AdmissionFixture["admitted"]);

    const result = await admitShaderQualification(fixture.input);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "runtime-package-invalid", stage: "package-immutable-runtime" }],
    });
  });

  it("rejects source-archive substitution against the evidence subject", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    mockedValidateEvidence.mockImplementation(async (input) => input.dataBundleSha256 === fixture.evidence.subject.dataBundleSha256
      ? { ok: true, value: fixture.evidence }
      : {
          ok: false,
          diagnostics: [{
            code: "invalid-contract",
            severity: "error",
            message: "Qualification data bundle digest is stale.",
          }],
        });

    const result = await admitShaderQualification({
      ...fixture.input,
      sourceArchiveBytes: Uint8Array.from([9, 9, 9, 9]),
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "matrix-evidence-invalid", stage: "verify-stable-webgpu-evidence" }],
    });
  });

  it("rejects non-canonical matrix bytes before trusting validation output", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const input = {
      ...fixture.input,
      matrixBytes: new TextEncoder().encode(`{ "matrixId": "stable-webgpu" }`),
    };

    const result = await admitShaderQualification(input);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "matrix-evidence-invalid", stage: "verify-stable-webgpu-evidence" }],
    });
    expect(mockedValidateMatrix).not.toHaveBeenCalled();
  });

  it("rejects failed cryptographic evidence verification without packaging assets", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const verifier = vi.fn(async () => false);

    const result = await admitShaderQualification({
      ...fixture.input,
      verifyCryptographicBundle: verifier,
    });

    expect(verifier).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "attestation-invalid", stage: "verify-evidence-attestation" }],
    });
  });

  it("requires cryptographic verification to return the boolean true", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const verifier = vi.fn(async () => ({ verified: false }) as unknown as boolean);

    const result = await admitShaderQualification({
      ...fixture.input,
      verifyCryptographicBundle: verifier,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "attestation-invalid", stage: "verify-evidence-attestation" }],
    });
  });

  it("rejects evidence and attestation URIs that do not share one immutable version root", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);

    const result = await admitShaderQualification({
      ...fixture.input,
      attestationReferenceUri: "https://other.example.invalid/evidence/qualification-cartoon/1.0.0/attestation-ref.json",
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: "runtime-package-invalid",
        stage: "package-immutable-runtime",
        severity: "error",
        message: "Immutable shader package validation failed.",
      }],
    });
  });

  it("binds the attested evidence filename to the exact evidence URI path", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);

    const result = await admitShaderQualification({
      ...fixture.input,
      validationEvidenceUri: "https://assets.example.invalid/evidence/qualification-cartoon/1.0.0/renamed-evidence.json",
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "runtime-package-invalid", stage: "package-immutable-runtime" }],
    });
  });

  it("rejects deeply nested canonical contract JSON before invoking a matrix validator", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    let nested: unknown = null;
    for (let depth = 0; depth < 65; depth += 1) nested = { child: nested };

    const result = await admitShaderQualification({
      ...fixture.input,
      matrixBytes: new TextEncoder().encode(canonicalizeGpuContract(nested)),
    });

    expect(mockedValidateMatrix).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "matrix-evidence-invalid", stage: "verify-stable-webgpu-evidence" }],
    });
  });

  it("snapshots Buffer-backed caller bytes and isolates the trusted verifier from retained state", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const bufferBackedInput: ShaderAdmissionInput = {
      ...fixture.input,
      sourceArchiveBytes: Buffer.from(fixture.input.sourceArchiveBytes),
      matrixBytes: Buffer.from(fixture.input.matrixBytes),
      validationEvidenceBytes: Buffer.from(fixture.input.validationEvidenceBytes),
      attestationReferenceBytes: Buffer.from(fixture.input.attestationReferenceBytes),
      attestationBundleBytes: Buffer.from(fixture.input.attestationBundleBytes),
    };
    const expectedArchive = new Uint8Array(bufferBackedInput.sourceArchiveBytes);
    const verifier = vi.fn(async (context: Parameters<ShaderAdmissionInput["verifyCryptographicBundle"]>[0]) => {
      bufferBackedInput.sourceArchiveBytes.fill(0);
      bufferBackedInput.matrixBytes.fill(0);
      bufferBackedInput.validationEvidenceBytes.fill(0);
      bufferBackedInput.attestationReferenceBytes.fill(0);
      bufferBackedInput.attestationBundleBytes.fill(0);
      (context.ref.producer as { repository: string }).repository = "Untrusted-LTD/changed";
      return true;
    });

    const result = await admitShaderQualification({
      ...bufferBackedInput,
      verifyCryptographicBundle: verifier,
    });

    expect(result.ok, result.ok ? undefined : JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.value.qualification.dataBundleSha256).toBe(await computeSha256(expectedArchive));
    const materializer = vi.mocked(fixture.input.materializeQualificationBundle);
    expect(materializer.mock.calls[0]?.[0].sourceArchiveBytes).toEqual(expectedArchive);
    expect(materializer.mock.calls[0]?.[0].sourceArchiveBytes).not.toBe(bufferBackedInput.sourceArchiveBytes);
    expect(result.value.assets.evidence.readFile("qualification/source-bundle")).toBeUndefined();
    expect(result.value.assets.evidence.manifest.validationEvidence.evidenceId).toBe("qualification-cartoon");
  });

  it("returns a typed cancellation failure and no receipt", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const controller = new AbortController();
    controller.abort();

    const result = await admitShaderQualification({ ...fixture.input, signal: controller.signal });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "aborted", stage: "assemble-final-wgsl" }],
    });
  });

  it("observes a synchronous host abort before a never-settling dependency can hang", async () => {
    const fixture = await createFixture();
    const controller = new AbortController();
    const materializer = vi.fn(() => {
      controller.abort();
      return new Promise<never>(() => undefined);
    });

    const result = await Promise.race([
      admitShaderQualification({
        ...fixture.input,
        materializeQualificationBundle: materializer,
        signal: controller.signal,
        timeoutMs: 50,
      }),
      new Promise<"hung">((resolveHung) => setTimeout(() => resolveHung("hung"), 250)),
    ]);

    expect(result).not.toBe("hung");
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "aborted", stage: "assemble-final-wgsl" }],
    });
  });

  it("returns a typed timeout failure when a dependency does not complete", async () => {
    const fixture = await createFixture();
    mockedAdmitBundle.mockImplementation(async () => new Promise(() => undefined));

    const result = await admitShaderQualification({ ...fixture.input, timeoutMs: 1 });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "timeout", stage: "assemble-final-wgsl" }],
    });
  });

  it("rejects fabricated receipts at the pipeline revalidation boundary", async () => {
    const result = await revalidateShaderAdmissionReceipt({
      receipt: Object.freeze({}) as ShaderAdmissionReceipt,
      verifyCryptographicBundle: vi.fn(async () => true),
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "receipt-invalid", stage: "revalidate-receipt" }],
    });
  });

  it("fails receipt revalidation when fresh cryptographic verification fails", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const admitted = await admitShaderQualification(fixture.input);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;

    const result = await revalidateShaderAdmissionReceipt({
      receipt: admitted.value,
      verifyCryptographicBundle: vi.fn(async () => false),
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "receipt-invalid", stage: "revalidate-receipt" }],
    });
  });

  it("requires receipt revalidation to receive the boolean true from cryptographic verification", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const admitted = await admitShaderQualification(fixture.input);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;

    const result = await revalidateShaderAdmissionReceipt({
      receipt: admitted.value,
      verifyCryptographicBundle: vi.fn(async () => "false" as unknown as boolean),
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "receipt-invalid", stage: "revalidate-receipt" }],
    });
  });

  it("fails receipt revalidation when retained evidence no longer matches the admitted proof", async () => {
    const fixture = await createFixture();
    installSuccessfulToolchain(fixture);
    const admitted = await admitShaderQualification(fixture.input);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    mockedValidateEvidence.mockResolvedValue({
      ok: true,
      value: {
        ...fixture.evidence,
        counts: {
          ...fixture.evidence.counts,
          passedResults: fixture.evidence.counts.passedResults - 1,
        },
      } as ShaderValidationEvidence,
    });
    mockedVerifyAttestation.mockClear();

    const result = await revalidateShaderAdmissionReceipt({
      receipt: admitted.value,
      verifyCryptographicBundle: vi.fn(async () => true),
    });

    expect(mockedVerifyAttestation).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "receipt-invalid", stage: "revalidate-receipt" }],
    });
  });
});
