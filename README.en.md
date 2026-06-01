<div align="center">

# WinsiBot v8.0.0

**Enterprise-grade WhatsApp Bot**

[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?logo=rust)](https://rust-lang.org)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue)](LICENSE)

*Multi-language architecture: TypeScript · Python · Rust*

[Versión en español →](README.md)

</div>

---

## Table of Contents

- [What is WinsiBot?](#what-is-winsibot)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Running the Bot](#running-the-bot)
- [Bot Commands](#bot-commands)
- [Maintenance CLI](#maintenance-cli)
- [Webhook API](#webhook-api)
- [Monitoring & Health](#monitoring--health)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Security](#security)
- [License](#license)

---

## What is WinsiBot?

WinsiBot is a general-purpose WhatsApp bot built on the [Baileys](https://github.com/WhiskeySockets/Baileys) library. It is designed to handle hundreds of simultaneous groups, thousands of messages per hour, and multiple bot instances (sub-bots), with an automatic session recovery system that minimizes downtime.

Unlike simple single-layer solutions, WinsiBot uses three specialized languages that cooperate:

- **TypeScript / Node.js** — WhatsApp protocol, commands, real-time message handling
- **Python** — artificial intelligence, process monitoring, session backups, health analysis
- **Rust** — atomic session storage, snapshots, message delivery tracking (SQLite), Signal session cleanup

---

## Features

### Messaging
- Smart rate limiting with per-JID token bucket (automatic anti-ban)
- Message queue with priorities: `urgent` → `normal` → `broadcast`
- Real-time delivery tracking: sent → delivered → read → played
- Automatic Bad MAC flood detection and Signal session auto-cleanup
- 443+ group support without performance degradation

### Session & Stability
- Atomic writes in Rust (tmp → fsync → rename) — `creds.json` never corrupts
- 5 rotating snapshots with automatic recovery
- Session backup with SHA-256 checksum verification
- Exponential reconnection with up to 50 retries (max 60s delay)
- Python monitor with watchdog, auto-restart, and freeze timeout

### Commands
- 45+ commands organized in 15 categories
- Middleware system: permissions, anti-spam, XP, per-group configuration
- Independent sub-bots (JadiBot) linked to different numbers
- Scheduler with cron-programmable jobs

### Infrastructure
- FastAPI + Celery for heavy Python tasks
- HTTP webhook receiver with HMAC-SHA256 and per-IP rate limiting
- Optional PHP panel
- Redis for task queue

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WinsiBot v8                             │
├──────────────┬──────────────────┬───────────────────────────────┤
│  TypeScript  │     Python       │            Rust               │
│  (Node.js)   │                  │                               │
│              │  ┌────────────┐  │  ┌────────────────────────┐  │
│  ┌────────┐  │  │  FastAPI   │  │  │     Session API        │  │
│  │ Baileys│  │  │  :5000     │  │  │     :3001              │  │
│  │ Socket │  │  ├────────────┤  │  │                        │  │
│  ├────────┤  │  │  Celery    │  │  │  • atomic write        │  │
│  │Handler │◄─┼─►│  Worker    │  │  │  • snapshots x5        │  │
│  ├────────┤  │  ├────────────┤  │  │  • SQLite delivery DB  │  │
│  │Webhook │  │  │  Monitor   │  │  │  • Signal clear        │  │
│  │ :4001  │  │  │  Watchdog  │  │  └────────────────────────┘  │
│  ├────────┤  │  ├────────────┤  │                               │
│  │Rate    │  │  │  AI Brain  │  │  ┌────────────────────────┐  │
│  │Limiter │  │  │  Health    │  │  │  SQLite: messages.db   │  │
│  └────────┘  │  └────────────┘  │  │  • outbox tracking     │  │
│              │                  │  │  • delivery stats      │  │
│  :4001       │  :5000           │  └────────────────────────┘  │
└──────────────┴──────────────────┴───────────────────────────────┘
         │                 │                      │
         └─────────────────┴──────────────────────┘
                           │
                    WhatsApp Network
```

---

## Requirements

| Tool | Minimum Version | Required |
|------|----------------|----------|
| Node.js | 18.x | ✅ |
| npm | 9.x | ✅ |
| Python | 3.11 | ✅ |
| Rust + Cargo | 1.75 | ✅ (to build Rust) |
| Redis | 6.x | ✅ (Celery) |
| PHP | 8.1 | ❌ (web panel) |

**OS:** Windows 10/11, Ubuntu 20.04+, Debian 11+

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Brashkie/WinsiBot.git
cd WinsiBot

# 2. Node dependencies
npm install

# 3. Python dependencies
cd python
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
cd ..

# 4. Build Rust Session API
npm run rust:build

# 5. Environment variables
copy .env.example .env         # Windows
# cp .env.example .env         # Linux / macOS
copy rust\.env.example rust\.env

# 6. Edit .env and rust/.env with your values (see Configuration section)

# 7. Start
npm run start:all
```

On first launch, if no session is saved, a **QR code** will appear in the terminal. Scan it with WhatsApp → ⋮ → Linked Devices → Link a Device.

---

## Configuration

### `.env` — Main variables

```env
# ─── Bot ──────────────────────────────────────────────────────────
PREFIX="!,.,#,/"          # Command trigger prefixes (comma-separated)
BOT_NAME=WinsiBot          # Bot display name
OWNER_JID=1999999999@s.whatsapp.net   # Your number (with country code, no +)
SESSION_PATH=./auth        # Folder where WhatsApp session is stored
NODE_ENV=production        # 'development' or 'production'
LOG_LEVEL=info             # 'silent' | 'info' | 'debug' | 'error'

# ─── Session API (Rust) ──────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=YOUR_SECURE_KEY_HERE     # openssl rand -hex 32

# ─── Webhook ─────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_HERE

# ─── Python services ─────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=INTERNAL_API_KEY
```

### `rust/.env` — Session API

```env
PORT=3001
API_KEY=YOUR_SECURE_KEY_HERE    # Must match SESSION_API_KEY in .env
SESSIONS_DIR=./sessions          # Where Rust stores credentials
AUTH_DIR=../auth                 # Baileys auth directory (for Signal cleanup)
DB_PATH=./data/messages.db      # SQLite message tracking
RUST_LOG=winsibot_session_api=info
```

> **Generate a secure key:** `openssl rand -hex 32`

### Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PREFIX` | `"!,.,#,/"` | Command prefixes |
| `WEBHOOK_PORT` | `4001` | Webhook receiver port |
| `SESSION_API_URL` | `http://127.0.0.1:3001` | Rust Session API URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `NODE_ENV` | `production` | Runtime mode |

---

## Running the Bot

### All-in-one (recommended for production)

```bash
npm run start:all
```

Launches in parallel:
- Rust Session API (`:3001`)
- Python Monitor (which in turn launches Node.js + FastAPI + Celery + PHP)

### Individually (for development)

```bash
npm run rust:start    # Rust Session API only
npm run monitor       # Python monitor + Node.js + services
npm run dev           # Node.js only (bypasses monitor, shows QR directly)
```

### To scan a new QR code

```bash
npm run manage:reset-qr
# or directly:
npm run dev
```

### Available scripts

| Script | Description |
|--------|-------------|
| `npm run start:all` | Start everything in parallel |
| `npm run monitor` | Python monitor with auto-restart |
| `npm run dev` | Node.js direct (development / QR) |
| `npm run rust:start` | Rust Session API |
| `npm run rust:build` | Compile Rust in release mode |
| `npm run manage` | Maintenance CLI (interactive menu) |
| `npm run manage:status` | Services status |
| `npm run manage:diagnose` | Deep diagnostics |
| `npm run manage:repair` | Auto-repair |
| `npm run manage:reset-signal` | Clear Signal sessions (Bad MAC) |
| `npm run manage:reset-qr` | Full reset + new QR scan |
| `npm run manage:backup` | Force session backup |
| `npm run manage:restore` | Restore from backup |
| `npm run manage:logs` | View recent logs |
| `npm run build` | Compile TypeScript to JS |

---

## Bot Commands

The bot has **45+ commands** across categories: admin, AI, downloads, stickers, music, info, sub-bots and more.

→ **[View full command reference](docs/commands.en.md)**

---

## Maintenance CLI

```bash
npm run manage
```

Interactive multi-service menu that orchestrates Python, Rust, and Node.

| Option | npm command | Description |
|--------|-------------|-------------|
| 1 | `manage:status` | Status table: FastAPI / Rust / Webhook / PHP |
| 2 | `manage:diagnose` | Analyzes session, Signal files, Rust, logs, breaks |
| 3 | `manage:repair` | Clears Signal → recovers creds → restores backup |
| 4 | `manage:reset-signal` | Deletes only `session-*.json` (keeps `creds.json`) |
| 5 | `manage:reset-qr` | Deletes full session and launches Node for new QR |
| 6 | `manage:backup` | Creates SHA-256 checksum-verified backup |
| 7 | `manage:restore` | Shows backup table to choose and restore |
| 8 | `manage:logs` | Last 30 session log events |

### When to use each option

- **Bot not responding (messages not appearing):** → option 4 `reset-signal`
- **Repeated "Bad MAC" in terminal:** → option 4 `reset-signal`
- **Expired / loggedOut session:** → option 5 `reset-qr`
- **creds.json corrupt error:** → option 3 `repair`
- **Before shutting down the server:** → option 6 `backup`
- **After updating:** → option 2 `diagnose`

---

## Webhook API

The webhook receiver listens on `http://127.0.0.1:4001` and allows controlling the bot from external services.

### Authentication

All requests must include the `x-webhook-signature` header with the HMAC-SHA256 signature of the body using the `WEBHOOK_SECRET` from `.env`.

```python
import hmac, hashlib
sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = {"x-webhook-signature": f"sha256={sig}"}
```

### Endpoints

#### `GET /health`
Check if bot is connected.
```json
{ "ok": true, "uptime": 3600, "connected": true }
```

#### `POST /webhook` — Send message
```json
{
  "event": "send_message",
  "jid": "1999999999@s.whatsapp.net",
  "text": "Hello from webhook"
}
```

#### `POST /webhook` — Broadcast
```json
{
  "event": "broadcast",
  "jids": ["1111111111@s.whatsapp.net", "2222222222@s.whatsapp.net"],
  "text": "Mass message"
}
```
> Broadcast automatically uses the rate limiter to avoid WhatsApp limits.

#### `POST /webhook` — Run job
```json
{
  "event": "run_job",
  "jobId": "job_name"
}
```

#### `POST /webhook` — Ping
```json
{ "event": "ping" }
```
Response: `{ "ok": true, "msg": "pong" }`

### Response codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid body or missing field |
| 401 | Invalid HMAC signature |
| 413 | Body too large (>64 KB) |
| 422 | Socket not available |
| 429 | Rate limit exceeded (1 req/s per IP) |
| 500 | Internal error |

---

## Monitoring & Health

### Rust Session API (`:3001`)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | General status + active sessions |
| `GET /health/live` | Liveness (for Docker/K8s) |
| `GET /health/ready` | Readiness |
| `GET /messages/stats?hours=24` | Delivery rate for last 24h |
| `GET /messages/pending?minutes=5` | Messages without delivery confirmation |

### Delivery statistics

```bash
curl -H "x-api-key: YOUR_KEY" http://127.0.0.1:3001/messages/stats
```
```json
{
  "total": 1500,
  "delivered": 1420,
  "read": 980,
  "failed": 3,
  "delivery_pct": "94.7",
  "read_pct": "65.3"
}
```

If `delivery_pct` drops below 80%, there are delivery issues — usually resolved with `npm run manage:repair`.

---

## Troubleshooting

### Bot not responding to messages

1. Check if it's connected: `npm run manage:status`
2. Look for Bad MAC errors in terminal
3. Run: `npm run manage:reset-signal`
4. If it persists: `npm run manage:repair`

### Continuous "Bad MAC" errors

Signal sessions are corrupted. Automatic solution:
```bash
npm run manage:reset-signal
```
The bot detects this automatically (8 Bad MACs in 60s) and self-repairs.

### "auth dir missing" or "creds.json corrupt" error

```bash
npm run manage:repair
# If no backup available:
npm run manage:reset-qr
```

### Bot restarting every hour

Check `HANG_TIMEOUT` in `python/terminal/monitor.py`. Default is 15 minutes. If the bot is in many active groups, having no output for short periods is normal.

### Session restores itself on restart (don't want QR)

The Python monitor detects that `auth/` doesn't exist and automatically restores the last backup. This is expected behavior. To force a new QR, use `npm run manage:reset-qr` which also deletes backups.

### Error 440 — "Expelled by another instance"

WhatsApp Web is open in a browser with the same number. Close all WhatsApp Web sessions and wait 60 seconds. The bot will reconnect automatically.

### `npm run rust:build` fails

Make sure Rust is installed:
```bash
rustup update stable
```
On Windows, you also need Visual Studio Build Tools (MSVC).

---

## FAQ

**Can I use this bot with multiple numbers?**
Yes, through the JadiBot system (`!jadibot`). Each sub-bot has its own independent session.

**Is it safe to use the unofficial WhatsApp API?**
Baileys implements the official WhatsApp Web protocol. However, WhatsApp does not officially authorize third-party bots. The bot includes rate limiting to minimize ban risk.

**How many groups can it handle?**
Tested with 443+ simultaneous groups without performance issues. The store does not cache group messages (only contact metadata) to keep memory usage low.

**How often should I backup?**
The monitor auto-backs up on start (if session is valid) and on shutdown signal. You can force it with `npm run manage:backup`. The last 5 backups are kept.

**What happens if the server shuts down abruptly?**
The Rust Session API uses atomic writes (tmp → rename), so `creds.json` never ends up in a partially written state. On restart, the monitor checks integrity and restores automatically if needed.

**Does it work with WhatsApp Business accounts?**
Yes. Delivery tracking also works with Business. However, some features like catalogs or official API buttons are not available.

---

## Security

- The `auth/` folder contains cryptographic private keys for your WhatsApp account. **Never include it in git commits** (it's in `.gitignore`).
- Use long random API keys (`openssl rand -hex 32`).
- The webhook receiver only listens on `127.0.0.1` by default, not exposed to the internet.
- All protected Session API routes require an API key.
- Webhook validates HMAC-SHA256 signature on every request.
- Session backups include SHA-256 checksum verification.

---

## Project Structure

```
WinsiBot/
├── src/                          # TypeScript — main bot
│   ├── config.ts                 # Global configuration
│   ├── index.ts                  # Entry point
│   ├── core/
│   │   ├── socket.ts             # WhatsApp WebSocket connection
│   │   ├── handler.ts            # Message → command dispatcher
│   │   ├── store.ts              # Contact/chat cache (atomic writes)
│   │   └── events.ts             # XP, spam, group configuration
│   ├── lib/
│   │   ├── rateLimiter.ts        # Token bucket rate limiter
│   │   ├── media_sender.ts       # safeSend / enqueueSend / broadcastSend
│   │   ├── session.ts            # Rust Session API client
│   │   └── pythonBridge.ts       # FastAPI communication
│   └── plugins/
│       ├── commands/             # 45+ commands by category
│       ├── middlewares/          # Auth, anti-spam, permissions
│       ├── scheduler/            # Scheduled jobs (cron)
│       └── webhooks/             # HTTP receiver
├── python/                       # Python — services
│   ├── api/                      # FastAPI + Celery
│   ├── ai/                       # AI, break detector, health monitor, AI brain
│   ├── session/                  # Session backup/restore/checksum
│   └── terminal/
│       ├── monitor.py            # Main watchdog
│       └── manage.py             # Maintenance CLI
├── rust/                         # Rust — Session API
│   └── src/
│       ├── main.rs               # Axum entry point
│       ├── routes.rs             # All HTTP handlers
│       ├── db.rs                 # SQLite delivery tracker
│       ├── atomic.rs             # Atomic file writes
│       └── snapshot.rs           # Rotating snapshots (x5)
├── php/                          # Optional web panel
├── .env.example                  # Configuration template
└── rust/.env.example             # Rust template
```

---

## License

GPL-3.0-or-later — see [LICENSE](LICENSE)

**Developed by Hepein Oficial / [Brashkie](https://github.com/Brashkie)**
