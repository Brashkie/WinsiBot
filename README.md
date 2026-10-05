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

> Bot de WhatsApp de alto rendimiento con arquitectura multi-lenguaje de tres capas.<br/>
> Sin límite artificial de grupos, pensado para miles de mensajes por hora y múltiples instancias.<br/>
> v8.12.0 — **El bot deja de llamar a Python, y lo que queda de él se compila.** Los tres comandos de imagen están ahora en Rust: `#toanime` pasa de **3,7 GB de torch a un ONNX de 8 MB**, `#removebg` usa el mismo modelo con el crate `ort`, y `#upscale` es **Anime4K portado** — sin modelo que bajar y sin archivos temporales. Con ellos se fue la API de Python entera, que había quedado con un solo endpoint para decir que estaba viva. Instalar es **`npm install` y nada más**: el binario de la Session API se baja precompilado para la plataforma —6 targets, Termux incluido— con su SHA-256 verificado. **Nueve bugs reales** encontrados de camino, entre ellos que `npm run build` **nunca limpiaba `dist/`** y el bot servía **35 comandos con código sin fuente** —dos de ellos borrados siete versiones atrás— y que la **Session API no podía arrancar** siguiendo `.env.example`, con el panic invisible porque se lanza con `stdio: 'ignore'`.<br/>

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
| 🟦 **Core** | TypeScript / Node.js | Protocolo WhatsApp, dispatcher de comandos, RPG, economía, panel web |
| ⚙️ **Session + IA** | Rust / Axum | Creds atómicas y snapshots, tracker Bad MAC, rate limiter, clasificación de intenciones, personalidad y humor, reputación, perfiles de estilo, Ollama y APIs cloud, imágenes |
| 🐍 **Opcional** | Python | Solo el watchdog de consola y el CLI de mantenimiento, que se abren a mano. **El bot funciona sin esto y nadie lo arranca** |

### Novedades en v8.12.0

**El bot ya no llama a Python para nada, y lo que queda de él se compila.** La 8.11.0 lo bajó a 16 archivos pero dejó tres comandos que necesitaban un intérprete y una API entera para servirlos. Los tres están en Rust, la API no existe, y Python queda en 9 archivos que son solo herramienta de consola.

