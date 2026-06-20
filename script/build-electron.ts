import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";

/** Compile only the Electron main + preload (used in dev; renderer is served by Vite). */
async function buildElectron() {
  await rm("electron/dist", { recursive: true, force: true });
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
}

buildElectron().catch((err) => {
  console.error(err);
  process.exit(1);
});
