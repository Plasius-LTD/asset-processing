# TDR 0001: WGSL Shader Admission Flow

## Status

Accepted

## Date

2026-07-13

## Purpose

Define the exact processing and trust flow implemented by
`admitShaderQualification` and `revalidateShaderAdmissionReceipt`.

## Public Contracts

- `createShaderAdmissionPlan` returns seven mandatory steps targeting
  `webgpu-wgsl` and identifies `asset.pipeline.shader-store.enabled`.
- `admitShaderQualification` returns a discriminated
  `ShaderAdmissionResult`. Failure contains a bounded, stable typed
  diagnostic; success contains a `ShaderAdmissionReceipt`.
- `ValidatedGpuAssetPackage` retains defensive byte copies and exposes only
  copy-returning file accessors.
- `isTrustedShaderAdmissionReceipt` recognizes receipts created by the current
  module instance.
- `revalidateShaderAdmissionReceipt` replays the retained proof before a
  downstream promotion attempt.

The receipt records exact shader/interface identities, model and shader ABI
hashes, module digests, model ABI hashes, core and inventory digests,
subject-binding digest, matrix identity, required compile-unit IDs, required
cell IDs, and complete passed-result counts. These fields are evidence summaries
for inspection; the retained proof and revalidation are the authority.

## Required Inputs

Admission requires:

1. The exact immutable source-archive bytes.
2. A trusted-host materialization capability that receives those exact bytes
   and their package-computed digest, then returns a private extraction
   directory bound to the same digest.
3. The exact versioned stable-WebGPU matrix bytes.
4. The exact aggregate validation-evidence bytes.
5. The exact external attestation-reference bytes.
6. The exact cryptographic attestation-bundle bytes.
7. Immutable HTTPS URIs for the shader manifest, evidence, and attestation
   reference.
8. A trusted-host cryptographic verifier, asset version, source adapter, and
   canonical creation timestamp. The verifier is application dependency
   injection, never candidate/request data.

The caller may provide cancellation and a bounded timeout. The default timeout
is 120 seconds and the accepted range is 1 through 600 seconds. Source archives
are limited to 64 MiB; matrix, evidence, attestation-reference, and attestation
bundle inputs are individually limited to 16 MiB, with a 96 MiB aggregate
input ceiling. Required inputs must be non-empty. Contract JSON inputs must be
UTF-8 canonical JSON and are rejected above 64 levels or one million nodes
before recursive canonicalization.

## Processing Sequence

1. Validate bounded bytes, immutable identities, timestamp, trusted host
   capabilities, timeout, and cancellation inputs.
2. Hash a defensive copy of the source archive, pass it to the trusted
   materializer, require the returned digest to match, then lazy-load
   `@plasius/gpu-shader/node` and admit the private extraction. Admission
   deterministically reassembles final WGSL, verifies the
   complete declared file closure, reflects the interface, regenerates ABI
   hashes and requirements, and validates model fixtures and layout probes.
3. Bind the canonical interface-manifest bytes to the regenerated interface
   reference. Generate schemas, types, byte constants, and CPU codec source
   from that interface.
4. Require at least one exact compatible-model fixture.
5. Lazy-load `@plasius/gpu-shader/testing`, validate the exact stable matrix,
   hash the supplied source archive, and require complete passing Cartesian
   evidence for every declared compile unit and cell.
6. Verify that evidence and the cryptographic bundle match the exact
   attestation reference, then invoke the trusted host's bounded cryptographic
   verifier with defensive copies.
7. Attach the verified universal evidence reference to the already-qualified
   shader manifest core. `additionalValidationEvidence` remains empty until an
   additive policy is supported.
8. Package and digest-validate three independent assets:
   - the reflected GPU-interface manifest;
   - the final shader manifest and exact WGSL modules under one immutable
     version root; and
   - the evidence, attestation reference and bundle, matrix, and compile-unit
     inventory. The evidence subject binds the separately retained intake
     archive by `dataBundleSha256` rather than copying it into this package.
9. Retain the full proof in a process-local registry and return the frozen
   receipt.

Any error, abort, timeout, missing fixture, noncanonical input, stale digest,
failed/skipped/unavailable matrix result, attestation failure, or package
validation failure returns `ok: false`. Partial asset packages are not returned.
Public diagnostics contain only stable stage/category messages; raw dependency,
filesystem, and verifier errors are reserved for trusted host telemetry.

## Trusted Extraction Boundary

The extraction directory is not caller input. The trusted orchestrator injects
a materializer that receives the admission-owned archive snapshot, the
package-computed digest, and the admission abort signal. It must create a new
private directory, reject links and unsafe paths during extraction, not mutate
or retain the snapshot, prevent concurrent mutation of extracted files, return
the same digest, and clean up after the admission call. The returned directory
is then passed to `admitQualificationBundle`, which rejects symbolic links,
executable/undeclared content, missing closure files, and byte/digest drift.

The materializer is an application dependency, never a deserialized callback
or candidate-selectable implementation. Storage admission must preserve the
archive identity verified by the trusted qualification workflow.

The evidence URI and its attestation-reference URI must share one immutable
HTTPS version root. Admission maps each exact URI suffix to the corresponding
digest-validated file descriptor. The storage layer remains responsible for
requiring that root to be the managed Blob asset-id/version root.

## Receipt Revalidation and Promotion

Before promotion, the downstream pipeline calls
`revalidateShaderAdmissionReceipt` with a fresh cryptographic verifier. The
function revalidates all three asset packages, reparses the retained matrix,
recomputes complete evidence coverage, rechecks the attestation and shader-core
digest, and confirms subject-binding and passed-result counts.

The proof registry is a `WeakMap`, so trust does not survive serialization,
process boundaries, a second installed package instance, or module reload. A
pipeline crossing any of those boundaries must retain the original archive,
matrix, evidence, and attestation artifacts and rerun
`admitShaderQualification`. It must not reconstruct a receipt from its visible
fields.

Shader admission and revalidation are exported only from the Node-specific
`@plasius/asset-processing/shader-admission` subpath. The package root remains
browser-safe and contains no reference to filesystem admission tooling.

After revalidation, `@plasius/asset-pipeline` owns ordered immutable promotion,
catalog/channel pointer changes, profile-to-shader reference checks, and
rollback. Style profiles are JSON assets resolved against already-promoted
exact shader versions; they are not processed as shader qualification bundles.

## Support Policy

The successful path currently admits the stable-universal matrix only. The
physical fleet in `plasius-ltd-site#1513` is a real delivery prerequisite:
unavailable hardware is a failed cell, not an exception. Additive and XR
profiles remain inadmissible until `@plasius/gpu-shader` publishes a supported
additive policy and the processing flow verifies its independent evidence in
addition to universal evidence.