| Área | Cambio |
|------|--------|
| **Los tres comandos de imagen a Rust, y dos no necesitaban torch** | `#toanime` pasa de **3,7 GB de torch a un modelo ONNX de 8 MB**; `#removebg` usa el mismo `isnetis.onnx` de antes con el crate `ort`; y `#upscale` es **Anime4K portado** — no una red sino un algoritmo de cinco pasos, así que no baja ningún modelo y tarda **175 ms** contra los segundos que costaba escribiendo archivos temporales. Al migrarlos salió que **dos de los tres ni siquiera usaban torch**: `dghs-imgutils` ya corría con ONNX Runtime |
| **`npm install` y listo: binarios de Rust precompilados** | Compilar la Session API eran **~4 minutos** y pedía Rust instalado. Ahora `postinstall` baja el binario de la plataforma desde las releases y verifica su SHA-256, con un workflow que compila **6 targets** —Termux incluido, que tiene el suyo propio porque Android usa Bionic y no glibc—. Si no hay binario, lo dice en una línea y compilar sigue funcionando |
| **Python ya no está en el camino de ningún mensaje** | Lo último en irse fueron los tres comandos de imagen, y con ellos la API de Python entera: había quedado con **un solo endpoint**, `GET /health`, que solo consultaban `monitor.py` y `manage.py` para mostrar "FastAPI: online". Un servicio cuyo único trabajo era responder que estaba vivo |
| **Las herramientas de consola también se compilan** | `npm run tools:build` pasa `monitor` y `manage` por Nuitka y saca ejecutables que corren **sin Python instalado**, `rich` incluido — que es Python puro, 77 módulos y cero binarios nativos, así que no hay un `.so` suyo que bajar: hay que compilarlo. Medido: 16,0 y 16,1 MB, ~3 min cada uno con la caché de C caliente |
| **Fix grave: el bot ejecutaba código borrado** | `tsc` compila pero no limpia, y `loadCommands()` registra **todo** `.js` que encuentre en `dist/`. Había 38 archivos huérfanos de versiones anteriores y **35 claves de comando las servía código sin fuente** — entre ellas `#registro` y `#unreg`, eliminados a propósito **siete versiones atrás** y que seguían funcionando, y `#image`, que servía la versión vieja y **tapaba la migración a Rust**. `npm run build` ahora limpia `dist/` primero |
| **Fix grave: la Session API no arrancaba siguiendo `.env.example`** | El servidor de Rust leía `API_KEY` y `PORT`; el cliente y el `.env.example` usan `SESSION_API_KEY` y `SESSION_API_URL`, y los dos primeros **no estaban documentados en ninguna parte**. Quien clonara el repo se quedaba sin API y sin saber por qué: `index.ts` la lanza con `stdio: 'ignore'`, así que el panic no salía en ningún log y solo se veía un reintento cada 3 segundos. Ahora la clave tiene **un solo nombre** y el puerto sale de `SESSION_API_URL`, así que cliente y servidor no pueden quedar en puertos distintos |
| **Fix: los binarios compilados no encontraban el proyecto** | Bajo Nuitka `--onefile`, `__file__` apunta al directorio temporal donde el binario se extrae en cada arranque, así que los 8 sitios que calculaban la raíz del proyecto daban una ruta que se borra al salir: `manage.exe` informaba *"auth dir missing"* teniendo **8.422 archivos** en `auth/`. Ni `sys.frozen` ni `sys.executable` sirven ahí; el que sí es `__compiled__.containing_dir` |
| **Fix: `npm run manage` crasheaba en cualquier Windows en español** | Con una codepage heredada —cp1252, el caso por defecto— `rich` cae a su renderizador legacy y lanza `UnicodeEncodeError` con el primero de sus símbolos: **moría antes de mostrar nada**. No era cosa de compilar, la versión interpretada hacía lo mismo. Las dos herramientas fuerzan UTF-8 antes de crear la `Console` |
| **Fix: el Health Monitor podía no arrancar nunca, en silencio** | Compartía un `try` con el AI Brain y arrancaba **después** del import de este, así que cualquier fallo del segundo se llevaba al primero sin que nadie se enterara. Se vio en vivo al correr el binario compilado, donde `numpy` está excluido a propósito |
| **Fix: el postinstall rompía `npm install` con un 404** | `process.exit(0)` con una petición HTTP en vuelo hacía que libuv abortara con **código 127**, que npm lee como postinstall fallido y corta la instalación entera — justo en el camino más común mientras no haya release publicada |
| **Fix: `chaos` y `ruff` mentían** | `chaos` reportaba *"API key inválida o faltante"* en 8 comprobaciones cuando la clave estaba bien y lo que faltaba era que el script leyera el `.env`. Y `ruff` y `py:deps` excluían el nombre exacto `venv`, así que cualquier `venv.roto` o `venv_tools` al lado los metía a recorrer site-packages: **26.165 avisos** de código que no es de este proyecto. Ahora un entorno se reconoce por su `pyvenv.cfg` |
| **140 tests unitarios en Rust y dos benchmarks** | 19 más en esta versión. Lo que depende de un modelo ONNX no se prueba con assert, pero sí todo lo que lo rodea: el encuadre con relleno, la conversión a tensor NCHW y **Anime4K entero**, incluido un test que comprueba que marca el borde más que una bicúbica sola — que es justo lo que lo distingue de un redimensionado |
---

## Stack técnico

<div align="center">

| Área | Tecnología | Propósito |
|------|-----------|-----------|
| Runtime | Node.js 20 LTS | Loop de eventos WhatsApp |
| Lenguaje | TypeScript 5.x | Tipado estricto end-to-end |
| WhatsApp | Baileys 6.x | Protocolo WA Web multi-device |
| IA y NLP | Rust | Intenciones por reglas, personalidad y humor, reputación, perfiles de estilo |
| Modelos de lenguaje | Ollama → GPT → Gemini → Claude | Cascada, con caída a plantillas locales si ninguno responde |
| Opcional | Python 3.11 | Watchdog de consola y CLI de mantenimiento — el bot corre sin esto |
| Session Store | Rust + Axum + SQLite | Creds atómicas, delivery tracking, outbox con dead-letter |
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
- Multi-modelo: **Ollama (local)** → GPT → Gemini → Claude, **todo desde Rust**
- **12 modos de personalidad** por grupo, con 489 frases propias
- Aprende el estilo de cada usuario y del grupo, y lo refleja al responder
- Si ningún modelo contesta, cae a plantillas locales sin repetir las últimas
- Reputación por usuario: modula el tono según cómo se porta
- Clasificación de intenciones por reglas en Rust, sub-milisegundo
- Historial de conversación por usuario (12 msgs) · 20 req/hora por JID

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
╔═══════════════════════════════════════════════════════════════════════╗
║                           WinsiBot v8.12.0                            ║
╠═════════════════════╦══════════════════════════╦══════════════════════╣
║      TypeScript     ║           Rust           ║        Python        ║
║    Node.js :4001    ║                          ║    nadie lo lanza    ║
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

