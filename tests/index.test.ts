import { describe, expect, it } from "vitest";
import { ASSET_PROCESSING_OPERATIONS, createDefaultProcessingPlan, resolveModelContentType } from "../src/index.js";

describe("asset processing", () => {
  it("resolves runtime content types", () => {
    expect(resolveModelContentType("chair.gltf")).toBe("model/gltf+json");
    expect(resolveModelContentType("chair.glb")).toBe("model/gltf-binary");
    expect(resolveModelContentType("texture.jpeg")).toBe("image/jpeg");
    expect(resolveModelContentType("texture.webp")).toBe("image/webp");
    expect(resolveModelContentType("payload.bin")).toBe("application/octet-stream");
    expect(resolveModelContentType("notes.txt")).toBe("application/octet-stream");
  });

  it("creates a complete default processing plan", () => {
    const plan = createDefaultProcessingPlan("eames-lounge-chair-ottoman");
    expect(plan.steps.map((step) => step.operation)).toEqual(ASSET_PROCESSING_OPERATIONS);
    expect(plan.steps.every((step) => step.required)).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(plan.targetRuntime).toBe("gpu-shared");
  });
});
