#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
export TZ="Asia/Jakarta"
export PATH="/root/.nvm/versions/node/v22.22.1/bin:$PATH"
ACC="69ef062d877ca2e454025d24"
OUT_DIR="/root/.openclaw/workspace/repliz_ibnu/02_content_strategy/generated_animasiku_hookflex_clean"
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-generate-animasiku-hookflex-clean.mjs --days 30 --out-dir "$OUT_DIR" >> /root/.openclaw/workspace/repliz_ibnu/runtime/generator-animasiku.log 2>&1
/root/.nvm/versions/node/v22.22.1/bin/node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --account-id "$ACC" --days 30 >> /root/.openclaw/workspace/repliz_ibnu/runtime/cron-animasiku.log 2>&1
