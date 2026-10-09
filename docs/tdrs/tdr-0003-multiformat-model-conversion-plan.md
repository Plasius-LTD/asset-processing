# TDR 0003: Multi-Format Model Conversion Plan

## Status

Accepted

## Purpose

Define the immutable metadata contract used by the host to coordinate model
validation, conversion, CAD tessellation, texture optimization, LOD,
collision, and runtime packaging.

## Contract

`createModelConversionProcessingPlan` accepts an asset ID, canonical source
and target formats, target runtime, fault-tolerance mode, and resource
packaging policy. It returns a frozen `model-conversion-plan-v1` with the
inherited `gpu.model.conversion.enabled` key and ordered steps. It performs no
file access, parsing, network requests, flag evaluation, or conversion.

The operation catalog is:

1. `validate-model`
2. `convert-model`
3. `tessellate-cad` for STEP, IGES, or IFC inputs only
4. `optimize-textures`
5. `generate-lod`
6. `generate-collision-proxy`
7. `package-runtime`

Fault tolerance is explicitly `fail-closed` or
`continue-with-diagnostics`. Resource packaging is `embedded`,
`relative-package`, or `manifest-referenced`. Host services must enforce the
flag, input/resource budgets, and any selected fault behavior.

## Source Formats and File Resolution

The canonical source list is glTF, GLB, OBJ, FBX, STEP, IGES, IFC, USD,
USDA, USDC, and USDZ. `.stp` resolves to STEP and `.igs` resolves to IGES.
Filename matching is case-insensitive and ignores URL query or fragment
suffixes. MTL remains a recognized auxiliary text file for content-type
resolution, not a standalone model source format.

| Extensions | Content type | Reason |
| --- | --- | --- |
| `.gltf` | `model/gltf+json` | Khronos and IANA registered media type |
| `.glb` | `model/gltf-binary` | Khronos and IANA registered media type |
| `.obj` | `model/obj` | IANA model media type |
| `.mtl` | `model/mtl` | IANA model media type |
| `.step`, `.stp` | `model/step` | IANA model media type |
| `.iges`, `.igs` | `model/iges` | IANA model media type |
| `.ifc` | `application/x-step` | buildingSMART IFC SPF media type |
| `.usda` | `model/vnd.usda` | IANA USD ASCII media type |
| `.usdz` | `model/vnd.usdz+zip` | IANA media type; USDZ is a ZIP archive |
| `.fbx`, `.usd`, `.usdc`, unknown | `application/octet-stream` | Binary or media type is ambiguous/unregistered |

The content-type helper is metadata only. It does not validate file bytes,
content sniffing, archive structure, or format support. The host must not trust
an extension as proof of file validity.

## Runtime Manifest Evidence

The canonical `ModelProcessingManifest.converter` field from
`@plasius/asset-contracts` carries converter identity, hashes, typed
diagnostics, and semantic losses. The processing package reuses that contract;
it does not add a second manifest schema. Existing canonical runtime-plan
validation copies and retains the converter evidence in the final manifest.

## Failure Behavior

- Invalid asset IDs, formats, runtimes, fault modes, or packaging policies
  throw bounded `TypeError` messages that do not echo caller input.
- Unknown filename extensions return no source format and generic binary
  content type.
- No conversion result is produced by this package; host-side failures must
  use the selected fail-closed or diagnostic-continuation policy.

## Verification

Tests cover operation ordering, CAD step selection, immutable output, format
alias resolution, content-type mapping, invalid inputs, and retained converter
diagnostics/losses in canonical runtime manifests. Package-wide coverage,
typecheck, lint, build, audit, and pack verification remain release gates.

## References

- [IANA model media types](https://www.iana.org/assignments/media-types/model)
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [buildingSMART IFC formats](https://technical.buildingsmart.org/standards/ifc/ifc-formats/)
- [OpenUSD USDZ file format specification](https://openusd.org/files/USDZFileFormatSpecification.pdf)
