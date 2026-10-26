# ADR 0008: Explicit Resource Manifest Planning

- Status: Accepted
- Date: 2026-10-26
- Work: [asset-processing Task 53](https://github.com/Plasius-LTD/asset-processing/issues/53)
- Parent: [site Feature 1153](https://github.com/Plasius-LTD/plasius-ltd-site/issues/1153)

## Context

The parent Feature explicitly requires a `resource-manifest` operation.
ADR 0006's published `model-conversion-plan-v1` ends in `package-runtime`.
Its catalog and ordered steps are already public contracts. General package
manifest qualification now exists in `@plasius/asset-contracts`; duplicating
its validator or moving execution into this planning package would violate
the existing ownership boundary.

## Decision

Add `createModelPackageProcessingPlan` and the separate versioned
`ModelPackageProcessingPlan` contract. Reuse the existing conversion planner
for all validation, captured identity, policy fields and immutable steps.
Insert a required `resource-manifest` step immediately before
`package-runtime`, after artifact generation. Preserve both existing plan
APIs, contract versions, operation catalogs and sequences. The new operation
type extends the conversion vocabulary without modifying the existing union.

The host's manifest handler uses published asset-contracts qualification on
the produced shared manifest, all file bytes and the complete package
inventory. Only its qualified result may reach packaging or promotion.
Processing/converter evidence and the general package inventory remain
distinct contracts owned by asset-contracts. No duplicate schema, qualification
implementation, format SDK, archive/transport executor or package is created.

## Rollout and failure behavior

The backend host evaluates remote `gpu.model.conversion.enabled` before
selecting the new plan; the package only records that inherited key.
Disabled/rollback keeps the host's existing plan/loader with no new stage.
Enabled selection requires a qualified handler and fixtures. Manifest
qualification failure always stops packaging/promotion, including diagnostic
continuation mode; never silently retry failed integrity through a legacy
path. The host owns acquisition authorization, limits, cancellation and
bounded payload-free diagnostics. Capability N/A for this headless boundary.

## Alternatives

- Insert a stage into the existing v1 plan: rejected because existing callers
  can depend on the exact operation sequence and exhaustive operation union.
- Rename `package-runtime`: rejected because qualification and packaging have
  separate inputs, outputs and failure gates.
- Implement qualification here: rejected because the shared package already
  provides it and this package remains pure planning metadata.

## Validation and release

Requirements tests cover every source format, CAD-only tessellation, stage
ordering, policy retention, deterministic serialization, immutable output,
bounded existing input rejection and unchanged v1/legacy contracts.
Coverage must include changed source and retain >=80% line coverage. Full
typecheck/lint/tests/build/audit/pack and packed/public ESM, CJS and declaration
consumers verify the additive release. Browser bundling checks this pure root
entry. Publish only through approved `cd.yml` on exact `main`, using the
`production` OIDC job and registry integrity/provenance verification. No site
deployment or full Feature/conformance completion is implied.
