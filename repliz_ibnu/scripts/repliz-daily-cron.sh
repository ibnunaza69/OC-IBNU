#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69e0433f84ebdfba15123ba2"
ACCOUNT_SLUG="infosehat_ku__69e0433f84ebdfba15123ba2"
ACCOUNT_ROOT="/root/.openclaw/workspace/repliz_ibnu/runtime/accounts/$ACCOUNT_SLUG"
mkdir -p "$ACCOUNT_ROOT/logs" "$ACCOUNT_ROOT/state" "$ACCOUNT_ROOT/generated"
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-generate-hookflex-clean.mjs --days 30 >> "$ACCOUNT_ROOT/logs/generator.log" 2>&1
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --account-id "$ACC" --days 30 >> "$ACCOUNT_ROOT/logs/cron.log" 2>&1
