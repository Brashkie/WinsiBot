<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=180&section=header&text=WinsiBot&fontSize=62&fontColor=ffffff&fontAlignY=38&desc=v8.2.1%20%E2%80%94%20Enterprise%20WhatsApp%20Bot&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-8.2.1-6C63FF?style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/Brashkie/WinsiBot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Brashkie/WinsiBot/pulls)

<br/>

> High-performance WhatsApp bot with a three-layer multi-language architecture.<br/>
> Designed for **10,000+ simultaneous groups**, thousands of messages per hour, and multiple instances.<br/>
> v8.2.1 — Cryptographic session integrity, QR-free recovery, per-group Bad MAC isolation, Ollama local AI, and full stability hardening.

<br/>

**[🇪🇸 Versión en español →](README.md)** &nbsp;·&nbsp; **[📖 Commands →](docs/commands.en.md)** &nbsp;·&nbsp; **[🐛 Report issue](https://github.com/Brashkie/WinsiBot/issues)**

</div>

---

## Table of Contents

<details>
<summary>Expand</summary>

- [What is WinsiBot?](#what-is-winsibot)
- [Technical Stack](#technical-stack)
- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Bot](#running-the-bot)
- [Commands](#commands)
- [Maintenance CLI](#maintenance-cli)
- [Webhook API](#webhook-api)
- [Monitoring](#monitoring)
- [Session API Reference](#session-api-reference)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Security](#security)
- [License](#license)

</details>

---

## What is WinsiBot?

**WinsiBot** is an enterprise-grade WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys) with a three-layer specialized architecture that cooperates in real time:

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| 🟦 **Core** | TypeScript / Node.js | WhatsApp protocol, command dispatcher, RPG, AI chat |
| 🐍 **Services** | Python / FastAPI / Celery | Advanced AI (Ollama + GPT + Claude + Gemini), watchdog, health checks |
| ⚙️ **Session** | Rust / Axum | Atomic creds write, 10 rotating snapshots, Bad MAC tracker, rate limiter, delivery SQLite |

### What's new in v8.2.1

| Area | Change |
|------|--------|
| **Cryptographic integrity** | Auth directory verified with Curve25519 `publicFromPrivate` at every startup via `@brashkie/signalis-core` |
| **QR-free recovery** | Corrupted `creds.json` auto-restored from Rust snapshot — no QR scan needed |
| **Per-group Bad MAC** | Each group has its own sliding-window counter (5 MACs / 30s); one flood no longer triggers a global reconnect |
| **Infinite reconnect** | `maxRetries` removed — bot reconnects forever with exponential backoff capped at 64s |
| **Semaphore** | Max 25 concurrent message handlers — prevents event-loop exhaustion under flood |
| **Rust watchdog** | Node.js pings Rust every 20s; `GET /watchdog/status` returns 503 if Node dies |
| **Rust rate limiter** | 15 msgs / 10s per sender with per-sender buckets, no global lock |
| **AbortController** | All Rust API calls time out at 3s — stalled server can't accumulate pending Promises |
| **Ollama support** | Local AI (Llama 3, Mistral, etc.) tried first in `_call_ai`, before any cloud API |
| **Snapshot count** | Increased from 5 → 10 rotating snapshots per session |
| **Python isolation** | `stdio: 'ignore'` prevents 4 KB pipe buffer from blocking the child process |
| **db.ts fix** | Removed `process.exit(0)` in SIGINT handler that was bypassing graceful shutdown |

---

## Technical Stack

<div align="center">

| Area | Technology | Purpose |
|------|-----------|---------|
| Runtime | Node.js 20 LTS | WhatsApp event loop |
| Language | TypeScript 5.x | End-to-end strict typing |
| WhatsApp | Baileys 6.x | WA Web multi-device protocol |
| Services | Python 3.11 + FastAPI | AI, watchdog, backup |
| Tasks | Celery + Redis | Async task queue |
| Session Store | Rust + Axum + SQLite | Atomic creds + delivery tracking |
| Crypto | `@brashkie/signalis-core` | Curve25519 / Ed25519 / HKDF / AES-GCM (Rust NAPI) |
| Database | SQLite (better-sqlite3) | userData, groupConfigs, clans |
| Web Panel | PHP 8.1 *(optional)* | Admin dashboard |

</div>

---

## Features

<table>
<tr>
<td width="50%">

### 📡 Messaging
- Per-sender rate limiting (Rust, no global lock)
- Priority queue: `urgent` → `normal` → `broadcast`
- Delivery tracking: sent → delivered → read
- Per-group Bad MAC flood detection + auto-clear
- 10,000+ groups without performance degradation
- Max 25 concurrent handlers (semaphore)

</td>
<td width="50%">

### 🔒 Session & Stability
- Atomic Rust write: `tmp → fsync → rename`
- 10 rotating snapshots with automatic recovery
- Curve25519 key integrity check at startup
- Auto QR-free restore from Rust snapshot
- Infinite reconnect with exponential backoff (max 64s)
- Python watchdog with freeze detection and auto-restart

</td>
</tr>
<tr>
<td width="50%">

### 🎮 RPG & Economy
- XP / levels / prestige system (10 ranks) + medals
- Own currency (BrasCoins) + bank
- Gacha (rollwaifu / pokédex / marvel)
- **Advanced Clans**: territories, 24h wars, alliances, treasury
- Missions: work, mining, chest, crime, theft
- **Gift System**: 30+ item catalog, mailbox, wishlist, trades
- **PvP Arena**: ELO, 9 divisions, bets, 5 combat actions
- **Advanced Pets**: 25 species, evolution, auto battles
- **Coding Quiz**: 42 questions, ELO, 5 difficulty levels
- **Draw & Guess**: 55 words, progressive hints, scoring

</td>
<td width="50%">

### 🤖 Artificial Intelligence
- Multi-model: **Ollama (local)** → GPT → Claude → Gemini
- Conversation history per user (12 messages)
- Rate limiting: 20 req/hour per JID
- Image generation with DALL-E
- Auto-translation (50+ languages)
- NLP fast-path in Rust for keyword detection

</td>
</tr>
<tr>
<td width="50%">

### 🛡️ Moderation
- Antilink, antispam, antiflood, antitoxic
- Platform block: Telegram, Discord, TikTok
- Customizable welcome / farewell messages
- Admin mode: only admins can use commands
- Warns with limit and auto-kick

</td>
<td width="50%">

### ⚙️ Infrastructure
- Independent sub-bots (JadiBot)
- HTTP Webhook with HMAC-SHA256
- Scheduler with programmable cron jobs
- Multi-service maintenance CLI
- Optional PHP panel for statistics
- **Interactive messages**: native buttons, lists, carousel, album, sylph
- **Button auto-response**: handler intercepts `interactiveResponseMessage`

</td>
</tr>
</table>

---

## Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           WinsiBot v8.2.1                                    ║
╠════════════════════╦═══════════════════════╦═══════════════════════════════╣
║   TypeScript        ║       Python           ║           Rust                ║
║   Node.js :4001     ║                        ║                               ║
║                     ║  ┌──────────────────┐  ║  ┌───────────────────────┐   ║
║  ┌───────────────┐  ║  │  FastAPI :5000   │  ║  │  Session API :3001    │   ║
║  │  Baileys WS   │  ║  ├──────────────────┤  ║  │                       │   ║
║  ├───────────────┤  ║  │  Celery + Redis  │  ║  │  ● atomic write       │   ║
║  │   Handler     │◄─╬─►│  Ollama client   │  ║  │  ● snapshots ×10      │   ║
║  │  (semaphore)  │  ║  │  GPT/Claude/     │  ║  │  ● bad_mac tracker    │   ║
║  ├───────────────┤  ║  │  Gemini fallback │  ║  │  ● rate_limiter       │   ║
║  │  75+ Cmds     │  ║  ├──────────────────┤  ║  │  ● watchdog heartbeat │   ║
║  ├───────────────┤  ║  │  Monitor         │  ║  │  ● delivery SQLite    │   ║
║  │  lib/db.ts    │  ║  │  Watchdog        │  ║  │  ● /sessions/backup   │   ║
║  │  (SQLite)     │  ║  └──────────────────┘  ║  └───────────────────────┘   ║
║  ├───────────────┤  ║                        ║                               ║
║  │ authVerifier  │  ║                        ║  ┌───────────────────────┐   ║
║  │ Curve25519    │  ║                        ║  │   messages.db         │   ║
║  │ + QR-free     │  ║                        ║  │  ● outbox tracking    │   ║
║  │   recovery    │  ║                        ║  │  ● delivery stats     │   ║
║  └───────────────┘  ║                        ║  └───────────────────────┘   ║
╚════════════════════╩═══════════════════════╩═══════════════════════════════╝
          │                     │                           │
          └─────────────────────┴───────────────────────────┘
                                │
                       WhatsApp Network
```

---

## Requirements

| Tool | Minimum | Required | Notes |
|------|---------|:--------:|-------|
| Node.js | 20.x LTS | ✅ | `node --version` |
| npm | 9.x | ✅ | bundled with Node |
| Python | 3.11+ | ✅ | `python --version` |
| Rust + Cargo | 1.75+ | ✅ | to compile Session API |
| Redis | 6.x | ✅ | for Celery / queue |
| Ollama | latest | ❌ | local AI (recommended, 16 GB RAM+) |
| PHP | 8.1+ | ❌ | optional web panel |
| FFmpeg | 6.x | ❌ | media conversion |

**Supported OS:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+

> **Ollama:** Pull a model before starting — `ollama pull llama3` or `ollama pull mistral`. The bot tries Ollama first and silently falls back to cloud APIs.

---

## Installation

```bash
# 1 — Clone the repository
git clone https://github.com/Brashkie/WinsiBot.git
cd WinsiBot

# 2 — Node.js dependencies
npm install

# 3 — Python virtual environment + dependencies
cd python
python -m venv venv

# Windows
venv\Scripts\activate
# Linux / macOS
# source venv/bin/activate

pip install -r requirements.txt
cd ..

# 4 — Compile Rust Session API
npm run rust:build

# 5 — Environment variables
# Windows
copy .env.example .env
copy rust\.env.example rust\.env
# Linux / macOS
# cp .env.example .env && cp rust/.env.example rust/.env

# 6 — Edit .env with your values (see Configuration)

# 7 — Start everything
npm run start:all
```

> **First run:** If no session is saved, a **QR code** will appear in the terminal.  
> Scan it from WhatsApp → ⋮ → Linked Devices → Link a Device.

---

## Configuration

### `.env` — Main variables

```env
# ─── Bot ──────────────────────────────────────────────────────────────────────
PREFIX="!,.,#,/"                        # Command prefixes (comma-separated)
BOT_NAME=WinsiBot                        # Bot display name
OWNER_JID=51999999999@s.whatsapp.net     # Your number (country code, no +)
SESSION_PATH=./auth                      # WhatsApp session folder
NODE_ENV=production                      # development | production
LOG_LEVEL=info                           # silent | info | debug | error

# ─── AI — all optional, bot works with any subset ─────────────────────────────
OPENAI_API_KEY=sk-...                    # GPT-4o-mini / DALL-E 3
ANTHROPIC_API_KEY=sk-ant-...             # Claude Haiku
GEMINI_API_KEY=AIza...                   # Gemini 1.5 Flash
OLLAMA_BASE_URL=http://localhost:11434   # Local Ollama (default port)
OLLAMA_MODEL=llama3                      # Model to use with Ollama

# ─── Session API (Rust) ───────────────────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=                         # openssl rand -hex 32

# ─── Webhook ──────────────────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=                          # openssl rand -hex 32

# ─── Python services ──────────────────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=                          # openssl rand -hex 32

# ─── Spotify (optional) ───────────────────────────────────────────────────────
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

### `rust/.env` — Session API

```env
PORT=3001
API_KEY=                   # Same value as SESSION_API_KEY above
SESSIONS_DIR=./sessions
AUTH_DIR=../auth
DB_PATH=./data/messages.db
RUST_LOG=winsibot_session_api=info
```

> **Generate secure keys:** `openssl rand -hex 32`

<details>
<summary>All environment variables</summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `PREFIX` | `"!,.,#,/"` | Comma-separated command prefixes |
| `WEBHOOK_PORT` | `4001` | HTTP receiver port |
| `SESSION_API_URL` | `http://127.0.0.1:3001` | Rust Session API URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `NODE_ENV` | `production` | Execution mode |
| `LOG_LEVEL` | `info` | Pino log level |
| `OPENAI_API_KEY` | — | GPT / DALL-E (optional) |
| `ANTHROPIC_API_KEY` | — | Claude (optional) |
| `GEMINI_API_KEY` | — | Gemini (optional) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama endpoint (optional) |
| `OLLAMA_MODEL` | `llama3` | Ollama model name |

</details>

---

## Running the Bot

### All-in-one *(recommended for production)*

```bash
npm run start:all
```

Starts in parallel: Rust Session API · Python Monitor (which in turn starts Node.js + FastAPI + Celery)

### By component *(for development)*

```bash
npm run rust:start      # Rust Session API only
npm run monitor         # Python monitor + Node.js + services
npm run dev             # Node.js only (no monitor, direct QR)
```

<details>
<summary>All npm scripts</summary>

| Script | Description |
|--------|-------------|
| `start:all` | Start everything in parallel |
| `monitor` | Python monitor with auto-restart |
| `dev` | Node.js direct — development / QR scan |
| `build` | Compile TypeScript → `dist/` |
| `rust:start` | Rust Session API |
| `rust:build` | Compile Rust in release mode |
| `manage` | Maintenance CLI (interactive menu) |
| `manage:status` | Service status overview |
| `manage:diagnose` | Deep session / Signal / Rust diagnostics |
| `manage:repair` | Automatic repair (tries QR-free restore first) |
| `manage:reset-signal` | Clear Signal sessions (Bad MAC) |
| `manage:reset-qr` | Full session reset + new QR |
| `manage:backup` | Force session backup |
| `manage:restore` | Restore from a backup |
| `manage:logs` | View recent session log events |
| `typecheck` | Type-check without compiling |
| `lint` | ESLint |
| `test` | Vitest |

</details>

---

## Commands

The bot has **75+ commands** across **17 categories**.

→ **[📖 Full command reference](docs/commands.en.md)**

<details>
<summary>Category overview</summary>

| Category | Notable commands | Description |
|----------|-----------------|-------------|
| 🤖 AI | `!gpt` `!claude` `!imagine` `!translate` | Multi-model chat, images, translations |
| 💰 RPG | `!work` `!daily` `!perfil` `!rw` `!clan` `!prestige` | Economy, gacha, levels, clans, prestige |
| 🎮 Games | `!arena` `!quiz` `!adivinar` `!mascota` | PvP Arena, Coding Quiz, Draw & Guess, pets |
| 🎁 Social | `!regalo` | Gift system, mailbox, wishlist, trades |
| 🛡️ Admin | `!ban` `!kick` `!antilink` `!warn` | Group moderation |
| 👑 Owner | `!exec` `!broadcast` `!premium` `!boost` | Full bot control |
| ⬇️ Downloads | `!yt` `!tiktok` `!ttsearch` `!ig` `!spotify` `!apk` | Media downloaders + carousel search |
| 🎨 Stickers | `!sticker` `!toimg` `!emojimix` `!stickerpack` | Create, convert, and pack stickers |
| 🎮 Fun | `!meme` `!sega` `!giphy` `!top` | Entertainment |
| 💞 Roleplay | `!hug` `!kiss` `!pat` `!kill` | Interactive anime GIFs |
| 🎵 Music | `!play` `!lyrics` `!spotify` | Audio and lyrics |
| 🌐 Media | `!anime` `!removebg` `!wimage` | Anime images, background removal, characters |
| 🔧 Util | `!clima` `!imagen` | Weather, image generation |
| ℹ️ Info | `!ping` `!creator` `!menu` | Bot information |
| 🤝 Jadibot | `!jadibot` `!stopbot` | Linked sub-bots |
| 🔞 NSFW | `!porngif` | Groups with NSFW enabled only |

</details>

---

## Maintenance CLI

```bash
npm run manage
```

Interactive multi-service menu orchestrating Python, Rust, and Node.js.

| Option | Command | When to use |
|:------:|---------|-------------|
| 1 | `manage:status` | Check FastAPI / Rust / Webhook / PHP status |
| 2 | `manage:diagnose` | Analyze session, Signal files, Rust, logs |
| 3 | `manage:repair` | Corrupted Signal → tries QR-free restore → backup |
| 4 | `manage:reset-signal` | Delete `session-*.json` only (keeps `creds.json`) |
| 5 | `manage:reset-qr` | Full session wipe and new QR |
| 6 | `manage:backup` | Create SHA-256 verified backup |
| 7 | `manage:restore` | Select and restore a backup |
| 8 | `manage:logs` | View last 30 session log events |

### Quick symptom guide

| Symptom | Solution |
|---------|---------|
| Bot unresponsive, messages not processed | `manage:reset-signal` |
| Repeated "Bad MAC" in terminal | automatic — or `manage:reset-signal` |
| Expired session / `loggedOut` | `manage:reset-qr` |
| `creds.json` corrupted | `manage:repair` (tries QR-free first) |
| Before shutting down the server | `manage:backup` |
| After an update | `manage:diagnose` |

---

## Webhook API

The receiver listens on `http://127.0.0.1:4001` and allows controlling the bot from external services.

### Authentication

All requests require the `x-webhook-signature` header with an HMAC-SHA256 signature:

```python
import hmac, hashlib

sig = hmac.new(WEBHOOK_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = { "x-webhook-signature": f"sha256={sig}" }
```

<details>
<summary>All endpoints</summary>

#### `GET /health`
```json
{ "ok": true, "uptime": 3600, "connected": true }
```

#### `POST /webhook` — Send message
```json
{
  "event": "send_message",
  "jid": "51999999999@s.whatsapp.net",
  "text": "Hello from webhook"
}
```

#### `POST /webhook` — Broadcast
```json
{
  "event": "broadcast",
  "jids": ["51111111111@s.whatsapp.net"],
  "text": "Mass message"
}
```

#### `POST /webhook` — Run job
```json
{ "event": "run_job", "jobId": "job_name" }
```

#### `POST /webhook` — Ping
```json
{ "event": "ping" }
```

</details>

### Response codes

| Code | Meaning |
|:----:|---------|
| `200` | Success |
| `400` | Invalid body or missing field |
| `401` | Invalid HMAC signature |
| `413` | Body too large (>64 KB) |
| `422` | Socket not available |
| `429` | Rate limit exceeded (1 req/s per IP) |
| `500` | Internal error |

---

## Monitoring

### Session API (Rust `:3001`)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | General status + active sessions |
| `GET /health/live` | Liveness probe (Docker / K8s) |
| `GET /health/ready` | Readiness probe |
| `GET /messages/stats?hours=24` | Delivery rate for the last N hours |
| `GET /messages/pending?minutes=5` | Messages without delivery confirmation |
| `GET /badmac/stats` | Per-group Bad MAC counters |
| `GET /rate/stats` | Per-sender rate limiter buckets |
| `GET /watchdog/status` | Node.js heartbeat — 503 if Node died |
| `GET /sessions/backup?sessionId=main` | Best available creds backup (QR-free restore) |

### Delivery stats example

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

> If `delivery_pct` drops below **80%**, run `npm run manage:repair`.

---

## Session API Reference

<details>
<summary>Full route list</summary>

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/write` | Write creds (base64) with atomic rename |
| `GET` | `/read` | Read current creds |
| `POST` | `/snapshot` | Force snapshot rotation |
| `POST` | `/recover` | Restore from best valid snapshot |
| `GET` | `/snapshots` | List all snapshots with health status |
| `GET` | `/healthy` | Session health + corruption check |
| `GET` | `/sessions` | List active session IDs |
| `POST` | `/sessions/signal/clear` | Delete Signal session files (Bad MAC fix) |
| `GET` | `/sessions/backup` | Return best valid creds for QR-free restore |
| `POST` | `/badmac/report` | Report a Bad MAC event for a group JID |
| `POST` | `/badmac/reset` | Reset Bad MAC counter for a group JID |
| `GET` | `/badmac/stats` | All group counters + last trigger times |
| `POST` | `/rate/check` | Check if sender is within rate limit |
| `GET` | `/rate/stats` | All sender buckets + usage |
| `POST` | `/watchdog/ping` | Node.js heartbeat ping |
| `GET` | `/watchdog/status` | Alive/dead + last ping time + ping count |
| `POST` | `/nlp/fast` | Rust-side NLP keyword detection |
| `POST` | `/ai/learn` | Store AI conversation turn (DuckDB) |
| `GET` | `/ai/context/:sender` | Retrieve conversation context |
| `POST` | `/messages/track` | Track outgoing message IDs |
| `POST` | `/messages/ack` | Update delivery status in batch |
| `GET` | `/messages/pending` | Get unconfirmed messages |
| `GET` | `/messages/stats` | Delivery statistics |
| `DELETE` | `/messages/cleanup` | Delete records older than N days |

</details>

### QR-free recovery flow

```
Bot starts → verifyAndReport(authDir)
  → creds.json corrupted detected via Curve25519 publicFromPrivate
  → _restoreCredsFromRust() → GET /sessions/backup (Rust)
    → Rust tries: current file → snapshot #1 → ... → snapshot #10
    → first valid JSON returned
  → TypeScript re-verifies backup with Curve25519
  → atomic write: creds.json.tmp → rename → creds.json
  → bot continues — no QR needed
```

---

## Project Structure

```
WinsiBot/
├── src/                              # TypeScript — main bot
│   ├── config.ts                     # Environment variables + Zod validation
│   ├── index.ts                      # Entry point
│   ├── types/
│   │   └── index.d.ts                # Global types (Command, UserData, etc.)
│   ├── core/
│   │   ├── socket.ts                 # WhatsApp WebSocket connection
│   │   ├── handler.ts                # Message dispatcher → commands (semaphore)
│   │   ├── store.ts                  # Contacts/chats cache (atomic write)
│   │   ├── logger.ts                 # Pino logger
│   │   ├── queue.ts                  # Priority message queue
│   │   └── events/
│   │       ├── index.ts              # UserData, GroupConfig, clans, global helpers
│   │       ├── xp.ts                 # XP / level system
│   │       ├── welcome.ts            # Welcome / farewell
│   │       ├── antispam.ts           # Spam detection
│   │       ├── antilink.ts           # Link filter
│   │       ├── antidelete.ts         # Deleted message forwarding
│   │       ├── anticall.ts           # Call blocking
│   │       └── nsfw.ts               # Adult content control
│   ├── lib/
│   │   ├── globals.ts                # Role system: owner/dev/mod/helper/premium
│   │   ├── db.ts                     # SQLite persistence (userData, groups, clans)
│   │   ├── ai.ts                     # Multi-model AI: GPT · Claude · Gemini
│   │   ├── authVerifier.ts           # Curve25519 auth dir verification + QR-free restore
│   │   ├── interactive.ts            # Interactive messages: buttons, lists, carousel, album
│   │   ├── gift.ts                   # Gift system (30+ items, mailbox, wishlist, trades)
│   │   ├── pvp.ts                    # PvP Arena (ELO K=32, 9 divisions, 5 actions)
│   │   ├── quiz.ts                   # Coding Quiz (42 questions, 5 difficulties)
│   │   ├── drawguess.ts              # Draw & Guess (55 words, hints, scoring)
│   │   ├── leveling.ts               # Prestige (10 ranks), streaks, medals, multipliers
│   │   ├── petAdvanced.ts            # Advanced Pets (25 species, evolution, battles)
│   │   ├── clan.ts                   # Extended Clans (territories, 24h wars, alliances)
│   │   ├── downloader.ts             # yt-dlp wrapper (YouTube, TikTok, Instagram)
│   │   ├── media.ts                  # Media processing
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter (TypeScript)
│   │   ├── safeMessage.ts            # Safe send with retries
│   │   ├── session.ts                # Rust Session API client
│   │   ├── sticker.ts                # Sticker creation
│   │   ├── jid_utils.ts              # JID utilities
│   │   └── utils.ts                  # General helpers
│   └── plugins/
│       ├── commands/                 # 75+ commands organized by category
│       ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│       ├── scheduler/                # Scheduled jobs (node-cron)
│       └── webhooks/                 # HTTP receiver
├── python/                           # Python — auxiliary services
│   ├── api/
│   │   └── routers/
│   │       └── hepein.py             # AI router: Ollama → GPT → Claude → Gemini
│   ├── ai/
│   │   ├── ollama_client.py          # Ollama async client with availability check
│   │   └── commands_ref.py           # Command reference for AI context
│   ├── session/                      # Backup / restore / SHA-256 checksum
│   └── terminal/
│       ├── monitor.py                # Main watchdog with auto-restart
│       └── manage.py                 # Interactive maintenance CLI
├── rust/                             # Rust — Session API
│   ├── build.rs                      # Windows linker fix (rstrtmgr.lib for DuckDB)
│   └── src/
│       ├── main.rs                   # Entry point (Axum)
│       ├── routes.rs                 # HTTP handlers + AppState
│       ├── bad_mac.rs                # Per-group Bad MAC sliding window tracker
│       ├── rate_limiter.rs           # Per-sender rate limiter (15 msgs / 10s)
│       ├── watchdog.rs               # Node.js heartbeat (90s dead threshold)
│       ├── snapshot.rs               # 10 rotating snapshots + read_best_valid()
│       ├── db.rs                     # SQLite delivery tracker
│       ├── atomic.rs                 # Atomic file write (tmp → fsync → rename)
│       └── nlp.rs                    # Rust-side NLP fast-path
├── php/                              # Optional web panel
├── docs/
│   ├── commands.md                   # Full command reference (ES)
│   └── commands.en.md                # Full command reference (EN)
├── .env.example
├── rust/.env.example
└── package.json
```

---

## Troubleshooting

<details>
<summary><b>Bot not responding to messages</b></summary>

1. Check connection: `npm run manage:status`
2. Look for Bad MAC errors in the terminal (auto-handled per group in v8.2.1)
3. Run: `npm run manage:reset-signal`
4. If the issue persists: `npm run manage:repair`

</details>

<details>
<summary><b>Repeated "Bad MAC" in terminal</b></summary>

From v8.2.1, Bad MAC is handled **per group** — one group flooding Bad MACs no longer triggers a global reconnect. The bot auto-detects the threshold (5 MACs in 30s per group) and clears only that group's Signal session.

To force a manual clear:

```bash
npm run manage:reset-signal
```

</details>

<details>
<summary><b>"auth dir missing" or "creds.json corrupt"</b></summary>

From v8.2.1, the bot attempts automatic QR-free recovery from Rust snapshots at startup. If that fails:

```bash
npm run manage:repair
# If no backup is available:
npm run manage:reset-qr
```

</details>

<details>
<summary><b>Bot restarts every few hours</b></summary>

Check `HANG_TIMEOUT` in `python/terminal/monitor.py`. Default is 15 minutes. The Rust watchdog also monitors the Node.js heartbeat (`GET /watchdog/status`) — inspect it to see the last ping time.

</details>

<details>
<summary><b>Error 440 — "Replaced by another instance"</b></summary>

WhatsApp Web is open in a browser with the same number. Close all web sessions and wait 60 seconds. The bot reconnects automatically with no retry limit (v8.2.1).

</details>

<details>
<summary><b><code>npm run rust:build</code> fails on Windows</b></summary>

```bash
rustup update stable
```

On Windows you also need **Visual Studio Build Tools** (MSVC). Download them from the Visual Studio Installer selecting "Desktop development with C++".

</details>

<details>
<summary><b>Ollama not responding / AI falls back to cloud</b></summary>

Check Ollama is running: `ollama serve`. Pull a model if you haven't: `ollama pull llama3`.  
The bot checks Ollama availability at every request and silently falls back to GPT → Claude → Gemini if it's down.

</details>

---

## FAQ

<details>
<summary><b>Can I use the bot with multiple numbers?</b></summary>

Yes, via the **JadiBot** system (`!jadibot`). Each sub-bot has its own independent session.

</details>

<details>
<summary><b>How many groups can it handle?</b></summary>

Designed for **10,000+ simultaneous groups**. The Rust rate limiter and per-group Bad MAC tracker use `HashMap` structures designed for high cardinality with automatic cleanup every 5,000 calls.

</details>

<details>
<summary><b>How often should I back up?</b></summary>

The monitor auto-backs up on start (if the session is valid) and on shutdown signal. Force it with `npm run manage:backup`. The last **10 snapshots** are kept by Rust, plus any manual backups.

</details>

<details>
<summary><b>Does it work with WhatsApp Business?</b></summary>

Yes. Delivery tracking also works with Business. However, features like catalogs or buttons from the official Business API are not available.

</details>

<details>
<summary><b>Is user data lost on restart?</b></summary>

No. `lib/db.ts` persists `userData`, `groupConfigs`, and clans in SQLite (`data/winsi.db`). Data loads automatically at startup.

</details>

<details>
<summary><b>What does @brashkie/signalis-core do?</b></summary>

It is a Rust-powered NAPI library exposing cryptographic primitives to Node.js: Curve25519, Ed25519, HKDF, AES-GCM, HMAC, SHA-256. WinsiBot uses it to verify that every key pair in `creds.json` is internally consistent (`publicFromPrivate(priv) === stored_pub`) before Baileys loads them — catching corruption before it causes Bad MAC errors at runtime.

</details>

---

## Security

> ⚠️ The `auth/` folder contains the private keys of your WhatsApp account. **Never include it in commits.**

- Use long random API keys (`openssl rand -hex 32`)
- The webhook receiver only listens on `127.0.0.1` by default
- All Session API routes require the API key in a header
- The webhook validates HMAC-SHA256 on every request
- Backups include SHA-256 checksum verification
- `creds.json` key pairs verified with Curve25519 at every startup
- `auth/` is in `.gitignore` — never expose it

---

## License

**GPL-3.0-or-later** — see [LICENSE](LICENSE)

<div align="center">

---

Built with care by **[Brashkie](https://github.com/Brashkie)** · Hepein Oficial

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=80&section=footer" width="100%"/>

</div>
