# ADR 0007: Explicit Model Filename and URL References

- Status: Accepted
- Date: 2026-10-24
- Project Task: Plasius-LTD/asset-processing#43
- Parent Story/Feature: plasius-ltd-site#2296 / #1153
- Clarifies: ADR 0006 and TDR 0003; other conversion-planning decisions remain unchanged.

## Context

The model resolvers currently accept URL-style references but expose a filename
parameter. Removing every query/fragment suffix loses literal POSIX filename
characters. Conversely, interpreting all strings as literal filenames would
break existing callers using `part.stp?download=1`. A normal object lookup also
returns inherited values for unsupported extensions such as `constructor` and
`__proto__`, while an extensionless `obj` token incorrectly identifies a model.

The existing `@plasius/asset-contracts` dependency owns shared model/manifests,
not filename resolution. This correction belongs in the existing public
`@plasius/asset-processing` resolvers and needs no new dependency or package.

## Decision

Add the optional `ModelFileReferenceKind` second argument to
`resolveModelSourceFormat` and `resolveModelContentType`. Keep `"url"` as the
default for compatibility with existing relative references. Absolute and
protocol-relative URLs use their pathname, never their authority or suffixes;
malformed absolute URLs are unknown. Do not percent-decode URL paths. Native
Windows drive paths retain the established path/query handling.

Explicit `"filename"` mode preserves literal `?` and `#` characters. In either
mode, both slash styles delimit components, and only a nonempty basename with
a nonleading, nontrailing final dot supplies an extension. Lowercase that
extension and look up only own keys in the frozen mappings. Dotfiles such as
`.obj` and extensionless format names are unknown; MTL remains auxiliary-only.
Invalid reference kinds fail with a fixed `TypeError` without echoing input.

The one-argument lifecycle content-type wrapper retains its existing model
lookup. No converter, validation, storage, or rollout authority is added.

## Alternatives

- Guess from question/hash placement: rejected because `chair.obj?draft.glb`
  has two valid interpretations.
- Make literal mode the default: rejected because existing query-bearing
  references are documented and tested.
- Add a parser dependency or reuse a host URL sanitizer: rejected because
  classification needs no network/security policy or larger package boundary.

## Consequences and verification

Existing one-argument calls retain URL-style semantics; callers handling literal
names can opt in without encoding or losing characters. Correcting extensionless,
inherited-key and authority matches intentionally removes unsupported results.
This remains metadata classification, not byte validation or proof of supported
conversion. Parsing is synchronous and performs no I/O or logging.

Failing-first regressions cover all model formats/aliases, both modes, uppercase,
POSIX/Windows paths, unknown/prototype/dotfile cases, URL authority and malformed
URLs, literal suffixes, MTL and non-model MIME compatibility. Packed ESM/CJS and
strict declaration consumers, full tests/coverage, lint/types/build, audits and
artifact checks are release gates. Publish through the existing exact-main CI
and hosted `cd.yml`/`production` OIDC route before any consumer adoption.

Feature `gpu.model.conversion.enabled` still belongs to the governed host
evaluator. Disable/rollback prevents consumer adoption or selects a previously
qualified package; metadata correctness and input validation remain unconditional.
No capability, control value, site deployment or new rollout switch is added.
