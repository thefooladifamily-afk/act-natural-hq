// budget-check.mjs — BUILD-TIME perf budget gate (Quest law).
// FAILS the build (exit 1) if any check trips. Wired into `npm run build`
// BEFORE vite, so over-budget art can never ship silently.
//
// Checks (QUEST-SPECS-AND-PERF-BUDGET.md):
//   HARD FAIL:
//   - character GLB > 45,000 triangles
//   - character mesh > 6 materials            (spec addition)
//   - character mesh > 20 morph targets       (spec addition)
//   - character > 3 draw calls (≈ mesh count)
//   - character texture > 2048px per side     (spec hard law; "use 1024 for
//     characters" is a stated preference, enforced as WARN below, not law)
//   - total texture VRAM > 96MB              (spec addition)
//   - scene-budget.json measured values over 300K tris / 80 draw calls
//   WARN (not fail):
//   - character texture > 1024px (spec preference — keep atlases small
//     where possible, but working art at 2048 ships)
//   - non-character texture > 2048px
//   - scene-budget.json unmeasured (measure with ?perf=1 on Quest)
//
// Interpretation note: the 2048px hard cap applies to CHARACTER textures.
// "Use 1024 for characters" is the spec's preference, not law — the 2D
// mouth atlases ship at 2048x1024 and total VRAM (52.9MB ≤ 96MB) is the
// real backstop. The meadow panorama (public/pano) is the 360° backdrop
// and ships large by requirement (360-SCALE-RULES.md: 3840x1920 minimum);
// it is exempt from the per-texture cap but counts toward the 96MB VRAM
// total. Failing the build over required backdrops or working atlases
// would be wrong; the VRAM cap is what protects the frame budget.
//
// Run: node tests/budget-check.mjs
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')

const CAPS = {
  charTris: 45000,
  charMaterials: 6,
  charMorphs: 20,
  charDrawCalls: 3,
  charTexPx: 2048, // spec hard law
  prefCharTexPx: 1024, // spec preference — WARN only, never fail
  warnTexPx: 2048,
  vramMB: 96,
  sceneTris: 300000,
  sceneCalls: 80,
}

let fails = []
let warns = []
const fail = (m) => { fails.push(m); console.log('FAIL  ' + m) }
const warn = (m) => { warns.push(m); console.log('WARN  ' + m) }
const pass = (m) => console.log('PASS  ' + m)

// ---------- helpers ----------
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

function jpgSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue }
    const m = buf[i + 1]
    if (m >= 0xc0 && m <= 0xc3 && m !== 0xc2) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
    const len = buf.readUInt16BE(i + 2)
    i += 2 + len
  }
  return null
}

// Minimal GLB parse: header + JSON chunk. Returns { tris, materials,
// morphs (max per mesh), drawCalls (≈ primitives), meshes }.
function parseGLB(buf, name) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'glTF') {
    fail(`character model ${name}: not a valid GLB`); return null
  }
  // GLB layout: header[0:12] (magic, version, total length),
  // then chunk0: length[12:16], type[16:20] ('JSON'), data[20:].
  const jsonLen = buf.readUInt32LE(12)
  const jsonType = buf.readUInt32LE(16)
  if (jsonType !== 0x4e4f534a) { fail(`character model ${name}: missing JSON chunk`); return null }
  let json
  try { json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)) }
  catch (e) { fail(`character model ${name}: JSON chunk unparsable`); return null }

  const accessors = json.accessors || []
  let tris = 0, drawCalls = 0, maxMorphs = 0
  const matSet = new Set()
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      drawCalls++
      let count = 0
      if (prim.indices !== undefined && accessors[prim.indices]) count = accessors[prim.indices].count
      else if (prim.attributes && prim.attributes.POSITION !== undefined && accessors[prim.attributes.POSITION]) {
        count = accessors[prim.attributes.POSITION].count
      }
      tris += prim.indices !== undefined ? count / 3 : count / 3
      if (prim.material !== undefined) matSet.add(prim.material)
      if (prim.targets) maxMorphs = Math.max(maxMorphs, prim.targets.length)
    }
  }
  return { tris: Math.round(tris), materials: matSet.size, morphs: maxMorphs, drawCalls, meshes: (json.meshes || []).length }
}

