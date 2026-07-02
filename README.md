# @plasius/asset-processing

Processing operation contracts for Plasius model cleanup, texture normalization, LOD, collision proxy, and runtime packaging.

## Install

```bash
npm install @plasius/asset-processing
```

## Scope

This package is part of the unified AI asset pipeline package family. It is scaffolded from the standard `@plasius/*` package template and owns the asset processing boundary described in the Plasius asset pipeline design.

## Feature Flag

- `asset.pipeline.unified-ai-assets.enabled`
- `asset.pipeline.external-model-harvest.enabled`

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

## Related Documents

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
- CLA and legal docs: [legal](./legal)

## License

Apache-2.0
