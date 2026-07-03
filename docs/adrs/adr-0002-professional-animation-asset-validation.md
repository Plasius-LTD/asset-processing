# ADR 0002: Professional Animation Asset Validation

## Status

Accepted

## Context

The Animation Adventure demo must fail before playback when the active assets
cannot support a professional WebGPU path. The current failure mode allowed
untextured proxy rendering, calibrated in-place travel, floating props, and
missing texture buffers to reach runtime before the user could see the issue.

## Decision

Keep `@plasius/asset-processing` as a renderer-agnostic validation boundary and
add extraction helpers for parsed glTF/GLB JSON:

- material, texture, image-buffer, UV, normal, skinning, and joint-count
  metadata
- professional character validation for textured skinned GLBs
- root-motion profile validation for travel clips
- textured environment prop validation for bounds and ground-level authoring

The package reports structured validation issues rather than performing
renderer-specific uploads or browser texture decoding.

## Consequences

`gpu-shared`, `gpu-renderer`, and the site runtime can reject broken
professional manifests before mounting playback. The checks remain usable in
offline pipelines and CI because they operate on parsed asset metadata instead
of WebGPU APIs.
