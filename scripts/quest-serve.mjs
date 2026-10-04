// scripts/quest-serve.mjs — serve the Quest build over https (Worker B).
//
//   node scripts/quest-serve.mjs [port]
//
// Serves dist-quest/ on https://<host>:<port> (default 4174) using the
// quest vite profile (self-signed cert via @vitejs/plugin-basic-ssl).
// WebXR requires a secure context: on the Quest, open the https:// URL
// (LAN IP or tunnel URL) and accept the cert warning once.
//
// This script blocks (Ctrl-C to stop). For tunnel use, run it in the
// background and point cloudflared at the port.
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = process.argv[2] || '4174'

const child = spawn(
  'npx',
  ['vite', 'preview', '--config', 'vite.quest.config.js', '--port', port, '--strictPort'],
  { cwd: ROOT, stdio: 'inherit' },
)
child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
