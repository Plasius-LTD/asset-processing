import { describe, expect, it } from "vitest";
import type {
  ModelAssemblyChildAssetRef,
  ModelCollisionPolicyEvidence,
  ModelConverterEvidence,
  ModelFidelityEvidence,
  ModelFidelityGateEvidence,
  ModelResourceRef,
  ModelTransform,
} from "@plasius/asset-contracts";
import { MODEL_RESOLUTION_CONTRACT_VERSION } from "@plasius/asset-contracts";
import {
  CANONICAL_MODEL_CLEANUP_STEPS,
  STATIC_WORLD_V1_PROCESSING_PROFILE,
  collectModelRollbackClosure,
  createCanonicalModelCleanupPlan,
  createCanonicalModelRuntimePlan,
  createModelCollisionPlan,
  createStaticWorldV1ProcessingProfile,
  planAdaptiveModelLods,
  planHybridModelPartitions,
  selectAdaptiveModelLod,
  validateAdaptiveModelLods,
  validateAdaptiveModelLodPlan,
  validateHybridModelPartitionPlan,
  validateModelFormatEvidence,
  type AdaptiveModelLodPlan,
  type CreateCanonicalModelRuntimePlanInput,
  type HybridModelPartitionPlan,
  type ModelFormatEvidence,
  type ModelPartitionOutput,
} from "../src/index.js";

const SOURCE_HASH = "1".repeat(64);
const LOD0_HASH = "2".repeat(64);
const COLLISION_HASH = "3".repeat(64);
const RESOLUTION_ID = "resolution-21";
const CANDIDATE_ID = "candidate-21";
const EVALUATED_AT = "2026-08-20T12:00:00.000Z";
const TOKEN = "A".repeat(48);

function glbResource(hash: string, byteLength = 8_000): ModelResourceRef {
  return {
    uri: `mcp://models/resolutions/${RESOLUTION_ID}/candidates/${CANDIDATE_ID}/artifacts/sha256/${hash}.glb`,
    byteLength,
    sha256: hash,
    contentType: "model/gltf-binary",
  };
}

function formatEvidence(overrides: Partial<ModelFormatEvidence> = {}): ModelFormatEvidence {
  return {
    matrixId: "provider-format-v1",
    matrixVersion: "1.0.0",
    sourceFormat: "obj",
    adapterId: "assimp-importer",
    adapterVersion: "1.2.0",
    sourceContentHash: SOURCE_HASH,
    targetFormat: "glb",
    decision: "supported",
    validatedAt: EVALUATED_AT,
    decisionToken: TOKEN,
    ...overrides,
  };
}

function preservedFidelity(): readonly ModelFidelityEvidence[] {
  return [
    { aspect: "geometry", outcome: "preserved", message: "Geometry validated." },
    { aspect: "materials", outcome: "preserved", message: "Materials validated." },
    { aspect: "textures", outcome: "preserved", message: "Textures validated." },
  ];
}

function converter(outputContentHash = LOD0_HASH): ModelConverterEvidence {
  return {
    id: "assimp-importer",
    version: "1.2.0",
    sourceFormat: "obj",
    targetFormat: "glb",
    sourceContentHash: SOURCE_HASH,
    outputContentHash,
    diagnostics: [],
    losses: [],
  };
}

function fidelityGate(): ModelFidelityGateEvidence {
  return {
    profileId: "static-world-fidelity",
    profileVersion: "1.0.0",
    outcome: "passed",
    requiredAspects: ["geometry", "materials", "textures"],
    evaluatedAt: EVALUATED_AT,
    decisionToken: TOKEN,
  };
}

function collisionPolicy(disposition: "proxy-required" | "none-allowed"): ModelCollisionPolicyEvidence {
  return {
    profileId: "static-world-collision",
    profileVersion: "1.0.0",
    disposition,
    category: disposition === "none-allowed" ? "visual-only" : "prop",
    decisionToken: TOKEN,
  };
}

const IDENTITY_TRANSFORM: ModelTransform = {
  translationMetres: [0, 0, 0],
  rotationQuaternion: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

function smallPartitionPlan(): HybridModelPartitionPlan {
  return planHybridModelPartitions({
    profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
    components: [
      {
        componentId: "chair-body",
        semanticNodeId: "chair",
        connectedComponentId: "chair-body",
        mobility: "movable",
        boundsMetres: { min: [-1, 0, -1], max: [1, 2, 1] },
        triangleCount: 8_000,
        byteLength: 8_000,
        textureByteLength: 0,
        maxTextureDimensionPx: 0,
      },
    ],
  });
}

function smallLodPlan(): AdaptiveModelLodPlan {
  return planAdaptiveModelLods({
    resolutionId: RESOLUTION_ID,
    candidateId: CANDIDATE_ID,
    lod0: {
      level: 0,
      resource: glbResource(LOD0_HASH),
      triangleCount: 8_000,
      geometricErrorMetres: 0,
    },
    attempts: [],
  });
}

function smallRuntimeInput(
  overrides: Partial<CreateCanonicalModelRuntimePlanInput> = {},
): CreateCanonicalModelRuntimePlanInput {
  const profile = createStaticWorldV1ProcessingProfile();
  const cleanup = createCanonicalModelCleanupPlan({
    formatEvidence: validateModelFormatEvidence(formatEvidence()),
    profile,
  });
  return {
    resolutionId: RESOLUTION_ID,
    candidateId: CANDIDATE_ID,
    profile,
    cleanup,
    partitions: smallPartitionPlan(),
    partitionOutputs: [],
    lods: smallLodPlan(),
    collision: createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "convex-hull", resource: glbResource(COLLISION_HASH, 600) },
      policy: collisionPolicy("proxy-required"),
    }),
    textureByteLength: 0,
    maxTextureDimensionPx: 0,
    converter: converter(),
    fidelityEvidence: preservedFidelity(),
    fidelityGate: fidelityGate(),
    processedAt: EVALUATED_AT,
    ...overrides,
  };
}

