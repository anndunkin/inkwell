import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "node:fs/promises";

/**
 * Build pipeline for the Electron app:
 *   1. Vite builds the React renderer to dist/renderer/
 *   2. esbuild compiles main.ts + preload.ts to electron/dist/ (CommonJS)
 *
 * better-sqlite3 is a native module and must stay external (not bundled).
 */
async function buildAll() {
  await rm("dist", { recursive: true, force: true });
  await rm("electron/dist", { recursive: true, force: true });

  console.log("building renderer (vite)...");
  await viteBuild();

  console.log("building electron main + preload (esbuild)...");
  await esbuild({
    entryPoints: ["electron/main.ts", "electron/preload.ts"],
    platform: "node",
    target: "node18",
    bundle: true,
    format: "cjs",
    outdir: "electron/dist",
    outExtension: { ".js": ".cjs" },
    external: ["electron", "better-sqlite3"],
    logLevel: "info",
  });

  console.log("build complete.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
