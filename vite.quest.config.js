import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// vite.quest.config.js — QUEST BUILD PROFILE (Worker B ownership).
//
// Same source as the standard build, packaged for the Quest Browser:
// separate outDir (dist-quest/), no sourcemaps, no base64-inlined assets,
// and a size gate after every build via scripts/quest-build.mjs.
// (Deliberately no manualChunks — measured 2026-10-03: the natural single
// chunk is 384KB gzip; forced splitting regressed to 612KB.)
//
// Usage:
//   node scripts/quest-build.mjs     # budget-check -> quest build -> size report
//   node scripts/quest-serve.mjs     # https LAN server for the headset
//   node scripts/quest-smoke.mjs    # headless boot check of the quest build
//
// DO NOT deploy dist-quest/ without Amy's explicit approval (STOP rule).
export default defineConfig({
  // GitHub Pages serves this app under /screening-room-quest/ — relative
  // asset paths keep the build working from any subpath. NEVER remove this.
  base: './',
  // basicSsl is here so `vite preview --https` (quest-serve.mjs) can serve
  // dist-quest/ over a self-signed cert: WebXR requires a secure context,
  // and a LAN IP is not secure over plain http.
  plugins: [react(), basicSsl()],
  define: {
    __QUEST_BUILD__: 'true',
  },
  build: {
    outDir: 'dist-quest',
    sourcemap: false,
    // Never inline assets as base64 data-URIs in the Quest profile: keep
    // every byte as a separate fetchable file so nothing bloats the JS.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    reportCompressedSize: true,
    // NOTE: no manualChunks. Attempted 2026-10-03 (react/three/fiber/xr
    // split): measured 612KB gzip initial vs 384KB gzip for the natural
    // single chunk — the three/fiber chunk cycle duplicates three.js and
    // splitting regresses total bytes. The natural single-chunk output is
    // already optimal for Quest; parallelism is not the bottleneck
    // (boot-time GLB/texture fetches are — see docs/QUEST-TEST-PLAN.md).
    // The emulator stays a lazy chunk automatically (emulate:false).
  },
  preview: {
    host: true,
    https: true,
    port: 4174,
  },
})
