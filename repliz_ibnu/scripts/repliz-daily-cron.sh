#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
/usr/bin/env node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --days 30 >> /root/.openclaw/workspace/repliz_ibnu/runtime/cron.log 2>&1
/usr/bin/env node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes >> /root/.openclaw/workspace/repliz_ibnu/runtime/auto-report.log 2>&1
/usr/bin/env node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs run-comment-worker-once --limit 20 >> /root/.openclaw/workspace/repliz_ibnu/runtime/comment-worker.log 2>&1
