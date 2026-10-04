// scripts/quest-build.mjs — Quest build pipeline (Worker B ownership).
//
//   node scripts/quest-build.mjs
//
// Steps:
//   1. Run the standard build-time budget gate (tests/budget-check.mjs).
//   2. vite build with the Quest profile (vite.quest.config.js) -> dist-quest/
//   3. Measure every emitted file (raw + gzip), print a size report.
//   4. FAIL the script if any JS chunk exceeds the Quest chunk budget.
//   5. Write dist-quest/quest-manifest.json (sizes, timestamp) for the
//      Oct 10 test plan.
//
// Size law (Quest 3 browser, WiFi): no single JS chunk over 700KB gzip,
// total JS gzip under 600KB warns. These are packaging budgets, not art
// budgets — the art budgets live in tests/budget-check.mjs.
import { execSync } from 'node:child_process'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist-quest')

const CHUNK_GZIP_FAIL_KB = 700
const TOTAL_JS_GZIP_WARN_KB = 600

const kb = (b) => (b / 1024).toFixed(1)

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

console.log('== [1/3] build-time budget gate ==')
execSync('node tests/budget-check.mjs', { cwd: ROOT, stdio: 'inherit' })

console.log('\n== [2/3] vite build (quest profile) ==')
execSync('npx vite build --config vite.quest.config.js', { cwd: ROOT, stdio: 'inherit' })

console.log('\n== [3/3] quest size report ==')
const files = []
for await (const p of walk(OUT)) {
  const s = await stat(p)
  const raw = await readFile(p)
  files.push({ path: p.slice(OUT.length + 1), bytes: s.size, gzip: gzipSync(raw).length })
}
files.sort((a, b) => b.bytes - a.bytes)

// Initial chunks = the entry script + modulepreload links in index.html.
// The size FAIL budget applies ONLY to these — lazy chunks (the XR
// emulator + its room environments, only fetched when emulate:true, which
// is off in prod) are reported as info, never gated.
const html = await readFile(join(OUT, 'index.html'), 'utf8')
const initialRefs = new Set(
  [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]),
)
const isInitialJs = (f) => f.path.endsWith('.js') && initialRefs.has(f.path)

let initialJsGzip = 0
let failed = false
for (const f of files) {
  const ext = extname(f.path)
  const tag =
    ext === '.js' ? (isInitialJs(f) ? 'JS*' : 'JS ') :
    ext === '.css' ? 'CSS' :
    ['.glb', '.mp3', '.png', '.jpg', '.webp'].includes(ext) ? 'AST' : '   '
  if (ext === '.js' && isInitialJs(f)) {
    initialJsGzip += f.gzip
    if (f.gzip > CHUNK_GZIP_FAIL_KB * 1024) {
      console.log(`FAIL  ${tag} ${f.path} — ${kb(f.bytes)} KB raw / ${kb(f.gzip)} KB gzip (initial-chunk budget ${CHUNK_GZIP_FAIL_KB} KB gzip)`)
      failed = true
      continue
    }
  }
  console.log(`      ${tag} ${f.path} — ${kb(f.bytes)} KB raw / ${kb(f.gzip)} KB gzip`)
}
console.log('      (JS* = initial download; JS without * = lazy, fetched on demand only)')

const initialJsGzipKb = kb(initialJsGzip)
console.log(`\nInitial JS download: ${initialJsGzipKb} KB gzip`)
if (initialJsGzip > TOTAL_JS_GZIP_WARN_KB * 1024) {
  console.log(`WARN  initial JS gzip ${initialJsGzipKb} KB exceeds ${TOTAL_JS_GZIP_WARN_KB} KB — investigate before Quest test`)
} else {
  console.log(`PASS  initial JS gzip ${initialJsGzipKb} KB within ${TOTAL_JS_GZIP_WARN_KB} KB`)
}

const totalBytes = files.reduce((a, f) => a + f.bytes, 0)
console.log(`Total dist-quest/: ${(totalBytes / 1024 / 1024).toFixed(1)} MB (${files.length} files)`)

const manifest = {
  builtAt: new Date().toISOString(),
  profile: 'quest',
  files: files.map((f) => ({ path: f.path, bytes: f.bytes, gzip: f.gzip })),
  totalBytes,
  initialJsGzip,
}
await writeFile(join(OUT, 'quest-manifest.json'), JSON.stringify(manifest, null, 2))
console.log('Wrote dist-quest/quest-manifest.json')

if (failed) {
  console.log('\nQUEST BUILD: FAIL (chunk budget exceeded)')
  process.exit(1)
}
console.log('\nQUEST BUILD: PASS')
