# ADR 0003: WGSL Shader Admission Boundary

## Status

Accepted

## Context

Shader assets must not reach storage promotion or runtime merely because a
caller supplies a layout description, ABI hash, or successful test flag. Those
claims can become stale when WGSL fragments are assembled differently, model
records drift, or qualification evidence refers to different bytes.

The package also needs to remain storage-neutral. It validates and packages
exact artifacts, while the asset pipeline and model-storage implementation own
catalog changes, promotion, rollback, and Blob operations.

## Decision

Final assembled WebGPU WGSL is the source of truth for shader interfaces.
`@plasius/asset-processing` delegates assembly, reflection, ABI regeneration,
schema and codec generation, model-fixture validation, and qualification
validation to `@plasius/gpu-shader`. It does not accept caller-authored record
offsets, field layouts, ABI hashes, pass flags, or matrix counts as admission
authority.

Admission is exposed only through the Node-specific
`@plasius/asset-processing/shader-admission` subpath. That implementation loads
the Node-only `@plasius/gpu-shader/node` and `@plasius/gpu-shader/testing`
entry points lazily when admission or receipt revalidation runs. The root
package remains browser-safe and does not reference the reflection or
qualification toolchain.

Admission consumes exact source-archive, matrix, validation-evidence,
attestation-reference, and cryptographic-attestation-bundle bytes. A successful
result contains digest-validated GPU-interface, shader, and validation-evidence
asset packages plus the generated schemas, TypeScript types, byte constants,
and codec source.

The package retains the admitted proof material in memory and
`revalidateShaderAdmissionReceipt` replays asset-byte, matrix, Cartesian
evidence, attestation, core-digest, and subject-binding checks. A receipt is
trusted only when it was created by the same loaded module instance. A
serialized, reconstructed, or cross-process receipt is never promotion
authority; those workflows must rerun full admission from the retained exact
artifacts.

## Trust and Rollout Boundaries

- A host-injected `materializeQualificationBundle` capability receives a
  defensive copy and package-computed digest of the exact immutable archive.
  It must produce a fresh private directory and return the same digest. The
  package validates that extracted data-only closure but remains archive-format
  and storage neutral. Candidate/request data cannot supply the capability.
- Evidence and attestation-reference URIs must share one immutable HTTPS
  version root and are mapped exactly to their packaged file descriptors.
  Model storage additionally owns enforcement of the managed Blob root and
  asset-id/version path.
- `asset.pipeline.shader-store.enabled` is the rollout and kill-switch flag for
  public candidate submission and promoted runtime discovery. Private
  qualification may run while disabled. The admission plan identifies the
  flag, while the upstream orchestrator owns remote evaluation.
- `gpu.shader.style.select` controls user-visible style discovery and selection.
  It is not admission, storage, evidence, or promotion authority and cannot
  bypass a disabled shader-store flag.
- Production stable-universal claims require every declared compile-unit ×
  matrix-cell result to pass. Missing physical runners, skipped cells,
  timeouts, device loss, and unavailable adapters fail closed.
- The physical fleet tracked by `plasius-ltd-site#1513` is not yet available.
  Until that task supplies authorized runners and device controllers, no
  production universal-support claim may be made from workflow scaffolding or
  SwiftShader alone.
- Additive and XR qualification fail closed until an approved additive matrix
  policy is released by `@plasius/gpu-shader`. The current admission path emits
  no additional validation evidence.
- The archive materializer and cryptographic verifier are injected by trusted
  host code. Candidate or request data cannot select, configure, or implement
  either capability.

## Downstream Responsibility

`@plasius/asset-pipeline` must revalidate a trusted receipt immediately before
promotion, promote the exact interface and evidence dependencies before the
shader, and update catalog pointers only after all immutable assets exist. It
also owns style-profile reference resolution, catalog publication, atomic
promotion, and rollback. This package does not interpret the style-selection
capability as approval and does not mutate catalogs or storage.

## Consequences

- CPU-facing layouts and schemas cannot drift independently from final WGSL.
- Evidence substitution and incomplete support matrices fail before a
  promotable package is returned.
- Receipt trust is deliberately process-local; durable orchestration retains
  the original proof artifacts and reruns admission rather than trusting a
  serialized summary.
- Large source archives are retained once by the trusted intake/storage host
  and bound into evidence by digest; evidence packages do not duplicate them.
- Production delivery remains blocked, correctly, until the declared physical
  matrix can be executed completely.
