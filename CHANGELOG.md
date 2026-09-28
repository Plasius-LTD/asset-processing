# Changelog

## Unreleased

- Refresh npm dependency lockfile to current supported stable versions (weekly maintenance, 2026-09-28). Refresh published Plasius package baselines after upstream releases.

- **Added**
  - Added pure canonical static-world model cleanup, signed format-evidence,
    semantic-first/grid assembly partitioning, seam-lock, adaptive LOD,
    projected-error selection, collision-policy, deterministic manifest, GLB
    runtime-closure, and atomic rollback planning helpers.
  - Added small-prop, adaptive high-poly, semantic/grid assembly, seam,
    collision-none/proxy, format drift, missing child, stable digest, and
    rollback closure fixtures.

- **Changed**
  - Refreshed compatible @plasius/* lockfile resolutions to the latest published releases.
 - Updated to the surviving `@plasius/asset-contracts` 0.3.1 line, and refreshed esbuild and transitive resolutions to clear the current npm audit findings.
  - Pinned fixed transitive `brace-expansion` and `nanoid` development-tool versions for the current high-severity denial-of-service advisories.
  - Raised statements and branches coverage thresholds to the package-wide 80% release floor.
  - Bound npm publication to the exact prepared `main` commit after successful push-triggered CI.

- **Fixed**
  - Re-derived serialized grid-cell geometry from each source-component extent
    so forged or drifted partition bounds cannot retain apparently valid seam
    evidence.
  - Bound every serialized partition, estimate, parent bound, and seam to a
    separate immutable source-component closure; rejected duplicate unsplit
    sources and symmetric outer-bound drift.
  - Generated bounded ordinal partition/seam identities so every accepted
    component path segment remains processable without token or length drift.
  - Required all three adaptive simplifier attempts at or above 10,000 LOD0
    triangles, zero attempts below that threshold, and the selected byte limit
    for every retained leaf GLB.
  - Snapshotted converter/fidelity evidence before asynchronous hashing and
    rejected blocked fidelity gates before returning runtime artifacts.
  - Recomputed manifest SHA-256 during asynchronous rollback reconstruction,
    deduplicated identical instanced-child dependencies, and rejected
    conflicting duplicate resource evidence.
  - Replaced locale-sensitive manifest, partition, seam, and closure sorting
    with a UTF-16 code-unit total order so hashes remain stable across worker
    locale and ICU configurations.
  - Kept the admission-depth regression fixture independent of the upstream canonicaliser's own matching depth guard.

- **Security**
  - Pinned patched transitive npm dependencies to clear the current audit baseline.
  - Added fail-closed source and npm-package admission for the administrative contributor registry and pinned the CI/CD runtime to Node.js 24.18.0 LTS.
  - Removed the npm write-token path, added a fail-closed npm 11.5.1-or-newer OIDC guard, and denied fork PR code access to self-hosted CI.
  - (placeholder)

## [0.2.0] - 2026-07-13

- **Added**
  - Added storage-neutral WGSL shader admission plans, exact archive/matrix/
    evidence/attestation verification, reflection-generated interface
    artifacts, immutable GPU asset packages, typed diagnostics, cancellation,
    bounded resource limits, and same-instance receipt revalidation through a
    Node-only package subpath.
  - Added architecture and technical-decision documentation for the trusted
    extraction, qualification, receipt, promotion, physical-fleet, and
    additive-matrix boundaries.

- **Changed**
  - Extended content-type resolution for canonical WGSL and JSON shader,
    interface, evidence, and style-profile artifacts.

- **Fixed**
  - Routed same-repository pull-request validation through the allowlisted
    reusable self-hosted workflow on `main`, restoring runner admission without
    exposing quarantined capacity to forks or shared npm cache state.
  - (placeholder)

- **Security**
  - Bound evidence and attestation URIs to one immutable version root, isolated
    filesystem admission from the browser-safe root API, and replaced raw
    dependency failures with stable non-sensitive diagnostics.

## [0.1.7] - 2026-07-03

- **Added**
  - Added professional Animation Adventure GLB material, texture, UV, normal,
    skinning, root-motion, and environment prop validation helpers.

- **Changed**
  - Restored the basic happy-hand gesture to the explicit farm-adventure clip
    id list so exported gesture clips can be represented and then quarantined
    through metadata when they are incompatible.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.6] - 2026-07-02

- **Added**
  - Added Mixamo movement-profile extraction for Animation Adventure clips,
    including motion mode, root/calibrated travel distance, speed, foot-contact
    windows, vertical bounds, and quarantine metadata.

- **Changed**
  - Removed the incompatible basic happy-hand gesture from the farm-adventure
    allow-list so it cannot be selected for Peasant Girl adventure playback.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.5] - 2026-06-30

- **Added**
  - Added Mixamo farm-adventure animation metadata extraction for duration,
    animated node targets, root translation availability, and skeleton
    compatibility.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.4] - 2026-06-28

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.3] - 2026-06-28

- **Added**
  - (placeholder)

- **Changed**
  - Refreshed development dependency baselines to `@types/node@26.0.1` and `eslint@10.6.0`.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.2] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.1] - 2026-06-21

- Scaffolded @plasius/asset-processing for the unified AI asset pipeline.
- Corrected scaffold documentation to identify the asset-processing package and ADR 0084 accurately.


[0.1.1]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.1
[0.1.2]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.2
[0.1.3]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.3
[0.1.4]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.4
[0.1.5]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.5
[0.1.6]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.6
[0.1.7]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.1.7
[0.2.0]: https://github.com/Plasius-LTD/asset-processing/releases/tag/v0.2.0
