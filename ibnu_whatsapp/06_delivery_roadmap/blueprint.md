# 06_delivery_roadmap / Blueprint

## Shared context links
- [`../README.md`](../README.md)
- [`../TOOLS.md`](../../../TOOLS.md)
- [`../MEMORY.md`](../../../MEMORY.md)
- [`../../00_shared/blueprint.md`](../../00_shared/blueprint.md)
- [`../../01_product/blueprint.md`](../../01_product/blueprint.md)
- [`../../02_architecture/blueprint.md`](../../02_architecture/blueprint.md)
- [`../../03_gateway_api/blueprint.md`](../../03_gateway_api/blueprint.md)
- [`../../04_sessions_security/blueprint.md`](../../04_sessions_security/blueprint.md)
- [`../../05_deployment_ops/blueprint.md`](../../05_deployment_ops/blueprint.md)

---

## Delivery phases

### Phase 0 — Foundation *(now)*
**Goal:** Get a minimal working gateway running with one account.

- [x] Project structure defined
- [x] Blueprint analysis complete
- [ ] Initialize Node.js + TypeScript project
- [ ] Install Baileys, set up `useMultiFileAuthState`
- [ ] Basic send message function (hardcoded)
- [ ] Verify WhatsApp connection works
- [ ] Verify session persistence across restart

**Exit criteria:** Can send a WhatsApp message via code, session survives restart.

---

### Phase 1 — Core API
**Goal:** Gateway exposes REST API for sending and receiving messages.

- [ ] Express/Fastify server setup
- [ ] `POST /send` — send text message
- [ ] `GET /accounts` — list accounts
- [ ] `POST /accounts` — initiate pairing (QR or pairing code)
- [ ] `GET /health`
- [ ] API key middleware
- [ ] Basic rate limiting
- [ ] Inbound webhook forwarder (single URL for now)
- [ ] Session auto-reconnect handling

**Exit criteria:** An external system can send and receive WhatsApp messages via REST API.

---

### Phase 2 — Multi-Account + Operations
**Goal:** Manage multiple accounts, better observability.

- [ ] Account manager with unique IDs
- [ ] Per-account status tracking
- [ ] Session storage for each account (separate folders)
- [ ] Structured logging (JSON)
- [ ] Message status tracking (queued → sent → delivered)
- [ ] Message log query API (`GET /messages`)
- [ ] Multiple webhook URL support
- [ ] Rate limit enforcement per account

**Exit criteria:** Can run 2+ WhatsApp accounts simultaneously without interference.

---

### Phase 3 — Admin UI
**Goal:** Dashboard for non-technical users to manage the gateway.

- [ ] React/Vite dashboard setup
- [ ] Account list page with status indicators
- [ ] QR code scanner modal for pairing
- [ ] Message log viewer
- [ ] Webhook configuration page
- [ ] Basic stats (message count, uptime)

**Exit criteria:** Admin can add a new WhatsApp account and monitor it entirely from the UI.

---

### Phase 4 — Hardening & Production Ready
**Goal:** Reliable enough for actual use.

- [ ] Session encryption at rest
- [ ] Webhook signature verification
- [ ] Retry logic for failed outbound messages
- [ ] Graceful shutdown handling
- [ ] Proper error handling and user-facing error messages
- [ ] Backup script for sessions
- [ ] Deployment documentation
- [ ] PM2 setup with auto-start

**Exit criteria:** Gateway can run unattended and recover from common failure scenarios.

---

### Phase 5 — Future (post-MVP)
Revisit based on real usage:
- [ ] Redis-backed session store
- [ ] PostgreSQL for message log (instead of in-memory)
- [ ] Scheduled/batch message sending
- [ ] Auto-reply rules engine
- [ ] Multi-tenant support
- [ ] WhatsApp Business API official integration

---

## Definition of Done per phase

Each phase is done when:
1. All checklist items completed
2. Code builds without errors
3. Tested manually end-to-end
4. Relevant blueprint updated with actual decisions (not just planned)
5. No known critical bugs outstanding

---

## Current phase

**Phase 0 — Foundation** ← *you are here*

Next action: initialize the Node.js project and verify Baileys connection.
