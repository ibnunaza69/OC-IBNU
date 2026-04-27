# 00_shared / Blueprint

## Shared context links
- [`../README.md`](../README.md) — project root overview
- [`../TOOLS.md`](../../../TOOLS.md) — workspace tools & infra notes
- [`../MEMORY.md`](../../../MEMORY.md) — long-term memory

---

## Project identity

**Name:** ibnu_whatsapp  
**Library:** [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)  
**Language:** TypeScript + Node.js  
**Deploy target:** VPS `43.134.74.130` (port SSH: 47221)  
**Stack summary:** WhatsApp gateway with REST API + webhook interface, multi-account, admin UI dashboard.

---

## Key architectural decisions (locked)

1. **Two-way messaging** — gateway handles both inbound and outbound messages.
2. **Multi-account** — supports multiple WhatsApp numbers simultaneously.
3. **Dual interface** — exposes REST API + receives inbound via webhook callback.
4. **Admin UI** — separate dashboard for management (not just API-only).
5. **TypeScript + Node.js** throughout.
6. **Deploy on existing VPS** at `43.134.74.130`.

---

## Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| WhatsApp library | `@whiskeysockets/baileys` | WebSocket-based, no browser needed |
| Runtime | Node.js 20+ | LTS, good Baileys compatibility |
| Language | TypeScript | Type safety, maintainability |
| Auth storage | File-based +可选 DB | Session per account, must survive restarts |
| REST API | Express or Fastify | Lightweight, well-supported |
| Webhook | Built-in HTTP listener | Receives inbound from WhatsApp |
| Admin UI | React/Vite (future) | Dashboard for account & message management |
| PM2 | process manager | Keep gateway alive, auto-restart |

---

## Critical rules

1. **No spam** — gateway must have rate limiting and abuse prevention.
2. **Session keys are sensitive** — never commit to git, store securely.
3. **Reconnect handling** — Baileys auto-reconnects, but we must handle session state properly.
4. **Multi-account isolation** — each account session must be independent.
5. **All config via env vars** — no hardcoded credentials.
6. **Soft launch only** — production use of unofficial WhatsApp API carries risk.

---

## Baileys version policy

- Pin to a specific version. Monitor [Baileys releases](https://github.com/WhiskeySockets/Baileys/releases) for breaking changes.
- Test upgrade in dev before applying to production.
- Document current pinned version in `package.json`.

---

## Reference links

- Baileys docs: https://baileys.wiki
- Baileys Discord: https://discord.gg/WeJM5FP9GG
- Migration guide (v7): https://whiskey.so/migrate-latest