## Requisitos

| Herramienta | Versión mínima | Requerido | Notas |
|-------------|---------------|:---------:|-------|
| Node.js | 20.x LTS | ✅ | `node --version` |
| npm | 9.x | ✅ | incluido con Node |
| Python | 3.11+ | ❌ | **Ya no hace falta** — desde la 8.12.0 ni los comandos de imagen lo usan. Solo para `npm run monitor` y `npm run manage`, que se abren a mano (y que también se pueden compilar) |
| Rust + Cargo | 1.75+ | ✅ | para compilar Session API |
| Ollama | latest | ❌ | IA local (recomendado, 16 GB RAM+) |
| FFmpeg | 6.x | ❌ | conversión de media |

**Sistemas operativos soportados:** Windows 10/11 · Ubuntu 20.04+ · Debian 11+ · macOS 12+ · Android (Termux)

> **Nota de plataforma:** en Termux/Android y en Linux/macOS sin GUI, Ollama es opcional igual que en Windows — el bot degrada bien sin ellos. Desde la 8.12.0 tampoco hace falta un compilador de C: `npm run spam:build` y `npm run cython:build` se fueron junto con la librería C de spam y las extensiones Cython, que compilaban código que ya estaba en Rust. El panel web (`web/`) usa el mismo Node.js ya requerido — no suma una herramienta nueva, solo un `npm install && npm run build` aparte (ver sección Instalación).
>
> **Dos cosas a tener en cuenta en dispositivos débiles (Termux/Android, ARM de placa única):**
>
> - De las dependencias de Node, la que de verdad compila desde código fuente en Android es **`sharp`** (lleva libvips): necesitás `clang`, `make` y `pkg-config` instalados *antes* de correr `npm install` (ver sección Termux más abajo). `cbor-x` se mencionaba acá y no hacía falta — su parte nativa (`cbor-extract`) es una dependencia **opcional**, y si no compila cae a la implementación en JavaScript puro sin que nada deje de funcionar.
> - **Python ya no hace falta para correr el bot.** No queda nada suyo en el camino de ningún mensaje y nadie lo arranca; solo lo usan `npm run monitor` y `npm run manage`, que se abren a mano. La 8.11.0 se llevó `pyarrow`, `duckdb`, `spacy`, `ddgs`, `requests` y `transformers`, y la 8.12.0 el resto: `torch`, `pillow`, `pyanime4k`, `dghs-imgutils`, `onnxruntime` y `opencv` — más de 4 GB de dependencias entre las dos.
> - La primera compilación de Rust (`npm run rust:build`) tarda unos minutos (~3 min en un PC de escritorio; bastante más en un teléfono) porque compila todo el árbol de dependencias con LTO. Es normal — no cierres la terminal, solo dale tiempo (y evitá que el dispositivo se duerma).

> **Ollama:** Descarga un modelo antes de iniciar — `ollama pull llama3` o `ollama pull mistral`. El bot intenta Ollama primero y cae en las APIs cloud automáticamente si no está disponible.

---

## Instalación

```bash
# 1 — Clonar el repositorio
git clone https://github.com/Brashkie/WinsiBot.git
cd WinsiBot

# 2 — Dependencias
npm install
#
# Esto también baja el binario ya compilado de la Session API de Rust para tu
# plataforma y verifica su SHA-256. Si para la tuya no hay binario, lo dice en
# una línea y podés compilarlo vos con `npm run rust:build`.

# 3 — Configuración
cp .env.example .env
#      ...y editá OWNER_JID con tu número

# 4 — Panel web (opcional — el bot arranca igual sin esto)
npm run web:build

# 5 — Arrancar
npm start
```

