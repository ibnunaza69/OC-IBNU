#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69e0433f84ebdfba15123ba2"
LOCK_FILE="/tmp/repliz-auto-report.lock"
flock -xn "$LOCK_FILE" -c "/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes --account-id '$ACC' >> /root/.openclaw/workspace/repliz_ibnu/runtime/auto-report.log 2>&1"
