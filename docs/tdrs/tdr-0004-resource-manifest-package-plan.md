# TDR 0004: Resource Manifest Package Plan

- Status: Accepted
- Decision: [ADR 0008](../adrs/adr-0008-explicit-resource-manifest-planning.md)

`createModelPackageProcessingPlan` accepts
`CreateModelConversionProcessingPlanInput` and returns
`ModelPackageProcessingPlan` with `contractVersion: "model-package-plan-v1"`.
All identity and policy validation is delegated to the existing conversion
planner. It performs no I/O, flag evaluation or manifest qualification.

The ordered required stages are:

1. `validate-model`
2. `convert-model`
3. `tessellate-cad` for STEP, IGES and IFC only
4. `optimize-textures`
5. `generate-lod`
6. `generate-collision-proxy`
7. `resource-manifest`
8. `package-runtime`

All three packaging policies retain the qualification stage. The host passes
the generated shared `AssetManifest`, complete file bytes and the package
entrypoint/resource inventory to `qualifyModelResourceManifest` from its
explicit published `@plasius/asset-contracts@0.8.3` dependency (or a compatible
qualified release). The returned immutable qualified manifest is the handler
output; package-runtime may consume it only after success. This binds the
closed relative paths, roles, MIME types, byte lengths, SHA-256 identities and
converter diagnostics through the existing shared contracts. The host must
not force the general resource inventory into LOD-only processing fields.

The package plan and each step are frozen, serializable metadata. It retains
the validated primitive identity, formats, runtime, fault policy, packaging
policy and inherited flag key. Source parsing, converter selection, byte
acquisition, budgets, deadlines and side effects remain host responsibilities.

Enabled backend `gpu.model.conversion.enabled` selects this plan only after
handler/fixture qualification. Disabled or rollback uses the existing plan
and loader with no new stage; no capability is required. An integrity failure
blocks packaging/promotion in every fault mode and must not silently fall
back to a different model or unqualified legacy path. Diagnostics exclude
payloads, signed URLs and credentials.

The legacy plan and `model-conversion-plan-v1` keep their original sequences,
types and catalogs. This is an additive minor package release through approved
`cd.yml`/`production`; no local publication or site deployment. Tests and
packed/public consumers prove ordering, format-specific steps, all retained
policies, validation/immutability and old-plan compatibility.
