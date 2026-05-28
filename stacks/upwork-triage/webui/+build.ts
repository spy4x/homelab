// Deno-native build script for the Preact SPA
// No Node.js required — esbuild bundles JS/TSX, CSS is pre-built

import * as esbuild from "npm:esbuild"
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11"

// 1. Bundle JS/TSX with esbuild
await esbuild.build({
  plugins: [...denoPlugins()],
  entryPoints: ["./src/main.tsx"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "npm:preact",
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  loader: { ".tsx": "tsx", ".ts": "ts" },
})
await esbuild.stop()

// 2. Copy index.html + pre-built CSS to dist
Deno.writeTextFileSync("dist/index.html", Deno.readTextFileSync("index.html"))
Deno.copyFileSync("src/style.css", "dist/style.css")

console.log("WebUI built: dist/index.html + dist/style.css + dist/main.js")
