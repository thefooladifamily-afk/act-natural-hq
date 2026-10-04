// ESM loader: lets Node import Vite's `?raw` suffix (used for the persona
// .md files in src/dialogue/respond.js) so unit tests exercise the REAL
// source, not a copy.
//
// DO NOT load this file directly with `node --import`: --import only runs
// the module, it does not register these hooks. Register via
// tests/register.mjs instead:
//   node --import ./tests/register.mjs tests/loop-test.mjs
// (or just `npm test`). Verified working on Node v24.20.0.
import { readFile } from 'node:fs/promises'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('?raw')) {
    const clean = specifier.slice(0, -4)
    const r = await nextResolve(clean, context)
    return { ...r, url: r.url + '?raw' }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('?raw')) {
    const source = await readFile(new URL(url.slice(0, -4)), 'utf8')
    return { format: 'module', source: `export default ${JSON.stringify(source)}`, shortCircuit: true }
  }
  return nextLoad(url, context)
}
