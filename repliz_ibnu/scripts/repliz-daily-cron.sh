#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
/usr/bin/env node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --days 30 >> /root/.openclaw/workspace/repliz_ibnu/cron.log 2>&1
