#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69ef062d877ca2e454025d24"
ACCOUNT_SLUG="animasiku2026__69ef062d877ca2e454025d24"
ACCOUNT_ROOT="/root/.openclaw/workspace/repliz_ibnu/runtime/accounts/$ACCOUNT_SLUG"
LOCK_FILE="/tmp/repliz-auto-report-animasiku.lock"
mkdir -p "$ACCOUNT_ROOT/logs" "$ACCOUNT_ROOT/state" "$ACCOUNT_ROOT/generated"
flock -xn "$LOCK_FILE" -c "/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes --account-id '$ACC' >> '$ACCOUNT_ROOT/logs/auto-report.log' 2>&1"
