#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes >> /root/.openclaw/workspace/repliz_ibnu/runtime/auto-report.log 2>&1
