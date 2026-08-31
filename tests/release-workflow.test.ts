import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string): string =>
  readFileSync(resolve(process.cwd(), `.github/workflows/${name}.yml`), "utf8");
const cdWorkflow = readWorkflow("cd");
const ciWorkflow = readWorkflow("ci");
const selfHostedCiWorkflow = readWorkflow("ci-self-hosted");
const workflowRepository = ["Plasius", "LTD/asset-processing"].join("-");

describe("package release trust boundary", () => {
  it("uses exact-main hosted OIDC publication without write tokens", () => {
    expect(cdWorkflow).toContain("runs-on: ubuntu-latest");
    expect(cdWorkflow).toContain("environment: production");
    expect(cdWorkflow).toContain("id-token: write");
    expect(cdWorkflow).toContain("Enforce exact-main successful CI");
    expect(cdWorkflow).toContain("refs/remotes/origin/main");
    expect(cdWorkflow).toContain("-f branch=main");
    expect(cdWorkflow).toContain("-f event=push");
    expect(cdWorkflow).toContain('-f head_sha="${EXPECTED_SHA}"');
    expect(cdWorkflow).toContain('conclusion == "success"');
    expect(cdWorkflow).toContain("Verify release runtime");
    expect(cdWorkflow).toContain('ACTUAL_NODE%%.*');
    expect(cdWorkflow).toContain('"11.5.1"');
    expect(cdWorkflow).toContain("--provenance");
    expect(cdWorkflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/u);
  });

  it("uses hosted pull-request CI and explicit trusted runners for main", () => {
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(ciWorkflow).toContain(
      `uses: ${workflowRepository}/.github/workflows/ci-self-hosted.yml@main`
    );
    expect(ciWorkflow).not.toContain("runs-on:");
    expect(selfHostedCiWorkflow).toContain("on:\n  workflow_call:");
    expect(selfHostedCiWorkflow.match(
      /runs-on: \$\{\{ fromJSON\(github\.event_name == 'pull_request' && '\["ubuntu-latest"\]' \|\| '\["self-hosted","Linux","X64"\]'\) \}\}/gu
    )).toHaveLength(2);
    expect(selfHostedCiWorkflow).not.toMatch(/cache:\s*["']npm["']/u);
    expect(ciWorkflow).not.toContain("pull_request_target");
    expect(selfHostedCiWorkflow).not.toContain("pull_request_target");
    expect(selfHostedCiWorkflow).not.toContain("fromJSON(vars.");
  });
});
