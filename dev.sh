#!/usr/bin/env bash
# Local dev with a working /api: Vite (HMR) + wrangler Pages Functions.
#
#   ./dev.sh
#
# Vite serves the client with hot-reload on $VITE_PORT; wrangler runs the
# functions/ API and proxies asset requests to Vite. Open the wrangler URL
# (http://localhost:$PAGES_PORT) — NOT the Vite port — so /api/* works.
set -euo pipefail

cd "$(dirname "$0")"

VITE_PORT="${VITE_PORT:-5173}"
PAGES_PORT="${PAGES_PORT:-8788}"

# Recursively kill a process and all its descendants. npm/npx spawn the real
# node (vite, wrangler, workerd) processes as children, so signalling only the
# top pid leaves orphans — walk the tree via `pgrep -P` instead.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

pids=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "==> shutting down dev servers"
  for pid in "${pids[@]}"; do
    kill_tree "$pid"
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "==> starting Vite (HMR) on :$VITE_PORT"
# vite.config.js reads this to set the HMR client port so hot-reload survives
# the wrangler --proxy in front of it.
export VITE_DEV_PORT="$VITE_PORT"
npm run dev -- --port "$VITE_PORT" --strictPort &
pids+=($!)

# Give Vite a moment to bind its port before wrangler proxies to it.
sleep 3

echo "==> starting wrangler Pages dev (functions + proxy) on :$PAGES_PORT"
npx wrangler pages dev --proxy "$VITE_PORT" --port "$PAGES_PORT" &
pids+=($!)

URL="http://localhost:$PAGES_PORT"

# Wait for wrangler to bind its port, then announce + open the RIGHT url.
# (Vite prints its own :$VITE_PORT link — that one has no /api. Use $URL.)
for _ in $(seq 1 40); do
  if curl -sS -o /dev/null -m 1 "$URL/" 2>/dev/null; then break; fi
  sleep 0.5
done

cat <<EOF

  ┌────────────────────────────────────────────────────────┐
  │  OPEN  ->  $URL
  │  (NOT the Vite link on :$VITE_PORT — that one has no /api)
  └────────────────────────────────────────────────────────┘

EOF
if [ -z "${NO_OPEN:-}" ] && command -v open >/dev/null 2>&1; then
  open "$URL" || true
fi

# Block until Ctrl-C or until either server dies, then cleanup() runs on EXIT.
# (Portable to bash 3.2, which lacks `wait -n`.)
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do
  sleep 1
done
