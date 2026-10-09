# ADR 0006: Multi-Format Model Conversion Planning

## Status

Accepted

## Date

2026-10-09

## Context

Feature `plasius-ltd-site#1153` requires a format-neutral planning boundary for
model conversion and runtime packaging. The package already has a legacy
glTF-oriented `AssetProcessingPlan` and a separate canonical static-world
planner. Replacing either contract would couple unrelated consumers to the
new rollout and could break existing public callers.

The shared `@plasius/asset-contracts` `ModelProcessingManifest` already owns
converter identity, diagnostics, and conversion-loss evidence. This package
must reuse that manifest contract rather than define parallel report fields.

## Decision

Add an additive `ModelConversionProcessingPlan` API alongside the legacy plan.
The new plan records canonical source and target formats, target runtime,
fault-tolerance mode, resource-packaging policy, the inherited
`gpu.model.conversion.enabled` flag key, and immutable processing steps.
STEP, IGES, and IFC sources include a required CAD tessellation step; other
formats omit it.

The package remains storage- and converter-neutral. The hosted coordinator
evaluates the remote feature flag and owns acquisition, converter selection,
resource limits, diagnostics, and side effects. Runtime manifests continue to
carry diagnostics and semantic loss through the shared `converter` evidence.
The existing `createDefaultProcessingPlan` and `ASSET_PROCESSING_OPERATIONS`
remain unchanged for backward compatibility.

Filename resolution recognizes canonical source formats and aliases (`.stp`
to STEP and `.igs` to IGES). Content-type resolution uses registered model
media types for glTF/GLB, OBJ/MTL, STEP/IGES, USDA, and USDZ;
`application/x-step` is used for IFC as documented by buildingSMART. Formats
that are ambiguous or lack a registered type use
`application/octet-stream`.

## Alternatives Considered

- Replace the legacy default plan: rejected because it would change required
  steps for existing consumers.
- Add format conversion fields to `ModelProcessingManifest`: rejected because
  the manifest is owned and validated by `@plasius/asset-contracts`; its
  existing converter evidence already stores diagnostics and losses.
- Put conversion execution in this package: rejected because it would mix
  pure contracts with storage, networking, parser dependencies, and rollout
  authority.

## Consequences

- Existing callers keep their current plan type and operation sequence.
- New consumers have a stable, serializable plan for multi-format work.
- Host services remain responsible for enforcing the flag and the resource
  budget before performing conversion.
- Unknown extensions remain generic binary content and cannot silently claim
  a supported source format.

## Validation and Release Implications

- Tests cover all operation names, immutable default plans, CAD-only
  tessellation, format aliases, content-type mapping, and invalid plan inputs.
- Existing runtime-manifest tests confirm converter diagnostics and losses are
  retained by the canonical `ModelProcessingManifest` path.
- README and Unreleased changelog document the public API. Package changes use
  the normal PR, exact-SHA CI, and approved `cd.yml`/`production` OIDC release
  workflow.
