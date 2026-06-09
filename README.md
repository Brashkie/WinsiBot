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

> Bot de WhatsApp de alto rendimiento con arquitectura multi-lenguaje.<br/>
> Diseñado para **443+ grupos simultáneos**, miles de mensajes por hora y múltiples instancias.<br/>
> v8.2.0 — Gift, PvP Arena, Quiz, Draw & Guess, Prestige, Mascotas avanzadas, Clan completo, Carrusel nativo.

<br/>

**[🇺🇸 English version →](README.en.md)** &nbsp;·&nbsp; **[📖 Comandos →](docs/commands.md)** &nbsp;·&nbsp; **[🐛 Reportar bug](https://github.com/Brashkie/WinsiBot/issues)**

</div>

---

## Tabla de contenidos

<details>
<summary>Expandir</summary>

- [¿Qué es WinsiBot?](#qué-es-winsibot)
- [Stack técnico](#stack-técnico)
- [Características](#características)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Ejecutar el bot](#ejecutar-el-bot)
- [Comandos](#comandos)
- [CLI de mantenimiento](#cli-de-mantenimiento)
- [API Webhook](#api-webhook)
- [Monitoreo](#monitoreo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Solución de problemas](#solución-de-problemas)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

</details>

---

## ¿Qué es WinsiBot?

**WinsiBot** es un bot de WhatsApp empresarial construido sobre [Baileys](https://github.com/WhiskeySockets/Baileys) con una arquitectura de tres capas especializadas que cooperan entre sí:

| Capa | Tecnología | Responsabilidad |
|------|-----------|----------------|
| 🟦 **Core** | TypeScript / Node.js | Protocolo WhatsApp, comandos, handler de mensajes, RPG, IA |
| 🐍 **Services** | Python / FastAPI / Celery | IA avanzada, monitor watchdog, backups de sesión, health check |
| ⚙️ **Session** | Rust / Axum | Escritura atómica de creds, snapshots x5, delivery tracker SQLite |

---

## Stack técnico

<div align="center">

| Área | Tecnología | Propósito |
|------|-----------|-----------|
| Runtime | Node.js 20 LTS | Loop de eventos WhatsApp |
| Lenguaje | TypeScript 5.x | Tipado estricto end-to-end |
| WhatsApp | Baileys 6.x | Protocolo WA Web multi-device |
| Servicios | Python 3.11 + FastAPI | IA, watchdog, backup |
| Tasks | Celery + Redis | Cola de tareas async |
| Session Store | Rust + Axum + SQLite | Creds atómicas + delivery tracking |
| Base de datos | SQLite (better-sqlite3) | userData, groupConfigs, clanes |
| Panel web | PHP 8.1 *(opcional)* | Dashboard de administración |

</div>

---

## Características

<table>
<tr>
<td width="50%">

### 📡 Mensajería
- Rate limiting con token bucket por JID
- Cola priorizada: `urgent` → `normal` → `broadcast`
- Tracking de entrega: enviado → entregado → leído
- Auto-detección de Bad MAC flood + auto-limpieza
- 443+ grupos sin degradación de rendimiento

</td>
<td width="50%">

### 🔒 Sesión & Estabilidad
- Escritura atómica Rust: `tmp → fsync → rename`
- 5 snapshots rotativos con recovery automático
- Backup con checksum SHA-256
- Reconexión exponencial (50 reintentos, máx 60s)
- Monitor Python con watchdog y freeze detection

</td>
</tr>
<tr>
<td width="50%">

### 🎮 RPG & Economía
- Sistema de XP / niveles / prestige (10 rangos) + medallas
- Moneda propia (BrasCoins) + banco
- Gacha (rollwaifu / pokedex / marvel)
- **Clanes avanzados**: territorios, guerras 24h, alianzas, tesorería
- Misiones: trabajo, minería, cofre, crimen, robo
- **Sistema de regalos**: catálogo 30+ items, buzón, wishlist, trueques
- **Arena PvP**: ELO, 9 divisiones, apuestas, 5 acciones de combate
- **Mascotas avanzadas**: 25 especies, evolución, batallas auto
- **Quiz de programación**: 42 preguntas, ELO, 5 dificultades
- **Draw & Guess**: 55 palabras, pistas progresivas, puntuación

</td>
<td width="50%">

### 🤖 Inteligencia Artificial
- Multi-modelo: GPT · Claude · Gemini con fallback
- Historial de conversación por usuario (12 msgs)
- Rate limiting: 20 req/hora por JID
- Generación de imágenes con DALL-E
- Traducción automática (50+ idiomas)

</td>
</tr>
<tr>
<td width="50%">

### 🛡️ Moderación
- Antilink, antispam, antiflood, antitoxic
- Bloqueo por plataforma: Telegram, Discord, TikTok
- Bienvenida / despedida personalizables
- Modo admin: solo admins usan comandos
- Warns con límite y auto-kick

</td>
<td width="50%">

### ⚙️ Infraestructura
- Sub-bots independientes (JadiBot)
- Webhook HTTP con HMAC-SHA256
- Scheduler con jobs programables vía cron
- CLI de mantenimiento multi-servicio
- Panel PHP opcional para estadísticas
- **Mensajes interactivos**: botones nativos, listas, carrusel, álbum, sylph
- **Respuesta automática de botones**: handler intercepta `interactiveResponseMessage`

</td>
</tr>
</table>

---

## Arquitectura

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
║  │ 45+ Cmds    │  ║  │  Monitor    │  ║  │  ● Signal clear      │ ║
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

## Requisitos

| Herramienta | Versión mínima | Requerido | Notas |
|-------------|---------------|:---------:|-------|
| Node.js | 20.x LTS | ✅ | `node --version` |
| npm | 9.x | ✅ | incluido con Node |
| Python | 3.11+ | ✅ | `python --version` |
| Rust + Cargo | 1.75+ | ✅ | para compilar Session API |
| Redis | 6.x | ✅ | para Celery / cola |
| PHP | 8.1+ | ❌ | panel web opcional |
| FFmpeg | 6.x | ❌ | conversión de media |

**Sistemas operativos soportados:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+

---

## Instalación

```bash
# 1 — Clonar el repositorio
git clone https://github.com/Brashkie/WinsiBot.git
cd WinsiBot

# 2 — Dependencias Node.js
npm install

# 3 — Entorno virtual Python + dependencias
cd python
python -m venv venv

# Windows
venv\Scripts\activate
# Linux / macOS
# source venv/bin/activate

pip install -r requirements.txt
cd ..

# 4 — Compilar Session API de Rust
npm run rust:build

# 5 — Variables de entorno
# Windows
copy .env.example .env
copy rust\.env.example rust\.env
# Linux / macOS
# cp .env.example .env && cp rust/.env.example rust/.env

# 6 — Editar .env con tus valores (ver sección Configuración)

# 7 — Iniciar todo
npm run start:all
```

> **Primera vez:** Si no hay sesión guardada, aparecerá un **código QR** en la terminal.  
> Escanéalo desde WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo.

---

## Configuración

### `.env` — Variables principales

```env
# ─── Bot ──────────────────────────────────────────────────────────────────
PREFIX="!,.,#,/"                        # Prefijos que activan comandos
BOT_NAME=WinsiBot                        # Nombre del bot
OWNER_JID=51999999999@s.whatsapp.net     # Tu número (código de país, sin +)
SESSION_PATH=./auth                      # Carpeta de sesión de WhatsApp
NODE_ENV=production                      # development | production
LOG_LEVEL=info                           # silent | info | debug | error

# ─── IA ───────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...                    # GPT-4o-mini / DALL-E 3
ANTHROPIC_API_KEY=sk-ant-...            # Claude Haiku
GEMINI_API_KEY=AIza...                   # Gemini 1.5 Flash

# ─── Session API (Rust) ───────────────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=                         # openssl rand -hex 32

# ─── Webhook ──────────────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=                          # openssl rand -hex 32

# ─── Servicios Python ─────────────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=                          # openssl rand -hex 32

# ─── Spotify (opcional) ───────────────────────────────────────────────────
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

### `rust/.env` — Session API

```env
PORT=3001
API_KEY=                   # Mismo valor que SESSION_API_KEY
SESSIONS_DIR=./sessions
AUTH_DIR=../auth
DB_PATH=./data/messages.db
RUST_LOG=winsibot_session_api=info
```

> **Generar claves seguras:** `openssl rand -hex 32`

### Variables avanzadas

<details>
<summary>Ver todas las variables</summary>

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PREFIX` | `"!,.,#,/"` | Prefijos separados por coma |
| `WEBHOOK_PORT` | `4001` | Puerto del receiver HTTP |
| `SESSION_API_URL` | `http://127.0.0.1:3001` | URL de la Session API Rust |
| `REDIS_URL` | `redis://localhost:6379` | Conexión a Redis |
| `NODE_ENV` | `production` | Modo de ejecución |
| `LOG_LEVEL` | `info` | Nivel de logs Pino |
| `OPENAI_API_KEY` | — | GPT / DALL-E (opcional) |
| `ANTHROPIC_API_KEY` | — | Claude (opcional) |
| `GEMINI_API_KEY` | — | Gemini (opcional) |

</details>

---

## Ejecutar el bot

### Todo en uno *(recomendado para producción)*

```bash
npm run start:all
```

Lanza en paralelo: Rust Session API · Python Monitor (que a su vez inicia Node.js + FastAPI + Celery)

### Por componentes *(para desarrollo)*

```bash
npm run rust:start      # Solo Session API Rust
npm run monitor         # Monitor Python + Node.js + servicios
npm run dev             # Solo Node.js (sin monitor, QR directo)
```

### Scripts disponibles

<details>
<summary>Ver todos los scripts npm</summary>

| Script | Descripción |
|--------|-------------|
| `start:all` | Inicia todo en paralelo |
| `monitor` | Monitor Python con auto-restart |
| `dev` | Node.js directo — desarrollo / escanear QR |
| `build` | Compilar TypeScript → `dist/` |
| `rust:start` | Session API de Rust |
| `rust:build` | Compilar Rust en release |
| `manage` | CLI de mantenimiento (menú interactivo) |
| `manage:status` | Estado de servicios |
| `manage:diagnose` | Diagnóstico profundo |
| `manage:repair` | Reparación automática |
| `manage:reset-signal` | Limpiar sesiones Signal (Bad MAC) |
| `manage:reset-qr` | Reset completo + nuevo QR |
| `manage:backup` | Forzar backup de sesión |
| `manage:restore` | Restaurar desde backup |
| `manage:logs` | Ver logs recientes |
| `typecheck` | Verificar tipos sin compilar |
| `lint` | ESLint |
| `test` | Vitest |

</details>

---

## Comandos

El bot tiene **75+ comandos** en **17 categorías**.

→ **[📖 Ver referencia completa de comandos](docs/commands.md)**

<details>
<summary>Resumen de categorías</summary>

| Categoría | Comandos destacados | Descripción |
|-----------|--------------------|----|
| 🤖 IA | `!gpt` `!claude` `!imagine` `!translate` | Chat multi-modelo, imágenes, traducciones |
| 💰 RPG | `!work` `!daily` `!perfil` `!rw` `!clan` `!prestige` | Economía, gacha, niveles, clanes, prestige |
| 🎮 Juegos | `!arena` `!quiz` `!adivinar` `!mascota` | PvP Arena, Quiz coding, Draw & Guess, mascotas |
| 🎁 Social | `!regalo` | Sistema de regalos, buzón, wishlist, trueques |
| 🛡️ Admin | `!ban` `!kick` `!antilink` `!warn` | Moderación de grupos |
| 👑 Owner | `!exec` `!broadcast` `!premium` `!boost` | Control total del bot |
| ⬇️ Descargas | `!yt` `!tiktok` `!ttsearch` `!ig` `!spotify` `!apk` | Descargadores multimedia + búsqueda con carrusel |
| 🎨 Stickers | `!sticker` `!toimg` `!emojimix` `!stickerpack` | Creación, conversión y packs completos |
| 🎮 Fun | `!meme` `!sega` `!giphy` `!top` | Entretenimiento |
| 💞 Roleplay | `!hug` `!kiss` `!pat` `!kill` | GIFs de anime interactivos |
| 🎵 Música | `!play` `!lyrics` `!spotify` | Audio y letras |
| 🌐 Media | `!anime` `!removebg` `!wimage` | Imágenes de anime, fondo, personajes |
| 🔧 Util | `!clima` `!imagen` | Clima, generación de imágenes |
| ℹ️ Info | `!ping` `!creator` `!menu` | Información del bot |
| 🤝 Jadibot | `!jadibot` `!stopbot` | Sub-bots vinculados |
| 🔞 NSFW | `!porngif` | Solo grupos con NSFW activo |

</details>

---

## CLI de mantenimiento

```bash
npm run manage
```

Menú interactivo multi-servicio que orquesta Python, Rust y Node.js.

| Opción | Comando | Cuándo usarlo |
|:------:|---------|---------------|
| 1 | `manage:status` | Ver estado de FastAPI / Rust / Webhook / PHP |
| 2 | `manage:diagnose` | Analizar sesión, archivos Signal, Rust, logs |
| 3 | `manage:repair` | Signal corrupto → recuperar creds → restaurar backup |
| 4 | `manage:reset-signal` | Solo borrar `session-*.json` (conserva `creds.json`) |
| 5 | `manage:reset-qr` | Eliminar sesión completa y obtener QR nuevo |
| 6 | `manage:backup` | Crear backup verificado con SHA-256 |
| 7 | `manage:restore` | Elegir y restaurar un backup |
| 8 | `manage:logs` | Ver últimos 30 eventos del session log |

### Referencia rápida de problemas

| Síntoma | Solución |
|---------|---------|
| Bot sin respuesta, mensajes no llegan | `manage:reset-signal` |
| "Bad MAC" repetitivo en terminal | `manage:reset-signal` |
| Sesión expirada / `loggedOut` | `manage:reset-qr` |
| `creds.json` corrupto | `manage:repair` |
| Antes de apagar el servidor | `manage:backup` |
| Después de actualizar | `manage:diagnose` |

---

## API Webhook

El receiver escucha en `http://127.0.0.1:4001` y permite controlar el bot desde servicios externos.

### Autenticación

Todas las peticiones requieren el header `x-webhook-signature` con firma HMAC-SHA256:

```python
import hmac, hashlib

sig = hmac.new(WEBHOOK_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = { "x-webhook-signature": f"sha256={sig}" }
```

### Endpoints

<details>
<summary>Ver todos los endpoints</summary>

#### `GET /health`
```json
{ "ok": true, "uptime": 3600, "connected": true }
```

#### `POST /webhook` — Enviar mensaje
```json
{
  "event": "send_message",
  "jid": "51999999999@s.whatsapp.net",
  "text": "Hola desde el webhook"
}
```

#### `POST /webhook` — Broadcast
```json
{
  "event": "broadcast",
  "jids": ["51111111111@s.whatsapp.net"],
  "text": "Mensaje masivo"
}
```

#### `POST /webhook` — Ejecutar job
```json
{ "event": "run_job", "jobId": "nombre_del_job" }
```

#### `POST /webhook` — Ping
```json
{ "event": "ping" }
```

</details>

### Códigos de respuesta

| Código | Significado |
|:------:|-------------|
| `200` | Éxito |
| `400` | Body inválido o campo faltante |
| `401` | Firma HMAC inválida |
| `413` | Body demasiado grande (>64 KB) |
| `422` | Socket no disponible |
| `429` | Rate limit excedido (1 req/s por IP) |
| `500` | Error interno |

---

## Monitoreo

### Session API de Rust (`:3001`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Estado general + sesiones activas |
| `GET /health/live` | Liveness (Docker / K8s) |
| `GET /health/ready` | Readiness |
| `GET /messages/stats?hours=24` | Tasa de delivery en las últimas N horas |
| `GET /messages/pending?minutes=5` | Mensajes sin confirmar entrega |

### Estadísticas de delivery

```bash
curl -H "x-api-key: TU_CLAVE" http://127.0.0.1:3001/messages/stats
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

> ⚠️ Si `delivery_pct` baja de **80%**, ejecuta `npm run manage:repair`.

---

## Estructura del proyecto

```
WinsiBot/
├── src/                              # TypeScript — bot principal
│   ├── config.ts                     # Variables de entorno + validación Zod
│   ├── index.ts                      # Entry point
│   ├── types/
│   │   └── index.d.ts                # Tipos globales (Command, UserData, etc.)
│   ├── core/
│   │   ├── socket.ts                 # Conexión WebSocket a WhatsApp
│   │   ├── handler.ts                # Dispatcher de mensajes → comandos
│   │   ├── store.ts                  # Cache de contactos/chats (escritura atómica)
│   │   ├── logger.ts                 # Pino logger
│   │   ├── queue.ts                  # Cola de mensajes priorizada
│   │   └── events/
│   │       ├── index.ts              # UserData, GroupConfig, clanes, helpers globales
│   │       ├── xp.ts                 # Sistema de experiencia / niveles
│   │       ├── welcome.ts            # Bienvenida / despedida
│   │       ├── antispam.ts           # Detección de spam
│   │       ├── antilink.ts           # Filtro de enlaces
│   │       ├── antidelete.ts         # Reenvío de mensajes eliminados
│   │       ├── anticall.ts           # Bloqueo de llamadas
│   │       └── nsfw.ts               # Control de contenido adulto
│   ├── lib/
│   │   ├── globals.ts                # Sistema de roles: owner/dev/mod/helper/prem
│   │   ├── db.ts                     # Persistencia SQLite (userData, grupos, clanes)
│   │   ├── ai.ts                     # Cliente IA multi-modelo: GPT · Claude · Gemini
│   │   ├── interactive.ts            # 🆕 Mensajes interactivos: botones, listas, carrusel, álbum
│   │   ├── gift.ts                   # 🆕 Sistema de regalos (30+ items, buzón, wishlist, trueques)
│   │   ├── pvp.ts                    # 🆕 Arena PvP (ELO K=32, 9 divisiones, 5 acciones)
│   │   ├── quiz.ts                   # 🆕 Quiz de programación (42 preguntas, 5 dificultades)
│   │   ├── drawguess.ts              # 🆕 Draw & Guess (55 palabras, pistas, puntuación)
│   │   ├── leveling.ts               # 🆕 Prestige (10 rangos), rachas, medallas, multiplicadores
│   │   ├── petAdvanced.ts            # 🆕 Mascotas avanzadas (25 especies, evolución, batallas)
│   │   ├── clan.ts                   # 🆕 Clan extendido (territorios, guerras 24h, alianzas)
│   │   ├── downloader.ts             # yt-dlp wrapper (YouTube, TikTok, Instagram)
│   │   ├── media.ts                  # Procesamiento de media
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter
│   │   ├── safeMessage.ts            # Envío seguro con reintentos
│   │   ├── session.ts                # Cliente Session API de Rust
│   │   ├── sticker.ts                # Creación de stickers
│   │   ├── jid_utils.ts              # Utilidades de JID
│   │   └── utils.ts                  # Helpers generales
│   └── plugins/
│       ├── commands/                 # 75+ comandos organizados por categoría
│       │   ├── rpg/                  # work, daily, perfil, rollwaifu, wimage, clan, regalo, prestige, mascota…
│       │   ├── games/                # 🆕 arena, quiz, adivinar
│       │   ├── admin/                # ban, kick, warn, antilink, config…
│       │   ├── owner/                # exec, broadcast, premium, boost…
│       │   ├── ai/                   # gpt, imagine, translate
│       │   ├── fun/                  # meme, sega, giphy, top…
│       │   ├── downloader/           # youtube, tiktok, ttsearch, apk, downloadapk
│       │   ├── sticker/              # sticker, stickerpack
│       │   └── …
│       ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│       ├── scheduler/                # Jobs programados (node-cron)
│       └── webhooks/                 # Receiver HTTP
│   └── core/events/
│       ├── gameHandlers.ts           # 🆕 Intercept Draw & Guess + Quiz en handler
├── python/                           # Python — servicios auxiliares
│   ├── api/                          # FastAPI + Celery
│   ├── ai/                           # IA, break detector, health monitor
│   ├── session/                      # Backup / restore / checksum SHA-256
│   └── terminal/
│       ├── monitor.py                # Watchdog principal con auto-restart
│       └── manage.py                 # CLI de mantenimiento interactivo
├── rust/                             # Rust — Session API
│   └── src/
│       ├── main.rs                   # Entry point (Axum)
│       ├── routes.rs                 # Handlers HTTP
│       ├── db.rs                     # SQLite delivery tracker
│       ├── atomic.rs                 # Escritura atómica de archivos
│       └── snapshot.rs               # Snapshots rotativos ×5
├── php/                              # Panel web opcional
├── docs/
│   ├── commands.md                   # Referencia completa de comandos (ES)
│   └── commands.en.md                # Command reference (EN)
├── .env.example                      # Plantilla de configuración principal
├── rust/.env.example                 # Plantilla de Rust
└── package.json
```

---

## Solución de problemas

<details>
<summary><b>El bot no responde a mensajes</b></summary>

1. Verifica que está conectado: `npm run manage:status`
2. Revisa si hay errores Bad MAC en la terminal
3. Ejecuta: `npm run manage:reset-signal`
4. Si persiste: `npm run manage:repair`

</details>

<details>
<summary><b>"Bad MAC" continuamente en terminal</b></summary>

Las sesiones Signal están corruptas. El bot detecta esto automáticamente (8 Bad MACs en 60s) y se auto-repara. Para forzarlo manualmente:

```bash
npm run manage:reset-signal
```

</details>

<details>
<summary><b>Error "auth dir missing" o "creds.json corrupt"</b></summary>

```bash
npm run manage:repair
# Si no hay backup disponible:
npm run manage:reset-qr
```

</details>

<details>
<summary><b>El bot se reinicia cada cierto tiempo</b></summary>

Revisa `HANG_TIMEOUT` en `python/terminal/monitor.py`. El valor por defecto es 15 minutos. Si el bot está en muchos grupos activos, es normal no tener output por períodos cortos.

</details>

<details>
<summary><b>Error 440 — "Expulsado por otra instancia"</b></summary>

WhatsApp Web está abierto en el navegador con el mismo número. Cierra todas las sesiones web y espera 60 segundos. El bot se reconectará solo.

</details>

<details>
<summary><b><code>npm run rust:build</code> falla en Windows</b></summary>

```bash
rustup update stable
```

En Windows también necesitas las **Build Tools de Visual Studio** (MSVC). Descárgalas desde el instalador de Visual Studio seleccionando "Desarrollo para escritorio con C++".

</details>

---

## Preguntas frecuentes

<details>
<summary><b>¿Puedo usar el bot con múltiples números?</b></summary>

Sí, mediante el sistema **JadiBot** (`!jadibot`). Cada sub-bot tiene su propia sesión independiente.

</details>

<details>
<summary><b>¿Cuántos grupos puede manejar?</b></summary>

Se ha probado con **443+ grupos simultáneos** sin degradación. El store no cachea mensajes de grupos (solo metadatos) para mantener el uso de memoria bajo.

</details>

<details>
<summary><b>¿Cada cuánto tiempo hacer backup?</b></summary>

El monitor hace backup automático al iniciar (si la sesión es válida) y al recibir señal de cierre. Puedes forzarlo con `npm run manage:backup`. Se conservan los últimos **5 backups**.

</details>

<details>
<summary><b>¿Funciona con WhatsApp Business?</b></summary>

Sí. El tracking de delivery también funciona con Business. Sin embargo, funciones como catálogos o botones de la API oficial de Business no están disponibles.

</details>

<details>
<summary><b>¿Los datos de usuarios se pierden al reiniciar?</b></summary>

No desde la v8.1.0. La librería `lib/db.ts` persiste `userData`, `groupConfigs` y clanes en SQLite (`data/winsi.db`). Los datos se cargan automáticamente al iniciar.

</details>

---

## Seguridad

> ⚠️ La carpeta `auth/` contiene las claves privadas de tu cuenta de WhatsApp. **Nunca la incluyas en commits.**

- Usa claves API largas y aleatorias (`openssl rand -hex 32`)
- El webhook receiver solo escucha en `127.0.0.1` por defecto
- Todas las rutas de la Session API requieren API key en header
- El webhook valida firma HMAC-SHA256 en cada petición
- Los backups incluyen verificación de checksums SHA-256
- `auth/` está en `.gitignore` — no la expongas

---

## Licencia

**GPL-3.0-or-later** — ver [LICENSE](LICENSE)

<div align="center">

---

Desarrollado con ❤️ por **[Brashkie](https://github.com/Brashkie)** · Hepein Oficial

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=80&section=footer" width="100%"/>

</div>
