# ADR 0005: Canonical Static-World Model Processing

## Status

Accepted

## Date

2026-08-20

## Context

Provider and future generated models must enter the promoted catalog through
one reproducible processing boundary. Conversion workers and hosted
orchestration need shared decisions for coordinate cleanup, leaf limits,
assembly partitioning, LOD retention, collision, runtime artifacts, and atomic
rollback. Those decisions cannot rely on converter-specific defaults or
caller-authored success flags.

`@plasius/asset-contracts` 0.3.1 already owns the canonical
`ModelProcessingManifest` and validates its coordinate basis, LOD ordering,
collision and fidelity gates, child graph, and public-safe resource references.
This package must plan and validate the work that produces that manifest while
remaining storage-neutral and browser-safe.

## Decision

Add an additive, pure root-package API for `static-world-v1` processing:

- Accept only the signed v1 provider-format matrix and its released adapter
  mapping. Metadata-only and drifted formats fail closed. VSP3 additionally
  requires authoritative scale evidence.
- Normalize to metres, Y-up, `-Z` forward, floor-centred origin, and
  counter-clockwise outward winding; validate finite geometry, repair
  normals/tangents, sort primitives deterministically, and embed validated
  runtime textures.
- Apply request-scoped profiles that may only tighten the static-world-v1 leaf
  limits. A different or raised profile requires a separately released
  operator policy and is not silently accepted.
- Preserve semantic nodes and connected components before splitting oversized
  static geometry on the configured X/Z grid. Movable objects are never
  clipped. Adjacent grid leaves require identical position, normal, UV, and LOD
  border locks. Retain immutable source-component facts in the plan and
  re-derive every serialized partition, estimate, parent bound, and seam from
  them. Use bounded ordinal-derived partition identities rather than embedding
  provider component IDs in manifest tokens.
- Keep LOD0 and require 50%, 20%, and 8% attempts for models with at least 10,000
  triangles. Retain only levels with at least 512 triangles, at least 30%
  reduction from the preceding retained level, monotonic measured error, and
  passing fidelity evidence. Models below the threshold have no simplifier
  attempts. Runtime guidance uses 1.5 projected pixels and 20% hysteresis.
- Generate collision independently from cleaned LOD0. A signed category policy
  must either require a distinct proxy or explicitly allow none.
- Require candidate-scoped, content-addressed GLB resources. Assemblies expose
  one parent manifest and immutable leaf references; caller array order cannot
  affect child order or identity.
- Hash canonical JSON with standards-based Web Crypto SHA-256. The digest binds
  a deterministic manifest ID, and assembly closure identity includes every
  LOD, collision artifact, child content identity, child manifest reference,
  hierarchy edge, and transform. Snapshot contract-validated evidence before
  the first asynchronous hash, reject blocked fidelity, and recompute the
  manifest digest when reconstructing rollback closure. Identical child
  instances deduplicate one dependency; conflicting evidence fails closed.
- Revalidate the final result through
  `createModelProcessingManifest` from `@plasius/asset-contracts` rather than
  duplicating that public contract validator.

The API returns plans only. It performs no download, archive extraction,
conversion, rendering, storage mutation, catalog promotion, flag evaluation,
or rollback side effect.

## Trust and Rollout Boundaries

Format, collision, and fidelity decision tokens originate in trusted policy
services. This package validates bounded token shape and subject consistency;
it does not hold signing keys or treat candidate data as a verifier.

`asset.pipeline.unified-ai-assets.enabled` remains the parent remotely
controlled rollout and kill switch. Hosted orchestration evaluates it before
starting or resuming acquisition and processing. The package records the
governed path but does not evaluate remote state. Disabling the feature stops
new work while immutable catalog versions remain available for rollback.

## Alternatives Considered

- Put cleanup decisions in each converter: rejected because format-specific
  defaults would drift and could produce incompatible manifests.
- Put planning directly in the hosted site: rejected because converter jobs,
  MCP services, CI fixtures, and future generator ingestion need the same pure
  boundary.
- Implement package-specific SHA-256: rejected because custom cryptography is
  unnecessary; Web Crypto supplies the approved portable primitive.
- Trust serialized plans without revalidation: rejected because a queue or
  database record could lose seam locks, children, evidence, or LOD audit
  fields before promotion.

## Consequences

- All provider and future generator outputs can use one deterministic path.
- Large static assemblies retain semantic identity and seam constraints while
  movable props fail instead of being clipped.
- Storage promotion and rollback can operate on an explicit immutable closure.
- Manifest creation is asynchronous because Web Crypto hashing is asynchronous.
- Operator-raised profiles and actual conversion implementations remain
  separate governed work.

## Related Work

- `Plasius-LTD/asset-processing#21`
- `Plasius-LTD/plasius-ltd-site#902`
- `Plasius-LTD/plasius-ltd-site#903`
- `Plasius-LTD/plasius-ltd-site#1484`
- Plasius site ADR 0084, ADR 0094, ADR 0098, and TDR 0004
