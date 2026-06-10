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

> Bot de WhatsApp de alto rendimiento con arquitectura multi-lenguaje de tres capas.<br/>
> Diseñado para **10,000+ grupos simultáneos**, miles de mensajes por hora y múltiples instancias.<br/>
> v8.2.1 — Integridad criptográfica de sesión, recuperación sin QR, Bad MAC por grupo, IA local con Ollama y hardening completo de estabilidad.

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
- [Referencia Session API](#referencia-session-api)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Solución de problemas](#solución-de-problemas)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

</details>

---

## ¿Qué es WinsiBot?

**WinsiBot** es un bot de WhatsApp empresarial construido sobre [Baileys](https://github.com/WhiskeySockets/Baileys) con una arquitectura de tres capas especializadas que cooperan en tiempo real:

| Capa | Tecnología | Responsabilidad |
|------|-----------|----------------|
| 🟦 **Core** | TypeScript / Node.js | Protocolo WhatsApp, dispatcher de comandos, RPG, IA |
| 🐍 **Services** | Python / FastAPI / Celery | IA avanzada (Ollama + GPT + Claude + Gemini), watchdog, health checks |
| ⚙️ **Session** | Rust / Axum | Escritura atómica de creds, 10 snapshots rotativos, tracker Bad MAC, rate limiter, delivery SQLite |

### Novedades en v8.2.1

| Área | Cambio |
|------|--------|
| **Integridad criptográfica** | Directorio auth verificado con Curve25519 `publicFromPrivate` en cada arranque vía `@brashkie/signalis-core` |
| **Recuperación sin QR** | `creds.json` corrupto se restaura automáticamente desde snapshot de Rust — sin escanear QR |
| **Bad MAC por grupo** | Cada grupo tiene su propio contador de ventana deslizante (5 MACs / 30s); un grupo inundado ya no dispara reconexión global |
| **Reconexión infinita** | `maxRetries` eliminado — el bot reconecta para siempre con backoff exponencial máx 64s |
| **Semáforo** | Máximo 25 handlers de mensajes concurrentes — previene agotamiento del event loop bajo flood |
| **Watchdog Rust** | Node.js hace ping a Rust cada 20s; `GET /watchdog/status` devuelve 503 si Node muere |
| **Rate limiter Rust** | 15 msgs / 10s por sender con buckets individuales, sin lock global |
| **AbortController** | Todas las llamadas a la API Rust tienen timeout de 3s — un servidor colgado no acumula Promises pendientes |
| **Soporte Ollama** | IA local (Llama 3, Mistral, etc.) se intenta primero en `_call_ai`, antes de cualquier API cloud |
| **Conteo de snapshots** | Aumentado de 5 → 10 snapshots rotativos por sesión |
| **Aislamiento Python** | `stdio: 'ignore'` evita que el buffer de pipe de 4 KB bloquee el proceso hijo |
| **Fix db.ts** | Eliminado `process.exit(0)` en el handler SIGINT que saltaba el graceful shutdown |

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
| Criptografía | `@brashkie/signalis-core` | Curve25519 / Ed25519 / HKDF / AES-GCM (Rust NAPI) |
| Base de datos | SQLite (better-sqlite3) | userData, groupConfigs, clanes |
| Panel web | PHP 8.1 *(opcional)* | Dashboard de administración |

</div>

---

## Características

<table>
<tr>
<td width="50%">

### 📡 Mensajería
- Rate limiting por sender (Rust, sin lock global)
- Cola priorizada: `urgent` → `normal` → `broadcast`
- Tracking de entrega: enviado → entregado → leído
- Detección de Bad MAC flood por grupo + auto-limpieza
- 10,000+ grupos sin degradación de rendimiento
- Máximo 25 handlers concurrentes (semáforo)

</td>
<td width="50%">

### 🔒 Sesión & Estabilidad
- Escritura atómica Rust: `tmp → fsync → rename`
- 10 snapshots rotativos con recovery automático
- Verificación de claves Curve25519 al arrancar
- Restauración automática de creds sin QR
- Reconexión infinita con backoff exponencial (máx 64s)
- Monitor Python con watchdog y freeze detection

</td>
</tr>
<tr>
<td width="50%">

### 🎮 RPG & Economía
- Sistema de XP / niveles / prestige (10 rangos) + medallas
- Moneda propia (BrasCoins) + banco
- Gacha (rollwaifu / pokédex / marvel)
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
- Multi-modelo: **Ollama (local)** → GPT → Claude → Gemini
- Historial de conversación por usuario (12 msgs)
- Rate limiting: 20 req/hora por JID
- Generación de imágenes con DALL-E
- Traducción automática (50+ idiomas)
- NLP fast-path en Rust para detección de palabras clave

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
║  │  (semáforo)   │  ║  │  GPT/Claude/     │  ║  │  ● bad_mac tracker    │   ║
║  ├───────────────┤  ║  │  Gemini fallback │  ║  │  ● rate_limiter       │   ║
║  │  75+ Cmds     │  ║  ├──────────────────┤  ║  │  ● watchdog heartbeat │   ║
║  ├───────────────┤  ║  │  Monitor         │  ║  │  ● delivery SQLite    │   ║
║  │  lib/db.ts    │  ║  │  Watchdog        │  ║  │  ● /sessions/backup   │   ║
║  │  (SQLite)     │  ║  └──────────────────┘  ║  └───────────────────────┘   ║
║  ├───────────────┤  ║                        ║                               ║
║  │ authVerifier  │  ║                        ║  ┌───────────────────────┐   ║
║  │ Curve25519    │  ║                        ║  │   messages.db         │   ║
║  │ + sin QR      │  ║                        ║  │  ● outbox tracking    │   ║
║  └───────────────┘  ║                        ║  │  ● delivery stats     │   ║
╚════════════════════╩═══════════════════════╩   └───────────────────────┘   ║
          │                     │                           │                  ╝
          └─────────────────────┴───────────────────────────┘
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
| Ollama | latest | ❌ | IA local (recomendado, 16 GB RAM+) |
| PHP | 8.1+ | ❌ | panel web opcional |
| FFmpeg | 6.x | ❌ | conversión de media |

**Sistemas operativos soportados:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+

> **Ollama:** Descarga un modelo antes de iniciar — `ollama pull llama3` o `ollama pull mistral`. El bot intenta Ollama primero y cae en las APIs cloud automáticamente si no está disponible.

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
# ─── Bot ──────────────────────────────────────────────────────────────────────
PREFIX="!,.,#,/"                        # Prefijos que activan comandos
BOT_NAME=WinsiBot                        # Nombre del bot
OWNER_JID=51999999999@s.whatsapp.net     # Tu número (código de país, sin +)
SESSION_PATH=./auth                      # Carpeta de sesión de WhatsApp
NODE_ENV=production                      # development | production
LOG_LEVEL=info                           # silent | info | debug | error

# ─── IA — todos opcionales, el bot funciona con cualquier subconjunto ──────────
OPENAI_API_KEY=sk-...                    # GPT-4o-mini / DALL-E 3
ANTHROPIC_API_KEY=sk-ant-...             # Claude Haiku
GEMINI_API_KEY=AIza...                   # Gemini 1.5 Flash
OLLAMA_BASE_URL=http://localhost:11434   # Ollama local (puerto por defecto)
OLLAMA_MODEL=llama3                      # Modelo a usar con Ollama

# ─── Session API (Rust) ───────────────────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=                         # openssl rand -hex 32

# ─── Webhook ──────────────────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=                          # openssl rand -hex 32

# ─── Servicios Python ─────────────────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=                          # openssl rand -hex 32

# ─── Spotify (opcional) ───────────────────────────────────────────────────────
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
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Endpoint local de Ollama (opcional) |
| `OLLAMA_MODEL` | `llama3` | Nombre del modelo Ollama |

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
| `manage:repair` | Reparación automática (intenta restauración sin QR primero) |
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
| 3 | `manage:repair` | Signal corrupto → intenta restauración sin QR → recupera backup |
| 4 | `manage:reset-signal` | Solo borrar `session-*.json` (conserva `creds.json`) |
| 5 | `manage:reset-qr` | Eliminar sesión completa y obtener QR nuevo |
| 6 | `manage:backup` | Crear backup verificado con SHA-256 |
| 7 | `manage:restore` | Elegir y restaurar un backup |
| 8 | `manage:logs` | Ver últimos 30 eventos del session log |

### Referencia rápida de problemas

| Síntoma | Solución |
|---------|---------|
| Bot sin respuesta, mensajes no llegan | `manage:reset-signal` |
| "Bad MAC" repetitivo en terminal | automático — o `manage:reset-signal` |
| Sesión expirada / `loggedOut` | `manage:reset-qr` |
| `creds.json` corrupto | `manage:repair` (intenta sin QR primero) |
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
| `GET /badmac/stats` | Contadores Bad MAC por grupo |
| `GET /rate/stats` | Buckets del rate limiter por sender |
| `GET /watchdog/status` | Heartbeat de Node.js — 503 si Node murió |
| `GET /sessions/backup?sessionId=main` | Mejor backup disponible (restauración sin QR) |

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

> Si `delivery_pct` baja de **80%**, ejecuta `npm run manage:repair`.

---

## Referencia Session API

<details>
<summary>Lista completa de rutas</summary>

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/write` | Escribir creds (base64) con rename atómico |
| `GET` | `/read` | Leer creds actuales |
| `POST` | `/snapshot` | Forzar rotación de snapshot |
| `POST` | `/recover` | Restaurar desde el mejor snapshot válido |
| `GET` | `/snapshots` | Listar snapshots con estado de salud |
| `GET` | `/healthy` | Salud de sesión + detección de corrupción |
| `GET` | `/sessions` | Listar IDs de sesión activos |
| `POST` | `/sessions/signal/clear` | Eliminar archivos Signal (fix Bad MAC) |
| `GET` | `/sessions/backup` | Devolver mejor creds válido para restauración sin QR |
| `POST` | `/badmac/report` | Reportar evento Bad MAC para un JID de grupo |
| `POST` | `/badmac/reset` | Resetear contador Bad MAC de un grupo |
| `GET` | `/badmac/stats` | Todos los contadores + tiempos de último trigger |
| `POST` | `/rate/check` | Verificar si un sender está dentro del rate limit |
| `GET` | `/rate/stats` | Todos los buckets por sender + uso |
| `POST` | `/watchdog/ping` | Ping de heartbeat desde Node.js |
| `GET` | `/watchdog/status` | Vivo/muerto + tiempo último ping + conteo |
| `POST` | `/nlp/fast` | Detección NLP de palabras clave en Rust |
| `POST` | `/ai/learn` | Guardar turno de conversación IA (DuckDB) |
| `GET` | `/ai/context/:sender` | Recuperar contexto de conversación |
| `POST` | `/messages/track` | Trackear IDs de mensajes salientes |
| `POST` | `/messages/ack` | Actualizar estado de entrega en lote |
| `GET` | `/messages/pending` | Mensajes sin confirmación de entrega |
| `GET` | `/messages/stats` | Estadísticas de delivery |
| `DELETE` | `/messages/cleanup` | Eliminar registros más viejos de N días |

</details>

### Flujo de recuperación sin QR

```
Bot arranca → verifyAndReport(authDir)
  → creds.json corrupto detectado vía Curve25519 publicFromPrivate
  → _restoreCredsFromRust() → GET /sessions/backup (Rust)
    → Rust prueba: archivo actual → snapshot #1 → ... → snapshot #10
    → primer JSON válido devuelto
  → TypeScript re-verifica el backup con Curve25519
  → escritura atómica: creds.json.tmp → rename → creds.json
  → bot continúa — sin QR necesario
```

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
│   │   ├── handler.ts                # Dispatcher de mensajes → comandos (semáforo)
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
│   │   ├── authVerifier.ts           # Verificación Curve25519 + restauración sin QR
│   │   ├── interactive.ts            # Mensajes interactivos: botones, listas, carrusel, álbum
│   │   ├── gift.ts                   # Sistema de regalos (30+ items, buzón, wishlist, trueques)
│   │   ├── pvp.ts                    # Arena PvP (ELO K=32, 9 divisiones, 5 acciones)
│   │   ├── quiz.ts                   # Quiz de programación (42 preguntas, 5 dificultades)
│   │   ├── drawguess.ts              # Draw & Guess (55 palabras, pistas, puntuación)
│   │   ├── leveling.ts               # Prestige (10 rangos), rachas, medallas, multiplicadores
│   │   ├── petAdvanced.ts            # Mascotas avanzadas (25 especies, evolución, batallas)
│   │   ├── clan.ts                   # Clan extendido (territorios, guerras 24h, alianzas)
│   │   ├── downloader.ts             # yt-dlp wrapper (YouTube, TikTok, Instagram)
│   │   ├── media.ts                  # Procesamiento de media
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter (TypeScript)
│   │   ├── safeMessage.ts            # Envío seguro con reintentos
│   │   ├── session.ts                # Cliente Session API de Rust
│   │   ├── sticker.ts                # Creación de stickers
│   │   ├── jid_utils.ts              # Utilidades de JID
│   │   └── utils.ts                  # Helpers generales
│   └── plugins/
│       ├── commands/                 # 75+ comandos organizados por categoría
│       ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│       ├── scheduler/                # Jobs programados (node-cron)
│       └── webhooks/                 # Receiver HTTP
├── python/                           # Python — servicios auxiliares
│   ├── api/
│   │   └── routers/
│   │       └── hepein.py             # Router IA: Ollama → GPT → Claude → Gemini
│   ├── ai/
│   │   ├── ollama_client.py          # Cliente Ollama async con verificación de disponibilidad
│   │   └── commands_ref.py           # Referencia de comandos para contexto IA
│   ├── session/                      # Backup / restore / checksum SHA-256
│   └── terminal/
│       ├── monitor.py                # Watchdog principal con auto-restart
│       └── manage.py                 # CLI de mantenimiento interactivo
├── rust/                             # Rust — Session API
│   ├── build.rs                      # Fix linker Windows (rstrtmgr.lib para DuckDB)
│   └── src/
│       ├── main.rs                   # Entry point (Axum)
│       ├── routes.rs                 # Handlers HTTP + AppState
│       ├── bad_mac.rs                # Tracker Bad MAC por grupo (ventana deslizante)
│       ├── rate_limiter.rs           # Rate limiter por sender (15 msgs / 10s)
│       ├── watchdog.rs               # Heartbeat de Node.js (umbral 90s muerto)
│       ├── snapshot.rs               # 10 snapshots rotativos + read_best_valid()
│       ├── db.rs                     # SQLite delivery tracker
│       ├── atomic.rs                 # Escritura atómica (tmp → fsync → rename)
│       └── nlp.rs                    # NLP fast-path en Rust
├── php/                              # Panel web opcional
├── docs/
│   ├── commands.md                   # Referencia completa de comandos (ES)
│   └── commands.en.md                # Full command reference (EN)
├── .env.example                      # Plantilla de configuración principal
├── rust/.env.example                 # Plantilla de Rust
└── package.json
```

---

## Solución de problemas

<details>
<summary><b>El bot no responde a mensajes</b></summary>

1. Verifica que está conectado: `npm run manage:status`
2. Revisa si hay errores Bad MAC en la terminal (gestionados por grupo desde v8.2.1)
3. Ejecuta: `npm run manage:reset-signal`
4. Si persiste: `npm run manage:repair`

</details>

<details>
<summary><b>"Bad MAC" continuamente en terminal</b></summary>

Desde v8.2.1, el Bad MAC se gestiona **por grupo** — un grupo inundando Bad MACs ya no dispara una reconexión global. El bot detecta el umbral automáticamente (5 MACs en 30s por grupo) y limpia solo la sesión Signal de ese grupo.

Para forzarlo manualmente:

```bash
npm run manage:reset-signal
```

</details>

<details>
<summary><b>Error "auth dir missing" o "creds.json corrupt"</b></summary>

Desde v8.2.1, el bot intenta recuperación automática sin QR desde los snapshots de Rust al arrancar. Si eso falla:

```bash
npm run manage:repair
# Si no hay backup disponible:
npm run manage:reset-qr
```

</details>

<details>
<summary><b>El bot se reinicia cada cierto tiempo</b></summary>

Revisa `HANG_TIMEOUT` en `python/terminal/monitor.py`. El valor por defecto es 15 minutos. El watchdog de Rust también monitorea el heartbeat de Node.js — consulta `GET /watchdog/status` para ver el tiempo del último ping.

</details>

<details>
<summary><b>Error 440 — "Expulsado por otra instancia"</b></summary>

WhatsApp Web está abierto en el navegador con el mismo número. Cierra todas las sesiones web y espera 60 segundos. El bot se reconectará solo (sin límite de reintentos desde v8.2.1).

</details>

<details>
<summary><b><code>npm run rust:build</code> falla en Windows</b></summary>

```bash
rustup update stable
```

En Windows también necesitas las **Build Tools de Visual Studio** (MSVC). Descárgalas desde el instalador de Visual Studio seleccionando "Desarrollo para escritorio con C++".

</details>

<details>
<summary><b>Ollama no responde / IA cae en cloud</b></summary>

Verifica que Ollama está corriendo: `ollama serve`. Descarga un modelo si no lo tienes: `ollama pull llama3`.  
El bot verifica la disponibilidad de Ollama en cada petición y cae silenciosamente en GPT → Claude → Gemini si no está disponible.

</details>

---

## Preguntas frecuentes

<details>
<summary><b>¿Puedo usar el bot con múltiples números?</b></summary>

Sí, mediante el sistema **JadiBot** (`!jadibot`). Cada sub-bot tiene su propia sesión independiente.

</details>

<details>
<summary><b>¿Cuántos grupos puede manejar?</b></summary>

Diseñado para **10,000+ grupos simultáneos**. El rate limiter de Rust y el tracker Bad MAC por grupo usan estructuras `HashMap` diseñadas para alta cardinalidad con limpieza automática cada 5,000 llamadas.

</details>

<details>
<summary><b>¿Cada cuánto tiempo hacer backup?</b></summary>

El monitor hace backup automático al iniciar (si la sesión es válida) y al recibir señal de cierre. Puedes forzarlo con `npm run manage:backup`. Rust conserva los últimos **10 snapshots**, además de los backups manuales.

</details>

<details>
<summary><b>¿Funciona con WhatsApp Business?</b></summary>

Sí. El tracking de delivery también funciona con Business. Sin embargo, funciones como catálogos o botones de la API oficial de Business no están disponibles.

</details>

<details>
<summary><b>¿Los datos de usuarios se pierden al reiniciar?</b></summary>

No. `lib/db.ts` persiste `userData`, `groupConfigs` y clanes en SQLite (`data/winsi.db`). Los datos se cargan automáticamente al iniciar.

</details>

<details>
<summary><b>¿Qué hace @brashkie/signalis-core?</b></summary>

Es una librería NAPI basada en Rust que expone primitivos criptográficos a Node.js: Curve25519, Ed25519, HKDF, AES-GCM, HMAC, SHA-256. WinsiBot la usa para verificar que cada par de claves en `creds.json` sea internamente consistente (`publicFromPrivate(priv) === stored_pub`) antes de que Baileys las cargue — detectando corrupción antes de que cause errores Bad MAC en tiempo de ejecución.

</details>

---

## Seguridad

> ⚠️ La carpeta `auth/` contiene las claves privadas de tu cuenta de WhatsApp. **Nunca la incluyas en commits.**

- Usa claves API largas y aleatorias (`openssl rand -hex 32`)
- El webhook receiver solo escucha en `127.0.0.1` por defecto
- Todas las rutas de la Session API requieren API key en header
- El webhook valida firma HMAC-SHA256 en cada petición
- Los backups incluyen verificación de checksums SHA-256
- Los pares de claves de `creds.json` verificados con Curve25519 en cada arranque
- `auth/` está en `.gitignore` — no la expongas

---

## Licencia

**GPL-3.0-or-later** — ver [LICENSE](LICENSE)

<div align="center">

---

Desarrollado con ❤️ por **[Brashkie](https://github.com/Brashkie)** · Hepein Oficial

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=80&section=footer" width="100%"/>

</div>