> **Python ya no hace falta.** Hasta la 8.12.0 había que crear un entorno
> virtual e instalar dependencias; desde entonces no queda nada de Python en el
> camino de ningún mensaje y el bot no lo arranca. Solo se usa para dos
> herramientas que se abren a mano:
>
> ```bash
> cd python && python -m venv venv
> venv\Scripts\activate          # Windows
> # source venv/bin/activate      # Linux / macOS / Termux
> pip install -r requirements.txt
> ```
>
> Con eso andan `npm run monitor` (watchdog interactivo) y `npm run manage`
> (CLI de mantenimiento). Si no las vas a usar, saltate el paso. Para
> `npm run py:lint` y `npm run tools:build` usa `requirements-dev.txt`, que
> incluye al otro.
>
> **Si actualizas Python, hay que recrear el entorno.** Un venv guarda la
> ruta absoluta del interprete que lo creo, y sus extensiones compiladas
> llevan la version en el nombre (`cp311`), asi que no se puede reapuntar a
> otra: `npm run py:lint`, `py:deps`, `tools:build`, `monitor` y `manage`
> fallan todos con `No Python at '...'`. Se arregla borrando `python/venv` y
> repitiendo los comandos de arriba.
---

### Instalación en Termux (Android)

> Instalá Termux desde **F-Droid**, no desde Play Store — la versión de Play Store está descontinuada y desactualizada.

```bash
# 0 — Paquetes del sistema (una sola vez)
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git tmux

# Opcional — solo si el bot va a leer/escribir en el almacenamiento compartido
# del teléfono (fuera de su propia carpeta de datos):
termux-setup-storage
```

