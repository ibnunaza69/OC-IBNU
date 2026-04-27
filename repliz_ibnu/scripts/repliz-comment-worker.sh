#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69e0433f84ebdfba15123ba2"
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs run-comment-worker-once --account-id "$ACC" --limit 20 >> /root/.openclaw/workspace/repliz_ibnu/runtime/comment-worker.log 2>&1
