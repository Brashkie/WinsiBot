<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=180&section=header&text=WinsiBot&fontSize=62&fontColor=ffffff&fontAlignY=38&desc=v8.2.0%20%E2%80%94%20Enterprise%20WhatsApp%20Bot&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-8.2.0-6C63FF?style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/Brashkie/WinsiBot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Brashkie/WinsiBot/pulls)

<br/>

> High-performance WhatsApp bot with multi-language architecture.<br/>
> Built for **443+ simultaneous groups**, thousands of messages per hour, and multiple instances.<br/>
> v8.2.0 — Gift System, PvP Arena, Coding Quiz, Draw & Guess, Prestige, Advanced Pets, Full Clans, Native Carousel.

<br/>

**[🇪🇸 Versión en español →](README.md)** &nbsp;·&nbsp; **[📖 Commands →](docs/commands.en.md)** &nbsp;·&nbsp; **[🐛 Report issue](https://github.com/Brashkie/WinsiBot/issues)**

</div>

---

## Table of Contents

<details>
<summary>Expand</summary>

- [What is WinsiBot?](#what-is-winsibot)
- [Tech Stack](#tech-stack)
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
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Security](#security)
- [License](#license)

</details>

---

## What is WinsiBot?

**WinsiBot** is an enterprise-grade WhatsApp bot built on [Baileys](https://github.com/WhiskeySockets/Baileys) with a three-layer architecture:

| Layer | Technology | Responsibility |
|-------|-----------|---------------|
| 🟦 **Core** | TypeScript / Node.js | WhatsApp protocol, commands, message handler, RPG, AI |
| 🐍 **Services** | Python / FastAPI / Celery | Advanced AI, watchdog monitor, session backups, health check |
| ⚙️ **Session** | Rust / Axum | Atomic creds write, ×5 snapshots, SQLite delivery tracker |

---

## Tech Stack

<div align="center">

| Area | Technology | Purpose |
|------|-----------|---------|
| Runtime | Node.js 20 LTS | WhatsApp event loop |
| Language | TypeScript 5.x | Strict end-to-end typing |
| WhatsApp | Baileys 6.x | WA Web multi-device protocol |
| Services | Python 3.11 + FastAPI | AI, watchdog, backup |
| Tasks | Celery + Redis | Async task queue |
| Session Store | Rust + Axum + SQLite | Atomic creds + delivery tracking |
| Database | SQLite (better-sqlite3) | userData, groupConfigs, clans |
| Web panel | PHP 8.1 *(optional)* | Administration dashboard |

</div>

---

## Features

<table>
<tr>
<td width="50%">

### 📡 Messaging
- Token bucket rate limiting per JID
- Priority queue: `urgent` → `normal` → `broadcast`
- Delivery tracking: sent → delivered → read
- Auto Bad MAC flood detection + auto-repair
- 443+ groups without performance degradation

</td>
<td width="50%">

### 🔒 Session & Stability
- Atomic Rust write: `tmp → fsync → rename`
- 5 rotating snapshots with automatic recovery
- SHA-256 checksum backup
- Exponential reconnect (50 retries, max 60s)
- Python monitor with watchdog and freeze detection

</td>
</tr>
<tr>
<td width="50%">

### 🎮 RPG & Economy
- XP / levels / role system
- Custom currency (BrasCoins) + bank + prestige
- Gacha system (rollwaifu / pokedex / marvel)
- Full clans: warehouse, treasury, co-leaders, ranking
- Missions: work, mining, chest, crime, robbery
- **PvP Arena**: 1v1 battles with diamond wager
- **Coding Quiz**: type-based programming questions
- **Draw & Guess**: collaborative group drawing mini-game
- **Advanced Pets**: feed, train, evolve, adventure
- **Prestige system**: resets progress for exclusive rewards
- **Gift system**: send coins/XP/items to other users
- Native carousel: TikTok search with download buttons

</td>
<td width="50%">

### 🤖 Artificial Intelligence
- Multi-model: GPT · Claude · Gemini with fallback
- Conversation history per user (12 msgs)
- Rate limiting: 20 req/hour per JID
- Image generation with DALL-E
- Auto-translation (50+ languages)

</td>
</tr>
<tr>
<td width="50%">

### 🛡️ Moderation
- Antilink, antispam, antiflood, antitoxic
- Platform blocking: Telegram, Discord, TikTok
- Customizable welcome / goodbye messages
- Admin mode: only admins can use commands
- Warns with limit and auto-kick

</td>
<td width="50%">

### ⚙️ Infrastructure
- Independent sub-bots (JadiBot)
- HTTP Webhook with HMAC-SHA256
- Scheduler with cron-based jobs
- Multi-service maintenance CLI
- Optional PHP panel for statistics
- Native interactive messages: buttons, lists, carousels
- Automatic `interactiveResponseMessage` handling

</td>
</tr>
</table>

---

## Architecture

```
╔══════════════════════════════════════════════════════════════════════╗
║                        WinsiBot v8.2.0                               ║
╠═══════════════════╦═══════════════════╦════════════════════════════╣
║   TypeScript      ║      Python       ║           Rust             ║
║   Node.js :4001   ║                   ║                            ║
║                   ║  ┌─────────────┐  ║  ┌──────────────────────┐ ║
║  ┌─────────────┐  ║  │  FastAPI    │  ║  │   Session API :3001  │ ║
║  │ Baileys WS  │  ║  │  :5000      │  ║  │                      │ ║
║  ├─────────────┤  ║  ├─────────────┤  ║  │  ● atomic write      │ ║
║  │   Handler   │◄─╬─►│  Celery     │  ║  │  ● snapshots ×5      │ ║
║  ├─────────────┤  ║  ├─────────────┤  ║  │  ● delivery SQLite   │ ║
║  │ 75+ Cmds    │  ║  │  Monitor    │  ║  │  ● Signal clear      │ ║
║  ├─────────────┤  ║  │  Watchdog   │  ║  └──────────────────────┘ ║
║  │  lib/db.ts  │  ║  ├─────────────┤  ║                            ║
║  │  (SQLite)   │  ║  │  AI Brain   │  ║  ┌──────────────────────┐ ║
║  ├─────────────┤  ║  │  Health     │  ║  │   messages.db        │ ║
║  │  lib/ai.ts  │  ║  └─────────────┘  ║  │  ● outbox tracking   │ ║
║  │  GPT/Claude │  ║                   ║  │  ● delivery stats    │ ║
║  └─────────────┘  ║                   ║  └──────────────────────┘ ║
╚═══════════════════╩═══════════════════╩════════════════════════════╝
         │                   │                        │
         └───────────────────┴────────────────────────┘
                             │
                    WhatsApp Network
```

---

## Requirements

| Tool | Min Version | Required | Notes |
|------|------------|:--------:|-------|
| Node.js | 20.x LTS | ✅ | `node --version` |
| npm | 9.x | ✅ | bundled with Node |
| Python | 3.11+ | ✅ | `python --version` |
| Rust + Cargo | 1.75+ | ✅ | to build Session API |
| Redis | 6.x | ✅ | for Celery / queue |
| PHP | 8.1+ | ❌ | optional web panel |
| FFmpeg | 6.x | ❌ | media conversion |

**Supported OS:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+

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

# 4 — Build Rust Session API
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

> **First run:** If there is no saved session, a **QR code** will appear in the terminal.  
> Scan it from WhatsApp → ⋮ → Linked devices → Link a device.

---

## Configuration

### `.env` — Main variables

```env
# ─── Bot ──────────────────────────────────────────────────────────────────
PREFIX="!,.,#,/"                        # Command prefixes (comma-separated)
BOT_NAME=WinsiBot                        # Bot display name
OWNER_JID=51999999999@s.whatsapp.net     # Your number (country code, no +)
SESSION_PATH=./auth                      # WhatsApp session folder
NODE_ENV=production                      # development | production
LOG_LEVEL=info                           # silent | info | debug | error

# ─── AI ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...                    # GPT-4o-mini / DALL-E 3
ANTHROPIC_API_KEY=sk-ant-...            # Claude Haiku
GEMINI_API_KEY=AIza...                   # Gemini 1.5 Flash

# ─── Session API (Rust) ───────────────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=                         # openssl rand -hex 32

# ─── Webhook ──────────────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=                          # openssl rand -hex 32

# ─── Python Services ──────────────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=                          # openssl rand -hex 32

# ─── Spotify (optional) ───────────────────────────────────────────────────
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

> **Generate secure keys:** `openssl rand -hex 32`

---

## Running the Bot

### All-in-one *(recommended for production)*

```bash
npm run start:all
```

Starts in parallel: Rust Session API · Python Monitor (which starts Node.js + FastAPI + Celery)

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
| `rust:build` | Build Rust in release mode |
| `manage` | Maintenance CLI (interactive menu) |
| `manage:status` | Service status |
| `manage:diagnose` | Deep diagnostic |
| `manage:repair` | Automatic repair |
| `manage:reset-signal` | Clear Signal sessions (Bad MAC) |
| `manage:reset-qr` | Full reset + new QR |
| `manage:backup` | Force session backup |
| `manage:restore` | Restore from backup |
| `manage:logs` | View recent logs |
| `typecheck` | Type check without compiling |
| `lint` | ESLint |
| `test` | Vitest |

</details>

---

## Commands

The bot has **75+ commands** in **17 categories**.

→ **[📖 Full command reference](docs/commands.en.md)**

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
| 3 | `manage:repair` | Corrupted Signal → recover creds → restore backup |
| 4 | `manage:reset-signal` | Delete only `session-*.json` (keep `creds.json`) |
| 5 | `manage:reset-qr` | Delete full session and get a new QR |
| 6 | `manage:backup` | Create SHA-256 verified backup |
| 7 | `manage:restore` | Select and restore a backup |
| 8 | `manage:logs` | View last 30 session log events |

### Quick troubleshooting reference

| Symptom | Solution |
|---------|---------|
| Bot unresponsive, messages not arriving | `manage:reset-signal` |
| "Bad MAC" looping in terminal | `manage:reset-signal` |
| Session expired / `loggedOut` | `manage:reset-qr` |
| `creds.json` corrupt | `manage:repair` |
| Before shutting down the server | `manage:backup` |
| After updating | `manage:diagnose` |

---

## Webhook API

The receiver listens on `http://127.0.0.1:4001` and allows controlling the bot from external services.

### Authentication

All requests require the `x-webhook-signature` header with HMAC-SHA256:

```python
import hmac, hashlib

sig = hmac.new(WEBHOOK_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = { "x-webhook-signature": f"sha256={sig}" }
```

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

### Rust Session API (`:3001`)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | General status + active sessions |
| `GET /health/live` | Liveness (Docker / K8s) |
| `GET /health/ready` | Readiness |
| `GET /messages/stats?hours=24` | Delivery rate for last N hours |
| `GET /messages/pending?minutes=5` | Unconfirmed messages |

> ⚠️ If `delivery_pct` drops below **80%**, run `npm run manage:repair`.

---

## Project Structure

```
WinsiBot/
├── src/                              # TypeScript — main bot
│   ├── config.ts                     # Env vars + Zod validation
│   ├── index.ts                      # Entry point
│   ├── types/index.d.ts              # Global types (Command, UserData, etc.)
│   ├── core/
│   │   ├── socket.ts                 # WhatsApp WebSocket connection
│   │   ├── handler.ts                # Message dispatcher → commands
│   │   ├── store.ts                  # Contact/chat cache (atomic write)
│   │   ├── logger.ts                 # Pino logger
│   │   ├── queue.ts                  # Priority message queue
│   │   └── events/
│   │       ├── index.ts              # UserData, GroupConfig, clans, global helpers
│   │       ├── xp.ts                 # XP / level system
│   │       ├── welcome.ts            # Welcome / goodbye
│   │       ├── antispam.ts           # Spam detection
│   │       ├── antilink.ts           # Link filter
│   │       ├── antidelete.ts         # Deleted message forwarding
│   │       ├── anticall.ts           # Call blocking
│   │       └── nsfw.ts               # Adult content control
│   ├── lib/
│   │   ├── globals.ts                # Role system: owner/dev/mod/helper/prem
│   │   ├── db.ts                     # SQLite persistence (userData, groups, clans)
│   │   ├── ai.ts                     # Multi-model AI: GPT · Claude · Gemini
│   │   ├── interactive.ts            # 🆕 sendButton / sendList / sendCarousel
│   │   ├── gift.ts                   # 🆕 Gift system between users
│   │   ├── pvp.ts                    # 🆕 PvP Arena engine
│   │   ├── quiz.ts                   # 🆕 Coding Quiz engine
│   │   ├── drawguess.ts              # 🆕 Draw & Guess engine
│   │   ├── leveling.ts               # 🆕 XP / level / prestige logic
│   │   ├── petAdvanced.ts            # 🆕 Advanced pet: feed, train, evolve
│   │   ├── clan.ts                   # 🆕 Full clan: warehouse, treasury, ranking
│   │   ├── downloader.ts             # yt-dlp wrapper (YouTube, TikTok, Instagram)
│   │   ├── media.ts                  # Media processing
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter
│   │   ├── safeMessage.ts            # Safe send with retries
│   │   ├── session.ts                # Rust Session API client
│   │   ├── sticker.ts                # Sticker creation
│   │   ├── jid_utils.ts              # JID utilities
│   │   └── utils.ts                  # General helpers
│   └── plugins/
│       ├── commands/                 # 75+ commands by category
│       │   ├── rpg/                  # work, daily, perfil, rollwaifu, clan, couple…
│       │   ├── games/                # 🆕 arena, quiz, adivinar (PvP, quiz, draw&guess)
│       │   ├── admin/                # ban, kick, warn, antilink, config…
│       │   ├── owner/                # exec, broadcast, premium, boost…
│       │   ├── ai/                   # gpt, imagine, translate
│       │   ├── fun/                  # meme, sega, giphy, top…
│       │   ├── downloader/           # 🆕 ttsearch, apk, downloadapk, tiktok, ytmp3…
│       │   ├── sticker/              # 🆕 sticker, stickerpack, removebg…
│       │   └── …
│       ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│       ├── scheduler/                # Scheduled jobs (node-cron)
│       └── webhooks/                 # HTTP receiver
├── python/                           # Python — auxiliary services
│   ├── api/                          # FastAPI + Celery
│   ├── ai/                           # AI, break detector, health monitor
│   ├── session/                      # Backup / restore / SHA-256 checksum
│   └── terminal/
│       ├── monitor.py                # Main watchdog with auto-restart
│       └── manage.py                 # Interactive maintenance CLI
├── rust/                             # Rust — Session API
│   └── src/
│       ├── main.rs                   # Entry point (Axum)
│       ├── routes.rs                 # HTTP handlers
│       ├── db.rs                     # SQLite delivery tracker
│       ├── atomic.rs                 # Atomic file write
│       └── snapshot.rs               # Rotating snapshots ×5
├── docs/
│   ├── commands.md                   # Full command reference (ES)
│   └── commands.en.md                # Full command reference (EN)
├── .env.example
└── rust/.env.example
```

---

## Troubleshooting

<details>
<summary><b>Bot not responding to messages</b></summary>

1. Check it's connected: `npm run manage:status`
2. Look for Bad MAC errors in the terminal
3. Run: `npm run manage:reset-signal`
4. If it persists: `npm run manage:repair`

</details>

<details>
<summary><b>"Bad MAC" looping in terminal</b></summary>

Signal sessions are corrupted. The bot auto-detects this (8 Bad MACs in 60s) and auto-repairs. To force it manually:

```bash
npm run manage:reset-signal
```

</details>

<details>
<summary><b>"auth dir missing" or "creds.json corrupt"</b></summary>

```bash
npm run manage:repair
# If no backup is available:
npm run manage:reset-qr
```

</details>

<details>
<summary><b><code>npm run rust:build</code> fails on Windows</b></summary>

```bash
rustup update stable
```

You also need **Visual Studio Build Tools** (MSVC). Download them from the Visual Studio Installer by selecting "Desktop development with C++".

</details>

---

## FAQ

<details>
<summary><b>Can I use the bot with multiple numbers?</b></summary>

Yes, via the **JadiBot** system (`!jadibot`). Each sub-bot has its own independent session.

</details>

<details>
<summary><b>How many groups can it handle?</b></summary>

Tested with **443+ simultaneous groups** without degradation. The store does not cache group messages (only metadata) to keep memory usage low.

</details>

<details>
<summary><b>Does it work with WhatsApp Business?</b></summary>

Yes. Delivery tracking also works with Business. However, features like catalogs or buttons from the official Business API are not available.

</details>

<details>
<summary><b>Is user data lost on restart?</b></summary>

No, not since v8.1.0. The `lib/db.ts` library persists `userData`, `groupConfigs`, and clans in SQLite (`data/winsi.db`). Data is automatically loaded on startup.

</details>

---

## Security

> ⚠️ The `auth/` folder contains your WhatsApp account's private cryptographic keys. **Never include it in git commits.**

- Use long random API keys (`openssl rand -hex 32`)
- The webhook receiver only listens on `127.0.0.1` by default
- All Session API routes require an API key header
- Webhook validates HMAC-SHA256 on every request
- Session backups include SHA-256 checksum verification
- `auth/` is in `.gitignore` — do not expose it

---

## License

**GPL-3.0-or-later** — see [LICENSE](LICENSE)

<div align="center">

---

Developed with ❤️ by **[Brashkie](https://github.com/Brashkie)** · Hepein Oficial

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=80&section=footer" width="100%"/>

</div>
