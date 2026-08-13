import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Parallel test files spawn many wasm interpreters at once; under
    // load a single corpus entry occasionally fails and never
    // reproduces standalone. One retry filters that noise without
    // masking real regressions (a deterministic failure still fails).
    retry: 1,
  },
});
