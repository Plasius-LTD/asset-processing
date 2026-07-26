# @plasius/asset-processing

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

External free-model processing plans preserve raw source assets and normalize
runtime outputs to glTF/GLB, meters, Y-up, `-Z` forward, floor-centered origin,
stable file digests, four LOD budgets, optimized textures, and collision
proxies for game runtime promotion.

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

- [ADR 0003: WGSL Shader Admission Boundary](./docs/adrs/adr-0003-wgsl-shader-admission-boundary.md)
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
self-hosted runners. Release preparation and npm publication use GitHub-hosted
runners with Node.js 24.18.0 LTS. CD remains disabled until the npm trusted
publisher binding is verified and the legacy token fallback is removed.
<!-- END PLASIUS RELEASE INTEGRITY -->
