// checkpoint.mjs — tag a known-good checkpoint after a passing milestone.
//
//   npm run checkpoint
//
// 1. Finds the newest acceptance-results.json under ~/workspace/evidence-*.
// 2. Requires overall === 'PASS' (refuses to checkpoint a failing build).
// 3. Creates git tag known-good-YYYYMMDD-N (N increments per day).
// 4. Writes checkpoints/<tag>.json manifest: commit, date, what passed,
//    path to the full acceptance results.
//
// The manifest lives in the repo so the checkpoint is self-describing;
// the tag makes it one command to get back:  git checkout known-good-20261003-1
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const project = join(root, '..')
const evRoot = join(process.env.HOME, 'workspace')
const ckDir = join(project, 'checkpoints')

function latestResults() {
  const cands = []
  for (const d of readdirSync(evRoot)) {
    if (!d.startsWith('evidence-')) continue
    const dd = join(evRoot, d)
    if (!statSync(dd).isDirectory()) continue
    for (const run of readdirSync(dd)) {
      const f = join(dd, run, 'acceptance-results.json')
      if (existsSync(f)) cands.push({ f, mtime: statSync(f).mtimeMs })
    }
  }
  cands.sort((a, b) => b.mtime - a.mtime)
  return cands[0] ? cands[0].f : null
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function nextN(today) {
  let n = 1
  try {
    const tags = execSync('git tag -l', { cwd: project }).toString().split('\n')
    const todays = tags.filter((t) => t.startsWith(`known-good-${today}-`))
    n = todays.length + 1
  } catch {}
  return n
}

const resultsFile = latestResults()
if (!resultsFile) {
  console.error('[checkpoint] no acceptance-results.json found — run `npm run acceptance` first')
  process.exit(2)
}
const results = JSON.parse(readFileSync(resultsFile, 'utf8'))
if (results.overall !== 'PASS') {
  console.error(`[checkpoint] REFUSED: latest acceptance run is ${results.overall}, not PASS (${resultsFile})`)
  process.exit(1)
}
const today = todayStr()
const tag = `known-good-${today}-${nextN(today)}`
const commit = execSync('git rev-parse HEAD', { cwd: project }).toString().trim()

// Tag the exact tested commit.
try {
  execSync(`git tag -a ${tag} ${commit} -m "Known-good checkpoint: acceptance PASS (${results.commit}, ${results.generatedAt})"`, { cwd: project })
} catch (e) {
  console.error('[checkpoint] git tag failed:', String(e).slice(0, 200))
  process.exit(1)
}
mkdirSync(ckDir, { recursive: true })
const manifest = {
  tag, commit, date: new Date().toISOString(),
  acceptance: {
    runFile: resultsFile, generatedAt: results.generatedAt, overall: results.overall,
    tests: results.tests.map((t) => ({ name: t.name, verdict: t.verdict, checks: `${t.pass}/${t.total}` })),
  },
  restore: `git checkout ${tag}`,
}
writeFileSync(join(ckDir, `${tag}.json`), JSON.stringify(manifest, null, 2))
console.log(`[checkpoint] tagged ${tag} @ ${commit.slice(0, 8)}`)
console.log(`[checkpoint] manifest: checkpoints/${tag}.json`)
console.log(`[checkpoint] restore:  git checkout ${tag}`)
