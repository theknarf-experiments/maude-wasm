// Node-side loader for the WL/M engine source (browsers import the
// .maude file through their bundler instead).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

let cachedSource: string | null = null;

export function wlSource(): string {
  if (cachedSource === null) {
    const require = createRequire(import.meta.url);
    cachedSource = readFileSync(
      require.resolve("@maude-wasm/wolfram-core/wl.maude"),
      "utf8",
    );
  }
  return cachedSource;
}
