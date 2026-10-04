# CHECKPOINTS — one command, always a way back

## Prerequisite

The project directory is a local git repo (initialized by the evidence
worker; `.gitignore` excludes `node_modules/`, `dist/`, `test-results/`).
Checkpoints are annotated tags on tested commits — no remote required.

## The loop

```
npm run build        # budget gate + vite build (blocks on budget failure)
npm test             # unit tests (loop, recut, sprite-lipsync)
npm run acceptance   # Tests 1-3 end-to-end against the REAL pipeline -> acceptance-results.json
npm run checkpoint   # tags known-good-YYYYMMDD-N + manifest (only if acceptance PASS)
```

`npm run checkpoint` refuses to tag a failing build. The manifest lands in
`checkpoints/known-good-YYYYMMDD-N.json` in the repo; the git tag pins the
exact tested commit.

## Restore a checkpoint

```
git checkout known-good-20261003-1
```

## What a checkpoint means

- `npm run build` passed (Quest budget gate included).
- `npm test` passed.
- All three acceptance tests PASS against the real event → memory → state →
  director → response pipeline, driven by real DOM clicks through `activate()`.
- The acceptance report (`acceptance-results.json`, referenced in the
  manifest) contains the full per-test trace for that commit.

## Rules

1. Tag after every passing milestone — never let an experimental branch
   become the only working version.
2. Checkpoint tags are never moved or deleted.
3. A checkpoint is "known-good" for the build it was tagged on. A later
   commit is not known-good until it passes the loop again.
4. `evidence-capture.mjs` (screenshots + video) and `demo-path.mjs` are
   optional evidence on top of a checkpoint — they do not replace it.
