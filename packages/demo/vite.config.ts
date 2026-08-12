import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/, so asset URLs need
  // that prefix. Defaults to root for local dev.
  base: process.env.BASE_PATH ?? "/",
  plugins: [{ enforce: "pre", ...mdx() }, react()],
  optimizeDeps: {
    // The Emscripten loader relies on import.meta.url and top-level
    // constructs that esbuild pre-bundling mangles; leave it alone.
    exclude: ["@maude-wasm/core", "maude-wasm"],
  },
});