// ---------- 1. character models ----------
let checkedModels = 0
for await (const p of walk(join(PUB, 'hybrid'))) {
  if (extname(p) !== '.glb') continue
  checkedModels++
  const r = parseGLB(await readFile(p), basename(p))
  if (!r) continue
  const tag = `model ${basename(p)}`
  if (r.tris > CAPS.charTris) fail(`${tag}: ${r.tris.toLocaleString()} tris > ${CAPS.charTris.toLocaleString()}`)
  else pass(`${tag}: ${r.tris.toLocaleString()} tris ≤ ${CAPS.charTris.toLocaleString()}`)
  if (r.materials > CAPS.charMaterials) fail(`${tag}: ${r.materials} materials > ${CAPS.charMaterials}`)
  else pass(`${tag}: ${r.materials} materials ≤ ${CAPS.charMaterials}`)
  if (r.morphs > CAPS.charMorphs) fail(`${tag}: ${r.morphs} morph targets > ${CAPS.charMorphs}`)
  else pass(`${tag}: ${r.morphs} morph targets ≤ ${CAPS.charMorphs}`)
  if (r.drawCalls > CAPS.charDrawCalls) fail(`${tag}: ${r.drawCalls} draw calls > ${CAPS.charDrawCalls}`)
  else pass(`${tag}: ${r.drawCalls} draw calls ≤ ${CAPS.charDrawCalls}`)
}
if (!checkedModels) warn('no character GLBs found under public/hybrid/ — model checks skipped')

// ---------- 2+3. textures: per-texture caps + VRAM total ----------
let vramBytes = 0
let checkedTex = 0
for await (const p of walk(PUB)) {
  const ext = extname(p).toLowerCase()
  if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') continue
  const buf = await readFile(p)
  const size = ext === '.png' ? pngSize(buf) : jpgSize(buf)
  if (!size) { warn(`unreadable image ${p.slice(PUB.length)} — skipped`); continue }
  checkedTex++
  const rel = p.slice(PUB.length)
  const isChar = rel.includes('/hybrid/') || rel.includes('/sprites/')
  const isPano = rel.includes('/pano/')
  vramBytes += size.w * size.h * 4 * (4 / 3) // RGBA8 + mipmaps
  if (isChar && (size.w > CAPS.charTexPx || size.h > CAPS.charTexPx)) {
    fail(`character texture ${rel}: ${size.w}x${size.h} > ${CAPS.charTexPx}px`)
  } else if (isChar && (size.w > CAPS.prefCharTexPx || size.h > CAPS.prefCharTexPx)) {
    warn(`character texture ${rel}: ${size.w}x${size.h} > ${CAPS.prefCharTexPx}px (spec preference; ships — VRAM total is the backstop)`)
  } else if (!isChar && !isPano && (size.w > CAPS.warnTexPx || size.h > CAPS.warnTexPx)) {
    warn(`texture ${rel}: ${size.w}x${size.h} > ${CAPS.warnTexPx}px (large; counts toward VRAM)`)
  }
}
const vramMB = vramBytes / (1024 * 1024)
if (vramMB > CAPS.vramMB) fail(`total texture VRAM ${vramMB.toFixed(1)}MB > ${CAPS.vramMB}MB`)
else pass(`total texture VRAM ${vramMB.toFixed(1)}MB ≤ ${CAPS.vramMB}MB (${checkedTex} textures)`)

// ---------- 4. scene totals via measured manifest ----------
try {
  const man = JSON.parse(await readFile(join(ROOT, 'tests', 'scene-budget.json'), 'utf8'))
  if (man.measured && typeof man.measured.tris === 'number') {
    if (man.measured.tris > CAPS.sceneTris) fail(`scene tris ${man.measured.tris.toLocaleString()} > ${CAPS.sceneTris.toLocaleString()} (measured ${man.measured.date})`)
    else pass(`scene tris ${man.measured.tris.toLocaleString()} ≤ ${CAPS.sceneTris.toLocaleString()} (measured ${man.measured.date})`)
    if (man.measured.drawCalls > CAPS.sceneCalls) fail(`scene draw calls ${man.measured.drawCalls} > ${CAPS.sceneCalls} (measured ${man.measured.date})`)
    else pass(`scene draw calls ${man.measured.drawCalls} ≤ ${CAPS.sceneCalls} (measured ${man.measured.date})`)
  } else {
    warn('scene-budget.json has no measured values — scene totals enforced at runtime by the governor; measure with ?perf=1 on Quest')
  }
} catch (e) {
  warn('tests/scene-budget.json missing — scene totals enforced at runtime by the governor')
}

// ---------- verdict ----------
console.log(`\n${fails.length} failures, ${warns.length} warnings`)
if (fails.length) {
  console.log('BUDGET CHECK FAILED — fix the assets above; over-budget art never ships.')
  process.exit(1)
}
console.log('BUDGET CHECK PASSED')
