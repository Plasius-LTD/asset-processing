# TDR 0002: Canonical Model Planning and Manifest Flow

## Status

Accepted

## Date

2026-08-20

## Purpose

Define the technical sequence and fail-closed checks used to turn trusted
conversion evidence and immutable GLB outputs into a canonical
`ModelProcessingManifest` and rollback closure.

## Required Inputs

1. A request-scoped `static-world-v1` profile that does not exceed default
   leaf limits.
2. Signed provider-format evidence bound to the exact source SHA-256, released
   adapter, adapter version, and GLB target.
3. Finite cleaned connected-component facts, including semantic identity,
   mobility, bounds, triangles, bytes, and texture facts.
4. Candidate-scoped content-addressed GLB resources for LOD0 and every attempted
   retained LOD.
5. Exact geometric-error and fidelity results for every simplifier attempt.
6. Signed category collision policy and, where required, a distinct collision
   GLB derived from the exact cleaned LOD0.
7. Converter, fidelity, and fidelity-gate evidence accepted by
   `@plasius/asset-contracts`.
8. For an assembly, exactly one immutable leaf output and local transform for
   every planned partition.
9. Stable resolution/candidate identifiers and a canonical processing
   timestamp.

## Planning Sequence

1. `validateModelFormatEvidence` validates the matrix identity, released format
   and adapter mapping, versions, source hash, GLB target, timestamp, decision
   token, and VSP3 scale evidence when applicable.
2. `createCanonicalModelCleanupPlan` fixes the coordinate and cleanup policies.
3. `planHybridModelPartitions` sorts components by semantic, connected, and
   component identity. Each compliant component stays whole. Oversized static
   components are intersected with deterministic X/Z grid cells. Integer
   estimates are distributed deterministically, and adjacent cells receive
   X/Z seam locks for positions, normals, UVs, and simplification. Oversized
   movable components fail.
4. `planAdaptiveModelLods` validates LOD0 and up to three unique candidate-
   scoped GLBs. It records requested target and exact actual triangle counts,
   measured error, fidelity result, retained level, or discard reason.
5. `createModelCollisionPlan` requires policy agreement and ensures a proxy is
   not the LOD0 resource.
6. `createCanonicalModelRuntimePlan` revalidates serialized cleanup, profile,
   partition, seam, LOD-attempt, collision, format, converter, child, transform,
   and resource evidence. Array ordering from a caller is not authority.
7. For a leaf, closure hash equals LOD0 content hash as required by the shared
   contract. For an assembly, canonical JSON binds parent, LODs, collision,
   sorted children, hierarchy, transforms, child content identities, and child
   manifest references before SHA-256 hashing.
8. Canonical manifest payload JSON is SHA-256 hashed and receives
   `model-manifest-&lt;digest&gt;`. `createModelProcessingManifest` performs the final
   shared contract validation. Durable orchestration persists and reuses all
   evidence timestamps for retries; changing immutable evidence, including a
   timestamp, intentionally changes identity.
9. `collectModelRollbackClosure` verifies the digest-to-ID binding and lists
   the manifest, LODs, collision, and sorted child manifest references. Entries
   distinguish manifest-identity, concrete resource-byte, and child
   asset-content digests.

## Runtime LOD Guidance

Multiply each retained level's measured geometric error in metres by the
current projected pixels per metre. Select the coarsest level at or below 1.5
pixels. When moving coarser, require the candidate to be at or below 1.2 pixels;
when moving finer, keep the prior coarser level until it exceeds 1.8 pixels.
This is the 20% transition hysteresis around the 1.5-pixel boundary.

## Failure Conditions

Planning returns no partial manifest when any of these occur:

- unsupported, metadata-only, or adapter-drifted source format;
- malformed or mismatched signed evidence;
- non-finite, non-floor-centred, or inconsistent geometry/texture facts;
- raised or incompatible processing profile;
- movable-object clipping or a static leaf that still exceeds limits after
  grid partitioning;
- missing, duplicate, unsafe, cross-candidate, or non-content-addressed GLB
  resource;
- missing/duplicate assembly output, unsafe child reference, invalid transform,
  child hierarchy failure, or incomplete seam-lock set;
- non-contiguous LODs, insufficient reduction, invalid error ordering, or
  retained-attempt audit drift;
- collision-policy mismatch or collision/LOD0 aliasing;
- converter/format/source/output mismatch, fidelity gate failure, or shared
  manifest validation failure; or
- digest/manifest identity mismatch during rollback-closure reconstruction.

## Side-Effect and Security Boundary

All functions are pure apart from standards-based Web Crypto hashing and return
deeply frozen values. They do not read files, use credentials, access the
network, log provider data, mutate storage, or evaluate the parent feature
flag. Fresh credential-free sandboxes, archive security, conversion execution,
rendering, durable state, audit telemetry, promotion, and rollback execution
remain hosted pipeline responsibilities.
