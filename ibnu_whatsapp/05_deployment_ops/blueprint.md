# 05_deployment_ops / Blueprint

## Shared context links
- [`../README.md`](../README.md)
- [`../TOOLS.md`](../../../TOOLS.md)
- [`../MEMORY.md`](../../../MEMORY.md)
- [`../../00_shared/blueprint.md`](../../00_shared/blueprint.md)

---

## Deploy target

- **Server:** `43.134.74.130`
- **SSH port:** `47221`
- **Runtime:** Node.js 20 LTS
- **User:** root (for now; consider creating dedicated user later)
- **Process manager:** PM2

---

## Directory structure on server

```
/opt/ibnu_whatsapp/
├── current/              # symlink to active release
│   ├── dist/             # compiled TypeScript
│   ├── src/              # source (for debugging)
│   └── node_modules/
├── releases/             # versioned releases
│   └── v1.0.0/
├── sessions/             # WhatsApp auth state (gitignored)
│   └── .gitkeep
├── logs/                 # application logs
│   └── .gitkeep
├── .env                  # environment variables
└── ecosystem.config.cjs  # PM2 config
```

---

## Environment file (.env)

```env
NODE_ENV=production
PORT=8080

# Security
API_KEYS=change-this-before-deploy

# Session storage
SESSION_DIR=/opt/ibnu_whatsapp/sessions

# Webhook outbound
WEBHOOK_SECRET=change-this-before-deploy

# Rate limiting
RATE_LIMIT_PER_ACCOUNT=20

# Logging
LOG_LEVEL=info

# Baileys
BAILEYS_VERSION=latest  # pin to specific version
```

---

## Build & deploy steps

### Prerequisites on server
```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Create directory structure
mkdir -p /opt/ibnu_whatsapp/{releases,sessions,logs}
```

### Build locally (or in CI)
```bash
npm install
npm run build    # tsc --outDir dist
```

### Deploy (manual)
```bash
# Copy release to server
rsync -avz --exclude='node_modules' --exclude='.git' ./ user@43.134.74.130:/opt/ibnu_whatsapp/releases/v1.x.x/

# On server: update symlink
cd /opt/ibnu_whatsapp
rm -f current && ln -s releases/v1.x.x current

# Install deps
cd /opt/ibnu_whatsapp/current && npm ci --production

# Restart
pm2 reload ecosystem.config.cjs
```

---

## PM2 ecosystem config

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'ibnu-whatsapp',
    script: 'dist/index.js',
    cwd: '/opt/ibnu_whatsapp/current',
    env: {
      NODE_ENV: 'production',
      // loaded from .env by PM2 if using dotenv
    },
    instances: 1,           // single instance (Baileys sockets)
    autorestart: true,
    max_restarts: 10,
    min_uptime: '30s',
    watch: false,
    max_memory_restart: '1G',
    log_file: '/opt/ibnu_whatsapp/logs/app.log',
    error_file: '/opt/ibnu_whatsapp/logs/error.log',
    time: true,
  }]
}
```

---

## Health monitoring

### Local health check
```bash
curl http://localhost:8080/health
```

### PM2 commands
```bash
pm2 status                   # list all processes
pm2 logs ibnu-whatsapp       # tail logs
pm2 reload ibnu-whatsapp     # zero-downtime reload
pm2 restart ibnu-whatsapp    # force restart
```

### Auto-start on server reboot
```bash
pm2 startup                  # generates systemd init script
pm2 save                     # saves current process list
```

---

## Logging strategy

- **Application logs:** structured JSON to `/opt/ibnu_whatsapp/logs/app.log`
- **Error logs:** separate error file
- **Format:** JSON lines with fields:
  - `timestamp`, `level`, `requestId`, `accountId`, `message`
- **Rotation:** use `pm2-logrotate` or external logrotate
- **Sensitive data:** never log message content, phone numbers, or API keys

---

## Firewall / network

VPS server likely has a cloud provider firewall:
- Port `8080` (gateway API) — restrict to trusted IPs only
- Port `47221` (SSH) — already changed from default
- No ports for WhatsApp needed (outbound WebSocket only)

---

## Backup strategy

### What to backup
- Session files (`sessions/`) — critical, without them accounts must re-pair
- `.env` file (secrets)
- `config/` if any custom settings

### What NOT to backup
- `node_modules/`
- Build artifacts

### How
```bash
# Manual backup
tar -czf wa-backup-$(date +%Y%m%d).tar.gz \
  /opt/ibnu_whatsapp/sessions \
  /opt/ibnu_whatsapp/.env

# Store off-server (cloud storage, another server)
```

---

## CI/CD (future)

When ready:
1. GitHub Actions for build + test
2. Push to git → CI builds → rsync to server → PM2 reload
3. Separate `dev` and `prod` environments
