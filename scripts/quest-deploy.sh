#!/usr/bin/env bash
# scripts/quest-deploy.sh — repeatable Quest release path (Worker B ownership).
#
#   bash scripts/quest-deploy.sh
#
# One command, four gates. FAILS LOUDLY at the first broken step (set -euo
# pipefail + explicit checks):
#   1. Build the Quest variant            (scripts/quest-build.mjs — includes
#                                          the build-time budget gate)
#   2. Serve it + run the automated smoke (scripts/quest-smoke.mjs — landing,
#                                          flat scene entry, zero console errors)
#   3. On PASS: snapshot a deployment-ready artifact into
#      releases/quest-<UTC timestamp>/ with DEPLOY-MANIFEST.json
#      (commit, tag, bundle sizes, smoke results)
#   4. Print the exact manual steps for Amy's headset + the 7-step checklist.
#
# NEVER pushes anywhere. There is no deploy step in this script on purpose:
# publishing requires Amy's explicit approval, every time. STOP before deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE_DIR="releases/quest-${STAMP}"
PORT="${QUEST_PORT:-4174}"

echo "================================================================"
echo " QUEST RELEASE PATH — ${STAMP} (UTC)"
echo "================================================================"

# ---------- Gate 1: build ----------
echo ""
echo ">>> GATE 1/3: quest build (budget gate + vite + size report)"
node scripts/quest-build.mjs

# ---------- Gate 2: smoke ----------
echo ""
echo ">>> GATE 2/3: serve + automated smoke test"
node scripts/quest-serve.mjs "$PORT" > /tmp/quest-deploy-serve.log 2>&1 &
SERVE_PID=$!
cleanup() { kill "$SERVE_PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -sk --max-time 2 "https://localhost:${PORT}/" >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -sk --max-time 5 "https://localhost:${PORT}/" >/dev/null 2>&1; then
  echo "FAIL  quest server did not come up on port ${PORT}"
  exit 1
fi

SMOKE_LOG="/tmp/quest-deploy-smoke.log"
if node scripts/quest-smoke.mjs "https://localhost:${PORT}/" > "$SMOKE_LOG" 2>&1; then
  SMOKE_RESULT="PASS"
else
  SMOKE_RESULT="FAIL"
fi
cat "$SMOKE_LOG"
if [ "$SMOKE_RESULT" != "PASS" ]; then
  echo ""
  echo "FAIL  smoke test failed — no release artifact produced. Fix and re-run."
  exit 1
fi
echo "PASS  smoke test passed"

# ---------- Gate 3: release artifact ----------
echo ""
echo ">>> GATE 3/3: snapshot release artifact"
mkdir -p "$RELEASE_DIR"
cp -r dist-quest/. "$RELEASE_DIR"/
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
TAG="$(git describe --tags --exact-match 2>/dev/null || echo none)"
node -e "
const fs = require('node:fs');
const qm = JSON.parse(fs.readFileSync('dist-quest/quest-manifest.json', 'utf8'));
const manifest = {
  stamp: '${STAMP}',
  profile: 'quest',
  commit: '${COMMIT}',
  tag: '${TAG}',
  builtAt: qm.builtAt,
  initialJsGzipBytes: qm.initialJsGzip,
  totalBytes: qm.totalBytes,
  fileCount: qm.files.length,
  smoke: '${SMOKE_RESULT}',
  smokeDetail: fs.readFileSync('${SMOKE_LOG}', 'utf8').split('\n').filter(l => l.startsWith('PASS') || l.startsWith('FAIL')).join(' | '),
};
fs.writeFileSync('${RELEASE_DIR}/DEPLOY-MANIFEST.json', JSON.stringify(manifest, null, 2));
console.log('Wrote ${RELEASE_DIR}/DEPLOY-MANIFEST.json');
"

cat > "${RELEASE_DIR}/HEADSET-STEPS.txt" <<'EOF'
SCREENING ROOM — Quest headset steps (give this URL to Amy)
============================================================

1. Put on the Quest, open Quest Browser.
2. Open the test URL: <PASTE THE DEPLOYED https URL HERE>
   (must be https — WebXR will not start on plain http)
3. Accept any certificate warning ONLY if you were told to expect one
   (self-signed LAN/tunnel builds).
4. On the landing page: look at ENTER IN VR, hold gaze ~1.2s.
5. Run the 7 steps in docs/QUEST-TEST-PLAN.md:
   1 LOAD → 2 ENTER XR → 3 INTERACT → 4 EVENT FIRES →
   5 ROOM RESPONDS → 6 MEMORY WORKS → 7 FINALE WORKS
6. Report back with the copy/paste template in the test plan.

TROUBLESHOOTING
- "NOT SUPPORTED" on ENTER IN VR: use PREVIEW (NO HEADSET), run the same
  7 steps flat, and say so in the report.
- Page loads slowly: retry with ?loft=0 appended to the URL and report
  both timings (skips the 3.6MB loft model).
- No audio at all: FAIL step 5, note it. Quiet dialogue is a known
  tuning item, not a FAIL.

STOP: this directory is a release CANDIDATE. Nothing here has been
published. Publishing requires Amy's explicit approval, every time.
EOF
echo "Wrote ${RELEASE_DIR}/HEADSET-STEPS.txt"

trap - EXIT
cleanup

echo ""
echo "================================================================"
echo " RELEASE CANDIDATE READY: ${RELEASE_DIR}"
echo " Commit ${COMMIT} · tag ${TAG} · smoke ${SMOKE_RESULT}"
echo "----------------------------------------------------------------"
echo " HEADSET STEPS FOR AMY:"
echo "----------------------------------------------------------------"
cat "${RELEASE_DIR}/HEADSET-STEPS.txt"
echo "================================================================"
echo " STOP: not published. Deploy only with Amy's explicit approval."
echo "================================================================"