Y después los mismos 5 pasos de [Instalación](#instalación), sin cambios.

**Ya no hace falta `rust`, `python`, `clang`, `make` ni `pkg-config`.** Hasta la 8.12.0 había que compilar la Session API en el teléfono —varios minutos— y crear un entorno virtual de Python. Ahora `npm install` baja el binario ya compilado para `aarch64-linux-android`, que es el target propio de Termux: Android usa la libc **Bionic**, no glibc, así que un binario de Linux ARM normal bajaría bien y no arrancaría.

Los comandos de imagen (`#toanime`, `#removebg`, `#upscale`) **funcionan en el teléfono**, porque ONNX Runtime publica build para ese target con **NNAPI**, la aceleración por hardware de Android.

**Lo único que puede compilar desde fuente** es `sharp` (lleva libvips), que no trae binario para Android. Si `npm install` falla ahí, instalá `pkg install -y clang make pkg-config` y repetí.

**Mantener el bot corriendo en segundo plano:**

- `termux-wake-lock` antes de iniciar el bot evita que Android mate el proceso al apagar la pantalla (`termux-wake-unlock` para liberarlo después).
- Corré el bot dentro de una sesión de `tmux` (`tmux new -s winsibot`, después `npm run start`) para que el proceso siga vivo aunque cierres la app de Termux — reconectá con `tmux attach -t winsibot`.
- Para autoarranque al reiniciar el teléfono, instalá el complemento **Termux:Boot** (F-Droid) y agregá un script en `~/.termux/boot/`.

> **RAM:** Ollama (IA local) generalmente no es viable en un teléfono común — usá las APIs cloud (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`), o dejá que el bot responda con su motor local de plantillas, que no necesita ningún modelo.
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
levanta sus propias dependencias (la Session API de Rust y, **si está instalada**,
la API de Python)
si no están corriendo ya, y cada una se reinicia sola si crashea — cada una con
su propio indicador de estado, y un solo Ctrl+C para apagar todo junto.

### Por componentes *(para desarrollo)*

```bash
npm run rust:start      # Solo Session API Rust, de forma aislada
npm run dev             # Solo Node.js sin compilar — desarrollo rápido / escanear QR
npm run monitor         # Watchdog de consola — opcional, necesita Python
```

<details>
<summary>Ver todos los scripts npm</summary>

| Script | Descripción |
|--------|-------------|
| `start` | Compila e inicia el bot **vía supervisor** — reinicia solo si crashea o se cuelga, y levanta Rust (y Python si está instalado) por su cuenta (cada uno con su propio auto-restart) |
| `start:unsupervised` | Igual que `start` pero sin la capa de supervisor — arranca `dist/index.js` directo |
| `monitor` | Watchdog de consola — opcional, necesita Python (`python/requirements.txt`) |
| `dev` | Node.js directo — desarrollo / escanear QR |
| `build` | Compilar TypeScript → `dist/`. **Borra `dist/` primero**: `tsc` no limpia, y el cargador de comandos registra todo `.js` que encuentre ahí, así que un archivo de una versión anterior seguiría ejecutándose |
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
| `py:deps` | Comprueba que lo que `python/` importa esté declarado en los requirements, en las dos direcciones. Sale con error si falta algo |
| `tools:build` | Compila `monitor` y `manage` a ejecutables nativos con Nuitka — corren sin Python instalado. No cruza plataformas: el binario sirve para la máquina donde se compiló |
| `rust:test` | Tests unitarios de Rust (`cargo test`) |
| `py:format` | Ruff — formateo de `python/` |
| `lint:all` | Corre `lint` + `rust:lint` + `py:lint` + `py:deps` de una |
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
| 1 | `manage:status` | Ver estado de Rust / Webhook / Panel web |
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
| | **Sesión** | |
| `POST` | `/write` | Escribir creds (base64) con rename atómico |
| `GET` | `/read` | Leer creds actuales |
| `POST` | `/snapshot` | Forzar rotación de snapshot |
| `POST` | `/recover` | Restaurar desde el mejor snapshot válido |
| `GET` | `/healthy` | Salud de sesión + detección de corrupción |
| `GET` | `/sessions` | Listar IDs de sesión activos |
| `POST` | `/sessions/signal/clear` | Eliminar archivos Signal (fix Bad MAC) |
| `GET` | `/sessions/backup` | Mejor creds válido para restauración sin QR |
| `POST` | `/badmac/report` | Reportar Bad MAC de un grupo (cooldown escalonado) |
| | **Flujo** | |
| `POST` | `/rate/check` | Si un sender está dentro del rate limit |
| `POST` | `/spam/check` | Frecuencia + texto repetido + bloqueo progresivo |
| `POST` | `/watchdog/ping` | Heartbeat desde Node.js |
| `GET` | `/watchdog/status` | Vivo/muerto + tiempo del último ping |
| | **IA** | |
| `POST` | `/nlp/fast` | Clasificación de intenciones por reglas (sub-ms) |
| `POST` | `/ai/learn` | Guardar un intercambio con la IA |
| `POST` | `/ai/observe` | Guardar un mensaje suelto de grupo (alimenta el perfil) |
| `GET` | `/ai/context/:sender` | Historial reciente para armar el prompt |
| `GET` · `DELETE` | `/ai/profile/:jid` | Perfil de estilo de un usuario (GET) · borrarlo todo (DELETE) |
| `GET` | `/ai/group-style/:gjid` | Perfil de estilo de un grupo |
| `GET` | `/ai/corpus/stats` | Tamaño del corpus de aprendizaje |
| `POST` | `/ai/chat/respond` | Respuesta con IA: Ollama → GPT → Gemini → Claude → plantilla |
| `POST` | `/ai/chat/imitate` | Responder imitando el estilo de un usuario |
| `POST` | `/ai/personality/respond` | Respuesta local por plantillas (sin modelo) |
| `GET` · `POST` | `/ai/personality/mode` | Modo activo y lista de modos (GET) · cambiarlo (POST) |
| `POST` | `/ai/personality/reset` | Volver al modo por defecto |
| `GET` | `/ai/memory/:jid` | Reputación y comportamiento de un usuario |
| `POST` | `/ai/memory/:jid/update` | Registrar un mensaje en su reputación |
| `GET` | `/ai/memory/toxic` | Los usuarios con peor reputación |
| | **Imágenes** | |
| `POST` | `/imagefx/lego` | Mosaico estilo LEGO |
| `POST` | `/search/image` | Buscar y descargar una imagen |
| `POST` | `/search/images` | Buscar y devolver solo las URLs |
| `POST` | `/vision/removebg` | Quitar el fondo (isnetis en ONNX) |
| `POST` | `/vision/toanime` | Convertir a estilo anime (AnimeGANv2 en ONNX) |
| `POST` | `/vision/upscale` | Ampliar x2 o x4 con Anime4K (sin modelo) |
| | **Entrega** | |
| `POST` | `/messages/track` | Registrar IDs de mensajes salientes |
| `POST` | `/messages/ack` | Actualizar estado de entrega en lote |
| `GET` | `/messages/pending` | Mensajes sin confirmación de entrega |
| `POST` | `/outbox/enqueue` | Encolar un envío ANTES de mandarlo, con su contenido |
| `GET` | `/outbox/unsent` | Lo que quedó encolado sin salir — para reenviar al arrancar |
| `POST` | `/outbox/sent` | Marcar como enviado de verdad (libera el contenido) |
| `POST` | `/outbox/retry` | Sumar un reintento (dead-letter tras 3) |
| | **Sub-bots** | |
| `POST` | `/subbots/register` | Registrar un sub-bot nuevo |
| `GET` | `/subbots` | Listar sub-bots |
| `GET` · `DELETE` | `/subbots/:id` | Estado de un sub-bot |
| `PUT` | `/subbots/:id/state` | Cambiar su estado |
| `POST` | `/subbots/:id/heartbeat` | Latido de un sub-bot |
| `POST` | `/subbots/:id/messages` | Sumar mensajes a su cuota |
| `POST` | `/subbots/:id/errors` | Registrar un error |
| `GET` | `/subbots/can-create` | Si queda cupo para otro |
| `GET` | `/subbots/config` | Configuración, con recarga en caliente |
| `GET` | `/subbots/stats` | Totales de sub-bots |
| `POST` | `/subbots/cleanup` | Limpiar los que quedaron colgados |
| | **Estado** | |
| `GET` | `/health` | Estado general + sesiones activas + plataforma |
| `GET` | `/health/live` | Liveness (Docker / K8s) |
| `GET` | `/health/ready` | Readiness |
| `GET` | `/metrics` | Contadores atómicos (escrituras, lecturas, bytes) |
| `GET` | `/analytics` | Panel agregado |
| `POST` | `/stats/bump` | Sumar a los contadores del bot |
| `GET` | `/stats/counters` | Contadores acumulados |
| `GET` | `/stats/top-commands` | Comandos más usados |

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
│   │   ├── loadShedding.ts           # Degrada por lag del event loop — nunca tira moderación ni admin
│   │   ├── botStats.ts               # Contadores en memoria, volcados a Rust cada minuto
│   │   ├── egress.ts                 # Embudo de salida — TODO sendMessage pasa por el rate limiter
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
│   │   ├── kv.ts                      # strenor — KV con TTL real (sesiones del panel web)
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
│   │   ├── circuitBreaker.ts          # Corta las llamadas a un servicio caído (closed/open/half-open)
│   │   ├── cacheManager.ts           # Cache genérico con TTL, stats hits/misses, eviction LFU
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
├── python/                           # Python — OPCIONAL, solo herramientas de consola
│   ├── requirements.txt              # Lo que necesitan `npm run monitor` y `manage`
│   ├── paths.py                      # La raíz del proyecto, interpretado o compilado
│   ├── ai/                           # Salud, roturas, anomalías, alertas
│   ├── session/                      # Backup / restore / checksum SHA-256
│   └── terminal/
│       ├── monitor.py                # Watchdog interactivo con auto-restart
│       └── manage.py                 # CLI de mantenimiento
├── rust/                             # Rust — Session API v5.7.0
│   ├── assets/                       # Datos incrustados en el binario con include_str!
│   │   ├── personality.json          # 489 frases en 12 modos + 121 de humor
│   │   └── commands.json             # Catálogo de 28 comandos para el contexto de la IA
│   └── src/
│       ├── main.rs                   # Entry point (Axum) — graceful shutdown + compresión gzip
│       ├── routes.rs                 # Handlers HTTP + AppState
│       ├── bad_mac.rs                # Tracker Bad MAC por grupo — sliding window log, cooldown escalonado, persistencia SQLite
│       ├── rate_limiter.rs           # Rate limiter por sender (15 msgs / 10s)
│       ├── watchdog.rs               # Heartbeat de Node.js — tracking de muerte/recuperación
│       ├── snapshot.rs               # 10 snapshots rotativos + read_best_valid()
│       ├── db.rs                     # SQLite delivery tracker + audit_log
│       ├── atomic.rs                 # Escritura atómica (tmp → fsync → rename)
│       ├── nlp.rs                    # Clasificador de intenciones por reglas — insultos, NSFW, spam, comandos (sub-ms)
│       ├── imagefx.rs                # Mosaico LEGO (crate `image`)
│       ├── imagesearch.rs            # Búsqueda y descarga de imágenes (Bing)
│       ├── personality.rs            # Modos, plantillas de respuesta y humor (datos incrustados)
│       ├── user_memory.rs            # Reputación y comportamiento por usuario
│       ├── ai_chat.rs                # IA real: Ollama → GPT → Gemini → Claude, con caída a plantilla
│       ├── rng.rs                    # Aleatoriedad barata (xorshift64*) para frases y mezclas
│       ├── conversations.rs          # Conversaciones de la IA + perfiles de estilo de usuario y grupo (SQLite)
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
El bot verifica la disponibilidad de Ollama en cada petición y cae en GPT → Gemini → Claude si no está. Si ninguno responde, usa su **motor local de plantillas** — 489 frases en 12 modos, con el modo del grupo y sin repetir las últimas respuestas — así que siempre contesta algo. Todo eso corre en Rust desde la 8.11.0: no necesita Python.

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
