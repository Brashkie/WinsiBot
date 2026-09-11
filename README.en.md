<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=180&section=header&text=WinsiBot&fontSize=62&fontColor=ffffff&fontAlignY=38&desc=v8.9.0%20%E2%80%94%20Enterprise%20WhatsApp%20Bot&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-8.9.0-6C63FF?style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20Android-lightgrey?style=flat-square)](https://github.com/Brashkie/WinsiBot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Brashkie/WinsiBot/pulls)

<br/>

> High-performance WhatsApp bot with a three-layer multi-language architecture.<br/>
> No artificial group limit, built for thousands of messages per hour and multiple instances.<br/>
> v8.9.0 — DuckDB is gone: it was why the first Rust build took 10–30 min, and with MSVC 14.51 it no longer finished at all. Its two tables move to `rusqlite` and a clean build drops to **3 m 19 s**. Thorough removal of verified dead code — 9 Rust routes, 3 Python routers, 5 TypeScript methods — plus a bug found along the way: the credentials backup never made its final write on shutdown.

<br/>

**[🇪🇸 Versión en español →](README.md)** &nbsp;·&nbsp; **[📖 Commands →](docs/commands.en.md)** &nbsp;·&nbsp; **[💰 Economy guide →](docs/economy.en.md)** &nbsp;·&nbsp; **[📜 Version history →](CHANGELOG.md)** &nbsp;·&nbsp; **[🐛 Report issue](https://github.com/Brashkie/WinsiBot/issues)**

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
| 🐍 **Services** | Python / FastAPI | Advanced AI (Ollama + GPT + Claude + Gemini), watchdog, health checks |
| ⚙️ **Session** | Rust / Axum | Atomic creds write, 10 rotating snapshots, Bad MAC tracker, rate limiter, delivery SQLite |

### What's new in v8.9.0

| Area | Change |
|------|--------|
| **Outbox: critical-operation messages no longer vanish in a crash** | If the bot deducted money and died before sending the confirmation, the state change stood and the user got nothing. Rust's `outbox` table existed but was a delivery meter: it recorded **after** sending and **without content**, so there was nothing to resend. Now `sendCritical()` queues → sends → marks sent, and on startup `replayOutbox()` resends whatever was left hanging. With a dead letter: anything that fails 3 times drops out of the retry loop but stays in the database for inspection |
| **Chaos testing (`npm run chaos`)** | 27 checks across 8 scenarios that break things for real against the compiled code: re-delivery storms, a restart mid-storm, corrupted logs, downed dependencies, the event loop blocked for 1.8s, and a crash between charging and confirming. It turns "I think it holds up" into "we tested its failure modes" |
| **Load shedding** | Under saturation, instead of trying to process everything until it dies, the bot sheds what it can spare: DEGRADED drops AI/downloads/music/NSFW, CRITICAL also drops the game. Moderation, admin and owner never drop. The signal is **event loop lag** — the only thing that detects Node saturation when CPU and RAM look normal |
| **Circuit breakers** | With Python or Rust down, every message paid the full timeout before failing anyway — both sit on the critical path. Now after N failures the circuit opens and fails instantly: from **242 ms to 0.01 ms** per call. A 429 from `/rate/check` (an intentional block) doesn't count as a failure: what's measured is whether the service answers |
| **Applied to 9 commands** | Transfers (`pay`, `transfer`, `rob`), long-cooldown rewards (`daily`, `weekly`, `monthly`) and settled bets (`coinflip`, `roulette`, `invest`). The other 21 economy commands were deliberately left alone: short cooldowns, or changes the user can verify with `#bal`. Incidentally, `transfer` and `rob` were sending around the rate limiter |
| **Fix: the same message could run twice** | `socket.ts` accepts `type === 'append'` (post-sync re-deliveries, 5-minute window) and Baileys' event buffer engages on **every** reconnect — routine with Bad MAC. There was no protection by message id at all: a `#daily` followed by a reconnect inside those 5 minutes ran twice. New `core/dedup.ts`, keeping the record **on disk** (an in-memory `Set` is lost precisely in the restart case) and scoped **per instance**, since ids are global to WhatsApp and a group message reaches the main bot and every sub-bot |
| **DuckDB removed** | It was why the first Rust build took 10–30 min — and with MSVC 14.51 it no longer finished at all. Only a Bad MAC counter and an AI conversation log used it, and both fit in `rusqlite` (already in the project). `cargo check` went from **failing** to 15 s, and a clean release build to **3 m 19 s**. `rust/build.rs`, which existed solely for it, goes too |
| **Fix: the credentials backup lost its last write** | `sessionClient.save()` debounces by 5 s and its doc said "call `flushNow()` before exiting" — but nobody did. The Rust-side backup lagged the disk by up to 5 s, and that's precisely the copy used to recover from a corrupted session. Now wired into shutdown, before the Rust process is killed and with a 2 s cap |
| **Dead code: 9 Rust routes** | `/ai/export`, `/badmac/export`, `/badmac/reset`, `/badmac/stats`, `/rate/stats`, `/audit`, `/snapshots`, `/messages/stats`, `/messages/cleanup` — none had a single caller. Along with their handlers, structs and helpers. **Rust compiles with zero warnings** |
| **Dead code: Python and TypeScript** | Removed `routers/groups.py`, `ratelimit.py` and `cache.py`, plus 5 unused methods from `lib/session.ts` (352 → 306 lines) |
| **One persistence engine fewer** | From 6 to 5: strenor, JSON, rusqlite, SQLAlchemy and Parquet |

**[📜 See the full version history →](CHANGELOG.md)**

---

## Technical Stack

<div align="center">

| Area | Technology | Purpose |
|------|-----------|---------|
| Runtime | Node.js 20 LTS | WhatsApp event loop |
| Language | TypeScript 5.x | End-to-end strict typing |
| WhatsApp | Baileys 6.x | WA Web multi-device protocol |
| Services | Python 3.11 + FastAPI | AI, watchdog, backup |
| Session Store | Rust + Axum + SQLite | Atomic creds + delivery tracking |
| Crypto | `@brashkie/signalis-core` | Curve25519 / Ed25519 / HKDF / AES-GCM (Rust NAPI) |
| Persistence — users | `strenor` (Rust NAPI) | `data/users.aof`, a delta log: only the user that changed gets written |
| Persistence — rest | JSON under `data/` (`core/persistence.ts`) | groupConfigs, clans, inventory — rewritten only when they change |
| Embedded KV | `strenor` (Rust NAPI) | Web panel sessions, with real TTL |
| Web Panel | React + Vite + Tailwind + TanStack | Real-time dashboard — admin and self-service for sub-bots/groups |

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
- No artificial group limit, no performance degradation
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
- Non-exponential leveling curve — reachable up to level 400
- Daily streak with progressive bonus (`#daily`, ×1.00–×1.20+)
- Own currency (BrasCoins) + bank
- **BrasEmbers**: scarce currency gating NSFW commands (`#ascuas`)
- **Businesses**: 6 buyable businesses with passive hourly income (`#business`/`#collect`)
- Gacha (rollwaifu / pokédex / marvel / anime) + collection (`#harem`)
- **Advanced Clans**: territories, 24h wars, alliances, treasury
- Missions: work, mining, chest, crime, theft
- **Gift System**: 30+ item catalog, mailbox, wishlist, trades
- **PvP Arena**: ELO, 9 divisions, bets, 5 combat actions
- **Dragon City**: 579 real dragons, eggs, video evolution, passive Gold
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
- Real-time web panel (React) — admin and self-service for sub-bots/groups
- **Interactive messages**: native buttons, lists, carousel, album, sylph
- **Button auto-response**: handler intercepts `interactiveResponseMessage`

</td>
</tr>
</table>

---

## Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           WinsiBot v8.9.0                                    ║
╠════════════════════╦═══════════════════════╦═══════════════════════════════╣
║   TypeScript        ║       Python           ║           Rust                ║
║   Node.js :4001     ║                        ║                               ║
║                     ║  ┌──────────────────┐  ║  ┌───────────────────────┐   ║
║  ┌───────────────┐  ║  │  FastAPI :5000   │  ║  │  Session API :3001    │   ║
║  │  Baileys WS   │  ║  ├──────────────────┤  ║  │                       │   ║
║  ├───────────────┤  ║  │  ML: spam/intent │  ║  │  ● atomic write       │   ║
║  │   Handler     │◄─╬─►│  Ollama client   │  ║  │  ● snapshots ×10      │   ║
║  │  (semaphore)  │  ║  │  GPT/Claude/     │  ║  │  ● bad_mac tracker    │   ║
║  ├───────────────┤  ║  │  Gemini fallback │  ║  │  ● rate_limiter       │   ║
║  │  125+ Cmds    │  ║  ├──────────────────┤  ║  │  ● watchdog heartbeat │   ║
║  ├───────────────┤  ║  │  Monitor         │  ║  │  ● delivery SQLite    │   ║
║  │  persistence  │  ║  │  Watchdog        │  ║  │  ● /sessions/backup   │   ║
║  │  (strenor)    │  ║  └──────────────────┘  ║  └───────────────────────┘   ║
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
| Ollama | latest | ❌ | local AI (recommended, 16 GB RAM+) |
| FFmpeg | 6.x | ❌ | media conversion |

**Supported OS:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+ · macOS 12+ · Android (Termux)

> **Platform note:** on Termux/Android and headless Linux/macOS, Ollama is optional just like on Windows — the bot degrades gracefully without it. `npm run cython:build` and `npm run spam:build` auto-detect the available C compiler (`gcc`/`clang`) on any of the three platforms. The web panel (`web/`) uses the same Node.js already required — no new tool, just a separate `npm install && npm run build` (see Installation).
>
> **Two things to expect on weaker devices (Termux/Android, single-board ARM):**
>
> - Some native Node dependencies (`sharp`, `cbor-x`) ship no prebuilt binary for Android — `npm install` compiles them from source, so you need a C/C++ compiler installed *before* running it (see the Termux section below).
> - The first Rust build (`npm run rust:build`) takes a few minutes (~3 min on a desktop; considerably longer on a phone) because it compiles the whole dependency tree with LTO. That's expected — don't close the terminal, just let it run (and keep the device from sleeping).

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

# 5 — Build the web panel (optional — the bot still starts without this,
#     the panel just shows a notice until you run this step)
cd web
npm install
npm run build
cd ..

# 6 — Environment variables
# Windows
copy .env.example .env
copy rust\.env.example rust\.env
# Linux / macOS
# cp .env.example .env && cp rust/.env.example rust/.env

# 7 — Edit .env with your values (see Configuration)

# 8 — Start everything
npm run start
```

> **First run:** If no session is saved, a **QR code** will appear in the terminal.  
> Scan it from WhatsApp → ⋮ → Linked Devices → Link a Device.

---

### Installing on Termux (Android)

The same 8 steps above work on Termux — this section only covers what's Android-specific: what to install first, and how to keep the bot running after you close the app.

> Install Termux from **F-Droid**, not the Play Store — the Play Store version is discontinued and outdated.

```bash
# 0 — System packages (one time only)
pkg update && pkg upgrade -y
pkg install -y nodejs-lts python rust git clang make pkg-config openssl-tool tmux

# Optional — only if the bot needs to read/write shared device storage
# (outside its own data folder):
termux-setup-storage
```

With that installed, follow the 8 steps in the [Installation](#installation) section above unchanged — Termux takes the "Linux / macOS" branch in steps 3 and 6.

**Two things that will happen and are expected:**

- In step 2 (`npm install`), some native dependencies will compile from source (Android has no prebuilt binary for them) — that's why `clang`/`make`/`pkg-config` come first in step 0. If `npm install` fails mentioning `node-gyp` or a missing compiler, one of those packages is missing.
- In step 4 (`npm run rust:build`), the first build takes a few minutes (~3 min on a desktop; longer on a phone) because it compiles all dependencies with LTO. Let it run and don't close the Termux session.

**Keeping the bot running in the background:**

- Run `termux-wake-lock` before starting the bot to stop Android from killing the process when the screen turns off (`termux-wake-unlock` to release it later).
- Run the bot inside a `tmux` session (`tmux new -s winsibot`, then `npm run start`) so the process survives closing the Termux app — reattach with `tmux attach -t winsibot`.
- For autostart on device reboot, install the **Termux:Boot** add-on (F-Droid) and add a script under `~/.termux/boot/`.

> **RAM:** Ollama (local AI) usually isn't viable on a regular phone — use the cloud APIs (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`) instead, the bot falls back to them automatically if Ollama doesn't respond.

---

## Configuration

### `.env` — Main variables

```env
# ─── Bot ──────────────────────────────────────────────────────────────────────
PREFIX="!,.,#,/"                        # Command prefixes (comma-separated)
BOT_NAME=WinsiBot                        # Bot display name
OWNER_JID=51999999999@s.whatsapp.net     # Your number (country code, no +)
SESSION_PATH=./auth                      # WhatsApp session folder
NEWSLETTER_JID=                          # Optional — your own WhatsApp channel, for the menu's "View channel"
MAX_CONTACTS=20000                       # Max cached contacts before rotating the oldest ones out
NODE_ENV=production                      # development | production
LOG_LEVEL=info                           # silent | info | debug | error

# ─── AI — all optional, bot works with any subset ─────────────────────────────
OPENAI_API_KEY=sk-...                    # GPT-4o-mini / DALL-E 3
ANTHROPIC_API_KEY=sk-ant-...             # Claude Haiku
GEMINI_API_KEY=AIza...                   # Gemini 1.5 Flash
OLLAMA_URL=http://localhost:11434        # Local Ollama (default port)
OLLAMA_MODEL=llama3.2:3b                 # Model to use with Ollama

# ─── Session API (Rust) ───────────────────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=                         # openssl rand -hex 32

# ─── Webhook ──────────────────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=                          # openssl rand -hex 32

# ─── Python services ──────────────────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
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
| `NEWSLETTER_JID` | — | Own channel for the menu's "View channel" (optional) |
| `MAX_CONTACTS` | `20000` | Cached contacts before rotating the oldest out |
| `WEBHOOK_PORT` | `4001` | HTTP receiver port |
| `SESSION_API_URL` | `http://127.0.0.1:3001` | Rust Session API URL |
| `NODE_ENV` | `production` | Execution mode |
| `LOG_LEVEL` | `info` | Pino log level |
| `OPENAI_API_KEY` | — | GPT / DALL-E (optional) |
| `ANTHROPIC_API_KEY` | — | Claude (optional) |
| `GEMINI_API_KEY` | — | Gemini (optional) |
| `OLLAMA_URL` | `http://localhost:11434` | Local Ollama endpoint (optional) |
| `OLLAMA_MODEL` | `llama3.2:3b` | Ollama model name |

</details>

---

## Running the Bot

### All-in-one *(recommended)*

```bash
npm run start
```

Builds and starts the bot **behind a lightweight supervisor** (`src/supervisor.ts`)
that restarts it if it crashes or hangs without a heartbeat. The bot, in turn,
brings up its own dependencies (Rust Session API, Python/FastAPI)
if they aren't already running, and each one restarts itself if it crashes —
each with its own status indicator, and a single Ctrl+C to shut everything down together.

### By component *(for development)*

```bash
npm run rust:start      # Rust Session API only, standalone
npm run dev             # Node.js only, no build step — fast iteration / QR scan
npm run monitor         # Python monitor with auto-restart and dashboard
```

<details>
<summary>All npm scripts</summary>

| Script | Description |
|--------|-------------|
| `start` | Build and start the bot **via the supervisor** — restarts it if it crashes or hangs, and brings up Rust/Python on its own (each with its own auto-restart) |
| `start:unsupervised` | Same as `start` but without the supervisor layer — runs `dist/index.js` directly |
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
| `chaos` | Break things on purpose and verify the bot holds up (`npm run chaos dedup` filters by scenario) |
| `users:export` | Export the user table to a readable JSON |
| `users:import` | Restore the user table from a JSON (with the bot stopped) |
| `users:stats` | How many users there are and how big the log is |
| `typecheck` | Type-check without compiling |
| `lint` / `lint:fix` | Biome — lints `src/`/`scripts/` (check-only / auto-fix what's safe) |
| `format` / `format:fix` | Biome — formats `src/`/`scripts/` (show diff only / write) |
| `check` / `check:fix` | Biome — lint + format + import sorting in one pass |
| `rust:lint` | `cargo clippy` on the Rust Session API |
| `py:lint` / `py:lint:fix` | Ruff — lints `python/` (needs `pip install -r python/requirements-dev.txt`) |
| `py:format` | Ruff — formats `python/` |
| `lint:all` | Runs `lint` + `rust:lint` + `py:lint` in one go |
| `test` | Vitest |

</details>

---

## Commands

The bot has **125+ commands** across **19 categories**.

→ **[📖 Full command reference](docs/commands.en.md)**

<details>
<summary>Category overview</summary>

| Category | Notable commands | Description |
|----------|-----------------|-------------|
| 🤖 AI | `!gpt` `!claude` `!imagine` `!translate` | Multi-model chat, images, translations |
| 💰 RPG | `!work` `!daily` `!perfil` `!rw` `!clan` `!prestige` `!harem` `!leveltop` | Economy, gacha, levels (daily streak), clans, prestige |
| 🎮 Games | `!arena` `!quiz` `!adivinar` `!pet` | PvP Arena, Coding Quiz, Draw & Guess, dragons |
| 🎁 Social | `!regalo` | Gift system, mailbox, wishlist, trades |
| 🛡️ Admin | `!ban` `!kick` `!antilink` `!warn` | Group moderation |
| 👑 Owner | `!exec` `!broadcast` `!premium` `!boost` | Full bot control |
| ⬇️ Downloads | `!yt` `!ytmp4` `!tiktok` `!ttsearch` `!ig` `!spotify` `!apk` | Media downloaders + carousel search |
| 🎨 Stickers | `!sticker` `!toimg` `!emojimix` `!stickerpack` | Create, convert, and pack stickers |
| 🎮 Fun | `!meme` `!sega` `!giphy` `!top` | Entertainment |
| 💞 Roleplay | `!hug` `!kiss` `!pat` `!kill` `!punch` `!laugh` `!sad` `!sleep` | Interactive anime GIFs |
| 🎵 Music | `!play` `!lyrics` `!spotify` | Audio and lyrics |
| 🌐 Media | `!anime` `!removebg` `!wimage` | Anime images, background removal, characters |
| 🔧 Util | `!clima` `!imagen` | Weather, image generation |
| ℹ️ Info | `!ping` `!creator` `!infobot` `!menu` | Bot information |
| 🤝 Jadibot | `!jadibot` `!stopbot` | Linked sub-bots |
| 🔞 NSFW | `!porngif` `!rule34` `!sexyimg` `!stickerporn` | Groups with NSFW enabled only |

</details>

---

## Maintenance CLI

```bash
npm run manage
```

Interactive multi-service menu orchestrating Python, Rust, and Node.js.

| Option | Command | When to use |
|:------:|---------|-------------|
| 1 | `manage:status` | Check FastAPI / Rust / Webhook / Web panel status |
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
| `GET /messages/pending?minutes=5` | Messages without delivery confirmation |
| `GET /watchdog/status` | Node.js heartbeat — 503 if Node died |
| `GET /sessions/backup?sessionId=main` | Best available creds backup (QR-free restore) |

### Messages pending delivery example

```bash
curl -H "x-api-key: YOUR_KEY" http://127.0.0.1:3001/messages/pending
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
| `GET` | `/healthy` | Session health + corruption check |
| `GET` | `/sessions` | List active session IDs |
| `POST` | `/sessions/signal/clear` | Delete Signal session files (Bad MAC fix) |
| `GET` | `/sessions/backup` | Return best valid creds for QR-free restore |
| `POST` | `/badmac/report` | Report a Bad MAC event for a group JID (escalating cooldown) |
| `POST` | `/rate/check` | Check if sender is within rate limit |
| `POST` | `/watchdog/ping` | Node.js heartbeat ping |
| `GET` | `/watchdog/status` | Alive/dead + last ping time + ping count |
| `POST` | `/nlp/fast` | Rust-side NLP keyword detection |
| `POST` | `/ai/learn` | Store AI conversation turn (SQLite) |
| `GET` | `/ai/context/:sender` | Retrieve conversation context |
| `POST` | `/messages/track` | Track outgoing message IDs |
| `POST` | `/messages/ack` | Update delivery status in batch |
| `GET` | `/messages/pending` | Get unconfirmed messages |
| `POST` | `/outbox/enqueue` | Queue a send BEFORE dispatching it, with its content |
| `GET` | `/outbox/unsent` | What stayed queued without going out — replayed on startup |
| `POST` | `/outbox/sent` | Mark as actually sent (releases the payload) |
| `POST` | `/outbox/retry` | Bump the retry counter (dead-letter after N attempts) |

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
│   ├── supervisor.ts                 # Restarts the bot if it crashes or hangs (external watchdog)
│   ├── types/
│   │   └── index.d.ts                # Global types (Command, UserData, etc.)
│   ├── core/
│   │   ├── socket.ts                 # WhatsApp WebSocket connection
│   │   ├── handler.ts                # Message dispatcher → commands (semaphore with bounded wait)
│   │   ├── dedup.ts                  # Drops re-delivered duplicates (per instance, survives restarts)
│   ├── loadShedding.ts           # Degrades on event loop lag — never sheds moderation or admin
│   │   ├── groupCache.ts             # Canonical groupMetadata cache (TTL + debounce/coalescing)
│   │   ├── store.ts                  # Contacts/chats cache (atomic write)
│   │   ├── persistence.ts            # Real persistence (users/groups/inventory/clans.json, atomic write)
│   │   ├── lid_mapper.ts             # @lid ↔ real number resolution
│   │   ├── logger.ts                 # Pino logger
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
│   │   ├── authStateCbor.ts          # Baileys session (creds/keys) in CBOR instead of JSON
│   │   ├── authVerifier.ts           # Curve25519 auth dir verification + QR-free restore
│   │   ├── db.ts                     # SQLite — generic KV (web panel sessions)
│   │   ├── interactive.ts            # Interactive messages: buttons, lists, carousel, album
│   │   ├── gift.ts                   # Gift system (30+ items, mailbox, wishlist, trades)
│   │   ├── pvp.ts                    # PvP Arena (ELO K=32, 9 divisions, 5 actions)
│   │   ├── quiz.ts                   # Coding Quiz (42 questions, 5 difficulties)
│   │   ├── drawguess.ts              # Draw & Guess (55 words, hints, scoring)
│   │   ├── leveling.ts               # Prestige (10 ranks), streaks, medals, multipliers
│   │   ├── dragoncity.ts             # Dragon City (579 dragons, evolution, passive Gold)
│   │   ├── clan.ts                   # Extended Clans (territories, 24h wars, alliances)
│   │   ├── downloader.ts             # yt-dlp wrapper (YouTube audio/video, TikTok, Instagram) — max 3 concurrent
│   │   ├── queue.ts                  # Generic queue with configurable concurrency (used by downloader.ts)
│   │   ├── rule34.ts                 # Rule34 JSON API client (images/videos by tag)
│   │   ├── circuitBreaker.ts             # Trips calls to a downed service (closed/open/half-open)
│   ├── cacheManager.ts           # Generic TTL cache, hit/miss stats, LFU eviction
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter (TypeScript)
│   │   ├── session.ts                # Rust Session API client
│   │   ├── sticker.ts                # Sticker creation
│   │   ├── platform.ts               # OS-specific paths/binaries (Windows/Linux/macOS/Termux)
│   │   ├── jid_utils.ts              # JID utilities
│   │   └── utils.ts                  # General helpers
│   ├── plugins/
│   │   ├── commands/                 # 190+ commands organized by category
│   │   ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│   │   ├── scheduler/                # Scheduled jobs (node-cron)
│   │   └── webhooks/                 # HTTP receiver
│   └── dashboard/                    # Web panel backend (Hono + WebSocket)
│       ├── server.ts                 # API + WS + web/dist static files
│       ├── auth.ts                   # WhatsApp-linked login (#login <code>)
│       └── routes/                   # /api/subbots, /api/groups, /api/admin
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
├── rust/                             # Rust — Session API v5.1.0
│   └── src/
│       ├── main.rs                   # Entry point (Axum) — graceful shutdown + gzip compression
│       ├── routes.rs                 # HTTP handlers + AppState
│       ├── bad_mac.rs                # Per-group Bad MAC tracker — sliding window log, escalating cooldown, SQLite persistence
│       ├── rate_limiter.rs           # Per-sender rate limiter (15 msgs / 10s)
│       ├── watchdog.rs               # Node.js heartbeat — death/recovery tracking
│       ├── snapshot.rs               # 10 rotating snapshots + read_best_valid()
│       ├── db.rs                     # SQLite delivery tracker + audit_log
│       ├── atomic.rs                 # Atomic file write (tmp → fsync → rename)
│       ├── nlp.rs                    # Rust-side NLP fast-path
│       ├── subbots.rs                # SubBot Manager — quotas, state, config hot-reload
│       ├── metrics.rs                # Atomic counters (writes/reads/bytes/snapshots)
│       ├── tasks.rs                  # Background tasks: auto-snapshot, periodic cleanup
│       ├── analytics.rs              # Aggregated dashboard (GET /analytics)
│       └── alerts.rs                 # Discord-compatible webhooks on watchdog events
├── web/                               # Web panel — React + Vite + Tailwind + TanStack
│   └── src/routes/                   # login, subbots, groups, admin (TanStack Router)
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

Since v8.4.0 this may be the **supervisor** (`src/supervisor.ts`) working as intended: it restarts the bot if it crashes (non-zero exit code) or if `GET /watchdog/status` shows the event loop hung without a heartbeat for a while. This is intentional — it lets the bot self-heal without manual intervention.

If the restart doesn't seem justified, check `HANG_TIMEOUT` in `python/terminal/monitor.py` (default 15 min) and the watchdog state via `GET /watchdog/status`. To rule out the supervisor, start without it using `npm run start:unsupervised`.

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

There's no artificial group limit in the code. The Rust rate limiter and per-group Bad MAC tracker use `HashMap`/`DashMap` structures designed for high cardinality, with automatic cleanup every 5,000 calls — the real ceiling depends on the machine's resources (RAM/CPU), not a fixed counter.

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

No. `core/persistence.ts` stores everything under `data/`: users in `users.aof` (a `strenor` append-only log where only the user that changed gets written) and `groupConfigs`/clans/inventory as JSON. It loads automatically at startup. To view or back up the user table in readable form: `npm run users:export`.

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
