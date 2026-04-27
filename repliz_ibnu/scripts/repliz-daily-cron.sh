#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69e0433f84ebdfba15123ba2"
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-generate-hookflex-clean.mjs --days 30 >> /root/.openclaw/workspace/repliz_ibnu/runtime/generator.log 2>&1
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --account-id "$ACC" --days 30 >> /root/.openclaw/workspace/repliz_ibnu/runtime/cron.log 2>&1
