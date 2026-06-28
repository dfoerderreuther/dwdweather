#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# ── wrangler.toml — borrow into project root for the duration of this script ──
PROJECT_ROOT="$(cd .. && pwd)"

if [ -f "$PROJECT_ROOT/wrangler.toml" ]; then
  echo "ERROR: wrangler.toml already exists in the project root."
  echo "install.sh manages this file itself — it copies infra/wrangler.toml up"
  echo "before deploying and removes it afterwards. A pre-existing file would be"
  echo "deleted at the end of this script, which is almost certainly not what you want."
  echo ""
  echo "If this wrangler.toml belongs to a different infra folder, remove it first,"
  echo "then re-run install.sh from the correct infra/ directory."
  exit 1
fi

cp wrangler.toml "$PROJECT_ROOT/wrangler.toml"
trap 'rm -f "$PROJECT_ROOT/wrangler.toml"' EXIT

# ── Terraform: init on first run, then apply ──────────────────────────────────
# Terraform doesn't expand ~ in source paths — expand $HOME (idempotent)
sed -i.bak "s|~/|$HOME/|g" main.tf && rm main.tf.bak

echo "==> terraform init"
terraform init

echo "==> terraform apply"
terraform apply

# ── Deploy to Cloudflare Pages ────────────────────────────────────────────────
# Run from project root so wrangler auto-discovers functions/ if present
DEPLOY_CMD=$(terraform output -raw deploy_command)
echo "==> $DEPLOY_CMD"
cd ..
eval "$DEPLOY_CMD"
