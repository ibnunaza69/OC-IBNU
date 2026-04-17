#!/usr/bin/env bash
set -euo pipefail
cd /root/.openclaw/workspace
/usr/bin/env node /root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes >> /root/.openclaw/workspace/repliz_ibnu/runtime/auto-report.log 2>&1
