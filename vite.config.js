import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// `npm run dev`       -> http://localhost:5173 (desktop preview)
// `npm run dev:https` -> https://<lan-ip>:5173  (REQUIRED for Quest Browser:
//   WebXR sessions only start in a secure context; a LAN IP is not secure
//   over plain http, so the self-signed cert plugin is used. Accept the
//   browser warning on the Quest once.)
export default defineConfig({
  // GitHub Pages serves this app under /screening-room-quest/ — relative
  // asset paths keep the build working from any subpath. NEVER remove this:
  // without it the deployed page is a blank white screen (absolute /assets/
  // paths 404 on project-site deploys).
  base: './',
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    https: process.argv.includes('--https'),
  },
})
