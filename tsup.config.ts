import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/shader-admission.ts"],
  dts: true,
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  splitting: false,
  target: "es2022",
});
