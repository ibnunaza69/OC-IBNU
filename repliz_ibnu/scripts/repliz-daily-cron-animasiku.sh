#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69ef062d877ca2e454025d24"
ACCOUNT_SLUG="animasiku2026__69ef062d877ca2e454025d24"
ACCOUNT_ROOT="/root/.openclaw/workspace/repliz_ibnu/runtime/accounts/$ACCOUNT_SLUG"
OUT_DIR="/root/.openclaw/workspace/repliz_ibnu/02_content_strategy/accounts/animasiku2026/generated_hookflex_clean"
mkdir -p "$ACCOUNT_ROOT/logs" "$ACCOUNT_ROOT/state" "$ACCOUNT_ROOT/generated"
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-generate-animasiku-hookflex-clean.mjs --days 30 --out-dir "$OUT_DIR" >> "$ACCOUNT_ROOT/logs/generator.log" 2>&1
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --account-id "$ACC" --days 30 >> "$ACCOUNT_ROOT/logs/cron.log" 2>&1
