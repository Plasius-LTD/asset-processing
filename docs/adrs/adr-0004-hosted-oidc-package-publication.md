# ADR 0004: Hosted OIDC Package Publication

- Status: Accepted
- Date: 2026-08-11

## Context

`@plasius/asset-processing` must publish without a long-lived npm write token
and without accepting CI evidence for another source snapshot.

## Decision

Publication is phase-isolated: dependency installation, package validation, SBOM generation, and immutable tarball packing run in `validate_and_pack` without the `production` environment or OIDC permission. The final hosted `publish` job downloads only that sealed artifact, explicitly installs npm 11.6.2, runs no repository dependency code, and publishes the tarball with lifecycle scripts disabled. It re-fetches current `main` immediately before the first release mutation and again immediately before npm publication. `.npmrc` contains no registry-auth placeholder, and release preparation returns the reviewed current `main` HEAD rather than package-file history.

Publish only from the GitHub-hosted `production` job using npm trusted
publishing. Prove the prepared SHA is still the exact remote `main` head and
that push-triggered `ci.yml` succeeded for it. Require Node 24 and npm 11.5.1 or
newer, request provenance, and prohibit npm write-token fallbacks. Same-repo PR
CI may use explicit self-hosted runners; fork PR code is denied.

The event-facing `ci.yml` is a lightweight caller of the repository-owned
`ci-self-hosted.yml@main` reusable workflow. The runner group allowlists that
stable workflow identity, while guards in both layers reject external-fork pull
requests. Reusable jobs request only the `Public CI - Quarantined` group with
the explicit `self-hosted`, `Linux`, and `X64` labels, and do not share npm
cache state.

## Consequences

Missing trust configuration, moved `main`, absent CI, unsupported runtime, or
missing OIDC identity fails closed before publication. Pull-request validation
remains schedulable without granting access to synthetic pull-request workflow
identities.

## Test implications

Workflow tests enforce source, CI, runtime, identity, runner, and token rules.
