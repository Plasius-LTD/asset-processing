# @plasius/asset-processing

[![npm version](https://img.shields.io/npm/v/@plasius/asset-processing.svg)](https://www.npmjs.com/package/@plasius/asset-processing)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/asset-processing/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/asset-processing/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/asset-processing)](https://codecov.io/gh/Plasius-LTD/asset-processing)
[![License](https://img.shields.io/github/license/Plasius-LTD/asset-processing)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Processing operation contracts for Plasius model cleanup, texture normalization,
LOD, collision proxy, WGSL shader admission, and runtime packaging.

## Install

```bash
npm install @plasius/asset-processing
```

## Scope

This package is part of the unified AI asset pipeline package family. It is scaffolded from the standard `@plasius/*` package template and owns the asset processing boundary described in the Plasius asset pipeline design.

## Feature Flag

- `asset.pipeline.unified-ai-assets.enabled`
- `asset.pipeline.external-model-harvest.enabled`
- `asset.pipeline.shader-store.enabled`
- `gpu.model.conversion.enabled`

The shader-store flag is the remote rollout and kill switch for public shader
candidate submission and promoted runtime discovery. Private qualification may
run while the flag is disabled; this package records the key but does not
evaluate it. The `gpu.shader.style.select` capability controls user-visible
style discovery and selection only; it is not admission, evidence, storage, or
promotion authority. Default-profile rendering does not depend on that
capability.

## WGSL Shader Admission

Final assembled WebGPU WGSL is authoritative for GPU records, bindings,
alignment, sizes, vertex inputs, and ABI hashes. Callers cannot supply layouts,
ABI hashes, matrix counts, or pass flags as admission evidence.

The admission API is intentionally isolated in the Node-only
`@plasius/asset-processing/shader-admission` export so existing browser-safe
model helpers never resolve filesystem tooling. `createShaderAdmissionPlan`
describes the mandatory storage-neutral flow. `admitShaderQualification`
consumes exact source-archive, matrix, aggregate
evidence, attestation-reference, and cryptographic-attestation-bundle bytes. It
then:

```ts
import {
  admitShaderQualification,
  revalidateShaderAdmissionReceipt,
} from "@plasius/asset-processing/shader-admission";
```

- lazy-loads `@plasius/gpu-shader/node` to reassemble WGSL, reflect the final
  interface, regenerate ABI hashes, generate schemas/types/constants/codecs,
  and validate exact model fixtures;
- lazy-loads `@plasius/gpu-shader/testing` to require a complete passing
  compile-unit × stable-matrix Cartesian product and verify evidence
  provenance;
- creates independently digest-validated GPU-interface, shader, and validation
  evidence asset packages without writing to storage; and
- returns typed, bounded diagnostics instead of partial packages when any gate
  fails.

`ValidatedGpuAssetPackage` retains defensive copies of exact file bytes.
`revalidateShaderAdmissionReceipt` replays package, matrix, evidence,
attestation, core-digest, and subject-binding checks before downstream
promotion. Receipt trust is intentionally limited to the module instance that
created it. A serialized or cross-process receipt is not trusted; retain the
original proof artifacts and rerun full admission in the receiving process.
The cryptographic verifier is a trusted host dependency and must never be
constructed from candidate/request data.

The trusted host owns the extraction boundary. Admission passes a defensive
snapshot and computed digest of the exact archive to the host-injected
`materializeQualificationBundle` capability. That capability must create a
fresh private directory, reject unsafe paths and links, return the matching
archive digest, not mutate or retain the snapshot, keep the directory immutable
during admission, and clean it up afterward. Candidate/request data cannot
provide the capability. The package
validates the extracted closure but remains archive-format and storage neutral.
The returned evidence asset binds the source archive by its computed
`dataBundleSha256`; it does not duplicate the potentially large intake archive.
The storage/materialization host must retain that exact immutable archive for
cross-process re-admission and audit.

Evidence and attestation-reference URIs must resolve beneath the same immutable
HTTPS version root, and their relative URI paths are bound to the corresponding
package file descriptors. Downstream storage additionally enforces the managed
Blob root and asset-id/version path.

`resolveAssetProcessingContentType` returns the canonical
`text/wgsl; charset=utf-8` type for WGSL and `application/json` for shader,
interface, evidence, and style-profile manifests while preserving existing
model content-type behavior.

### Delivery Boundary

This package does not promote assets, update catalogs, select styles, or roll
back channels. `@plasius/asset-pipeline` must revalidate the receipt, promote
exact dependencies in order, resolve style-profile references against promoted
shader versions, update catalog pointers atomically, and own rollback.

Production stable-universal support remains blocked on the authorized physical
fleet and device controllers tracked by `plasius-ltd-site#1513`. SwiftShader or
workflow scaffolding alone cannot produce a production support claim. Missing
runners, skips, timeouts, device loss, and unavailable adapters fail admission.

Additive and XR shader evidence also fails closed until
`@plasius/gpu-shader` publishes an approved additive matrix policy. The current
admission path attaches universal evidence only.

## External Model Processing

### Multi-format conversion planning

`createModelConversionProcessingPlan` creates an immutable, side-effect-free
plan for a model source and target. It records canonical source/target formats,
runtime, fault-tolerance mode, resource-packaging policy, and the inherited
`gpu.model.conversion.enabled` rollout key. The hosted coordinator must
evaluate that remote flag before acquisition or conversion; this package does
not evaluate remote state or execute converters.

The operation vocabulary includes validation, conversion, CAD tessellation,
texture optimization, LOD generation, collision-proxy generation, and runtime
packaging. CAD tessellation is included only for STEP, IGES, and IFC sources;
other plans omit that step. The legacy `createDefaultProcessingPlan` contract
remains unchanged.

```ts
import { createModelConversionProcessingPlan } from "@plasius/asset-processing";

const plan = createModelConversionProcessingPlan({
  assetId: "building-42",
  sourceFormat: "ifc",
  targetFormat: "glb",
  targetRuntime: "gpu-shared",
  faultToleranceMode: "continue-with-diagnostics",
  resourcePackagingPolicy: "manifest-referenced",
});
```

`resolveModelSourceFormat` normalizes `.stp` to STEP and `.igs` to IGES.
`resolveModelContentType` returns registered model media types for glTF/GLB,
OBJ/MTL, STEP/IGES, and USDA/USDZ; ambiguous or unregistered binary formats use
`application/octet-stream`. IFC uses the buildingSMART-documented
`application/x-step` type. Canonical runtime manifests already carry converter diagnostics and semantic loss reports in their
`converter` evidence; `createCanonicalModelRuntimePlan` validates and retains
these fields without introducing a second manifest contract.

The package root now exposes pure, immutable planning and validation helpers for
the `static-world-v1` model pipeline. They do not download, unpack, convert,
render, store, promote, or roll back assets. Hosted orchestration supplies
validated evidence and performs those side effects only after these helpers
return a complete plan.

`createStaticWorldV1ProcessingProfile` applies the default leaf ceilings of
1,000,000 LOD0 triangles, 100 MiB GLB, 64 MiB aggregate textures, 4K texture
dimension, and 32-metre X/Z cells. Request profiles may tighten those values;
this package fails closed if they raise or replace the profile. Operator-raised
profiles require a separately released policy and are not accepted by this API.

`validateModelFormatEvidence` admits only formats in the signed v1 matrix:
glTF/GLB through the dedicated adapter; OBJ, FBX, PLY, STL, DAE, 3DS, and LWO
through the pinned Assimp importer; Blend and USD family inputs through pinned
Blender LTS; and VSP3 through sandboxed OpenVSP when authoritative scale
evidence is present. MAX, Maya, F3Z, unknown formats, adapter drift, invalid
tokens, and non-GLB targets fail with `unsupported-source-format` or a bounded
validation error. The decision token is evidence from the trusted policy
service; this storage-neutral package validates its shape and matrix binding but
does not hold policy signing keys.

`createCanonicalModelCleanupPlan` fixes the output basis to metres, Y-up, `-Z`
forward, a floor-centred origin, and counter-clockwise outward winding. It also
requires finite geometry, repaired normals/tangents, deterministic primitive
ordering, and embedded validated runtime textures.

`planHybridModelPartitions` preserves semantic nodes and connected components
first. Oversized static geometry is then split on the configured X/Z grid.
Every adjacent grid leaf receives a deterministic lock for identical border
positions, normals, UVs, and LOD simplification. Movable geometry is never
clipped: a movable object that cannot satisfy one leaf fails instead.
Plans retain the complete immutable source-component facts used to derive each
leaf. Serialized plans re-derive exact ordinal partition IDs, the complete cell
set, cell bounds, estimates, source identity, and parent bounds from that
separate evidence before seam evidence is accepted. Provider component IDs may
use the full accepted path-segment grammar and length; bounded ordinal-derived
partition and seam IDs keep them safe for manifest instance tokens.

`planAdaptiveModelLods` always retains LOD0 and, at 10,000 or more LOD0
triangles, requires and records all three attempts at 50%, 20%, and 8%. Assets
below the threshold require zero simplifier attempts. A candidate level is discarded
when it fails fidelity, saves less than 30% from the preceding retained level,
falls below 512 triangles, or regresses geometric error. Exact counts and
measured error remain in the plan. `selectAdaptiveModelLod` selects the
coarsest level at no more than 1.5 projected pixels and applies 20% transition
hysteresis.

`createModelCollisionPlan` keeps collision separate from cleaned LOD0. A proxy
is mandatory unless signed category-policy evidence explicitly allows
`collision: none`; semantic confidence cannot override this gate.

`createCanonicalModelRuntimePlan` revalidates all serialized subplans, checks
the exact format/converter/LOD0 binding, requires all runtime artifacts to be
content-addressed candidate-scoped GLBs, applies the selected byte limit to
every retained leaf GLB, and rejects a blocked fidelity gate. Converter,
fidelity, gate, and timestamp evidence is contract-validated and frozen before
the first asynchronous hash so caller mutation cannot change the result. Final
contract validation remains delegated to `@plasius/asset-contracts`.

The runtime planner uses standards-based Web Crypto SHA-256 over canonical JSON
to create a stable manifest identity. Assembly children are ordered by planned
partition rather than caller order. `collectModelRollbackClosure` is
asynchronous: it recomputes that digest from the normalized manifest before
returning the exact parent, LOD, collision, and child-reference closure for
atomic promotion or rollback. Repeated assembly instances of the same immutable
leaf share one deduplicated dependency entry; the same URI with conflicting
digest evidence fails. A child entry labels
its digest as `asset-content`; it does not misrepresent the child model hash as
the bytes hash of its separately stored manifest. The parent entry similarly
labels its digest as `manifest-identity`, while concrete GLBs use
`resource-bytes`.

Durable orchestration must persist and reuse the canonical `processedAt` and
evidence timestamps for an idempotent retry. Timestamps are part of immutable
evidence, so changing one intentionally creates a different manifest identity.

```ts
import {
  createCanonicalModelCleanupPlan,
  createStaticWorldV1ProcessingProfile,
  planAdaptiveModelLods,
  planHybridModelPartitions,
  validateModelFormatEvidence,
} from "@plasius/asset-processing";

const profile = createStaticWorldV1ProcessingProfile({
  maxTriangles: 500_000,
  maxPartitionCellMetres: 16,
});
const cleanup = createCanonicalModelCleanupPlan({
  profile,
  formatEvidence: validateModelFormatEvidence(signedFormatEvidence),
});
const partitions = planHybridModelPartitions({ profile, components });
const lods = planAdaptiveModelLods({
  resolutionId,
  candidateId,
  lod0,
  attempts: simplifierAttempts,
});
```

The inherited remote kill switch is
`asset.pipeline.unified-ai-assets.enabled`. This package records the governed
processing contract but does not evaluate flags. The hosted coordinator must
stop acquisition/processing when disabled; already immutable catalog versions
remain referenceable for rollback.

## Mixamo Animation Metadata

`extractMixamoAnimationMetadata` accepts parsed glTF/GLB JSON and returns the
clip duration, animated node targets, root-translation availability, skeleton
compatibility, and whether the clip is part of the farm-adventure v1 allow-list.
It also returns a `movementProfile` used by Animation Adventure load-time
validation, including motion mode, root/calibrated travel distance, expected
speed, foot-contact windows, vertical bounds, loopability, displacement
permission, and quarantine reason when a clip must not drive adventure playback.

## Professional Animation Asset Validation

Professional Animation Adventure assets can be checked before renderer mount:

- `extractGltfMaterialTextureMetadata` reports material count, texture/image
  count, embedded/external image buffers, UVs, normals, skinning primitives,
  maximum joint count, diffuse/base-color textures, normal textures, and
  unresolved texture references.
- `validateProfessionalCharacterAsset` fails characters that are not skinned,
  lack UVs/normals, omit diffuse or normal textures, or point at missing image
  buffers.
- `validateProfessionalRootMotionProfile` rejects travel clips that rely on
  calibrated in-place motion instead of authored root translation.
- `validateEnvironmentPropAsset` validates textured farm/environment GLBs,
  optional normal maps, finite bounds, and ground-level origins.

## Related Documents

- [ADR 0005: Canonical Static-World Model Processing](./docs/adrs/adr-0005-canonical-static-world-model-processing.md)
- [ADR 0003: WGSL Shader Admission Boundary](./docs/adrs/adr-0003-wgsl-shader-admission-boundary.md)
- [TDR 0002: Canonical Model Planning and Manifest Flow](./docs/tdrs/tdr-0002-canonical-model-planning-flow.md)
- [TDR 0001: WGSL Shader Admission Flow](./docs/tdrs/tdr-0001-wgsl-shader-admission-flow.md)
- plasius-ltd-site `docs/Design/unified-ai-asset-pipeline.md`
- plasius-ltd-site `docs/adrs/adr-0084-unified-ai-asset-pipeline-packages.md`
- plasius-ltd-site `docs/tdrs/tdr-0004-unified-ai-asset-pipeline.md`

## Development

```bash
npm install
npm run build
npm test
npm run test:coverage
npm run pack:check
```

## Governance

- Security policy: [SECURITY.md](./SECURITY.md)
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- ADRs: [docs/adrs](./docs/adrs)
- TDRs: [docs/tdrs](./docs/tdrs)
- CLA and legal docs: [legal](./legal)

## License

Apache-2.0

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs on approved
self-hosted runners through the allowlisted reusable workflow on `main`.
Same-repository pull requests call that stable admission point; fork PR code is
denied. Shared package-manager caching is disabled on quarantined runners.
Publication uses the GitHub-hosted `production` job with Node 24 and npm 11.5.1
or newer. It is token-free and proceeds only while the prepared SHA is the
exact `main` head after successful push-triggered CI. Do not dispatch CD until
the npm trusted-publisher binding is verified.
<!-- END PLASIUS RELEASE INTEGRITY -->
