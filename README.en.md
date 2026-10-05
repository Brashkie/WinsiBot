<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=180&section=header&text=WinsiBot&fontSize=62&fontColor=ffffff&fontAlignY=38&desc=v8.10.0%20%E2%80%94%20Enterprise%20WhatsApp%20Bot&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-8.12.0-6C63FF?style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20Android-lightgrey?style=flat-square)](https://github.com/Brashkie/WinsiBot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Brashkie/WinsiBot/pulls)

<br/>

> High-performance WhatsApp bot with a three-layer multi-language architecture.<br/>
> No artificial group limit, built for thousands of messages per hour and multiple instances.<br/>
> v8.12.0 — **The bot stops calling Python, and what's left of it compiles.** The three image commands now live in Rust: `#toanime` goes from **3.7 GB of torch to an 8 MB ONNX model**, `#removebg` uses the same model via the `ort` crate, and `#upscale` is **Anime4K ported** — no model to download and no temp files. The entire Python API went with them, having been reduced to a single endpoint that said it was alive. Installing is **`npm install` and nothing else**: the Session API binary is fetched prebuilt for your platform — 5 targets, Termux included — with its SHA-256 verified. **Nine real bugs** surfaced along the way, among them that `npm run build` **never cleaned `dist/`**, so the bot served **35 commands from source-less code** — two of them deleted seven releases earlier — and that the **Session API could not start** if you followed `.env.example`, with the panic invisible because it is launched with `stdio: 'ignore'`.<br/>

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
| 🐍 **Optional** | Python | Only the console watchdog and the maintenance CLI, which you open by hand. **The bot runs without it and nothing starts it** |

### What's new in v8.12.0

**The bot no longer calls Python at all, and what's left of it compiles.** 8.11.0 got it down to 16 files but left three commands that needed an interpreter, plus a whole API to serve them. All three are in Rust, the API is gone, and Python is down to 9 files that are console tooling only.

| Area | Change |
|------|--------|
| **The three image commands moved to Rust, and two never needed torch** | `#toanime` goes from **3.7 GB of torch to an 8 MB ONNX model**; `#removebg` uses the same `isnetis.onnx` as before via the `ort` crate; and `#upscale` is **Anime4K ported** — not a network but a five-step algorithm, so it downloads no model and takes **175 ms** against the seconds it cost while writing temp files. Migrating them revealed that **two of the three never used torch**: `dghs-imgutils` already ran on ONNX Runtime |
| **`npm install` and done: prebuilt Rust binaries** | Building the Session API took **~4 minutes** and required Rust installed. Now `postinstall` fetches the binary for your platform from the releases and verifies its SHA-256, with a workflow building **5 targets** — Termux included, which has its own because Android uses Bionic rather than glibc. If no binary exists, it says so in one line and building from source still works |
| **Python is off every message path** | The last things to go were the three image commands, and with them the entire Python API: it had been reduced to **a single endpoint**, `GET /health`, polled only by `monitor.py` and `manage.py` to display "FastAPI: online". A service whose only job was to answer that it was alive |
| **The console tools compile too** | `npm run tools:build` runs `monitor` and `manage` through Nuitka and produces executables that work **without Python installed**, `rich` included — which is pure Python, 77 modules and zero native binaries, so there is no `.so` of it to download: you have to compile it. Measured: 16.0 and 16.1 MB, ~3 min each with a warm C cache |
| **Serious fix: the bot was running deleted code** | `tsc` compiles but never cleans, and `loadCommands()` registers **every** `.js` it finds under `dist/`. There were 38 orphan files from earlier versions and **35 command keys were being served by source-less code** — among them `#registro` and `#unreg`, deliberately removed **seven releases earlier** and still working, and `#image`, which served the old version and **masked the migration to Rust**. `npm run build` now wipes `dist/` first |
| **Serious fix: the Session API would not start if you followed `.env.example`** | The Rust server read `API_KEY` and `PORT`; the client and `.env.example` use `SESSION_API_KEY` and `SESSION_API_URL`, and the first two were **documented nowhere**. Anyone cloning the repo got no API and no explanation: `index.ts` launches it with `stdio: 'ignore'`, so the panic never reached a log — just a retry every 3 seconds. The key now has **one name**, and the port is derived from `SESSION_API_URL`, so client and server cannot end up on different ports |
| **Fix: the compiled binaries could not find the project** | Under Nuitka `--onefile`, `__file__` points into the temp directory the binary unpacks itself into on every run, so the 8 places that computed the project root returned a path that is deleted on exit: `manage.exe` reported *"auth dir missing"* with **8,422 files** in `auth/`. Neither `sys.frozen` nor `sys.executable` helps there; `__compiled__.containing_dir` does |
| **Fix: `npm run manage` crashed on any Spanish Windows** | With a legacy codepage — cp1252, the default — `rich` falls back to its legacy renderer and throws `UnicodeEncodeError` on the first of its symbols: it **died before printing anything**. Not a compilation artifact; the interpreted version did the same. Both tools now force UTF-8 before creating the `Console` |
| **Fix: the Health Monitor could silently never start** | It shared a `try` with the AI Brain and started **after** that import, so any failure in the second took the first down with it, unnoticed. Seen live running the compiled binary, where `numpy` is excluded on purpose |
| **Fix: the postinstall broke `npm install` with a 404** | `process.exit(0)` with an HTTP request still in flight made libuv abort with **code 127**, which npm reads as a failed postinstall and aborts the whole install — on exactly the most common path while no release is published |
| **Fix: `chaos` and `ruff` were lying** | `chaos` reported *"invalid or missing API key"* on 8 checks when the key was fine and what was missing was the script reading `.env`. And `ruff` and `py:deps` excluded the literal name `venv`, so any `venv.roto` or `venv_tools` alongside sent them walking site-packages: **26,165 warnings** about code that isn't this project's. An environment is now recognised by its `pyvenv.cfg` |
| **140 Rust unit tests and two benchmarks** | 19 more this release. What depends on an ONNX model isn't asserted, but everything around it is: the padded framing, the NCHW tensor conversion, and **all of Anime4K**, including a test that it sharpens edges more than a plain bicubic — which is exactly what sets it apart from a resize |
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
| Optional | Python 3.11 | Console watchdog and maintenance CLI — the bot runs without it |
| Session Store | Rust + Axum + SQLite | Atomic creds, delivery tracking, outbox with dead-letter |
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
- Multi-model: **Ollama (local)** → GPT → Gemini → Claude, **all from Rust**
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
╔═══════════════════════════════════════════════════════════════════════╗
║                           WinsiBot v8.12.0                            ║
╠═════════════════════╦══════════════════════════╦══════════════════════╣
║      TypeScript     ║           Rust           ║        Python        ║
║    Node.js :4001    ║                          ║  nothing starts it   ║
║                     ║                          ║                      ║
║  ┌───────────────┐  ║ ┌──────────────────────┐ ║ ┌──────────────────┐ ║
║  │  Baileys WS   │  ║ │   Session API :3001  │ ║ │   (OPCIONAL)     │ ║
║  ├───────────────┤  ║ ├──────────────────────┤ ║ │  solo consola    │ ║
║  │    Handler    │  ║ │ ● creds atómicas     │ ║ ├──────────────────┤ ║
║  │   (semáforo)  │  ║ │ ● snapshots ×10      │ ║ │  monitor         │ ║
║  ├───────────────┤  ║ │ ● bad_mac tracker    │ ║ │  watchdog con    │ ║
║  │   125+ Cmds   │  ║ │ ● rate_limiter+spam  │ ║ │  auto-restart    │ ║
║  ├───────────────┤  ║ │ ● watchdog heartbeat │ ║ ├──────────────────┤ ║
║  │    egress     │  ║ │ ● outbox + DLQ       │ ║ │  manage          │ ║
║  │ (rate limit)  │  ║ ├──────────────────────┤ ║ │  backup/reparar  │ ║
║  ├───────────────┤  ║ │ nlp      intenciones │ ║ └──────────────────┘ ║
║  │  persistence  │  ║ │ person.  12 modos    │ ║                      ║
║  │   (strenor)   │  ║ │ memory   reputación  │ ║                      ║
║  ├───────────────┤  ║ │ ai_chat  Ollama→GPT→ │ ║                      ║
║  │ authVerifier  │  ║ │          Gemini→     │ ║                      ║
║  │  Curve25519   │  ║ │          Claude      │ ║                      ║
║  └───────────────┘  ║ │ convers. perfiles    │ ║                      ║
║                     ║ │ imagefx  mosaico     │ ║                      ║
║                     ║ │ imagesrc búsqueda    │ ║                      ║
║                     ║ │ vision   anime+ONNX  │ ║                      ║
║                     ║ └──────────────────────┘ ║                      ║
╚═════════════════════╩══════════════════════════╩══════════════════════╝
           │                        │                        │           
           └────────────────────────┴────────────────────────┘           
                                    │
                            WhatsApp Network
```

---

## Requirements

| Tool | Minimum | Required | Notes |
|------|---------|:--------:|-------|
| Node.js | 20.x LTS | ✅ | `node --version` |
| npm | 9.x | ✅ | bundled with Node |
| Python | 3.11+ | ❌ | **No longer needed** — as of 8.12.0 not even the image commands use it. Only for `npm run monitor` and `npm run manage`, which you open by hand (and which can also be compiled) |
| Rust + Cargo | 1.75+ | ✅ | to compile Session API |
| Ollama | latest | ❌ | local AI (recommended, 16 GB RAM+) |
| FFmpeg | 6.x | ❌ | media conversion |

**Supported OS:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+ · macOS 12+ · Android (Termux)

> **Platform note:** on Termux/Android and headless Linux/macOS, Ollama is optional just like on Windows — the bot degrades gracefully without it. As of 8.12.0 a C compiler is no longer needed either: `npm run spam:build` and `npm run cython:build` are gone along with the C spam library and the Cython extensions, which were compiling code that already lived in Rust. The web panel (`web/`) uses the same Node.js already required — no new tool, just a separate `npm install && npm run build` (see Installation).
>
> **Two things to expect on weaker devices (Termux/Android, single-board ARM):**
>
> - The Node dependency that genuinely builds from source on Android is **`sharp`** (it bundles libvips): you need `clang`, `make` and `pkg-config` installed *before* running `npm install` (see the Termux section below). `cbor-x` used to be listed here and did not belong — its native part (`cbor-extract`) is an **optional** dependency, and if it fails to build it falls back to pure JavaScript with nothing breaking.
> - **Python is no longer needed to run the bot.** Nothing of it remains on any message path and nothing starts it; only `npm run monitor` and `npm run manage` use it, and you open those by hand. 8.11.0 dropped `pyarrow`, `duckdb`, `spacy`, `ddgs`, `requests` and `transformers`, and 8.12.0 dropped the rest: `torch`, `pillow`, `pyanime4k`, `dghs-imgutils`, `onnxruntime` and `opencv` — over 4 GB of dependencies between the two.
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

> **Python is no longer needed.** Up to 8.12.0 you had to create a virtualenv
> and install dependencies; since then nothing of Python remains on any message
> path and the bot never starts it. It is only used for two tools you open by
> hand:
>
> ```bash
> cd python && python -m venv venv
> venv\Scripts\activate          # Windows
> # source venv/bin/activate      # Linux / macOS / Termux
> pip install -r requirements.txt
> ```
>
> That enables `npm run monitor` (interactive watchdog) and `npm run manage`
> (maintenance CLI). If you will not use them, skip the step. For
> `npm run py:lint` and `npm run tools:build` use `requirements-dev.txt`,
> which includes the other one.
>
> **If you upgrade Python, the virtualenv has to be recreated.** A venv
> stores the absolute path of the interpreter that created it, and its
> compiled extensions carry the version in their filename (`cp311`), so it
> cannot be repointed at another one: `npm run py:lint`, `py:deps`,
> `tools:build`, `monitor` and `manage` all fail with `No Python at '...'`.
> Delete `python/venv` and repeat the commands above.
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

**`rust`, `python`, `clang`, `make` and `pkg-config` are no longer needed.** Up to 8.12.0 you had to build the Session API on the phone — several minutes — and create a Python virtualenv. Now `npm install` fetches the prebuilt binary for `aarch64-linux-android`, which is Termux's own target: Android uses the **Bionic** libc, not glibc, so an ordinary Linux ARM binary would download fine and fail to start.

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
brings up its own dependencies (the Rust Session API and, **if installed**,
the Python API)
if they aren't already running, and each one restarts itself if it crashes —
each with its own status indicator, and a single Ctrl+C to shut everything down together.

### By component *(for development)*

```bash
npm run rust:start      # Rust Session API only, standalone
npm run dev             # Node.js only, no build step — fast iteration / QR scan
npm run monitor         # Console watchdog — optional, needs Python
```

<details>
<summary>All npm scripts</summary>

| Script | Description |
|--------|-------------|
| `start` | Build and start the bot **via the supervisor** — restarts it if it crashes or hangs, and brings up Rust (and Python if installed) on its own (each with its own auto-restart) |
| `start:unsupervised` | Same as `start` but without the supervisor layer — runs `dist/index.js` directly |
| `monitor` | Console watchdog — optional, needs Python (`python/requirements.txt`) |
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
| `typecheck` | Type-check without compiling |
| `lint` / `lint:fix` | Biome — lints `src/`/`scripts/` (check-only / auto-fix what's safe) |
| `format` / `format:fix` | Biome — formats `src/`/`scripts/` (show diff only / write) |
| `check` / `check:fix` | Biome — lint + format + import sorting in one pass |
| `rust:lint` | `cargo clippy` on the Rust Session API |
| `py:lint` / `py:lint:fix` | Ruff — lints `python/` (needs `pip install -r python/requirements-dev.txt`) |
| `py:deps` | Checks that everything `python/` imports is declared in the requirements, both ways. Exits non-zero if anything is missing |
| `tools:build` | Compiles `monitor` and `manage` into native executables with Nuitka — they run without Python installed. Does not cross-compile: the binary is for the machine that built it |
| `rust:test` | Rust unit tests (`cargo test`) |
| `rust:bench` | Criterion benchmarks on the hot path (HTML reports in `rust/target/criterion/`) |
| `py:format` | Ruff — formats `python/` |
| `lint:all` | Runs `lint` + `rust:lint` + `py:lint` + `py:deps` in one go |
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
| 1 | `manage:status` | Check Rust / Webhook / Web panel status |
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
│   ├── config.ts                     # Environment variables + Zod validation
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
│   │   ├── commands/                 # 190+ commands organized by category
│   │   ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│   │   ├── scheduler/                # Scheduled jobs (node-cron)
│   │   └── webhooks/                 # HTTP receiver
│   └── dashboard/                    # Web panel backend (Hono + WebSocket)
│       ├── server.ts                 # API + WS + web/dist static files
│       ├── auth.ts                   # WhatsApp-linked login (#login <code>)
│       └── routes/                   # /api/subbots, /api/groups, /api/admin
├── python/                           # Python — OPTIONAL, console tooling only
│   ├── requirements.txt              # What `npm run monitor` and `manage` need
│   ├── paths.py                      # The project root, interpreted or compiled
│   ├── ai/                           # Health, breakages, anomalies, alerts
│   ├── session/                      # Backup / restore / SHA-256 checksum
│   └── terminal/
│       ├── monitor.py                # Interactive watchdog with auto-restart
│       └── manage.py                 # Maintenance CLI
├── rust/                             # Rust — Session API v5.7.0
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
