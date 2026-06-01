<div align="center">

# WinsiBot v8.0.0

**Bot de WhatsApp empresarial de alto rendimiento**

[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?logo=rust)](https://rust-lang.org)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue)](LICENSE)

*Arquitectura multi-lenguaje: TypeScript · Python · Rust*

[English version →](README.en.md)

</div>

---

## Tabla de contenidos

- [¿Qué es WinsiBot?](#qué-es-winsibot)
- [Características](#características)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación rápida](#instalación-rápida)
- [Configuración](#configuración)
- [Ejecutar el bot](#ejecutar-el-bot)
- [Comandos del bot](#comandos-del-bot)
- [CLI de mantenimiento](#cli-de-mantenimiento)
- [API Webhook](#api-webhook)
- [Monitoreo y salud](#monitoreo-y-salud)
- [Solución de problemas](#solución-de-problemas)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

---

## ¿Qué es WinsiBot?

WinsiBot es un bot de WhatsApp de uso general construido sobre la librería [Baileys](https://github.com/WhiskeySockets/Baileys). Está diseñado para soportar cientos de grupos simultáneos, miles de mensajes por hora y múltiples instancias de bot (sub-bots), con un sistema de recuperación automática de sesión que minimiza el tiempo fuera de línea.

A diferencia de soluciones simples de una sola capa, WinsiBot usa tres lenguajes especializados que cooperan entre sí:

- **TypeScript / Node.js** — protocolo WhatsApp, comandos, manejo de mensajes en tiempo real
- **Python** — inteligencia artificial, monitoreo del proceso, backups de sesión, análisis de salud
- **Rust** — almacenamiento atómico de sesión, snapshots, tracking de entrega de mensajes (SQLite), limpieza de sesiones Signal

---

## Características

### Mensajería
- Rate limiting inteligente con token bucket por JID (anti-ban automático)
- Cola de mensajes con prioridades: `urgent` → `normal` → `broadcast`
- Tracking de entrega en tiempo real: enviado → entregado → leído → reproducido
- Detección automática de Bad MAC flood y auto-limpieza de sesiones Signal
- Soporte de 443+ grupos sin degradación de rendimiento

### Sesión y estabilidad
- Escritura atómica en Rust (tmp → fsync → rename) — nunca corrompe `creds.json`
- 5 snapshots rotativos con recuperación automática
- Backup de sesión con verificación de checksums SHA-256
- Reconexión exponencial con hasta 50 reintentos (delay máx 60s)
- Monitor Python con watchdog, restart automático y timeout de freeze

### Comandos
- 45+ comandos organizados en 15 categorías
- Sistema de middlewares: permisos, anti-spam, XP, configuración por grupo
- Sub-bots independientes (JadiBot) vinculados a diferentes números
- Scheduler con jobs programables vía cron

### Infraestructura
- FastAPI + Celery para tareas pesadas en Python
- Webhook HTTP receiver con HMAC-SHA256, rate limiting por IP
- Panel PHP opcional
- Redis para cola de tareas

---

## Arquitectura

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

## Requisitos

| Herramienta | Versión mínima | Obligatorio |
|-------------|---------------|-------------|
| Node.js | 18.x | ✅ |
| npm | 9.x | ✅ |
| Python | 3.11 | ✅ |
| Rust + Cargo | 1.75 | ✅ (compilar Rust) |
| Redis | 6.x | ✅ (Celery) |
| PHP | 8.1 | ❌ (panel web) |

**Sistema operativo:** Windows 10/11, Ubuntu 20.04+, Debian 11+

---

## Instalación rápida

```bash
# 1. Clonar
git clone https://github.com/Brashkie/WinsiBot.git
cd WinsiBot

# 2. Dependencias Node
npm install

# 3. Dependencias Python
cd python
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
cd ..

# 4. Compilar Session API de Rust
npm run rust:build

# 5. Variables de entorno
copy .env.example .env         # Windows
# cp .env.example .env         # Linux / macOS
copy rust\.env.example rust\.env

# 6. Editar .env y rust/.env con tus valores (ver sección Configuración)

# 7. Iniciar
npm run start:all
```

Al primer inicio, si no hay sesión guardada, aparecerá un **código QR** en la terminal. Escanéalo con WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo.

---

## Configuración

### `.env` — Variables principales

```env
# ─── Bot ──────────────────────────────────────────────────────────
PREFIX="!,.,#,/"          # Prefijos que activan comandos (separados por coma)
BOT_NAME=WinsiBot          # Nombre del bot
OWNER_JID=51999999999@s.whatsapp.net   # Tu número (con código de país, sin +)
SESSION_PATH=./auth        # Carpeta donde se guarda la sesión de WhatsApp
NODE_ENV=production        # 'development' o 'production'
LOG_LEVEL=info             # 'silent' | 'info' | 'debug' | 'error'

# ─── Session API (Rust) ──────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=CLAVE_SEGURA_AQUI     # openssl rand -hex 32

# ─── Webhook ─────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=SECRETO_WEBHOOK_AQUI

# ─── Servicios Python ────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=CLAVE_API_INTERNA
```

### `rust/.env` — Session API

```env
PORT=3001
API_KEY=CLAVE_SEGURA_AQUI    # Debe coincidir con SESSION_API_KEY de .env
SESSIONS_DIR=./sessions       # Donde Rust guarda las creds
AUTH_DIR=../auth              # Directorio auth de Baileys (para limpiar Signal)
DB_PATH=./data/messages.db   # SQLite de tracking de mensajes
RUST_LOG=winsibot_session_api=info
```

> **Generar clave segura:** `openssl rand -hex 32`

### Variables avanzadas

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PREFIX` | `"!,.,#,/"` | Prefijos de comandos |
| `WEBHOOK_PORT` | `4001` | Puerto del webhook receiver |
| `SESSION_API_URL` | `http://127.0.0.1:3001` | URL de la Session API de Rust |
| `REDIS_URL` | `redis://localhost:6379` | Conexión a Redis |
| `NODE_ENV` | `production` | Modo de ejecución |

---

## Ejecutar el bot

### Todo en uno (recomendado para producción)

```bash
npm run start:all
```

Lanza en paralelo:
- Rust Session API (`:3001`)
- Python Monitor (que a su vez lanza Node.js + FastAPI + Celery + PHP)

### Por partes (para desarrollo)

```bash
npm run rust:start    # Solo Session API de Rust
npm run monitor       # Monitor Python + Node.js + servicios
npm run dev           # Solo Node.js (bypass del monitor, muestra QR directo)
```

### Para escanear QR nuevo

```bash
npm run manage:reset-qr
# o directamente:
npm run dev
```

### Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run start:all` | Inicia todo en paralelo |
| `npm run monitor` | Monitor Python con auto-restart |
| `npm run dev` | Node.js directo (desarrollo / QR) |
| `npm run rust:start` | Session API de Rust |
| `npm run rust:build` | Compilar Rust en modo release |
| `npm run manage` | CLI de mantenimiento (menú) |
| `npm run manage:status` | Estado de servicios |
| `npm run manage:diagnose` | Diagnóstico profundo |
| `npm run manage:repair` | Reparación automática |
| `npm run manage:reset-signal` | Limpiar sesiones Signal (Bad MAC) |
| `npm run manage:reset-qr` | Reset completo + nuevo QR |
| `npm run manage:backup` | Forzar backup de sesión |
| `npm run manage:restore` | Restaurar desde backup |
| `npm run manage:logs` | Ver logs recientes |
| `npm run build` | Compilar TypeScript a JS |

---

## Comandos del bot

El bot tiene **45+ comandos** en categorías: admin, IA, descargas, stickers, música, info, sub-bots y más.

→ **[Ver referencia completa de comandos](docs/commands.md)**

---

## CLI de mantenimiento

```bash
npm run manage
```

Menú interactivo multi-servicio que orquesta Python, Rust y Node.

| Opción | Comando npm | Descripción |
|--------|-------------|-------------|
| 1 | `manage:status` | Tabla de estado: FastAPI / Rust / Webhook / PHP |
| 2 | `manage:diagnose` | Analiza sesión, archivos Signal, Rust, logs, breaks |
| 3 | `manage:repair` | Limpia Signal → recupera creds → restaura backup |
| 4 | `manage:reset-signal` | Borra solo `session-*.json` (mantiene `creds.json`) |
| 5 | `manage:reset-qr` | Elimina sesión completa y lanza Node para nuevo QR |
| 6 | `manage:backup` | Crea backup verificado con checksums SHA-256 |
| 7 | `manage:restore` | Muestra tabla de backups para elegir y restaurar |
| 8 | `manage:logs` | Últimos 30 eventos del session log |

### Cuándo usar cada opción

- **Bot sin respuesta (messages no aparecen):** → opción 4 `reset-signal`
- **"Bad MAC" en terminal repetidamente:** → opción 4 `reset-signal`
- **Sesión expirada / loggedOut:** → opción 5 `reset-qr`
- **Error de creds.json corrupto:** → opción 3 `repair`
- **Antes de apagar el servidor:** → opción 6 `backup`
- **Después de actualizar:** → opción 2 `diagnose`

---

## API Webhook

El webhook receiver escucha en `http://127.0.0.1:4001` y permite controlar el bot desde servicios externos.

### Autenticación

Todas las peticiones deben incluir el header `x-webhook-signature` con la firma HMAC-SHA256 del body usando el `WEBHOOK_SECRET` del `.env`.

```bash
# Calcular firma (Python)
import hmac, hashlib
sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
headers = {"x-webhook-signature": f"sha256={sig}"}
```

### Endpoints

#### `GET /health`
Verificar si el bot está conectado.
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
  "jids": ["51111111111@s.whatsapp.net", "51222222222@s.whatsapp.net"],
  "text": "Mensaje masivo"
}
```
> El broadcast usa el rate limiter automáticamente para no violar los límites de WhatsApp.

#### `POST /webhook` — Ejecutar job
```json
{
  "event": "run_job",
  "jobId": "nombre_del_job"
}
```

#### `POST /webhook` — Ping
```json
{ "event": "ping" }
```
Respuesta: `{ "ok": true, "msg": "pong" }`

### Códigos de respuesta

| Código | Significado |
|--------|-------------|
| 200 | Éxito |
| 400 | Body inválido o campo faltante |
| 401 | Firma HMAC inválida |
| 413 | Body demasiado grande (>64 KB) |
| 422 | Socket no disponible |
| 429 | Rate limit excedido (1 req/s por IP) |
| 500 | Error interno |

---

## Monitoreo y salud

### Session API de Rust (`:3001`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /health` | Estado general + sesiones activas |
| `GET /health/live` | Liveness (para Docker/K8s) |
| `GET /health/ready` | Readiness |
| `GET /messages/stats?hours=24` | Tasa de delivery en las últimas 24h |
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

Si `delivery_pct` baja de 80%, hay problemas de entrega que generalmente se resuelven con `npm run manage:repair`.

---

## Solución de problemas

### El bot no responde a mensajes

1. Verifica que está conectado: `npm run manage:status`
2. Revisa si hay errores Bad MAC en la terminal
3. Ejecuta: `npm run manage:reset-signal`
4. Si persiste: `npm run manage:repair`

### Aparece "Bad MAC" continuamente

Las sesiones Signal están corruptas. Solución automática:
```bash
npm run manage:reset-signal
```
El bot detecta este problema automáticamente (8 Bad MACs en 60s) y se auto-repara.

### Error "auth dir missing" o "creds.json corrupt"

```bash
npm run manage:repair
# Si no hay backup disponible:
npm run manage:reset-qr
```

### El bot se reinicia cada hora

Revisar `HANG_TIMEOUT` en `python/terminal/monitor.py`. El valor por defecto es 15 minutos. Si el bot está en muchos grupos activos, es normal no tener output por períodos cortos.

### La sesión se restaura sola al reiniciar (no quiero QR)

El monitor Python detecta que `auth/` no existe y restaura el último backup automáticamente. Esto es el comportamiento esperado. Si quieres forzar un QR nuevo, usa `npm run manage:reset-qr` que también elimina los backups.

### Error 440 — "Expulsado por otra instancia"

Significa que WhatsApp Web está abierto en el navegador con el mismo número. Cierra todas las sesiones de WhatsApp Web y espera 60 segundos. El bot se reconectará solo.

### `npm run rust:build` falla

Asegúrate de tener Rust instalado:
```bash
rustup update stable
```
En Windows, también necesitas las herramientas de compilación de Visual Studio (MSVC).

---

## Preguntas frecuentes

**¿Puedo usar este bot con múltiples números?**
Sí, mediante el sistema JadiBot (`!jadibot`). Cada sub-bot tiene su propia sesión independiente.

**¿Es seguro usar la API no oficial de WhatsApp?**
Baileys implementa el protocolo oficial de WhatsApp Web. Sin embargo, WhatsApp no autoriza oficialmente bots de terceros. El bot incluye rate limiting para minimizar el riesgo de ban.

**¿Cuántos grupos puede manejar?**
Se ha probado con 443+ grupos simultáneamente sin problemas de rendimiento. El store no cachea mensajes de grupos (solo metadatos de contactos) para mantener el uso de memoria bajo.

**¿Cada cuánto hacer backup?**
El monitor hace backup automático al iniciar (si la sesión es válida) y al recibir señal de cierre. Puedes forzarlo con `npm run manage:backup`. Se mantienen los últimos 5 backups.

**¿Qué pasa si el servidor se apaga abruptamente?**
La Session API de Rust usa escritura atómica (tmp → rename), por lo que `creds.json` nunca queda en estado parcialmente escrito. Al reiniciar, el monitor verifica la integridad y restaura automáticamente si es necesario.

**¿Funciona con cuentas de WhatsApp Business?**
Sí. El tracking de delivery también funciona con Business. Sin embargo, algunas funciones como catálogos o botones de la API oficial no están disponibles.

---

## Seguridad

- La carpeta `auth/` contiene las claves privadas criptográficas de tu cuenta de WhatsApp. **Nunca la incluyas en commits de git** (está en `.gitignore`).
- Usa claves API largas y aleatorias (`openssl rand -hex 32`).
- El webhook receiver solo escucha en `127.0.0.1` por defecto, no expuesto a internet.
- Todas las rutas protegidas de la Session API requieren API key.
- El webhook valida firma HMAC-SHA256 en cada petición.
- Los backups de sesión incluyen verificación de checksums SHA-256.

---

## Estructura del proyecto

```
WinsiBot/
├── src/                          # TypeScript — bot principal
│   ├── config.ts                 # Configuración global
│   ├── index.ts                  # Entry point
│   ├── core/
│   │   ├── socket.ts             # Conexión WebSocket a WhatsApp
│   │   ├── handler.ts            # Dispatcher de mensajes → comandos
│   │   ├── store.ts              # Cache de contactos/chats (con escritura atómica)
│   │   └── events.ts             # XP, spam, configuración de grupo
│   ├── lib/
│   │   ├── rateLimiter.ts        # Token bucket rate limiter
│   │   ├── media_sender.ts       # safeSend / enqueueSend / broadcastSend
│   │   ├── session.ts            # Cliente de la Session API de Rust
│   │   └── pythonBridge.ts       # Comunicación con FastAPI
│   └── plugins/
│       ├── commands/             # 45+ comandos por categoría
│       ├── middlewares/          # Auth, anti-spam, permisos
│       ├── scheduler/            # Jobs programados (cron)
│       └── webhooks/             # Receiver HTTP
├── python/                       # Python — servicios
│   ├── api/                      # FastAPI + Celery
│   ├── ai/                       # IA, break detector, health monitor, AI brain
│   ├── session/                  # Backup/restore/checksum de sesión
│   └── terminal/
│       ├── monitor.py            # Watchdog principal
│       └── manage.py             # CLI de mantenimiento
├── rust/                         # Rust — Session API
│   └── src/
│       ├── main.rs               # Entry point Axum
│       ├── routes.rs             # Todos los handlers HTTP
│       ├── db.rs                 # SQLite delivery tracker
│       ├── atomic.rs             # Escritura atómica de archivos
│       └── snapshot.rs           # Snapshots rotativos (x5)
├── php/                          # Panel web opcional
├── .env.example                  # Plantilla de configuración
└── rust/.env.example             # Plantilla de Rust
```

---

## Licencia

GPL-3.0-or-later — ver [LICENSE](LICENSE)

**Desarrollado por Hepein Oficial / [Brashkie](https://github.com/Brashkie)**
