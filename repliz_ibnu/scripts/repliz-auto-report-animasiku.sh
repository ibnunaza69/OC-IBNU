#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69ef062d877ca2e454025d24"
LOCK_FILE="/tmp/repliz-auto-report-animasiku.lock"
flock -xn "$LOCK_FILE" -c "/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes --account-id '$ACC' >> /root/.openclaw/workspace/repliz_ibnu/runtime/auto-report-animasiku.log 2>&1"
