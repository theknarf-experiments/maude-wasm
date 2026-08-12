import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{ enforce: "pre", ...mdx() }, react()],
  optimizeDeps: {
    // The Emscripten loader relies on import.meta.url and top-level
    // constructs that esbuild pre-bundling mangles; leave it alone.
    exclude: ["@maude-wasm/core", "maude-wasm"],
  },
});
