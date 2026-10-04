// acceptance-report.mjs — renders the one-page acceptance summary.
// Input: JSON results file produced by evidence-capture.mjs / demo-path.mjs
//   { generatedAt, commit, buildUrl?, scenarios: [{name, verdict, pass, total, durationMs, checks:[{name, pass, detail}]}] }
// Output: <out>.html (one-page summary) + <out>.md (plain-text summary).
// Verdicts are restricted to the allowed set: PASS | FAIL | PARTIAL | NOT TESTED.
import { readFileSync, writeFileSync } from 'node:fs'

const VERDICTS = new Set(['PASS', 'FAIL', 'PARTIAL', 'NOT TESTED'])
const COLORS = {
  PASS: '#3ddc84', FAIL: '#ff5c5c', PARTIAL: '#ffb020', 'NOT TESTED': '#8a8f98',
}

function sanitize(results) {
  // acceptance.mjs emits {tests:[...]}; evidence-capture emits {scenarios:[...]}.
  // Normalize to scenarios for rendering.
  const raw = results.scenarios || (results.tests || []).map((t) => ({
    name: t.name, verdict: t.verdict, pass: t.pass, total: t.total,
    durationMs: t.durationMs, checks: t.checks,
  }))
  return {
    ...results,
    scenarios: raw.map((s) => ({
      ...s,
      verdict: VERDICTS.has(s.verdict) ? s.verdict : 'NOT TESTED',
    })),
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function overall(scenarios) {
  if (!scenarios.length) return 'NOT TESTED'
  const v = scenarios.map((s) => s.verdict)
  if (v.every((x) => x === 'PASS')) return 'PASS'
  if (v.every((x) => x === 'FAIL')) return 'FAIL'
  if (v.some((x) => x === 'NOT TESTED') && v.every((x) => x === 'NOT TESTED' || x === 'FAIL')) return 'FAIL'
  return 'PARTIAL'
}

export function renderMarkdown(results) {
  const r = sanitize(results)
  const all = overall(r.scenarios)
  const lines = [
    `# Acceptance Test Summary — ${all}`,
    '',
    `- Generated: ${r.generatedAt || 'unknown'}`,
    `- Commit: ${r.commit || 'unknown'}`,
    `- Build: ${r.buildUrl || 'local'}`,
    `- Scenarios: ${r.scenarios.length}`,
    '',
    '| Scenario | Verdict | Checks |',
    '|---|---|---|',
    ...r.scenarios.map((s) => `| ${s.name} | ${s.verdict} | ${s.pass}/${s.total} |`),
    '',
  ]
  for (const s of r.scenarios) {
    lines.push(`## ${s.name} — ${s.verdict} (${s.pass}/${s.total})`, '')
    for (const c of s.checks) lines.push(`- [${c.pass ? 'x' : ' '}] ${c.name}${c.detail ? ' — ' + c.detail : ''}`)
    lines.push('')
  }
  if (r.notes) lines.push('## Notes', '', r.notes, '')
  return lines.join('\n')
}

export function renderHTML(results) {
  const r = sanitize(results)
  const all = overall(r.scenarios)
  const cards = r.scenarios.map((s) => {
    const col = COLORS[s.verdict]
    const rows = s.checks.map((c) => `
      <tr>
        <td style="color:${c.pass ? '#3ddc84' : '#ff5c5c'};font-weight:bold">${c.pass ? '✓' : '✗'}</td>
        <td>${esc(c.name)}</td>
        <td class="dim">${esc(c.detail)}</td>
      </tr>`).join('')
    return `
    <section class="card">
      <header style="border-left:6px solid ${col}">
        <h2>${esc(s.name)}</h2>
        <span class="verdict" style="background:${col}">${s.verdict}</span>
        <span class="dim">${s.pass}/${s.total} checks · ${(s.durationMs / 1000).toFixed(0)}s</span>
      </header>
      <table>${rows}</table>
    </section>`
  }).join('')
  const media = (r.media || []).map((m) => {
    if (/\.(png|jpe?g|webp)$/i.test(m.file)) return `<figure><img src="${esc(m.file)}" alt="${esc(m.label || m.file)}"><figcaption>${esc(m.label || m.file)}</figcaption></figure>`
    if (/\.webm$/i.test(m.file)) return `<figure><video controls src="${esc(m.file)}"></video><figcaption>${esc(m.label || m.file)}</figcaption></figure>`
    return ''
  }).join('')
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acceptance Summary — ${all}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#101114;color:#e8eaed;max-width:960px;margin:0 auto;padding:24px}
  h1{font-size:1.6rem}.meta{color:#9aa0a6;font-size:.9rem}
  .card{margin:18px 0;background:#1a1c20;border-radius:10px;overflow:hidden}
  .card header{display:flex;align-items:center;gap:14px;padding:12px 16px;background:#202329}
  .card h2{margin:0;font-size:1.1rem;flex:1}
  .verdict{color:#101114;font-weight:800;padding:4px 12px;border-radius:20px;font-size:.85rem}
  .dim{color:#9aa0a6;font-size:.85rem}
  table{width:100%;border-collapse:collapse}
  td{padding:8px 12px;border-top:1px solid #2a2d33;vertical-align:top;font-size:.92rem}
  .overall{display:inline-block;color:#101114;font-weight:800;padding:6px 18px;border-radius:24px;font-size:1rem;margin:8px 0}
  figure{margin:18px 0}img,video{max-width:100%;border-radius:8px}
  figcaption{color:#9aa0a6;font-size:.85rem;margin-top:6px}
</style></head>
<body>
<h1>Behavioral Cinema Engine — Acceptance Summary</h1>
<p class="meta">Generated ${esc(r.generatedAt || 'unknown')} · commit ${esc(r.commit || 'unknown')} · build ${esc(r.buildUrl || 'local')}</p>
<p><span class="overall" style="background:${COLORS[all]}">${all}</span></p>
${cards}
${media ? `<h2>Captured evidence</h2>${media}` : ''}
</body></html>`
}

function main() {
  const [inFile, outBase] = process.argv.slice(2)
  if (!inFile || !outBase) {
    console.error('usage: node scripts/acceptance-report.mjs <results.json> <out-base>')
    process.exit(2)
  }
  const results = JSON.parse(readFileSync(inFile, 'utf8'))
  writeFileSync(outBase + '.html', renderHTML(results))
  writeFileSync(outBase + '.md', renderMarkdown(results))
  const r = sanitize(results)
  console.log('overall:', overall(r.scenarios))
  console.log('html:', outBase + '.html')
  console.log('md:  ', outBase + '.md')
}

if (process.argv[1] && process.argv[1].endsWith('acceptance-report.mjs')) main()
