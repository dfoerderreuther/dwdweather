#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

SOURCE="/Users/dominikforderreuther/work/data/cloudflare/not404-terraform/project-template/"

rsync -av \
  --exclude='main.tf' \
  --exclude='wrangler.toml' \
  "$SOURCE" .

chmod +x install.sh update-infra.sh

# ── Diff project-specific files against the current template ──────────────────
for file in main.tf wrangler.toml; do
  echo ""
  echo "==> diff $file (template vs. this project)"
  if diff -u "${SOURCE}${file}" "$file"; then
    echo "    (no differences)"
  fi
done