describe("canonical static-world model processing", () => {
  it("creates an immutable small LOD0-only prop plan and stable manifest identity", async () => {
    const profile = createStaticWorldV1ProcessingProfile();
    const evidence = validateModelFormatEvidence(formatEvidence());
    const cleanup = createCanonicalModelCleanupPlan({ formatEvidence: evidence, profile });
    const partitions = smallPartitionPlan();
    const lods = smallLodPlan();
    const collision = createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "convex-hull", resource: glbResource(COLLISION_HASH, 600) },
      policy: collisionPolicy("proxy-required"),
    });

    const input = {
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      profile,
      cleanup,
      partitions,
      partitionOutputs: [],
      lods,
      collision,
      textureByteLength: 0,
      maxTextureDimensionPx: 0,
      converter: converter(),
      fidelityEvidence: preservedFidelity(),
      fidelityGate: fidelityGate(),
      processedAt: EVALUATED_AT,
    } as const;

    const first = await createCanonicalModelRuntimePlan(input);
    const second = await createCanonicalModelRuntimePlan(input);

    expect(first.manifest).toMatchObject({
      kind: "leaf",
      contentHash: LOD0_HASH,
      closureHash: LOD0_HASH,
      coordinateSystem: {
        unit: "metre",
        upAxis: "Y",
        forwardAxis: "-Z",
        origin: "floor-centred",
        outwardFaceWinding: "counter-clockwise",
      },
      technicalProfile: {
        triangleCount: 8_000,
        byteLength: 8_000,
        lodCount: 1,
        hasCollision: true,
        partitionCount: 1,
        partitionCellMetres: 32,
      },
      children: [],
    });
    expect(first.manifestDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.manifestDigest).toBe(second.manifestDigest);
    expect(first.manifest.manifestId).toBe(second.manifest.manifestId);
    expect(first.cleanup.steps).toEqual(CANONICAL_MODEL_CLEANUP_STEPS);
    expect(first.runtimeArtifacts.every((artifact) => artifact.contentType === "model/gltf-binary")).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.manifest)).toBe(true);
    expect(Object.isFrozen(first.rollbackClosure)).toBe(true);

    const driftedManifest = {
      ...structuredClone(first.manifest),
      processedAt: "2026-08-21T12:00:00.000Z",
    };
    await expect(collectModelRollbackClosure(driftedManifest, first.manifestDigest)).rejects.toThrow(
      /digest.*manifest|exactly bind/iu,
    );
  });

  it("retains adaptive LODs using exact counts and records discarded attempts", () => {
    const plan = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: {
        level: 0,
        resource: glbResource("4".repeat(64), 100_000),
        triangleCount: 100_000,
        geometricErrorMetres: 0,
      },
      attempts: [
        {
          resource: glbResource("5".repeat(64), 55_000),
          triangleCount: 50_000,
          geometricErrorMetres: 0.01,
          fidelityPassed: true,
        },
        {
          resource: glbResource("6".repeat(64), 42_000),
          triangleCount: 40_000,
          geometricErrorMetres: 0.02,
          fidelityPassed: true,
        },
        {
          resource: glbResource("7".repeat(64), 12_000),
          triangleCount: 8_000,
          geometricErrorMetres: 0.05,
          fidelityPassed: true,
        },
      ],
    });

    expect(plan.attempts.map((attempt) => attempt.targetTriangleCount)).toEqual([50_000, 20_000, 8_000]);
    expect(plan.lods.map((lod) => [lod.level, lod.triangleCount, lod.geometricErrorMetres])).toEqual([
      [0, 100_000, 0],
      [1, 50_000, 0.01],
      [2, 8_000, 0.05],
    ]);
    expect(plan.attempts[1]).toMatchObject({ retained: false, reasonCode: "insufficient-reduction" });
    expect(plan.attempts[2]).toMatchObject({ retained: true, retainedLevel: 2 });
    expect(Object.isFrozen(plan.lods)).toBe(true);
  });

  it("records fidelity, triangle-floor, and geometric-error LOD discard reasons", () => {
    const fidelityAndFloor = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: {
        level: 0,
        resource: glbResource("0".repeat(64), 100_000),
        triangleCount: 100_000,
        geometricErrorMetres: 0,
      },
      attempts: [
        {
          resource: glbResource("1".repeat(64), 50_000),
          triangleCount: 50_000,
          geometricErrorMetres: 0.01,
          fidelityPassed: false,
        },
        {
          resource: glbResource("2".repeat(64), 1_000),
          triangleCount: 511,
          geometricErrorMetres: 0.02,
          fidelityPassed: true,
        },
        {
          resource: glbResource("3".repeat(64), 8_000),
          triangleCount: 8_000,
          geometricErrorMetres: 0.04,
          fidelityPassed: false,
        },
      ],
    });
    expect(fidelityAndFloor.attempts.map((attempt) => attempt.reasonCode)).toEqual([
      "fidelity-check-failed",
      "below-minimum-triangles",
      "fidelity-check-failed",
    ]);

    const errorRegression = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: {
        level: 0,
        resource: glbResource("3".repeat(64), 100_000),
        triangleCount: 100_000,
        geometricErrorMetres: 0,
      },
      attempts: [
        {
          resource: glbResource("4".repeat(64), 50_000),
          triangleCount: 50_000,
          geometricErrorMetres: 0.1,
          fidelityPassed: true,
        },
        {
          resource: glbResource("5".repeat(64), 20_000),
          triangleCount: 20_000,
          geometricErrorMetres: 0.05,
          fidelityPassed: true,
        },
        {
          resource: glbResource("6".repeat(64), 8_000),
          triangleCount: 8_000,
          geometricErrorMetres: 0.2,
          fidelityPassed: false,
        },
      ],
    });
    expect(errorRegression.attempts[1]?.reasonCode).toBe("geometric-error-regressed");
  });

  it("keeps a small asset LOD0-only and rejects invalid LOD ordering", () => {
    const plan = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: {
        level: 0,
        resource: glbResource(LOD0_HASH),
        triangleCount: 9_999,
        geometricErrorMetres: 0,
      },
      attempts: [],
    });

    expect(plan.lods).toHaveLength(1);
    expect(plan.attempts).toEqual([]);
    expect(() => planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: plan.lods[0]!,
      attempts: [{
        resource: glbResource("8".repeat(64)),
        triangleCount: 4_999,
        geometricErrorMetres: 0.01,
        fidelityPassed: true,
      }],
    })).toThrow(/below.*threshold.*must not|zero.*attempt/iu);
    expect(() => planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: {
        ...plan.lods[0]!,
        triangleCount: 10_000,
      },
      attempts: [],
    })).toThrow(/three.*attempt/iu);
    expect(() => validateAdaptiveModelLods([
      { ...plan.lods[0]!, level: 1 },
    ])).toThrow(/contiguous.*LOD0/iu);
    expect(() => validateAdaptiveModelLods([
      plan.lods[0]!,
      {
        level: 1,
        resource: glbResource("9".repeat(64)),
        triangleCount: 7_000,
        geometricErrorMetres: -0.1,
      },
    ])).toThrow(/geometric error/iu);
  });

  it("selects the coarsest projected-error-safe LOD with transition hysteresis", () => {
    const lods = validateAdaptiveModelLods([
      { level: 0, resource: glbResource("a".repeat(64)), triangleCount: 100_000, geometricErrorMetres: 0 },
      { level: 1, resource: glbResource("b".repeat(64)), triangleCount: 50_000, geometricErrorMetres: 0.01 },
      { level: 2, resource: glbResource("c".repeat(64)), triangleCount: 10_000, geometricErrorMetres: 0.03 },
    ]);

    expect(selectAdaptiveModelLod({ lods, pixelsPerMetre: 40 })).toMatchObject({ level: 2, projectedErrorPx: 1.2 });
    expect(selectAdaptiveModelLod({ lods, pixelsPerMetre: 45, previousLevel: 1 })).toMatchObject({
      level: 1,
      transition: "held-finer",
    });
    expect(selectAdaptiveModelLod({ lods, pixelsPerMetre: 55, previousLevel: 2 })).toMatchObject({
      level: 2,
      transition: "held-coarser",
    });
    expect(() => selectAdaptiveModelLod({ lods, pixelsPerMetre: Number.POSITIVE_INFINITY })).toThrow(/finite/iu);
    expect(() => selectAdaptiveModelLod({ lods, pixelsPerMetre: 10, previousLevel: 3 })).toThrow(/previousLevel/iu);
  });

  it("preserves semantic and connected components before grid splitting", () => {
    const semantic = planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [
        {
          componentId: "table-component",
          semanticNodeId: "table",
          connectedComponentId: "table-connected",
          mobility: "movable",
          boundsMetres: { min: [0, 0, -1], max: [2, 1, 1] },
          triangleCount: 4_000,
          byteLength: 4_000,
          textureByteLength: 0,
          maxTextureDimensionPx: 0,
        },
        {
          componentId: "chair-component",
          semanticNodeId: "chair",
          connectedComponentId: "chair-connected",
          mobility: "movable",
          boundsMetres: { min: [-2, 0, -1], max: [0, 1, 1] },
          triangleCount: 4_000,
          byteLength: 4_000,
          textureByteLength: 0,
          maxTextureDimensionPx: 0,
        },
      ],
    });

    expect(semantic.kind).toBe("assembly");
    expect(semantic.partitions.map((partition) => [partition.method, partition.semanticNodeId])).toEqual([
      ["semantic", "chair"],
      ["semantic", "table"],
    ]);
    expect(semantic.seamLocks).toEqual([]);
    expect(semantic.boundsMetres).toEqual({ min: [-2, 0, -1], max: [2, 1, 1] });

    const leaf = planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [{
        componentId: "single-body",
        semanticNodeId: "single-body",
        connectedComponentId: "single-body",
        mobility: "static",
        boundsMetres: { min: [-1, 0, -1], max: [1, 1, 1] },
        triangleCount: 1_000,
        byteLength: 1_000,
        textureByteLength: 0,
        maxTextureDimensionPx: 0,
      }],
    });
    expect(() => validateHybridModelPartitionPlan({
      ...leaf,
      kind: "assembly",
      partitions: [
        leaf.partitions[0]!,
        {
          ...leaf.partitions[0]!,
          partitionId: "part-forged-duplicate",
          estimatedTriangleCount: 1,
          estimatedByteLength: 1,
        },
      ],
    })).toThrow(/source component.*exactly|partition.*source/iu);
  });

  it("grid-partitions an oversized static building and locks every shared border", () => {
    const grid = planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [
        {
          componentId: "building-shell",
          semanticNodeId: "building-shell",
          connectedComponentId: "shell-connected",
          mobility: "static",
          boundsMetres: { min: [-40, 0, -16], max: [40, 20, 16] },
          triangleCount: 800_000,
          byteLength: 80_000_000,
          textureByteLength: 40_000_000,
          maxTextureDimensionPx: 4096,
        },
      ],
    });

    expect(grid.kind).toBe("assembly");
    expect(grid.partitions).toHaveLength(8);
    expect(grid.partitions.every((partition) => partition.method === "grid")).toBe(true);
    expect(grid.partitions.every((partition) => partition.semanticNodeId === "building-shell")).toBe(true);
    expect(grid.seamLocks.length).toBeGreaterThan(0);
    expect(grid.seamLocks.every((lock) => (
      lock.attributes.join(",") === "POSITION,NORMAL,TEXCOORD_0"
      && lock.lodConstraint === "lock-identical-border-vertices"
    ))).toBe(true);
    expect(new Set(grid.seamLocks.map((lock) => lock.seamId)).size).toBe(grid.seamLocks.length);
    expect(() => validateHybridModelPartitionPlan({ ...grid, seamLocks: grid.seamLocks.slice(1) })).toThrow(/every.*seam/iu);

    const forgedPartitions = grid.partitions.map((partition) => (
      partition.gridCell?.x === -1 && partition.gridCell.z === -1
        ? {
          ...partition,
          boundsMetres: {
            min: [...partition.boundsMetres.min],
            max: [
              partition.boundsMetres.max[0] - 1,
              partition.boundsMetres.max[1],
              partition.boundsMetres.max[2],
            ],
          },
        }
        : partition
    ));
    expect(() => validateHybridModelPartitionPlan({ ...grid, partitions: forgedPartitions })).toThrow(
      /grid.*bounds.*cell/iu,
    );

    const symmetricallyForgedPartitions = grid.partitions.map((partition) => ({
      ...partition,
      boundsMetres: {
        min: [
          partition.gridCell?.x === -2 ? -39 : partition.boundsMetres.min[0],
          partition.boundsMetres.min[1],
          partition.boundsMetres.min[2],
        ],
        max: [
          partition.gridCell?.x === 1 ? 39 : partition.boundsMetres.max[0],
          partition.boundsMetres.max[1],
          partition.boundsMetres.max[2],
        ],
      },
    }));
    expect(() => validateHybridModelPartitionPlan({
      ...grid,
      boundsMetres: { min: [-39, 0, -16], max: [39, 20, 16] },
      partitions: symmetricallyForgedPartitions,
    })).toThrow(/source component.*bounds|parent bounds.*source/iu);
  });

  it("never clips movable objects and rejects non-finite or over-budget component evidence", () => {
    const oversizedMovable = {
      componentId: "movable-stage",
      semanticNodeId: "stage",
      connectedComponentId: "stage",
      mobility: "movable" as const,
      boundsMetres: { min: [-20, 0, -2], max: [20, 2, 2] } as const,
      triangleCount: 20_000,
      byteLength: 20_000,
      textureByteLength: 0,
      maxTextureDimensionPx: 0,
    };
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [oversizedMovable],
    })).toThrow(/movable.*clip/iu);
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [{
        ...oversizedMovable,
        boundsMetres: { min: [Number.NaN, 0, 0], max: [1, 1, 1] },
      }],
    })).toThrow(/finite/iu);
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [{
        ...oversizedMovable,
        boundsMetres: { min: [-1, 0, -1], max: [1, 1, 1] },
        triangleCount: 1_000_001,
      }],
    })).toThrow(/movable.*limit/iu);
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [{
        ...oversizedMovable,
        boundsMetres: { min: [-1, 1, -1], max: [1, 2, 1] },
      }],
    })).toThrow(/floor-centred/iu);
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [{
        ...oversizedMovable,
        boundsMetres: { min: [-1, 0, -1], max: [1, 1, 1] },
        textureByteLength: 1,
        maxTextureDimensionPx: 0,
      }],
    })).toThrow(/texture evidence/iu);
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [
        { ...oversizedMovable, boundsMetres: { min: [-1, 0, -1], max: [0, 1, 1] }, componentId: "same" },
        { ...oversizedMovable, boundsMetres: { min: [0, 0, -1], max: [1, 1, 1] }, componentId: "same" },
      ],
    })).toThrow(/componentId.*unique/iu);
    expect(() => planHybridModelPartitions({
      profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
      components: [{
        ...oversizedMovable,
        mobility: "static",
        boundsMetres: { min: [-1e20, 0, -1], max: [1e20, 1, 1] },
      }],
    })).toThrow(/partition grid extent/iu);

    for (const componentId of ["wall~shell", "a".repeat(124)]) {
      const valid = planHybridModelPartitions({
        profile: STATIC_WORLD_V1_PROCESSING_PROFILE,
        components: [{
          ...oversizedMovable,
          componentId,
          connectedComponentId: "bounded-connected-id",
          semanticNodeId: undefined,
          mobility: "static",
        }],
      });
      expect(valid.partitions.every((partition) => (
        partition.partitionId.length <= 128
        && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(partition.partitionId)
      ))).toBe(true);
      expect(valid.seamLocks.every((lock) => (
        lock.seamId.length <= 128
        && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(lock.seamId)
      ))).toBe(true);
    }
  });

  it("validates separate proxy and explicitly authorised collision-none policies", () => {
    const none = createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "none" },
      policy: collisionPolicy("none-allowed"),
    });
    expect(none.record.kind).toBe("none");

    expect(() => createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "none" },
      policy: collisionPolicy("proxy-required"),
    })).toThrow(/proxy/iu);
    expect(() => createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "box", resource: glbResource(LOD0_HASH) },
      policy: collisionPolicy("proxy-required"),
    })).toThrow(/separate/iu);
  });

  it("fails closed for unsupported or mismatched signed format evidence", () => {
    expect(validateModelFormatEvidence(formatEvidence())).toMatchObject({
      sourceFormat: "obj",
      adapterId: "assimp-importer",
      targetFormat: "glb",
    });
    expect(() => validateModelFormatEvidence(formatEvidence({ sourceFormat: "max", adapterId: "metadata-only" }))).toThrow(
      /unsupported-source-format/iu,
    );
    expect(() => validateModelFormatEvidence(formatEvidence({ sourceFormat: "obj", adapterId: "blender-lts" }))).toThrow(
      /adapter/iu,
    );
    expect(() => validateModelFormatEvidence(formatEvidence({ decisionToken: "too-short" }))).toThrow(/decision token/iu);
    expect(() => validateModelFormatEvidence(formatEvidence({ validatedAt: "not-a-time" }))).toThrow(/timestamp/iu);
    expect(() => validateModelFormatEvidence(formatEvidence({
      sourceFormat: "vsp3",
      adapterId: "openvsp-sandbox",
    }))).toThrow(/scale evidence/iu);
    expect(validateModelFormatEvidence(formatEvidence({
      sourceFormat: "vsp3",
      adapterId: "openvsp-sandbox",
      authoritativeScaleEvidenceSha256: "b".repeat(64),
    }))).toMatchObject({ authoritativeScaleEvidenceSha256: "b".repeat(64) });
  });

  it("allows only tightening the static-world-v1 limits", () => {
    const tightened = createStaticWorldV1ProcessingProfile({
      maxTriangles: 500_000,
      maxBytes: 50 * 1024 * 1024,
      maxPartitionCellMetres: 16,
    });
    expect(tightened).toMatchObject({
      id: "static-world-v1",
      maxTriangles: 500_000,
      maxBytes: 50 * 1024 * 1024,
      maxPartitionCellMetres: 16,
    });
    expect(() => createStaticWorldV1ProcessingProfile({ maxTriangles: 1_000_001 })).toThrow(/tighten/iu);
    expect(() => createStaticWorldV1ProcessingProfile({ maxPartitionCellMetres: 0 })).toThrow(/positive/iu);
    expect(() => createStaticWorldV1ProcessingProfile({ maxBytes: 1_024, maxTextureBytes: 2_048 })).toThrow(/must not exceed/iu);
    expect(() => createStaticWorldV1ProcessingProfile({ id: "other-profile" } as never)).toThrow(/unsupported fields/iu);
  });

  it("builds an atomic assembly and deterministic rollback closure", async () => {
    const profile = createStaticWorldV1ProcessingProfile();
    const cleanup = createCanonicalModelCleanupPlan({
      formatEvidence: validateModelFormatEvidence(formatEvidence()),
      profile,
    });
    const partitions = planHybridModelPartitions({
      profile,
      components: [
        {
          componentId: "left-wing",
          semanticNodeId: "left-wing",
          connectedComponentId: "left-wing",
          mobility: "static",
          boundsMetres: { min: [-2, 0, -1], max: [0, 2, 1] },
          triangleCount: 20_000,
          byteLength: 4_000,
          textureByteLength: 0,
          maxTextureDimensionPx: 0,
        },
        {
          componentId: "right-wing",
          semanticNodeId: "right-wing",
          connectedComponentId: "right-wing",
          mobility: "static",
          boundsMetres: { min: [0, 0, -1], max: [2, 2, 1] },
          triangleCount: 20_000,
          byteLength: 4_000,
          textureByteLength: 0,
          maxTextureDimensionPx: 0,
        },
      ],
    });
    const childHashes = ["d".repeat(64), "e".repeat(64)];
    const partitionOutputs: readonly ModelPartitionOutput[] = partitions.partitions.map((partition, index) => ({
      partitionId: partition.partitionId,
      assetRef: {
        disposition: "staged-derived",
        derivedId: partition.partitionId,
        kind: "leaf",
        contentHash: childHashes[index]!,
        processingManifestUri: `mcp://models/resolutions/${RESOLUTION_ID}/candidates/${CANDIDATE_ID}/children/${partition.partitionId}/manifest`,
      } satisfies ModelAssemblyChildAssetRef,
      transform: IDENTITY_TRANSFORM,
    }));
    const lods = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: { level: 0, resource: glbResource(LOD0_HASH), triangleCount: 40_000, geometricErrorMetres: 0 },
      attempts: [
        {
          resource: glbResource("f".repeat(64), 4_000),
          triangleCount: 20_000,
          geometricErrorMetres: 0.02,
          fidelityPassed: true,
        },
        {
          resource: glbResource("8".repeat(64), 3_000),
          triangleCount: 8_000,
          geometricErrorMetres: 0.04,
          fidelityPassed: false,
        },
        {
          resource: glbResource("9".repeat(64), 2_000),
          triangleCount: 3_200,
          geometricErrorMetres: 0.08,
          fidelityPassed: false,
        },
      ],
    });
    const collision = createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "none" },
      policy: collisionPolicy("none-allowed"),
    });
    const runtimeInput = {
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      profile,
      cleanup,
      partitions,
      partitionOutputs,
      lods,
      collision,
      textureByteLength: 0,
      maxTextureDimensionPx: 0,
      converter: converter(),
      fidelityEvidence: preservedFidelity(),
      fidelityGate: fidelityGate(),
      processedAt: EVALUATED_AT,
    } as const;

    const runtime = await createCanonicalModelRuntimePlan(runtimeInput);
    const rollback = await collectModelRollbackClosure(runtime.manifest, runtime.manifestDigest);
    const repeated = await createCanonicalModelRuntimePlan({
      ...runtimeInput,
      partitionOutputs: [...partitionOutputs].reverse(),
    });

    expect(runtime.manifest.kind).toBe("assembly");
    expect(runtime.manifest.children).toHaveLength(2);
    expect(runtime.manifest.technicalProfile.partitionCount).toBe(2);
    expect(runtime.manifest.closureHash).not.toBe(runtime.manifest.contentHash);
    expect(rollback.map((entry) => entry.kind)).toEqual([
      "manifest",
      "lod",
      "lod",
      "child-manifest",
      "child-manifest",
    ]);
    expect(rollback.filter((entry) => entry.kind === "child-manifest").map((entry) => entry.sha256)).toEqual(childHashes);
    expect(rollback.filter((entry) => entry.kind === "child-manifest").every((entry) => entry.digestSubject === "asset-content")).toBe(true);
    expect(repeated.manifestDigest).toBe(runtime.manifestDigest);
    expect(repeated.manifest.children.map((child) => child.instanceId)).toEqual(
      runtime.manifest.children.map((child) => child.instanceId),
    );

    const sharedAssetRef = {
      contractVersion: MODEL_RESOLUTION_CONTRACT_VERSION,
      assetId: "shared-building-leaf",
      version: "1.0.0",
      kind: "leaf",
      contentHash: "7".repeat(64),
      runtimeManifestUri: "mcp://models/catalog/shared-building-leaf/versions/1.0.0/manifest",
    } as const;
    const instanced = await createCanonicalModelRuntimePlan({
      ...runtimeInput,
      partitionOutputs: partitions.partitions.map((partition) => ({
        partitionId: partition.partitionId,
        assetRef: sharedAssetRef,
        transform: IDENTITY_TRANSFORM,
      })),
    });
    expect(instanced.manifest.children).toHaveLength(2);
    expect(instanced.rollbackClosure.filter((entry) => entry.kind === "child-manifest")).toHaveLength(1);
    await expect(createCanonicalModelRuntimePlan({
      ...runtimeInput,
      partitionOutputs: partitions.partitions.map((partition, index) => ({
        partitionId: partition.partitionId,
        assetRef: {
          ...sharedAssetRef,
          contentHash: String(index + 6).repeat(64),
        },
        transform: IDENTITY_TRANSFORM,
      })),
    })).rejects.toThrow(/conflicting duplicate resource/iu);

    const mutableConverter = converter();
    const mutationAttempt = createCanonicalModelRuntimePlan({
      ...runtimeInput,
      converter: mutableConverter,
    });
    (mutableConverter as { id: string }).id = "blender-lts";
    (mutableConverter as { version: string }).version = "9.9.9";
    (mutableConverter as { sourceFormat: string }).sourceFormat = "blend";
    const mutationSafe = await mutationAttempt;
    expect(mutationSafe.cleanup.formatEvidence.adapterId).toBe("assimp-importer");
    expect(mutationSafe.manifest.converter).toMatchObject({
      id: "assimp-importer",
      version: "1.2.0",
      sourceFormat: "obj",
    });
  });

  it("revalidates serialized adaptive audit evidence and rejects drift", () => {
    const plan = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: { level: 0, resource: glbResource(LOD0_HASH), triangleCount: 20_000, geometricErrorMetres: 0 },
      attempts: [
        {
          resource: glbResource("a".repeat(64)),
          triangleCount: 10_000,
          geometricErrorMetres: 0.02,
          fidelityPassed: true,
        },
        {
          resource: glbResource("b".repeat(64)),
          triangleCount: 4_000,
          geometricErrorMetres: 0.04,
          fidelityPassed: false,
        },
        {
          resource: glbResource("c".repeat(64)),
          triangleCount: 1_600,
          geometricErrorMetres: 0.08,
          fidelityPassed: false,
        },
      ],
    });
    expect(validateAdaptiveModelLodPlan(plan)).toEqual(plan);
    expect(() => validateAdaptiveModelLodPlan({
      ...plan,
      attempts: [{ ...plan.attempts[0]!, targetTriangleCount: 9_999 }, ...plan.attempts.slice(1)],
    })).toThrow(/target triangle count/iu);
    expect(() => validateAdaptiveModelLodPlan({
      ...plan,
      attempts: [
        { ...plan.attempts[0]!, retained: false, retainedLevel: undefined, reasonCode: undefined },
        ...plan.attempts.slice(1),
      ],
    })).toThrow(/retained outcome/iu);
    expect(() => validateAdaptiveModelLodPlan({
      ...plan,
      attempts: [
        {
          ...plan.attempts[0]!,
          resource: {
            ...plan.attempts[0]!.resource,
            uri: plan.attempts[0]!.resource.uri.replace(`/candidates/${CANDIDATE_ID}/`, "/candidates/other-candidate/"),
          },
        },
        ...plan.attempts.slice(1),
      ],
    })).toThrow(/candidate scope/iu);
    expect(() => planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: plan.lods[0]!,
      attempts: [1, 2, 3, 4].map((index) => ({
        resource: glbResource(String(index).repeat(64)),
        triangleCount: 1_000,
        geometricErrorMetres: 0.1,
        fidelityPassed: true,
      })),
    })).toThrow(/at most three/iu);
  });

  it("fails runtime evidence drift and sorts converter diagnostics deterministically", async () => {
    const diagnosticInput = smallRuntimeInput({
      converter: {
        ...converter(),
        diagnostics: [
          { severity: "info", code: "z-last", message: "Last." },
          { severity: "info", code: "a-first", message: "First." },
        ],
        losses: [
          { severity: "info", code: "z-loss", message: "Last loss." },
          { severity: "info", code: "a-loss", message: "First loss." },
        ],
      },
    });
    const runtime = await createCanonicalModelRuntimePlan(diagnosticInput);
    expect(runtime.manifest.converter.diagnostics.map((item) => item.code)).toEqual(["a-first", "z-last"]);
    expect(runtime.manifest.converter.losses.map((item) => item.code)).toEqual(["a-loss", "z-loss"]);
    await expect(collectModelRollbackClosure(runtime.manifest, "0".repeat(64))).rejects.toThrow(/exactly bind/iu);

    const composedMessage = "\u00e9";
    const decomposedMessage = "e\u0301";
    const unicodeEvidence = [
      { severity: "info" as const, code: "unicode", message: composedMessage },
      { severity: "info" as const, code: "unicode", message: decomposedMessage },
    ];
    const unicodeForward = await createCanonicalModelRuntimePlan(smallRuntimeInput({
      converter: { ...converter(), diagnostics: unicodeEvidence },
    }));
    const unicodeReverse = await createCanonicalModelRuntimePlan(smallRuntimeInput({
      converter: { ...converter(), diagnostics: [...unicodeEvidence].reverse() },
    }));
    expect(unicodeForward.manifestDigest).toBe(unicodeReverse.manifestDigest);
    expect(unicodeForward.manifest.converter.diagnostics.map((item) => item.message)).toEqual([
      decomposedMessage,
      composedMessage,
    ]);

    const tighter = createStaticWorldV1ProcessingProfile({ maxTriangles: 7_000 });
    await expect(createCanonicalModelRuntimePlan({
      ...smallRuntimeInput(),
      profile: tighter,
    })).rejects.toThrow(/cleanup.*profile/iu);
    await expect(createCanonicalModelRuntimePlan({
      ...smallRuntimeInput(),
      textureByteLength: 10,
      maxTextureDimensionPx: 0,
    })).rejects.toThrow(/texture evidence/iu);
    await expect(createCanonicalModelRuntimePlan({
      ...smallRuntimeInput(),
      collision: createModelCollisionPlan({
        lod0Sha256: "f".repeat(64),
        record: { kind: "none" },
        policy: collisionPolicy("none-allowed"),
      }),
    })).rejects.toThrow(/exact cleaned LOD0/iu);
    await expect(createCanonicalModelRuntimePlan({
      ...smallRuntimeInput(),
      converter: { ...converter(), id: "gltf-glb-adapter" },
    })).rejects.toThrow(/converter evidence/iu);
    await expect(createCanonicalModelRuntimePlan({
      ...smallRuntimeInput(),
      processedAt: "2026-08-19T12:00:00.000Z",
    })).rejects.toThrow(/must not precede/iu);
    await expect(createCanonicalModelRuntimePlan({
      ...smallRuntimeInput(),
      converter: {
        ...converter(),
        diagnostics: [{ severity: "blocking", code: "invalid-geometry", message: "Geometry is invalid." }],
      },
      fidelityEvidence: [
        { aspect: "geometry", outcome: "lost", message: "Geometry is invalid." },
        ...preservedFidelity().slice(1),
      ],
      fidelityGate: { ...fidelityGate(), outcome: "blocked" },
    })).rejects.toThrow(/blocked.*fidelity|fidelity.*blocked/iu);
  });

  it("rejects retained leaf GLBs above the selected byte limit", async () => {
    const profile = createStaticWorldV1ProcessingProfile();
    const partitions = planHybridModelPartitions({
      profile,
      components: [{
        componentId: "high-poly-leaf",
        connectedComponentId: "high-poly-leaf",
        mobility: "static",
        boundsMetres: { min: [-1, 0, -1], max: [1, 1, 1] },
        triangleCount: 100_000,
        byteLength: 8_000,
        textureByteLength: 0,
        maxTextureDimensionPx: 0,
      }],
    });
    const cleanup = createCanonicalModelCleanupPlan({
      formatEvidence: validateModelFormatEvidence(formatEvidence()),
      profile,
    });
    const lods = planAdaptiveModelLods({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      lod0: { level: 0, resource: glbResource(LOD0_HASH), triangleCount: 100_000, geometricErrorMetres: 0 },
      attempts: [
        {
          resource: glbResource("4".repeat(64), 500 * 1024 * 1024),
          triangleCount: 50_000,
          geometricErrorMetres: 0.01,
          fidelityPassed: true,
        },
        {
          resource: glbResource("5".repeat(64)),
          triangleCount: 20_000,
          geometricErrorMetres: 0.02,
          fidelityPassed: false,
        },
        {
          resource: glbResource("6".repeat(64)),
          triangleCount: 8_000,
          geometricErrorMetres: 0.04,
          fidelityPassed: false,
        },
      ],
    });
    await expect(createCanonicalModelRuntimePlan({
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      profile,
      cleanup,
      partitions,
      partitionOutputs: [],
      lods,
      collision: createModelCollisionPlan({
        lod0Sha256: LOD0_HASH,
        record: { kind: "none" },
        policy: collisionPolicy("none-allowed"),
      }),
      textureByteLength: 0,
      maxTextureDimensionPx: 0,
      converter: converter(),
      fidelityEvidence: preservedFidelity(),
      fidelityGate: fidelityGate(),
      processedAt: EVALUATED_AT,
    })).rejects.toThrow(/GLB.*byte|runtime.*limit/iu);
  });

  it("rejects missing assembly children, unsafe refs, and incompatible evidence", async () => {
    const profile = createStaticWorldV1ProcessingProfile();
    const cleanup = createCanonicalModelCleanupPlan({
      formatEvidence: validateModelFormatEvidence(formatEvidence()),
      profile,
    });
    const partitions = planHybridModelPartitions({
      profile,
      components: [
        {
          componentId: "a",
          semanticNodeId: "a",
          connectedComponentId: "a",
          mobility: "static",
          boundsMetres: { min: [-1, 0, -1], max: [0, 1, 1] },
          triangleCount: 10_000,
          byteLength: 4_000,
          textureByteLength: 0,
          maxTextureDimensionPx: 0,
        },
        {
          componentId: "b",
          semanticNodeId: "b",
          connectedComponentId: "b",
          mobility: "static",
          boundsMetres: { min: [0, 0, -1], max: [1, 1, 1] },
          triangleCount: 10_000,
          byteLength: 4_000,
          textureByteLength: 0,
          maxTextureDimensionPx: 0,
        },
      ],
    });
    const collision = createModelCollisionPlan({
      lod0Sha256: LOD0_HASH,
      record: { kind: "none" },
      policy: collisionPolicy("none-allowed"),
    });
    const base = {
      resolutionId: RESOLUTION_ID,
      candidateId: CANDIDATE_ID,
      profile,
      cleanup,
      partitions,
      partitionOutputs: [],
      lods: smallLodPlan(),
      collision,
      textureByteLength: 0,
      maxTextureDimensionPx: 0,
      converter: converter(),
      fidelityEvidence: preservedFidelity(),
      fidelityGate: fidelityGate(),
      processedAt: EVALUATED_AT,
    } as const;
    await expect(createCanonicalModelRuntimePlan(base)).rejects.toThrow(/missing.*partition output/iu);

    const unsafeLods = {
      ...smallLodPlan(),
      lods: [{
        ...smallLodPlan().lods[0]!,
        resource: {
          ...smallLodPlan().lods[0]!.resource,
          uri: `mcp://models/resolutions/${RESOLUTION_ID}/candidates/${CANDIDATE_ID}/artifacts/not-addressed.glb`,
        },
      }],
    } as AdaptiveModelLodPlan;
    await expect(createCanonicalModelRuntimePlan({
      ...base,
      partitions: smallPartitionPlan(),
      lods: unsafeLods,
    })).rejects.toThrow(/content-addressed/iu);

    await expect(createCanonicalModelRuntimePlan({
      ...base,
      partitions: smallPartitionPlan(),
      converter: { ...converter(), sourceContentHash: "0".repeat(64) },
    })).rejects.toThrow(/format evidence.*source/iu);
  });
});
