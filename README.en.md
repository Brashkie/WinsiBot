<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=180&section=header&text=WinsiBot&fontSize=62&fontColor=ffffff&fontAlignY=38&desc=v8.10.0%20%E2%80%94%20Enterprise%20WhatsApp%20Bot&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-8.17.0-6C63FF?style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20Android-lightgrey?style=flat-square)](https://github.com/Brashkie/WinsiBot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Brashkie/WinsiBot/pulls)

<br/>

> High-performance WhatsApp bot with a three-layer multi-language architecture.<br/>
> No artificial group limit, built for thousands of messages per hour and multiple instances.<br/>
> v8.17.0 — **Speaks your language, 35 new commands, and lighter.** Spanish, English and Portuguese depending on each number's country; `#take`, sticker packs, each group's own welcome, health and companion care, `#actividad`, `#fantasmas`, `#sorteo` and more; from 31 dependencies to 14 and the core from 16 to 9 MB.<br/>

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
| 🟦 **Core** | TypeScript / Node.js | WhatsApp protocol, command dispatcher, RPG, economy, web panel |
| ⚙️ **Session + AI** | Rust / Axum | Atomic creds and snapshots, Bad MAC tracker, rate limiter, intent classification, personality and humour, reputation, style profiles, Ollama and cloud APIs, images |
| 🧮 **Native kernels** | C + Zig | Anime4K and the JPEG codec, compiled with Zig into the Session API binary. The fastest one is used, measured |

### What's new in v8.17.0

**Speaks your language, 35 new commands, and lighter.** The full detail, with every measurement, is in the [CHANGELOG](CHANGELOG.md).

| Area | Change |
|------|--------|
| **Speaks your language** | Spanish, English and Portuguese: pick it with `#idioma` (`#language`), or the bot works it out from your number's country (+55 → Portuguese) or uses the group's. Notices, the menu, help, the descriptions of all 242 commands and the most used ones, with aliases like `#ajuda` or `#trabalhar`. A message that isn't a command pays nothing for this |
| **For the group** | `#actividad` (who writes the most), `#fantasmas` (who doesn't, and removing them), `#paises`, `#nota` and `#reglas`, `#sorteo` (giveaways), `#cerrar`/`#abrir`, `#promote`, and each group's own welcome with `#setwelcome` and `#testwelcome` |
| **To play** | `#ship`, `#parejas`, team match lineups (`#lista`, `#mapa`), `#slap`. Real health: the raid boss hits back and you heal with `#curar` or `#hospital`; and your companion fights better if you care for it (`#pet comida`, `agua`, `pasear`) |
| **Stickers** | `#qc` (a message as a sticker), `#texto`, `#take` (your pack and author on someone else's sticker, without re-encoding it), `#setmeta`, `#toimg`, and named packs (`#newpack`, `#stickeradd`, `#getpack`) |
| **Profile** | `#setdesc`, `#setgenre`, `#cumples` (the group's upcoming birthdays), `#getpic` |
| **Lighter** | From **31 dependencies to 14**: what `openai`, `zod`, `moment-timezone`, `dotenv` and 13 others did is now done by Node 24 or a few lines of our own. The core starts in **~92 ms instead of 201** and takes **9 MB instead of 16**. Groups go to a binary log that only writes the one that changed |
| **Kernels** | Anime4K's push kernels in vectorized Zig, the Sobel fused, and the JPEG Huffman stage on every core (**27 → 11 ms**). `#upscale` from ~275 to ~130 ms not counting the JPEG, bit-for-bit identical, also tested on ARM |
| **Fixes** | Two copies of `sharp` crashed the process when `#tweet` and `#sticker` were used in the same session; command cooldowns could be dodged by switching aliases; the birthday greeting could go out twice |

**To update:** `npm install`. On the first start, `groups.json` migrates itself to `data/groups.aof`.

---

## Technical Stack

<div align="center">

| Area | Technology | Purpose |
|------|-----------|---------|
| Runtime | Node.js 20 LTS | WhatsApp event loop |
| Language | TypeScript 5.x | End-to-end strict typing |
| WhatsApp | Baileys 6.x | WA Web multi-device protocol |
| AI and NLP | Rust | Rule-based intents, personality and humour, reputation, style profiles |
| Language models | Ollama → GPT → Gemini → Claude | Cascade, falling back to local templates if none answer |
| Session Store | Rust + Axum + SQLite | Atomic creds, delivery tracking, outbox with dead-letter |
| Heavy compute | C + Zig (`native` feature) | Anime4K kernels with SIMD and an in-house JPEG codec: Zig for what vectorizes, C for what decides bit by bit |
| Crypto | `@brashkie/signalis-core` | Curve25519 / Ed25519 / HKDF / AES-GCM (Rust NAPI) |
| Persistence — users and groups | `strenor` (Rust NAPI) | `data/users.aof` and `data/groups.aof`, delta logs: only the user or group that changed gets written |
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
- Atomic `auth/` writes on the Node side too, with `creds.cbor.bak` and no silently created credentials
- Antiban in Rust: per-minute/hour/day caps, warm-up for new numbers, 463 and 429
- Infinite reconnect with exponential backoff (max 64s)
- Supervisor (`npm start`) that restarts the bot if the process dies or hangs without a heartbeat

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
- Multi-model: **Ollama or Cosxamix (local)** → GPT → Gemini → Claude, **all from Rust**
- **12 personality modes** per group, with 489 phrases of their own
- Learns each user's and the group's style, and mirrors it when replying
- If no model answers, falls back to local templates without repeating recent ones
- Per-user reputation: shapes the tone according to how they behave
- Rule-based intent classification in Rust, sub-millisecond
- Conversation history per user (12 messages) · 20 req/hour per JID

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
╔════════════════════════════════════════════════╗
║                WinsiBot v8.17.0                ║
╠═════════════════════╦══════════════════════════╣
║      TypeScript     ║           Rust           ║
║    Node.js :4001    ║                          ║
║                     ║                          ║
║  ┌───────────────┐  ║ ┌──────────────────────┐ ║
║  │  Baileys WS   │  ║ │   Session API :3001  │ ║
║  ├───────────────┤  ║ ├──────────────────────┤ ║
║  │    Handler    │  ║ │ ● creds atómicas     │ ║
║  │   (semáforo)  │  ║ │ ● snapshots ×10      │ ║
║  ├───────────────┤  ║ │ ● bad_mac tracker    │ ║
║  │   125+ Cmds   │  ║ │ ● rate_limiter+spam  │ ║
║  ├───────────────┤  ║ │ ● watchdog heartbeat │ ║
║  │    egress     │  ║ │ ● outbox + DLQ       │ ║
║  │ (rate limit)  │  ║ ├──────────────────────┤ ║
║  ├───────────────┤  ║ │ nlp      intenciones │ ║
║  │  persistence  │  ║ │ person.  12 modos    │ ║
║  │   (strenor)   │  ║ │ memory   reputación  │ ║
║  ├───────────────┤  ║ │ ai_chat  Ollama→GPT→ │ ║
║  │ authVerifier  │  ║ │          Gemini→     │ ║
║  │  Curve25519   │  ║ │          Claude      │ ║
║  └───────────────┘  ║ │ convers. perfiles    │ ║
║                     ║ │ imagefx  mosaico     │ ║
║                     ║ │ imagesrc búsqueda    │ ║
║                     ║ │ vision   anime+ONNX  │ ║
║                     ║ └──────────────────────┘ ║
╚═════════════════════╩══════════════════════════╝
           │                        │
           └───────────┬────────────┘
                       │
               WhatsApp Network
```

---

## Requirements

| Tool | Minimum | Required | Notes |
|------|---------|:--------:|-------|
| Node.js | 20.x LTS | ✅ | `node --version` |
| npm | 9.x | ✅ | bundled with Node |
| Rust + Cargo | 1.75+ | ❌ | only to build the Session API yourself: `npm install` fetches the binary for your platform |
| Ollama **or** [Cosxamix](https://github.com/Brashkie/Cosxamix) | latest | ❌ | local AI (recommended, 16 GB RAM+). Both speak the same dialect, so switching between them is three lines of `.env` — see `.env.example` |
| FFmpeg | 6.x | ❌ | media conversion |
| yt-dlp | recent | ❌ | downloads from YouTube and other sites. Executable in `bin/` or on `PATH`; on Termux, `pkg install yt-dlp` |

**Supported OS:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+ · macOS 12+ · Android (Termux)

> **Platform note:** on Termux/Android and headless Linux/macOS, Ollama is optional just like on Windows — the bot degrades gracefully without it. As of 8.12.0 a C compiler is no longer needed either: `npm run spam:build` and `npm run cython:build` are gone along with the C spam library and the Cython extensions, which were compiling code that already lived in Rust. The web panel (`web/`) uses the same Node.js already required — no new tool, just a separate `npm install && npm run build` (see Installation).
>
> **Two things to expect on weaker devices (Termux/Android, single-board ARM):**
>
> - The Node dependency that genuinely builds from source on Android is **`sharp`** (it bundles libvips): you need `clang`, `make` and `pkg-config` installed *before* running `npm install` (see the Termux section below). `cbor-x` used to be listed here and did not belong — its native part (`cbor-extract`) is an **optional** dependency, and if it fails to build it falls back to pure JavaScript with nothing breaking.
> - **Python left the project in 8.15.0.** It hadn't been on any message path since 8.12.0; now the two console tools are gone too, moved to Node. The only external thing that may pull in Python is **yt-dlp**, for the download commands: its releases ship a standalone executable for Windows, Linux and macOS that doesn't need it, and on Termux `pkg install yt-dlp` installs it.
> - The first Rust build (`npm run rust:build`) takes a few minutes (~3 min on a desktop; considerably longer on a phone) because it compiles the whole dependency tree with LTO. That's expected — don't close the terminal, just let it run (and keep the device from sleeping).

> **Ollama:** Pull a model before starting — `ollama pull llama3` or `ollama pull mistral`. The bot tries Ollama first and silently falls back to cloud APIs.

---

## Installation

```bash
# 1 — Clone the repository
git clone https://github.com/Brashkie/WinsiBot.git
cd WinsiBot

# 2 — Dependencies
npm install
#
# This also downloads the prebuilt Rust Session API binary for your platform
# and verifies its SHA-256. If there is no binary for yours, it says so in one
# line and you can build it yourself with `npm run rust:build`.

# 3 — Configuration
cp .env.example .env
#      ...then set OWNER_JID to your number

# 4 — Web panel (optional — the bot starts fine without it)
npm run web:build

# 5 — Start
npm start
```

> **No Python needed.** Since 8.15.0 there is nothing of Python left in the
> project: the maintenance CLI (`npm run manage`) is in Node and the
> supervisor (`npm start`) replaces the old `monitor.py`. If you have a
> `python/` folder from an earlier version, it can be deleted entirely.
---

### Installing on Termux (Android)

> Install Termux from **F-Droid**, not the Play Store — the Play Store build is discontinued and outdated.

```bash
# 0 — System packages (once)
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git tmux

# Optional — only if the bot will read/write the phone's shared storage
# (outside its own data folder):
termux-setup-storage
```

Then the same 5 steps from [Installation](#installation), unchanged.

**`rust`, `python`, `clang`, `make` and `pkg-config` are no longer needed.** Up to 8.12.0 you had to build the Session API on the phone — several minutes — and create a Python virtualenv. Now `npm install` fetches the prebuilt binary for `aarch64-linux-android`, which is Termux's own target: Android uses the **Bionic** libc, not glibc, so an ordinary Linux ARM binary would download fine and fail to start. The download commands need yt-dlp: `pkg install yt-dlp`.

The image commands (`#toanime`, `#removebg`, `#upscale`) **work on the phone**, because ONNX Runtime ships a build for that target with **NNAPI**, Android's hardware acceleration.

**The only thing that may build from source** is `sharp` (it bundles libvips), which has no Android binary. If `npm install` fails there, run `pkg install -y clang make pkg-config` and retry.

**Keeping the bot running in the background:**

- `termux-wake-lock` before starting the bot stops Android from killing the process when the screen turns off (`termux-wake-unlock` to release it).
- Run the bot inside a `tmux` session (`tmux new -s winsibot`, then `npm run start`) so the process survives closing the Termux app — reattach with `tmux attach -t winsibot`.
- For autostart on reboot, install the **Termux:Boot** add-on (F-Droid) and drop a script in `~/.termux/boot/`.

> **RAM:** Ollama (local AI) usually isn't viable on an ordinary phone — use the cloud APIs (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`), or let the bot answer with its local template engine, which needs no model at all.
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

# ─── Other ────────────────────────────────────────────────────────────────────
API_SECRET_KEY=                          # openssl rand -hex 32
# RAID_CADA_H=6                          # how many hours between world boss spawns (#raid)
# RAID_DURA_MIN=60                       # minutes before it escapes
# TTS_MOTOR=auto                         # #tts: piper · espeak · sapi · say (auto: the first one available)
# PIPER_MODEL=                           # path to a Piper .onnx voice, the best quality

# ─── Spotify (optional) ───────────────────────────────────────────────────────
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

### `data/session-api/.env` — Session API *(optional)*

The Session API reads the root `.env` —`SESSION_API_URL` and `SESSION_API_KEY`
are the same for the bot and for it—, so normally nothing else is needed. The
bot starts it with `data/session-api/` as its working directory, and its data
lives there: `data/messages.db`, `data/ai_conversations.db`, `sessions/`,
`antiban.json` and `logs/`. A `.env` in that folder, if present, is read first;
use it for API-only settings:

```env
RUST_LOG=winsibot_session_api=info
# SESSIONS_DIR, DB_PATH, CONV_DB_PATH and MODELS_DIR: relative to data/session-api/
```

> Up to 8.14.0 all of this lived in `rust/`, mixed with the code. On upgrade,
> the bot moves `rust/data`, `rust/sessions`, `rust/logs` and `rust/.env` to
> `data/session-api/` on first start, without overwriting anything.

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
brings up its own dependency —the Session API—
if they aren't already running, and each one restarts itself if it crashes —
each with its own status indicator, and a single Ctrl+C to shut everything down together.

### By component *(for development)*

```bash
npm run rust:start      # Rust Session API only, standalone
npm run dev             # Node.js only, no build step — fast iteration / QR scan
```

<details>
<summary>All npm scripts</summary>

| Script | Description |
|--------|-------------|
| `start` | Build and start the bot **via the supervisor** — restarts it if it crashes or hangs, and brings up the Session API on its own, with its own auto-restart |
| `start:unsupervised` | Same as `start` but without the supervisor layer — runs `dist/index.js` directly |
| `dev` | Node.js direct — development / QR scan |
| `build` | Compile TypeScript → `dist/`. **Wipes `dist/` first**: `tsc` never cleans, and the command loader registers every `.js` it finds there, so a file from an earlier release would keep running |
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
| `groups:export` / `groups:import` / `groups:stats` | The same for the group settings (`data/groups.aof`) |
| `typecheck` | Type-check without compiling |
| `lint` / `lint:fix` | Biome — lints `src/`/`scripts/` (check-only / auto-fix what's safe) |
| `format` / `format:fix` | Biome — formats `src/`/`scripts/` (show diff only / write) |
| `check` / `check:fix` | Biome — lint + format + import sorting in one pass |
| `rust:lint` | `cargo clippy` on the Rust Session API |
| `native:build` | Builds the Session API with the C and Zig kernels (`--features native`). Needs [Zig](https://ziglang.org) 0.14 |
| `native:test` | Tests comparing the C and Zig kernels with the Rust ones, bit for bit |
| `native:bench` | The Anime4K kernels in Rust, C and Zig, and PNG against both JPEGs, measured with Criterion |
| `cluster:test` | Tests for the in-house storage engine, including the ones that cut writes midway |
| `cluster:compare` | The in-house engine against SQLite with the bot's workloads (see `CLUSTER_CACHE_MB` and `SQLITE_PRAGMAS` in `crates/cluster/examples/compare.rs`) |
| `bench:api` | Starts the Session API in a temporary folder and measures the CPU Rust spends on each per-message endpoint |
| `bench:hops` | What a trip from Node to the Session API costs —latency and Node CPU—, with the API running |
| `mem:profile` | How much RAM each piece adds at startup —Baileys, the core, the commands— and what lazy loading saves. `-- --deps` measures each dependency on its own |
| `ai:bench` | Measures what a cold Ollama model costs versus a warm one, and checks whether the endpoint the bot uses honours `keep_alive`. Needs Ollama running |
| `rust:test` | Rust unit tests (`cargo test`) |
| `rust:bench` | Criterion benchmarks on the hot path (HTML reports in `target/criterion/`) |
| `lint:all` | Runs `lint` + `rust:lint` in one go |
| `test` | Vitest |

</details>

---

## Commands

The bot has **200+ commands** across **16 categories**.

→ **[📖 Full command reference](docs/commands.en.md)**

<details>
<summary>Category overview</summary>

| Category | Notable commands | Description |
|----------|-----------------|-------------|
| 🤖 AI | `!gpt` `!claude` `!imagine` `!translate` | Multi-model chat, images, translations |
| 💰 RPG | `!work` `!daily` `!perfil` `!setdesc` `!setgenre` `!salud` `!hospital` `!rw` `!clan` `!prestige` `!harem` `!forjar` `!subasta` `!leveltop` | Economy, health, gacha, levels (daily streak), clans, prestige, forge, auctions |
| 🎮 Games | `!arena` `!raid` `!mazmorra` `!bj` `!poker` `!quiz` `!adivinar` `!pet` | PvP Arena (and vs the CPU), world boss, daily dungeon, blackjack, Casino Hold'em, Coding Quiz, Draw & Guess, dragons |
| 🎁 Social | `!regalo` | Gift system, mailbox, wishlist, trades |
| 🛡️ Admin | `!ban` `!kick` `!promote` `!cerrar` `!fantasmas` `!antilink` `!warn` `!setwelcome` `!testwelcome` | Group moderation, promote, close the group, inactive members, custom welcome |
| 👑 Owner | `!exec` `!broadcast` `!premium` `!boost` | Full bot control |
| ⬇️ Downloads | `!yt` `!ytmp4` `!tiktok` `!ttsearch` `!ig` `!spotify` `!apk` | Media downloaders + carousel search |
| 🎨 Stickers | `!sticker` `!take` `!setmeta` `!qc` `!texto` `!toimg` `!newpack` `!getpack` `!stickerpack` | Create stickers, your pack and author, messages and text as stickers, back to image, your packs |
| 🎮 Fun | `!asesino` `!historia` `!ship` `!parejas` `!lista` `!meme` `!sega` `!giphy` `!top` | Killer in the chat (Mafia-style), AI broken telephone, compatibility, match lineups, entertainment |
| 💞 Roleplay | `!hug` `!kiss` `!pat` `!slap` `!kill` `!punch` `!laugh` `!sad` `!sleep` | Interactive anime GIFs |
| 🎵 Music | `!play` `!lyrics` `!spotify` | Audio and lyrics |
| 🌐 Media | `!anime` `!removebg` `!wimage` | Anime images, background removal, characters |
| 🔧 Util | `!getpic` `!suggest` `!resumen` `!encuesta` `!recordar` `!sorteo` `!nota` `!actividad` `!paises` `!tts` `!clima` `!imagen` | What did I miss?, polls, reminders, giveaways, group notes, activity, countries, offline text-to-speech, weather, images |
| ℹ️ Info | `!ping` `!creator` `!infobot` `!menu` `!idioma` | Bot information, language (es/en/pt) |
| 🤝 Jadibot | `!jadibot` `!stopbot` | Linked sub-bots |
| 🔞 NSFW | `!porngif` `!rule34` `!sexyimg` `!stickerporn` | Groups with NSFW enabled only |

</details>

---

## Maintenance CLI

```bash
npm run manage
```

Interactive menu, or a direct command with `npm run manage -- <command>`. It's in Node since 8.15.0 —it used to be Python— and reads the backups the previous version left.

| Option | Command | When to use |
|:------:|---------|-------------|
| 1 | `manage:status` | Check Rust / Webhook / Web panel status |
| 2 | `manage:diagnose` | Analyze session, Signal files, Rust, logs |
| 3 | `manage:repair` | broken creds → Session API copy → last valid backup → QR only if nothing is left. **Does not delete Signal sessions**: that's `reset-signal` |
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

```js
import { createHmac } from 'crypto'

const sig = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
const headers = { 'x-webhook-signature': `sha256=${sig}` }
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

> If `delivery_pct` drops below **80%**, run `npm run manage:diagnose`; if it points at Signal sessions, `npm run manage:reset-signal`.

---

## Session API Reference

<details>
<summary>Full route list</summary>

| Method | Path | Description |
|--------|------|-------------|
| | **Session** | |
| `POST` | `/write` | Write creds (base64) with an atomic rename |
| `GET` | `/read` | Read current creds |
| `POST` | `/snapshot` | Force a snapshot rotation |
| `POST` | `/recover` | Restore from the best valid snapshot |
| `GET` | `/healthy` | Session health + corruption detection |
| `GET` | `/sessions` | List active session IDs |
| `POST` | `/sessions/signal/clear` | Delete Signal files (Bad MAC fix) |
| `GET` | `/sessions/backup` | Best valid creds for QR-free recovery |
| `POST` | `/badmac/report` | Report a group Bad MAC (staged cooldown) |
| | **Flow control** | |
| `POST` | `/antiban/permit` | Turn for one account's send: wait, or rejection with reason |
| `POST` | `/antiban/report` | Error in WhatsApp's *ack* (429, 463) — cools the account or the contact |
| `POST` | `/antiban/paired` | Freshly linked number — starts its warm-up |
| `GET` | `/antiban/status` | Sends in the last minute, hour and 24 h, and what limits now |
| `POST` | `/rate/check` | Whether a sender is within the rate limit |
| `POST` | `/spam/check` | Frequency + repeated text + progressive blocking |
| `POST` | `/watchdog/ping` | Heartbeat from Node.js |
| `GET` | `/watchdog/status` | Alive/dead + time since last ping |
| | **AI** | |
| `POST` | `/nlp/fast` | Rule-based intent classification (sub-ms) |
| `POST` | `/ai/learn` | Store an AI exchange |
| `POST` | `/ai/observe` | Store a plain group message (feeds the profile) |
| `GET` | `/ai/context/:sender` | Recent history for building the prompt |
| `GET` · `DELETE` | `/ai/profile/:jid` | A user's style profile (GET) · wipe everything (DELETE) |
| `GET` | `/ai/group-style/:gjid` | A group's style profile |
| `GET` | `/ai/group/activity/:gjid` | How many messages each member sent in `days` days, and since when there's a record: used by `#actividad` and `#fantasmas` |
| `GET` | `/ai/group/recent/:gjid` | A group's latest messages (`limit`, `hours`), who spoke and about what: used by `#resumen` |
| `POST` | `/ai/story` | Broken telephone: a twist from ONE fragment (`modo: seguir`) or a title (`modo: titulo`); `text: null` if no AI answered |
| `POST` | `/ai/summarize` | Summarize a conversation with AI, without personality; `text: null` if no AI answered |
| `GET` | `/ai/corpus/stats` | Size of the learning corpus |
| `POST` | `/ai/chat/respond` | AI reply: Ollama → GPT → Gemini → Claude → template |
| `POST` | `/ai/chat/imitate` | Reply imitating a user's style |
| `POST` | `/ai/personality/respond` | Local template reply (no model) |
| `GET` · `POST` | `/ai/personality/mode` | Active mode and mode list (GET) · change it (POST) |
| `POST` | `/ai/personality/reset` | Back to the default mode |
| `GET` | `/ai/memory/:jid` | A user's reputation and behaviour |
| `POST` | `/ai/memory/:jid/update` | Record a message against their reputation |
| `GET` | `/ai/memory/toxic` | Users with the worst reputation |
| | **Images** | |
| `POST` | `/imagefx/lego` | LEGO-style mosaic |
| `POST` | `/search/image` | Search for and download an image |
| `POST` | `/search/images` | Search and return only the URLs |
| `POST` | `/vision/removebg` | Remove the background (isnetis on ONNX) |
| `POST` | `/vision/toanime` | Convert to anime style (AnimeGANv2 on ONNX) |
| `POST` | `/vision/upscale` | Upscale x2 or x4 with Anime4K (no model) |
| | **Delivery** | |
| `POST` | `/messages/track` | Track outgoing message IDs |
| `POST` | `/messages/ack` | Batch-update delivery status |
| `GET` | `/messages/pending` | Messages without delivery confirmation |
| `POST` | `/outbox/enqueue` | Queue a send BEFORE dispatching it, with its payload |
| `GET` | `/outbox/unsent` | What stayed queued without going out — to replay at startup |
| `POST` | `/outbox/sent` | Mark as genuinely sent (frees the payload) |
| `POST` | `/outbox/retry` | Add a retry (dead-letter after 3) |
| | **Sub-bots** | |
| `POST` | `/subbots/register` | Register a new sub-bot |
| `GET` | `/subbots` | List sub-bots |
| `GET` · `DELETE` | `/subbots/:id` | A sub-bot's status |
| `PUT` | `/subbots/:id/state` | Change its state |
| `POST` | `/subbots/:id/heartbeat` | A sub-bot's heartbeat |
| `POST` | `/subbots/:id/messages` | Add messages to its quota |
| `POST` | `/subbots/:id/errors` | Record an error |
| `GET` | `/subbots/can-create` | Whether there is room for another |
| `GET` | `/subbots/config` | Configuration, with hot reload |
| `GET` | `/subbots/stats` | Sub-bot totals |
| `POST` | `/subbots/cleanup` | Clean up the ones left hanging |
| | **Status** | |
| `GET` | `/health` | General status + active sessions + platform |
| `GET` | `/health/live` | Liveness (Docker / K8s) |
| `GET` | `/health/ready` | Readiness |
| `GET` | `/metrics` | Atomic counters (writes, reads, bytes) |
| `GET` | `/analytics` | Aggregated dashboard |
| `POST` | `/stats/bump` | Add to the bot's counters |
| `GET` | `/stats/counters` | Accumulated counters |
| `GET` | `/stats/top-commands` | Most-used commands |

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
│   ├── config.ts                     # Environment variables, validated by hand
│   ├── index.ts                      # Entry point
│   ├── supervisor.ts                 # Restarts the bot if it crashes or hangs (external watchdog)
│   ├── types/
│   │   └── index.d.ts                # Global types (Command, UserData, etc.)
│   ├── core/
│   │   ├── socket.ts                 # WhatsApp WebSocket connection
│   │   ├── handler.ts                # Message dispatcher → commands (semaphore with bounded wait)
│   │   ├── dedup.ts                  # Drops re-delivered duplicates (per instance, survives restarts)
│   │   ├── loadShedding.ts           # Degrades on event loop lag — never sheds moderation or admin
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
│   │   ├── kv.ts                      # strenor — KV con TTL real (sesiones del panel web)
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
│   │   ├── circuitBreaker.ts          # Trips calls to a downed service (closed/open/half-open)
│   │   ├── cacheManager.ts           # Generic TTL cache, hit/miss stats, LFU eviction
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter (TypeScript)
│   │   ├── session.ts                # Rust Session API client
│   │   ├── sticker.ts                # Sticker creation
│   │   ├── platform.ts               # OS-specific paths/binaries (Windows/Linux/macOS/Termux)
│   │   ├── jid_utils.ts              # JID utilities
│   │   └── utils.ts                  # General helpers
│   ├── plugins/
│   │   ├── commands/                 # 200+ commands organized by category
│   │   ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│   │   ├── scheduler/                # Scheduled jobs (own cron parser)
│   │   └── webhooks/                 # HTTP receiver
│   └── dashboard/                    # Web panel backend (Hono + WebSocket)
│       ├── server.ts                 # API + WS + web/dist static files
│       ├── auth.ts                   # WhatsApp-linked login (#login <code>)
│       └── routes/                   # /api/subbots, /api/groups, /api/admin
├── crates/session-api/               # Session API v5.10.0 (Rust) — workspace in the root Cargo.toml
│   ├── native/                       # C and Zig kernels, compiled with Zig into the binary
│   │   ├── lib.zig                   # Root: pulls in the other .zig files
│   │   ├── anime4k.c                 # push_color and push_gradient (1.35x over Rust)
│   │   ├── anime4k.zig               # Sobel with @Vector(8, f32) (3.7x over Rust)
│   │   ├── jpeg.zig                  # Colour, 4:2:0 and DCT with vectors
│   │   └── jpeg.c                    # Tables, headers and Huffman (3.35x over Rust's JPEG)
│   ├── build.rs                      # Calls Zig with the `native` feature
│   ├── assets/                       # Data embedded into the binary with include_str!
│   │   ├── personality.json          # 489 phrases across 12 modes + 121 humour phrases
│   │   └── commands.json             # 28-command catalogue for AI context
│   └── src/
│       ├── main.rs                   # Entry point (Axum) — graceful shutdown + gzip compression
│       ├── routes.rs                 # HTTP handlers + AppState
│       ├── bad_mac.rs                # Per-group Bad MAC tracker — sliding window log, escalating cooldown, SQLite persistence
│       ├── rate_limiter.rs           # Per-sender rate limiter (15 msgs / 10s)
│       ├── watchdog.rs               # Node.js heartbeat — death/recovery tracking
│       ├── snapshot.rs               # 10 rotating snapshots + read_best_valid()
│       ├── db.rs                     # SQLite delivery tracker + audit_log
│       ├── atomic.rs                 # Atomic file write (tmp → fsync → rename)
│       ├── nlp.rs                    # Rule-based intent classifier — insults, NSFW, spam, commands (sub-ms)
│       ├── imagefx.rs                # LEGO mosaic (`image` crate)
│       ├── imagesearch.rs            # Image search and download (Bing)
│       ├── personality.rs            # Modes, response templates and humour (embedded data)
│       ├── user_memory.rs            # Per-user reputation and behaviour
│       ├── ai_chat.rs                # Real AI: Ollama → GPT → Gemini → Claude, falling back to templates
│       ├── rng.rs                    # Cheap randomness (xorshift64*) for phrases and shuffles
│       ├── conversations.rs          # AI conversations + user and group style profiles (SQLite)
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
├── crates/session-api/.env.example   # Session API template
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

If the restart doesn't seem justified, check the watchdog state via `GET /watchdog/status`: the supervisor restarts when the Session API reports the bot stopped sending heartbeats. To rule out the supervisor, start without it using `npm run start:unsupervised`.

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
The bot checks Ollama availability at every request and falls back to GPT → Gemini → Claude. If none answer, it uses its **local template engine** — 489 phrases across 12 modes, honouring the group's mode and avoiding recent replies — so it always says something. All of that runs in Rust as of 8.11.0: no Python needed.

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

The Session API keeps a copy of `creds` on every change and the last **10 snapshots**, and `creds.cbor.bak` keeps the previous version alongside. A full backup of `auth/` is done by hand with `npm run manage:backup`, which keeps the 5 most recent.

</details>

<details>
<summary><b>Does it work with WhatsApp Business?</b></summary>

Yes. Delivery tracking also works with Business. However, features like catalogs or buttons from the official Business API are not available.

</details>

<details>
<summary><b>Is user data lost on restart?</b></summary>

No. `core/persistence.ts` stores everything under `data/`: users in `users.aof` and groups in `groups.aof` (`strenor` append-only logs where only what changed gets written), and clans/inventory as JSON. It loads automatically at startup. To view or back up the user table in readable form: `npm run users:export`.

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
