<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6C63FF,100:00C9FF&height=180&section=header&text=WinsiBot&fontSize=62&fontColor=ffffff&fontAlignY=38&desc=v8.10.0%20%E2%80%94%20Enterprise%20WhatsApp%20Bot&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/Version-8.10.0-6C63FF?style=flat-square)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS%20%7C%20Android-lightgrey?style=flat-square)](https://github.com/Brashkie/WinsiBot)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Brashkie/WinsiBot/pulls)

<br/>

> Bot de WhatsApp de alto rendimiento con arquitectura multi-lenguaje de tres capas.<br/>
> Sin límite artificial de grupos, pensado para miles de mensajes por hora y múltiples instancias.<br/>
> v8.10.0 — Versión de fiabilidad. Garantías nuevas contra perder y duplicar operaciones: idempotencia de mensajes (Baileys los re-entrega en cada reconexión, así que un `#daily` podía ejecutarse dos veces), outbox con dead-letter para los comandos de economía, circuit breakers, load shedding por lag del event loop y una suite de chaos testing. El **embudo de salida** pasa de cubrir el 38% de los envíos al 100% — 524 llamadas esquivaban el rate limiter — y se corrige un fallo por el que el retraso mínimo entre mensajes dejaba de aplicarse justo en las ráfagas. Y mucha menos superficie: fuera DuckDB, fuera Redis y Celery, y Python de 16 routers a 7, de 59 archivos a 37 y de 16 dependencias a 9, sin una sola llamada HTTP por mensaje.

<br/>

**[🇺🇸 English version →](README.en.md)** &nbsp;·&nbsp; **[📖 Comandos →](docs/commands.md)** &nbsp;·&nbsp; **[💰 Guía de economía →](docs/economy.md)** &nbsp;·&nbsp; **[📜 Historial de versiones →](CHANGELOG.md)** &nbsp;·&nbsp; **[🐛 Reportar bug](https://github.com/Brashkie/WinsiBot/issues)**

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
| 🐍 **Services** | Python / FastAPI | IA avanzada (Ollama + GPT + Claude + Gemini), watchdog, health checks |
| ⚙️ **Session** | Rust / Axum | Escritura atómica de creds, 10 snapshots rotativos, tracker Bad MAC, rate limiter, delivery SQLite |

### Novedades en v8.10.0

| Área | Cambio |
|------|--------|
| **Outbox: los mensajes de operaciones críticas ya no se pierden en un crash** | Si el bot descontaba dinero y moría antes de mandar la confirmación, quedaba el estado cambiado y el usuario sin respuesta. La tabla `outbox` de Rust existía pero era un medidor de entregas: registraba **después** de enviar y **sin contenido**, así que no había nada que reenviar. Ahora `sendCritical()` encola → envía → marca enviado, y al arrancar `replayOutbox()` reenvía lo que quedó a medias. Con dead-letter: lo que falla 3 veces sale del reintento pero queda en la base para inspeccionarlo |
| **Embudo de salida (38% → 100%)** | 524 de 850 envíos esquivaban el rate limiter, y el límite **por chat** casi nunca se aplicaba. Ahora `sendMessage` se envuelve una vez al crear el socket: todo pasa por el limitador, también en los sub-bots y también el código que se escriba mañana |
| **Fix: el retraso mínimo fallaba en ráfagas** | Con envíos concurrentes, dos mensajes salían en el mismo milisegundo pese al mínimo de 300 ms — protegía en reposo y no cuando importaba. Medido: 0 ms antes, 298 ms ahora |
| **Python: de 59 archivos a 37** | Fuera el reentrenamiento de modelos (`/ml/train`), que el bot nunca llamó y que leía un dataset ya congelado; con él se van `polars` y 4 módulos. De los 8 endpoints de `ml` el bot solo usaba dos. **11.425 líneas → 9.506** y **16 dependencias → 9** |
| **Python: 6 dependencias menos** | `flask`, `flask-cors`, `pandas`, `openai`, `python-dotenv` y `gunicorn` no tenían un solo import. De 16 a 10. Y `data/database.py` declaraba 9 tablas que no usaba nadie: de 200 a 65 líneas |
| **Logs con historia útil** | Rust rotaba cada minuto guardando 20 archivos: solo quedaban 20 minutos de historia. Ahora es diaria con 14 días. El volumen nunca fue el problema — los 20 archivos sumaban 4 KB |
| **Estadísticas sin Python** | Cada mensaje costaba **dos** llamadas HTTP a Python para escribir una fila que solo se usaba para contarla. Ahora es un `++` en memoria (95 ns) que se vuelca a Rust una vez por minuto. Y el top de comandos **funciona por primera vez**: leía un `.parquet` que nadie escribía |
| **`/pending` eliminado** | Se escribía un registro por cada mensaje para que al arrancar se contaran, se leyeran y se marcaran como procesados — sin usarlos. Un contador decorativo que costaba una llamada HTTP por mensaje |
| **Fix: `#warn` contaba en el store equivocado** | Las advertencias se guardaban en Python mientras `UserData` de TS ya tenía `warns` sin usar. Mismo patrón que el bug de `#ban` de la 8.7.0 |
| **`fast/process` eliminado** | Se llamaba en CADA mensaje (hasta 500 ms de espera) para obtener `is_owner` — que TS ya calcula síncrono y con más cobertura — y `allowed`, un tercer rate limit. Era trabajo duplicado, no algo que migrar |
| **Benchmarks con Criterion** | `npm run rust:bench`. El camino caliente medido en serio: `check` 145-245 ns según carga, `spam_check` 129-138 ns, y un mensaje de 4 KB cuesta igual que uno corto. Contra los 1-3 **ms** del round-trip HTTP eliminado |
| **SpamGuard de Python a Rust** | Cada comando hacía **dos** round-trips HTTP para casi la misma pregunta: `/rate/check` a Rust y `/spam/check` a Python (que envolvía una librería C con `ctypes`). La lógica — ventana deslizante, bloqueo progresivo y texto repetido — vive ahora en `rate_limiter.rs`, con el mismo contrato. Python sale del camino crítico de cada comando |
| **Chaos testing (`npm run chaos`)** | 27 comprobaciones en 8 escenarios que rompen cosas de verdad contra el código compilado: tormentas de re-entregas, reinicio a mitad, logs corruptos, dependencias caídas, el event loop bloqueado 1.8s y un crash entre cobrar y confirmar. Sirve para pasar de "creo que aguanta" a "probamos sus modos de fallo" |
| **Load shedding** | Con el bot saturado, en vez de intentar procesar todo hasta morir se sacrifica lo prescindible: DEGRADADO tira IA/descargas/música/NSFW, CRÍTICO tira también el juego. Moderación, admin y owner nunca caen. La señal es el **lag del event loop** — lo único que detecta la saturación de Node cuando CPU y RAM se ven normales |
| **Circuit breakers** | Con Python o Rust caídas, cada mensaje pagaba el timeout completo antes de fallar igual — las dos están en el camino crítico. Ahora tras N fallos el circuito se abre y falla al instante: de **242 ms a 0.01 ms** por llamada. Un 429 de `/rate/check` (bloqueo intencional) no cuenta como fallo: lo que se mide es si el servicio contesta |
| **Aplicado a 9 comandos** | Transferencias (`pay`, `transfer`, `rob`), recompensas de cooldown largo (`daily`, `weekly`, `monthly`) y apuestas resueltas (`coinflip`, `roulette`, `invest`). Los otros 21 comandos con economía se dejaron igual a propósito: cooldowns cortos o cambios verificables con `#bal`. De paso, `transfer` y `rob` enviaban esquivando el rate limiter |
| **Fix: el mismo mensaje podía ejecutarse dos veces** | `socket.ts` acepta `type === 'append'` (re-entregas post-sync, ventana de 5 min) y el buffer de eventos de Baileys se activa en **cada** reconexión — habituales por Bad MAC. No había ninguna protección por id de mensaje: un `#daily` seguido de una reconexión dentro de esos 5 minutos se ejecutaba dos veces. Nuevo `core/dedup.ts`, con el registro **en disco** (un `Set` en memoria se pierde justo en el caso del reinicio) y separado **por instancia**, porque los ids son globales de WhatsApp y un mensaje de grupo llega al bot principal y a cada sub-bot |
| **DuckDB eliminado** | Era la razón de que la primera compilación de Rust tardara 10–30 min — y con MSVC 14.51 ya ni terminaba. Solo lo usaban un contador de Bad MAC y un log de conversaciones, que caben en `rusqlite` (ya estaba en el proyecto). `cargo check` pasó de **fallar** a 15 s, y un build de release limpio a **3 m 19 s**. Se va también `rust/build.rs`, que existía solo para él |
| **Fix: el respaldo de credenciales perdía su última escritura** | `sessionClient.save()` tiene un debounce de 5 s y su doc decía "llamá a `flushNow()` antes de salir" — pero no lo llamaba nadie. El respaldo en Rust quedaba hasta 5 s por detrás del disco, justo el que se usa para recuperar cuando la sesión está corrupta. Conectado al apagado, antes de matar el proceso de Rust y con techo de 2 s |
| **Código muerto: 9 rutas de Rust** | `/ai/export`, `/badmac/export`, `/badmac/reset`, `/badmac/stats`, `/rate/stats`, `/audit`, `/snapshots`, `/messages/stats`, `/messages/cleanup` — ninguna con un solo llamador. Con sus handlers, structs y helpers. **Rust compila sin un solo warning** |
| **Código muerto: Python y TypeScript** | Fuera `routers/groups.py`, `ratelimit.py` y `cache.py`, y 5 métodos sin uso de `lib/session.ts` (de 352 a 306 líneas) |
| **Un motor de persistencia menos** | De 6 a 5: strenor, JSON, rusqlite, SQLAlchemy y Parquet |

**[📜 Ver el historial completo de versiones →](CHANGELOG.md)**

---

## Stack técnico

<div align="center">

| Área | Tecnología | Propósito |
|------|-----------|-----------|
| Runtime | Node.js 20 LTS | Loop de eventos WhatsApp |
| Lenguaje | TypeScript 5.x | Tipado estricto end-to-end |
| WhatsApp | Baileys 6.x | Protocolo WA Web multi-device |
| Servicios | Python 3.11 + FastAPI | IA, watchdog, backup |
| Session Store | Rust + Axum + SQLite | Creds atómicas + delivery tracking |
| Criptografía | `@brashkie/signalis-core` | Curve25519 / Ed25519 / HKDF / AES-GCM (Rust NAPI) |
| Persistencia — usuarios | `strenor` (Rust NAPI) | `data/users.aof`, log de deltas: solo se escribe el usuario que cambió |
| Persistencia — resto | JSON en `data/` (`core/persistence.ts`) | groupConfigs, clanes, inventario — se reescriben solo si cambian |
| KV embebido | `strenor` (Rust NAPI) | Sesiones del panel web, con TTL real |
| Panel web | React + Vite + Tailwind + TanStack | Dashboard en tiempo real — admin y self-service de sub-bots/grupos |

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
- Sin límite artificial de grupos, sin degradación de rendimiento
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
- Curva de niveles no-exponencial — alcanzable hasta nivel 400
- Rachas diarias con bono progresivo (`#daily`, ×1.00–×1.20+)
- Moneda propia (BrasCoins) + banco
- **BrasEmbers**: moneda escasa que gatea el uso de comandos NSFW (`#ascuas`)
- **Negocios**: 6 negocios comprables con ingreso pasivo por hora (`#business`/`#collect`)
- Gacha (rollwaifu / pokédex / marvel / anime) + colección (`#harem`)
- **Clanes avanzados**: territorios, guerras 24h, alianzas, tesorería
- Misiones: trabajo, minería, cofre, crimen, robo
- **Sistema de regalos**: catálogo 30+ items, buzón, wishlist, trueques
- **Arena PvP**: ELO, 9 divisiones, apuestas, 5 acciones de combate
- **Dragon City**: 579 dragones reales, huevos, evolución con video, Oro pasivo
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
- Panel web en tiempo real (React) — admin y self-service de sub-bots/grupos
- **Mensajes interactivos**: botones nativos, listas, carrusel, álbum, sylph
- **Respuesta automática de botones**: handler intercepta `interactiveResponseMessage`

</td>
</tr>
</table>

---

## Arquitectura

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           WinsiBot v8.10.0                                   ║
╠════════════════════╦═══════════════════════╦═══════════════════════════════╣
║   TypeScript        ║       Python           ║           Rust                ║
║   Node.js :4001     ║                        ║                               ║
║                     ║  ┌──────────────────┐  ║  ┌───────────────────────┐   ║
║  ┌───────────────┐  ║  │  FastAPI :5000   │  ║  │  Session API :3001    │   ║
║  │  Baileys WS   │  ║  ├──────────────────┤  ║  │                       │   ║
║  ├───────────────┤  ║  │  ML: spam/intent │  ║  │  ● atomic write       │   ║
║  │   Handler     │◄─╬─►│  Ollama client   │  ║  │  ● snapshots ×10      │   ║
║  │  (semáforo)   │  ║  │  GPT/Claude/     │  ║  │  ● bad_mac tracker    │   ║
║  ├───────────────┤  ║  │  Gemini fallback │  ║  │  ● rate_limiter       │   ║
║  │  125+ Cmds    │  ║  ├──────────────────┤  ║  │  ● watchdog heartbeat │   ║
║  ├───────────────┤  ║  │  Monitor         │  ║  │  ● delivery SQLite    │   ║
║  │  persistence  │  ║  │  Watchdog        │  ║  │  ● /sessions/backup   │   ║
║  │  (strenor)    │  ║  └──────────────────┘  ║  └───────────────────────┘   ║
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
| Ollama | latest | ❌ | IA local (recomendado, 16 GB RAM+) |
| FFmpeg | 6.x | ❌ | conversión de media |

**Sistemas operativos soportados:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+ · macOS 12+ · Android (Termux)

> **Nota de plataforma:** en Termux/Android y en Linux/macOS sin GUI, Ollama es opcional igual que en Windows — el bot degrada bien sin ellos. `npm run cython:build` y `npm run spam:build` ya detectan el compilador C disponible (`gcc`/`clang`) en cualquiera de los tres sistemas. El panel web (`web/`) usa el mismo Node.js ya requerido — no suma una herramienta nueva, solo un `npm install && npm run build` aparte (ver sección Instalación).
>
> **Dos cosas a tener en cuenta en dispositivos débiles (Termux/Android, ARM de placa única):**
>
> - Algunas dependencias nativas de Node (`sharp`, `cbor-x`) no traen binario precompilado para Android — `npm install` las compila desde código fuente, así que necesitás un compilador C/C++ instalado *antes* de correrlo (ver sección Termux más abajo).
> - La primera compilación de Rust (`npm run rust:build`) tarda unos minutos (~3 min en un PC de escritorio; bastante más en un teléfono) porque compila todo el árbol de dependencias con LTO. Es normal — no cierres la terminal, solo dale tiempo (y evitá que el dispositivo se duerma).

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

# 5 — Compilar el panel web (opcional — el bot arranca igual sin esto,
#     el panel muestra un aviso hasta que corras este paso)
cd web
npm install
npm run build
cd ..

# 6 — Variables de entorno
# Windows
copy .env.example .env
copy rust\.env.example rust\.env
# Linux / macOS
# cp .env.example .env && cp rust/.env.example rust/.env

# 7 — Editar .env con tus valores (ver sección Configuración)

# 8 — Iniciar todo
npm run start
```

> **Primera vez:** Si no hay sesión guardada, aparecerá un **código QR** en la terminal.  
> Escanéalo desde WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo.

---

### Instalación en Termux (Android)

Los mismos 8 pasos de arriba funcionan en Termux — esta sección solo cubre lo que es específico de Android: qué instalar antes, y cómo mantener el bot corriendo cuando cerrás la app.

> Instalá Termux desde **F-Droid**, no desde Play Store — la versión de Play Store está descontinuada y desactualizada.

```bash
# 0 — Paquetes del sistema (una sola vez)
pkg update && pkg upgrade -y
pkg install -y nodejs-lts python rust git clang make pkg-config openssl-tool tmux

# Opcional — solo si el bot va a leer/escribir en el almacenamiento compartido
# del teléfono (fuera de su propia carpeta de datos):
termux-setup-storage
```

Con eso instalado, seguí los 8 pasos de la sección [Instalación](#instalación) de arriba sin cambios — Termux entra por la rama "Linux / macOS" en los pasos 3 y 6.

**Dos cosas que van a pasar y son normales:**

- En el paso 2 (`npm install`), algunas dependencias nativas van a compilar desde código fuente (Android no tiene binario precompilado para ellas) — por eso `clang`/`make`/`pkg-config` van primero en el paso 0. Si `npm install` falla mencionando `node-gyp` o un compilador no encontrado, es señal de que falta alguno de esos paquetes.
- En el paso 4 (`npm run rust:build`), la primera compilación tarda unos minutos (~3 min en un PC; más en un teléfono) porque compila todas las dependencias con LTO. Dejalo corriendo y no cierres la sesión de Termux.

**Mantener el bot corriendo en segundo plano:**

- `termux-wake-lock` antes de iniciar el bot evita que Android mate el proceso al apagar la pantalla (`termux-wake-unlock` para liberarlo después).
- Corré el bot dentro de una sesión de `tmux` (`tmux new -s winsibot`, después `npm run start`) para que el proceso siga vivo aunque cierres la app de Termux — reconectá con `tmux attach -t winsibot`.
- Para autoarranque al reiniciar el teléfono, instalá el complemento **Termux:Boot** (F-Droid) y agregá un script en `~/.termux/boot/`.

> **RAM:** Ollama (IA local) generalmente no es viable en un teléfono común — usá las APIs cloud (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`) en su lugar, el bot cae a ellas automáticamente si Ollama no responde.

---

## Configuración

### `.env` — Variables principales

```env
# ─── Bot ──────────────────────────────────────────────────────────────────────
PREFIX="!,.,#,/"                        # Prefijos que activan comandos
BOT_NAME=WinsiBot                        # Nombre del bot
OWNER_JID=51999999999@s.whatsapp.net     # Tu número (código de país, sin +)
SESSION_PATH=./auth                      # Carpeta de sesión de WhatsApp
NEWSLETTER_JID=                          # Opcional — tu canal de WhatsApp, para el "Ver canal" del menú
MAX_CONTACTS=20000                       # Máximo de contactos en caché antes de rotar los más antiguos
NODE_ENV=production                      # development | production
LOG_LEVEL=info                           # silent | info | debug | error

# ─── IA — todos opcionales, el bot funciona con cualquier subconjunto ──────────
OPENAI_API_KEY=sk-...                    # GPT-4o-mini / DALL-E 3
ANTHROPIC_API_KEY=sk-ant-...             # Claude Haiku
GEMINI_API_KEY=AIza...                   # Gemini 1.5 Flash
OLLAMA_URL=http://localhost:11434        # Ollama local (puerto por defecto)
OLLAMA_MODEL=llama3.2:3b                 # Modelo a usar con Ollama

# ─── Session API (Rust) ───────────────────────────────────────────────────────
SESSION_API_URL=http://127.0.0.1:3001
SESSION_API_KEY=                         # openssl rand -hex 32

# ─── Webhook ──────────────────────────────────────────────────────────────────
WEBHOOK_PORT=4001
WEBHOOK_SECRET=                          # openssl rand -hex 32

# ─── Servicios Python ─────────────────────────────────────────────────────────
PYTHON_API_URL=http://localhost:5000
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
| `NEWSLETTER_JID` | — | Canal propio para el "Ver canal" del menú (opcional) |
| `MAX_CONTACTS` | `20000` | Contactos en caché antes de rotar los más antiguos |
| `WEBHOOK_PORT` | `4001` | Puerto del receiver HTTP |
| `SESSION_API_URL` | `http://127.0.0.1:3001` | URL de la Session API Rust |
| `NODE_ENV` | `production` | Modo de ejecución |
| `LOG_LEVEL` | `info` | Nivel de logs Pino |
| `OPENAI_API_KEY` | — | GPT / DALL-E (opcional) |
| `ANTHROPIC_API_KEY` | — | Claude (opcional) |
| `GEMINI_API_KEY` | — | Gemini (opcional) |
| `OLLAMA_URL` | `http://localhost:11434` | Endpoint local de Ollama (opcional) |
| `OLLAMA_MODEL` | `llama3.2:3b` | Nombre del modelo Ollama |

</details>

---

## Ejecutar el bot

### Todo en uno *(recomendado)*

```bash
npm run start
```

Compila e inicia el bot **detrás de un supervisor liviano** (`src/supervisor.ts`)
que lo reinicia solo si crashea o si se cuelga sin heartbeat. El bot, a su vez,
levanta sus propias dependencias (Rust Session API, Python/FastAPI)
si no están corriendo ya, y cada una se reinicia sola si crashea — cada una con
su propio indicador de estado, y un solo Ctrl+C para apagar todo junto.

### Por componentes *(para desarrollo)*

```bash
npm run rust:start      # Solo Session API Rust, de forma aislada
npm run dev             # Solo Node.js sin compilar — desarrollo rápido / escanear QR
npm run monitor         # Monitor Python con auto-restart y dashboard
```

<details>
<summary>Ver todos los scripts npm</summary>

| Script | Descripción |
|--------|-------------|
| `start` | Compila e inicia el bot **vía supervisor** — reinicia solo si crashea o se cuelga, y levanta Rust/Python por su cuenta (cada uno con su propio auto-restart) |
| `start:unsupervised` | Igual que `start` pero sin la capa de supervisor — arranca `dist/index.js` directo |
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
| `chaos` | Provoca fallos a propósito y verifica que el bot aguanta (`npm run chaos dedup` filtra por escenario) |
| `users:export` | Exportar el padrón de usuarios a un JSON legible |
| `users:import` | Restaurar el padrón desde un JSON (con el bot parado) |
| `users:stats` | Cuántos usuarios hay y cuánto ocupa el log |
| `typecheck` | Verificar tipos sin compilar |
| `lint` / `lint:fix` | Biome — linter de `src/`/`scripts/` (revisa / revisa y corrige lo seguro) |
| `format` / `format:fix` | Biome — formateo de `src/`/`scripts/` (solo mostrar diff / escribir) |
| `check` / `check:fix` | Biome — lint + formato + orden de imports en un solo paso |
| `rust:lint` | `cargo clippy` sobre la Session API de Rust |
| `rust:bench` | Benchmarks de Criterion sobre el camino caliente (informes HTML en `rust/target/criterion/`) |
| `py:lint` / `py:lint:fix` | Ruff — linter de `python/` (requiere `pip install -r python/requirements-dev.txt`) |
| `py:format` | Ruff — formateo de `python/` |
| `lint:all` | Corre `lint` + `rust:lint` + `py:lint` de una |
| `test` | Vitest |

</details>

---

## Comandos

El bot tiene **125+ comandos** en **19 categorías**.

→ **[📖 Ver referencia completa de comandos](docs/commands.md)**

<details>
<summary>Resumen de categorías</summary>

| Categoría | Comandos destacados | Descripción |
|-----------|--------------------|----|
| 🤖 IA | `!gpt` `!claude` `!imagine` `!translate` | Chat multi-modelo, imágenes, traducciones |
| 💰 RPG | `!work` `!daily` `!perfil` `!rw` `!clan` `!prestige` `!harem` `!leveltop` | Economía, gacha, niveles (racha en daily), clanes, prestige |
| 🎮 Juegos | `!arena` `!quiz` `!adivinar` `!pet` | PvP Arena, Quiz coding, Draw & Guess, dragones |
| 🎁 Social | `!regalo` | Sistema de regalos, buzón, wishlist, trueques |
| 🛡️ Admin | `!ban` `!kick` `!antilink` `!warn` | Moderación de grupos |
| 👑 Owner | `!exec` `!broadcast` `!premium` `!boost` | Control total del bot |
| ⬇️ Descargas | `!yt` `!ytmp4` `!tiktok` `!ttsearch` `!ig` `!spotify` `!apk` | Descargadores multimedia + búsqueda con carrusel |
| 🎨 Stickers | `!sticker` `!toimg` `!emojimix` `!stickerpack` | Creación, conversión y packs completos |
| 🎮 Fun | `!meme` `!sega` `!giphy` `!top` | Entretenimiento |
| 💞 Roleplay | `!hug` `!kiss` `!pat` `!kill` `!punch` `!laugh` `!sad` `!sleep` | GIFs de anime interactivos |
| 🎵 Música | `!play` `!lyrics` `!spotify` | Audio y letras |
| 🌐 Media | `!anime` `!removebg` `!wimage` | Imágenes de anime, fondo, personajes |
| 🔧 Util | `!clima` `!imagen` | Clima, generación de imágenes |
| ℹ️ Info | `!ping` `!creator` `!infobot` `!menu` | Información del bot |
| 🤝 Jadibot | `!jadibot` `!stopbot` | Sub-bots vinculados |
| 🔞 NSFW | `!porngif` `!rule34` `!sexyimg` `!stickerporn` | Solo grupos con NSFW activo |

</details>

---

## CLI de mantenimiento

```bash
npm run manage
```

Menú interactivo multi-servicio que orquesta Python, Rust y Node.js.

| Opción | Comando | Cuándo usarlo |
|:------:|---------|---------------|
| 1 | `manage:status` | Ver estado de FastAPI / Rust / Webhook / Panel web |
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
| `GET /messages/pending?minutes=5` | Mensajes sin confirmar entrega |
| `GET /watchdog/status` | Heartbeat de Node.js — 503 si Node murió |
| `GET /sessions/backup?sessionId=main` | Mejor backup disponible (restauración sin QR) |

### Mensajes sin confirmar entrega

```bash
curl -H "x-api-key: TU_CLAVE" http://127.0.0.1:3001/messages/pending
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
| `GET` | `/healthy` | Salud de sesión + detección de corrupción |
| `GET` | `/sessions` | Listar IDs de sesión activos |
| `POST` | `/sessions/signal/clear` | Eliminar archivos Signal (fix Bad MAC) |
| `GET` | `/sessions/backup` | Devolver mejor creds válido para restauración sin QR |
| `POST` | `/badmac/report` | Reportar evento Bad MAC para un JID de grupo (cooldown escalonado) |
| `POST` | `/rate/check` | Verificar si un sender está dentro del rate limit |
| `POST` | `/spam/check` | Check combinado: frecuencia + texto repetido + bloqueo progresivo |
| `POST` | `/watchdog/ping` | Ping de heartbeat desde Node.js |
| `GET` | `/watchdog/status` | Vivo/muerto + tiempo último ping + conteo |
| `POST` | `/nlp/fast` | Detección NLP de palabras clave en Rust |
| `POST` | `/ai/learn` | Guardar turno de conversación IA (SQLite) |
| `GET` | `/ai/context/:sender` | Recuperar contexto de conversación |
| `POST` | `/messages/track` | Trackear IDs de mensajes salientes |
| `POST` | `/messages/ack` | Actualizar estado de entrega en lote |
| `GET` | `/messages/pending` | Mensajes sin confirmación de entrega |
| `POST` | `/outbox/enqueue` | Encolar un envío ANTES de mandarlo, con su contenido |
| `GET` | `/outbox/unsent` | Lo que quedó encolado sin salir — para reenviar al arrancar |
| `POST` | `/outbox/sent` | Marcar como enviado de verdad (libera el contenido) |
| `POST` | `/outbox/retry` | Sumar un reintento (dead-letter tras N intentos) |

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
│   ├── supervisor.ts                 # Reinicia el bot si crashea o se cuelga (watchdog externo)
│   ├── types/
│   │   └── index.d.ts                # Tipos globales (Command, UserData, etc.)
│   ├── core/
│   │   ├── socket.ts                 # Conexión WebSocket a WhatsApp
│   │   ├── handler.ts                # Dispatcher de mensajes → comandos (semáforo con espera acotada)
│   │   ├── dedup.ts                  # Descarta re-entregas del mismo mensaje (por instancia, sobrevive reinicios)
│   ├── loadShedding.ts           # Degrada por lag del event loop — nunca tira moderación ni admin
│   ├── botStats.ts               # Contadores en memoria, volcados a Rust cada minuto
│   ├── egress.ts                 # Embudo de salida — TODO sendMessage pasa por el rate limiter
│   │   ├── groupCache.ts             # Cache canónico de groupMetadata (TTL + debounce/coalescing)
│   │   ├── store.ts                  # Cache de contactos/chats (escritura atómica)
│   │   ├── persistence.ts            # Persistencia real (users/groups/inventory/clans.json, escritura atómica)
│   │   ├── lid_mapper.ts             # Resolución @lid ↔ número real
│   │   ├── logger.ts                 # Pino logger
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
│   │   ├── authStateCbor.ts          # Sesión de Baileys en CBOR (creds/keys) en vez de JSON
│   │   ├── authVerifier.ts           # Verificación Curve25519 + restauración sin QR
│   │   ├── db.ts                     # SQLite — KV genérico (sesiones del panel web)
│   │   ├── interactive.ts            # Mensajes interactivos: botones, listas, carrusel, álbum
│   │   ├── gift.ts                   # Sistema de regalos (30+ items, buzón, wishlist, trueques)
│   │   ├── pvp.ts                    # Arena PvP (ELO K=32, 9 divisiones, 5 acciones)
│   │   ├── quiz.ts                   # Quiz de programación (42 preguntas, 5 dificultades)
│   │   ├── drawguess.ts              # Draw & Guess (55 palabras, pistas, puntuación)
│   │   ├── leveling.ts               # Prestige (10 rangos), rachas, medallas, multiplicadores
│   │   ├── dragoncity.ts             # Dragon City (579 dragones, evolución, Oro pasivo)
│   │   ├── clan.ts                   # Clan extendido (territorios, guerras 24h, alianzas)
│   │   ├── downloader.ts             # yt-dlp wrapper (YouTube audio/video, TikTok, Instagram) — máx 3 concurrentes
│   │   ├── queue.ts                  # Cola genérica con concurrencia configurable (usada por downloader.ts)
│   │   ├── rule34.ts                 # Cliente de la API JSON de Rule34 (imágenes/videos por tag)
│   │   ├── circuitBreaker.ts             # Corta las llamadas a un servicio caído (closed/open/half-open)
│   ├── cacheManager.ts           # Cache genérico con TTL, stats hits/misses, eviction LFU
│   │   ├── media_sender.ts           # safeSend / enqueueSend / broadcastSend
│   │   ├── rateLimiter.ts            # Token bucket rate limiter (TypeScript)
│   │   ├── session.ts                # Cliente Session API de Rust
│   │   ├── sticker.ts                # Creación de stickers
│   │   ├── platform.ts               # Rutas/binarios por SO (Windows/Linux/macOS/Termux)
│   │   ├── jid_utils.ts              # Utilidades de JID
│   │   └── utils.ts                  # Helpers generales
│   ├── plugins/
│   │   ├── commands/                 # 190+ comandos organizados por categoría
│   │   ├── middlewares/              # Auth, anti-spam, cooldown, rate limit
│   │   ├── scheduler/                # Jobs programados (node-cron)
│   │   └── webhooks/                 # Receiver HTTP
│   └── dashboard/                    # Backend del panel web (Hono + WebSocket)
│       ├── server.ts                 # API + WS + estático de web/dist
│       ├── auth.ts                   # Login vinculando WhatsApp (#login <código>)
│       └── routes/                   # /api/subbots, /api/groups, /api/admin
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
├── rust/                             # Rust — Session API v5.1.0
│   └── src/
│       ├── main.rs                   # Entry point (Axum) — graceful shutdown + compresión gzip
│       ├── routes.rs                 # Handlers HTTP + AppState
│       ├── bad_mac.rs                # Tracker Bad MAC por grupo — sliding window log, cooldown escalonado, persistencia SQLite
│       ├── rate_limiter.rs           # Rate limiter por sender (15 msgs / 10s)
│       ├── watchdog.rs               # Heartbeat de Node.js — tracking de muerte/recuperación
│       ├── snapshot.rs               # 10 snapshots rotativos + read_best_valid()
│       ├── db.rs                     # SQLite delivery tracker + audit_log
│       ├── atomic.rs                 # Escritura atómica (tmp → fsync → rename)
│       ├── nlp.rs                    # NLP fast-path en Rust
│       ├── subbots.rs                # SubBot Manager — cuotas, estado, hot-reload de config
│       ├── metrics.rs                # Contadores atómicos (writes/reads/bytes/snapshots)
│       ├── tasks.rs                  # Tareas de fondo: auto-snapshot, limpieza periódica
│       ├── analytics.rs              # Dashboard agregado (GET /analytics)
│       └── alerts.rs                 # Webhooks Discord-compatibles en eventos del watchdog
├── web/                               # Panel web — React + Vite + Tailwind + TanStack
│   └── src/routes/                   # login, subbots, groups, admin (TanStack Router)
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

Desde v8.4.0 esto puede ser el **supervisor** (`src/supervisor.ts`) actuando como se espera: reinicia el bot si crashea (código de salida != 0) o si detecta, vía `GET /watchdog/status`, que el event loop se colgó sin heartbeat por un buen rato. Es intencional — así el bot se auto-recupera sin intervención manual.

Si el reinicio no parece justificado, revisa `HANG_TIMEOUT` en `python/terminal/monitor.py` (default 15 min) y el estado del watchdog con `GET /watchdog/status`. Para descartar que sea el supervisor, arranca sin él con `npm run start:unsupervised`.

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

No hay ningún límite artificial de grupos en el código. El rate limiter de Rust y el tracker Bad MAC por grupo usan estructuras `HashMap`/`DashMap` diseñadas para alta cardinalidad, con limpieza automática cada 5,000 llamadas — el techo real depende de los recursos (RAM/CPU) de la máquina donde corra el bot, no de un contador fijo.

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

No. `core/persistence.ts` guarda todo en `data/`: los usuarios en `users.aof` (log append-only de `strenor`, donde solo se escribe el usuario que cambió) y `groupConfigs`/clanes/inventario en JSON. Se carga automáticamente al iniciar. Para ver o respaldar el padrón de usuarios en formato legible: `npm run users:export`.

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
