# Changelog

Todos los cambios notables de WinsiBot se documentan en este archivo, versión por versión, de más reciente a más antigua.

---

## [8.5.1] — 2026-07-21

Segunda ronda de resistencia — esta vez enfocada en grupos muy activos (10+ personas escribiendo casi al mismo tiempo), donde aparecían Bad MAC con más frecuencia. Se encontraron y corrigieron dos bugs reales que explican buena parte de eso, más mejoras de concurrencia en Rust y el reemplazo completo del sistema de mascotas por Dragon City.

| Área | Cambio |
|------|--------|
| **Fix: mensajes descartados en lote tras una reconexión** | Baileys entrega varios mensajes en un solo evento `messages.upsert` cuando su buffer interno está activo — y ese buffer se activa en **cada reconexión**, no solo al arrancar en frío. El código solo leía `messages[0]`, así que en un grupo activo que sigue hablando justo durante la resincronización (el escenario típico tras un Bad MAC), el resto del lote —comandos, y hasta Bad MAC adicionales del mismo lote— se descartaba en silencio, sin log. Confirmado leyendo el código fuente de Baileys (`event-buffer.js`). Corregido en `socket.ts` y en los sub-bots (`serbot.ts`), ahora se recorre el array completo |
| **Fix: `/nlp/fast` (Rust) entraba en pánico con cualquier texto** | Dos expresiones regulares usaban backreferences (`\1`), sintaxis que el crate `regex` de Rust no soporta por diseño — `Regex::new(...).unwrap()` fallaba la primera vez que llegaba texto no vacío, y por quedar cacheada en un `OnceLock`, volvía a pasar en cada llamada siguiente. En la práctica, la ruta rápida de NLP nunca funcionó. Detectado con `cargo clippy` (lint `invalid_regex`), reescrito sin regex (detección manual de caracteres/patrones repetidos), verificado en vivo sin un solo pánico |
| **Fix: el historial de Bad MAC nunca se guardaba en disco** | `bad_mac.rs` creaba su tabla en una conexión DuckDB separada de la que usan los `INSERT` reales — la tabla quedaba "invisible" para la conexión compartida, y cada intento de persistir un clear fallaba en silencio. Confirmado inspeccionando la base real de producción (solo tenía `conversations`/`user_style`, nunca `bad_mac_events`). Ahora usa la misma conexión compartida para todo |
| **Rust — concurrencia real bajo carga (rate limiter, Bad MAC, locks de sesión)** | `/rate/check` se llama por *cada* mensaje de *cada* usuario — es el camino más caliente del proceso. Antes, un único `Mutex<HashMap>` global serializaba esa llamada sin importar que fueran usuarios completamente distintos. Migrado a `DashMap` (particionado en shards por núcleo) en `rate_limiter.rs`, `bad_mac.rs` y `lock_manager.rs` — verificado con 200 usuarios y 60 grupos disparando en paralelo puro, cero condiciones de carrera. De paso, `conversations.rs` combina 3 consultas SQL en 1 para acortar cuánto tiempo se retiene el lock de la conexión DuckDB compartida |
| **Sistema de mascotas reemplazado por Dragon City** | `#pet` (alias `#mascota`, `#dragon`, `#dragones`) ahora es Dragon City real: catálogo de 579 dragones (`Brashkie/module-data`), con imagen y video de evolución reales. Se incuba un huevo (`#pet hatch`, ¥800), evoluciona dos veces según su nivel (con video de evolución la primera vez que llega a cada etapa), y genera **Oro** pasivo (moneda nueva, separada de BrasCoins) según su nivel — se cobra con `#pet collect` y se gasta alimentando (`#pet feed`). Descripciones traducidas al español al vuelo. Reemplaza por completo al sistema anterior de 25 especies genéricas (`petAdvanced.ts`, eliminado) |
| **Fix: el anuncio de subida de nivel ignoraba el toggle `autolevelup`** | 7 comandos RPG (`work`, `mine`, `crime`, `daily`, `weekly`, `monthly`, `chest`) llamaban a `levelUpLine()` sin chequear la config del grupo — el anuncio salía igual aunque `autolevelup` estuviera apagado. Ahora todos respetan el toggle |
| **Fix: el panel `#on`/`#off` no mostraba `autoaccept`/`autoreject`** | Un desajuste de mayúsculas entre cómo se listaban esas dos opciones y cómo estaban registradas hacía que nunca aparecieran en el panel, aunque el toggle en sí funcionara. También rediseñado sin emojis, estilo tarjeta consistente con el resto del bot |
| **BrasEmbers** | Nueva moneda escasa (`#ascuas`, cooldown 3h) que además puede caer con baja probabilidad en `daily`/`work`/`crime`/`mine`. Los 5 comandos NSFW existentes ahora cuestan 1 BrasEmber por uso, sumado al toggle de grupo `#on nsfw` |
| **Negocios (`#business`/`#collect`)** | 6 negocios comprables (Granja a Fábrica, ¥5K–¥1.2M) que generan BrasCoins pasivos por hora, con tope de acumulación de 24h — mismo patrón de ingreso pasivo que ahora también usa Dragon City para el Oro |
| **`#applemusic`/`#deezer`** | Alternativas gratuitas a Spotify (bloqueado: Spotify ahora exige cuenta Premium del developer hasta para uso solo-servidor) — iTunes Search API y Deezer Search API, sin necesitar API key |
| **`#rw`/`#c` migrados a MessagePack** | Las tres fuentes (Marvel, Pokédex, anime) ahora vienen de `Brashkie/module-data` en MessagePack en vez de JSON — 13-19% más liviano, verificado byte a byte contra el JSON original antes de migrar. Anime subió de 300 a 500 personajes |
| **Rediseño visual — tarjetas y sin emojis en paneles** | `invest`, `config` (`#on`/`#off`), `truth`/`dare`, `welcome`/bye, `roulette`, `coinflip`, `category`, `menu` — unificados al estilo `╭─「 」`/`│`/`>` del resto del bot, corrigiendo de paso un bug de renderizado: `>` solo activa el bloque de cita nativo de WhatsApp si es el primer carácter literal de la línea |
| **Biome + ruff + `cargo clippy`** | Nuevo linter/formateador para TypeScript (Biome, reemplaza a ESLint/Prettier que no tenían config activa) y Python (ruff) — scripts `lint`, `format`, `check` (+ `:fix`), `py:lint`, `py:format`, `rust:lint`, `lint:all` |

---

## [8.5.0] — 2026-07-17

Ronda de resistencia y escalabilidad — enfocada en que el bot **nunca deje de responder**, ni con más grupos ni con reconexiones de por medio, más un algoritmo de detección de Bad MAC matemáticamente más preciso.

| Área | Cambio |
|------|--------|
| **Fix: respuestas de IA perdidas tras una reconexión** | `handleAIResponse` puede tardar 44s+ esperando a Ollama — tiempo de sobra para que una reconexión (Bad MAC, watchdog zombie, corte de red) invalide el socket que tenía capturado desde que llegó el mensaje. Confirmado en logs reales: reconexión a las 20:01:12, error `Connection Closed` recién a las 20:02:57 al intentar responder por el socket viejo, con el bot ya reconectado por uno nuevo en ese mismo momento. Ahora pide el socket **vivo** justo antes de cada envío en vez de arrastrar el capturado al principio |
| **Fix: un solo envío colgado congelaba TODA la cola de mensajes salientes** | `enqueueSend`/`broadcastSend` procesan su cola uno por uno, en secuencia, sin ningún timeout sobre el envío real a WhatsApp. Un solo `sendMessage()` colgado de verdad (stall de red que no rechaza limpio) bloqueaba todo lo que viniera después en la cola — para cualquier grupo — hasta que esa promesa se resolviera sola, a veces minutos después. Nuevo techo duro de 20s en el punto único de envío (`rateLimiter.ts`), con reintento automático |
| **Rust — I/O bloqueante movida fuera del runtime async** | Los handlers de sesión (`write`, `read`, `is_healthy`, `list_sessions`, `health`, `readiness`, `snapshot_route`, `recover`, `list_snapshots`, `read_backup`, `sessions/signal/clear`) hacían lectura/escritura de archivos síncrona directo en funciones `async` de Tokio — bloqueando el hilo del runtime para *cualquier otra petición* concurrente mientras tanto. El más grave: `write` (guardado de credenciales, se dispara en cada `creds.update` de Baileys de cada bot y sub-bot) incluye un `fsync()` real. Todos movidos a `tokio::task::spawn_blocking`, mismo patrón que ya usaban los endpoints de mensajería |
| **`bad_mac.rs` — algoritmo de ventana deslizante real** | El contador de Bad MAC por grupo usaba bloques fijos de tiempo (tumbling window) que se resetean enteros cada 30s — una ráfaga repartida justo alrededor del límite de un bloque (4 eventos a los 29s + 4 a los 31s) nunca cruzaba el umbral de 5 en ninguno de los dos bloques, aunque fueran 8 eventos reales en 2 segundos. Reemplazado por un log de timestamps con purga incremental (sliding window log real), sin ese punto ciego y sin costo extra (O(1) amortizado por evento) |
| **`bad_mac.rs` — fuga de memoria corregida** | El mapa de contadores por grupo nunca se limpiaba — cualquier grupo que tuvo aunque sea un Bad MAC suelto quedaba en memoria para siempre. Nueva tarea de fondo (cada 30 min) libera grupos inactivos por más de 1h que nunca dispararon una limpieza real; los que sí reincidieron se mantienen indefinidamente para no perder su escalada de cooldown |
| **Rate limiting — Rust nunca bloqueaba de verdad** | `/rate/check` de Rust devuelve HTTP 429 a propósito cuando bloquea a alguien, pero el cliente TS trataba cualquier respuesta no-2xx como "Rust caído" y caía a su fallback de "permitir siempre" — el límite de 15 msj/10s de Rust nunca bloqueaba a nadie en la práctica |
| **Rate limiting — el límite local era más estricto que el real y silencioso** | Un segundo límite en memoria (5 mensajes/5s, en TODO mensaje) bloqueaba antes que el de Rust y solo avisaba 1 de cada 3 veces — las otras 2, silencio total. Subido a 12/5s, como red de respaldo real en vez de ser el que más rápido se disparaba con uso normal |
| **`authVerifier` — menos falsos positivos en cada reconexión** | El verificador de integridad de `auth/` corría su barrido completo (todos los `session-*.json`) en cada reconexión, no solo al arrancar — exponiendo cientos de archivos a glitches de I/O transitorios en cada una. Ahora solo corre en el arranque en frío del proceso, y reintenta una vez antes de dar un archivo por corrupto |
| **`#mcsearch`/`#mcfriends`/`#mcachievement` reparados** | La API de OpenXBL anida los resultados bajo `content.people`/`content.titles`, no directo como se leía — por eso nunca encontraba jugadores reales. También corregidos dos nombres de campo mal escritos (`gamerScore`, `totalGamerscore`) que dejaban el gamerscore siempre en "N/D" |
| **`#rw`/`#c` — nueva fuente: anime** | 300 personajes de 128 series (Naruto, Attack on Titan, Jujutsu Kaisen, Death Note, Berserk, One Piece, etc.), sumada a Marvel y Pokédex — mismo sistema de exclusividad por grupo |

---

## [8.4.3] — 2026-07-16

| Área | Cambio |
|------|--------|
| **Bienvenida/despedida no funcionaban en absoluto** | El handler que arma el mensaje existía con toda su lógica, pero nunca estaba conectado a ningún evento de Baileys — activar `welcome`/`detect` en `#on` no hacía nada. Ya conectado, y de paso rediseñado: imagen + tarjeta propia, usa la descripción real del grupo como texto de bienvenida (o un default si no tiene), con link al repo |
| **Aviso de cambio de nombre de grupo (`detect`) spameaba en cada resync** | WhatsApp reenvía el nombre/descripción *actuales* de todos los grupos cada vez que hace un resync interno, no solo cuando algo cambia de verdad — sin comparar contra el último valor conocido, esto mandaba "Nombre actualizado" en cada grupo con `detect` prendido, todo el tiempo. Ahora solo avisa si realmente cambió |
| **Casi todos los flags de `#on` estaban desconectados** | `antilink2`, `antitelegram`, `antidiscord`, `antitiktok`, `antiyoutube`, `antitoxic`, `antitraba`, `antidelete`, `viewonce`, `anticall`, `autoAccept`/`autoReject` y `rpg` tenían su lógica completa escrita pero nunca conectada a ningún evento real — activarlos en `#on` no hacía nada. Auditados y conectados todos; `anticall` además tenía un bug donde el toggle escribía en un lugar que la lógica real nunca leía |
| **`authVerifier` — validación criptográfica real** | `signalis-core` actualizado a 0.4.0. Los archivos `sender-key-*.json`/`session-*.json` decían validar "tamaños de buffer válidos" pero en realidad no chequeaban nada — ahora sí, con decodificación estricta de base64 (detecta corrupción que antes pasaba desapercibida). Probado contra los ~2000 archivos reales de `auth/` sin falsos positivos |
| **`#rw`/`#c` — exclusividad de personajes por grupo** | Un personaje ya reclamado en un grupo ya no puede volver a salir ni reclamarse ahí — pero sí puede tener otro dueño distinto en otro grupo |
| **4 comandos nuevos** | `#lego` (mosaico estilo LEGO, con Pillow), `#reto`/`#verdad` (verdad o reto, separados, con más de 80 frases cada uno), `#tweet` (imagen de tweet falso, ahora con soporte para adjuntar foto) |
| **`#rule34video` migrado — ya no necesita API key** | Antes usaba mal la API de rule34.xxx (un tag inválido que casi nunca encontraba resultados) y encima requería cuenta propia. Ahora scrapea rule34video.com directo, sin cuenta ni credenciales |
| **Sub-bots — límite configurable y más resiliencia** | `SUBBOT_MAX` (env, sincronizado con Rust en caliente sin reiniciarlo) reemplaza el límite fijo de 100. Cada sub-bot ahora está aislado de errores del resto (antes un fallo en uno podía tumbar el proceso entero), guarda por qué se cayó la última vez, y `#serbot reconectar` fuerza el reintento de todos los caídos sin esperar el backoff |
| **Python: ráfagas de mensajes congelaban toda la API** | Uvicorn corre con un solo worker — dos routers (`fast.py`, `ml.py`) llamaban sus modelos de ML/NLP directo dentro del handler async sin pasarlos a un hilo aparte, así que una ráfaga de mensajes bloqueaba el único hilo disponible y arrastraba con él a *todos* los demás endpoints (`/users`, `/messages`, `/pending`, etc.), no solo esos dos |
| **Fix: condición de carrera guardando datos** | El autoguardado periódico (cada 30s) podía chocar con el guardado final al cerrar sesión/SIGTERM/SIGINT — ambos escribían al mismo archivo temporal, y el que perdía la carrera tiraba `ENOENT`/`EPERM`. Ahora cada escritura usa su propio temporal y se serializan por archivo |
| **Fix: latencia en comandos** | Dos llamadas sin límite de tiempo propio (resolver si sos admin del grupo, chequeo de spam-guard en cada comando) podían demorar la respuesta hasta varios segundos si WhatsApp o Python estaban lentos. Ahora ambas tienen un techo — si tardan más, el bot sigue igual con el valor por defecto en vez de colgarse |
| **Consola — menos ruido de libsignal** | Los logs de "sesión Signal abierta/cerrada" volcaban el objeto completo (con buffers de claves incluidos) por consola — ahora quedan en una línea compacta |

---

## [8.4.2] — 2026-07-15

| Área | Cambio |
|------|--------|
| **Fix: owner no reconocido con `@lid`** | Cuando WhatsApp identifica al remitente con un `@lid` (identificador opaco de privacidad de número, cada vez más común) en vez de su número real, el chequeo de owner comparaba ese `@lid` contra `OWNER_JID` y nunca podía coincidir — bloqueaba comandos `ownerOnly` para el owner real. Ahora usa `senderPn`/`participantPn` (número real que Baileys manda en paralelo) y, si esos vienen vacíos, resuelve el `@lid` contra los metadatos del grupo (`participant.jid`) como último recurso, solo en el momento exacto en que se va a rechazar un comando |
| **Fix: ffmpeg tumbaba el proceso entero** | `ffmpeg-static` estaba en `package.json` pero nunca se usaba — `#sticker` con video/GIF dependía de `fluent-ffmpeg`, que no encontraba el binario en el PATH del sistema y lanzaba un error interno de un `ChildProcess` sin listener, **no capturable con try/catch**, que mataba todo el bot. Ahora `FFMPEG_PATH` apunta al binario bundleado desde el arranque, y el error (si volviera a pasar) quedó en la lista de excepciones no-fatales |
| **Bad MAC — umbral global además de por grupo** | Una sesión Signal corrupta puede manifestarse como Bad MAC repartidos entre *muchos* grupos distintos (2-3 cada uno) sin que ninguno cruce su propio umbral — el bot se quedaba sordo sin que la limpieza automática se disparara nunca. Nuevo contador global en Rust (`rust/src/bad_mac.rs`, 8 eventos en 60s agregando todos los grupos) que fuerza la limpieza de sesión igual, con persistencia y cooldown escalonado propios |
| **Watchdog de conexión "zombie"** | El ping interno de Baileys no detecta cuando WhatsApp deja de empujar mensajes en tiempo real a un dispositivo (transporte vivo, pero silencio total). Nuevo chequeo de "tiempo sin `messages.upsert`" — si pasan 10 minutos sin un solo mensaje entrante, fuerza una reconexión sola, sin necesitar reinicio manual |
| **`#daily` / `#chest` reinician a medianoche** | Antes eran 24h rodantes desde el último uso — ahora se reinician a la medianoche (UTC, igual que la racha de días de `#daily`), como cualquier recompensa diaria estándar. Migración automática para grupos que ya tenían el default viejo guardado |
| **`#profile` responde citando el mensaje** | Ahora podés ver el perfil de alguien respondiendo a su mensaje con `#profile`, no solo mencionándolo. De paso, arreglado un bug donde ver el perfil de alguien sin nombre guardado mostraba *tu* nombre en vez del de esa persona |
| **Python: fix de timeouts en `/api/v1/users`** | `getOrCreateUser`/`addExp` corren en cada mensaje — antes cada llamada leía y reescribía **todo** `users.parquet` bajo un lock global, con costo proporcional al total de usuarios. Con suficiente tráfico concurrente eso llenaba el lock y causaba los `ECONNABORTED` que aparecían en los logs. Ahora vive en caché de memoria con flush a disco cada 5s, mismo patrón que ya usaba `messages.parquet` |
| **Handler sin polling** | El semáforo de concurrencia de `handler.ts` esperaba un cupo libre sondeando cada 100ms — reemplazado por una cola de espera que entrega el cupo en el mismo instante en que se libera, sin sondeo ni CPU de más bajo ráfagas grandes |
| **Sistema de registro: limpieza al 100%** | Quedaban restos del sistema de registro eliminado en v8.4.1 — comandos fantasma documentados en `commands.md`/`commands.en.md` y un campo `registered` muerto en `types/index.d.ts`. Ya no queda ninguna referencia en el código ni en la documentación |
| **Sub-bots conectados al handler central** | Antes los sub-bots (`#serbot`) solo quedaban conectados sin procesar ningún mensaje — ahora comparten el mismo handler de comandos que el bot principal (y su semáforo de concurrencia). De paso, arreglado un bug donde el heartbeat hacia Rust nunca se enviaba realmente (comparaba contra la clave equivocada del registro en memoria) |
| **8 comandos nuevos** | Info: `roblox`/`rbx`, `mcsearch`, `mcfriends`, `mcachievement`, `mcuuid`, `mcavatar`, `mchead`, `mcbody`, `mcskin` (Minecraft Java + Xbox Live, este último requiere `XBL_API_KEY` opcional) · Fun: `melones` |
| **Guía de economía nueva** | `docs/economy.md` / `docs/economy.en.md` — cómo conseguir BrasCoins, diamantes, mascotas, personajes y objetos, con cada comando verificado contra el código real |
| **Consola rediseñada** | Tema `matrix` (verde/negro) en toda la consola en vez de `dracula`, logo de arranque más grande con efecto de "descifrado" antes de mostrarse, y limpieza periódica de cachés cada 20 min (con `groupMeta` excluido a propósito) |

---

## [8.4.1] — 2026-07-13

| Área | Cambio |
|------|--------|
| **Registro eliminado** | El sistema de registro obligatorio (`!registro`/`!unreg`) se sacó por completo — `crime`, `#profile`, `bank`, `afk`, `transfer`, `invest`, `quote`, `pay`, `einfo`, `coinflip`, `rob` y `roulette` ya no piden registrarte para usarlos |
| **`#profile` rediseñado** | Ahora envía la foto de perfil de WhatsApp como imagen, muestra cumpleaños (`!birthday`), género, puesto en el ranking global, cantidad y valor del harem (`!rw`), coins totales (billetera + banco) y un contador nuevo de comandos usados |
| **`#daily` corregido** | El cooldown real era de 2 horas pese a llamarse "diario" — dejaba juntar la recompensa hasta 12 veces al día aunque la racha de días solo avanzaba una vez. Ahora son 24 horas reales (`einfo.ts` y la documentación también corregidos) |
| **Endpoints Python↔TS reparados** | 5 llamadas de TypeScript a la API de Python apuntaban a rutas que no existían o usaban el método HTTP equivocado — la más grave: la moderación de spam por contenido (`groupCfg.antispam`) usaba `GET` contra un endpoint que solo acepta `POST`, así que estaba **silenciosamente desactivada** en todos los grupos que la tenían prendida. También se arregló la clasificación de intención (`/nlp/intent`), la similitud de texto, y el borrado de perfil por privacidad (`!imitate` → borrar, usaba `POST` en vez de `DELETE`, nunca borraba nada) |
| **Timeout y logs de IA** | El timeout de 5s para llamadas a Python era muy corto para respuestas de IA vía Ollama (hasta 25s) — subido a 15s. Los errores de la API de Python ya no vuelcan el objeto completo de Axios en los logs (cientos de líneas) — ahora solo `endpoint`, `code`, `status` y `message` |
| **Ollama documentado** | Variables `OLLAMA_URL`/`OLLAMA_MODEL`/`OLLAMA_TIMEOUT` agregadas a `.env.example` (no existían) y corregido el nombre de variable mal documentado en el README (`OLLAMA_BASE_URL` → `OLLAMA_URL`, que es el que realmente lee el código) |

---

## [8.4.0] — 2026-07-06

| Área | Cambio |
|------|--------|
| **Supervisor de proceso** | Nuevo `src/supervisor.ts` — reinicia el bot con backoff si crashea, y fuerza reinicio si detecta que el event loop se colgó sin crashear (sin heartbeat al watchdog de Rust). `npm start` ahora pasa por él; `npm run start:unsupervised` arranca el bot directo sin la capa extra |
| **Auto-restart de Redis/Celery/Rust** | Igual que ya hacía Python — si Redis, Celery o la Session API de Rust crashean, se reinician solos a los 3s, con guarda para no reiniciar durante un apagado voluntario (Ctrl+C / SIGTERM) |
| **Bad MAC con cooldown escalonado** | El cooldown entre clears de un mismo grupo ya no es fijo (10s) — escala 10s → 30s → 90s... hasta 10 min para grupos que reinciden seguido. Se persiste en DuckDB (`bad_mac_events`) + `audit_log` de SQLite, con export a Parquet (`POST /badmac/export`), e hidrata la escalada al reiniciar Rust desde el historial de las últimas 24h |
| **Cache de grupos unificado** | `src/core/groupCache.ts` reemplaza 3 caches independientes de `groupMetadata` (uno en `handler.ts`, otro en `lid_mapper.ts`, y refetch sin cache en `store.ts`) por uno solo con TTL + debounce/coalescing — menos llamadas redundantes a la API de WhatsApp en grupos grandes o con participantes muy activos |
| **Control de carga (flood)** | Antispam ahora es por grupo+usuario (antes se compartía entre todos los grupos de un mismo usuario); `safeSend` respeta el techo global de envíos salientes; descargas (`yt-dlp`) limitadas a 3 concurrentes; el semáforo de 25 handlers concurrentes espera hasta 3s por un cupo libre antes de descartar un mensaje |
| **Alertas de persistencia** | Webhook de alerta (reutiliza `alerts.rs`) si falla la escritura de una sesión en Rust, y warning visible en Node si el respaldo hacia Rust falla |
| **WebSocket más resistente** | Timeouts explícitos (`connectTimeoutMs`, `keepAliveIntervalMs`, `defaultQueryTimeoutMs`) + jitter en el backoff de reconexión (bot principal y subbots) — evita reconexiones simultáneas tras un corte de red compartido |
| **Banner de arranque** | Ya no muestra `prefix`/`env` en líneas verticales — ahora una fila de badges horizontales (versión, Node, plataforma, GitHub), en el mismo estilo que los badges del README |
| **Dependencias** | `@brashkie/signalis-core` 0.2.0 → 0.3.1 (agrega ChaCha20-Poly1305), `ansimax` 1.4.2 → 1.4.5 (agrega `panels.gridAreas`, syntax highlighting) |

---

## [8.3.0]

| Área | Cambio |
|------|--------|
| **Rust Session API v5.1.0** | Nuevos módulos: `metrics` (contadores atómicos), `tasks` (auto-snapshot + limpieza periódica), `analytics` (dashboard agregado), `alerts` (webhooks Discord-compatibles en muerte/recuperación del watchdog) |
| **Auditoría persistente** | Tabla `audit_log` en SQLite — registra altas/bajas/cambios de estado de subbots y eventos del watchdog, consultable vía `GET /audit` |
| **Hot-reload de config** | `GET`/`PATCH /subbots/config` ajusta límites de subbots (máximo global, por usuario, cooldown) sin reiniciar el proceso |
| **Apagado ordenado** | Ctrl+C ahora toma un snapshot final de todas las sesiones activas antes de cerrar, en vez de matar el proceso en seco |
| **Fix race condition** | `register()` de subbots tenía una condición de carrera TOCTOU en registros concurrentes del mismo owner — corregida con mutex de serialización |
| **Fix corrupción de datos (Python)** | `parquet_store.py` leía/escribía `users.parquet` sin ningún lock — en Windows causaba `ERROR_USER_MAPPED_FILE` y pérdida silenciosa de registros de usuarios bajo carga concurrente |
| **Cache Manager genérico** | `@lib/cacheManager.ts` con TTL automático, estadísticas hits/misses y eviction LFU — reemplaza dos implementaciones de caché manuales duplicadas (`groupMetaCache`, `charCache`) |
| **Curva de niveles corregida** | La fórmula de EXP por nivel era exponencial pura (`100 × 1.5^nivel`) — pasado el nivel ~22 se volvía matemáticamente imposible de alcanzar, pese a tener rangos definidos hasta nivel 400 |
| **Racha en `#daily`** | Conecta el sistema de prestige/racha de `@lib/leveling.ts` (ya existía pero nunca se usaba fuera de `#prestige racha`) — bono progresivo (×1.00–×1.20+) por días consecutivos reclamados |
| **Limpieza de dependencias** | 31 paquetes npm sin uso real eliminados del bundle (~420 paquetes transitivos) tras auditar cada import — el bot ya usa `yt-dlp` local en vez de las libs de scraping que quedaban listadas |
| **10+ comandos nuevos** | NSFW: `rule34`, `rule34video`, `sexyimg`, `stickerporn` · Roleplay: `kisscheeks`, `laugh`, `punch`, `sad`, `sleep` · RPG: `harem`, `leveltop` · Descargas: `ytmp4` · Info: `infobot` |
| **Fix Pinterest** | El comando `pinterest`/`pin` leía el HTML estático de la búsqueda (solo placeholders borrosos) — ahora usa la API interna de búsqueda que la propia SPA de Pinterest consume |
| **Fix `#sticker` con cita** | Citar una imagen/video y usar `#sticker` fallaba con *"no es un mensaje de media"* — sustituía mal el mensaje citado antes de descargarlo |

---

## [8.2.1] — 2026-06-10

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

## [8.2.0] — 2026-06-08 / 2026-06-09

Sistemas RPG mayores agregados de una: **Gift** (regalos, buzón, wishlist, trueques), **Arena PvP** (ELO, 9 divisiones, 5 acciones de combate), **Quiz** de programación (42 preguntas, 5 dificultades), **Draw & Guess** (55 palabras, pistas progresivas), **Prestige** (10 rangos, rachas, medallas) y **Clan** completo (territorios, guerras 24h, alianzas, tesorería). Documentación completa (`docs/`) y nuevos comandos/fixes de esta tanda.

## [8.1.1] — 2026-06-08

Librería (`lib/`) completada, IA Hepein mejorada, y sistema de mensajes interactivos (botones nativos, listas, carrusel, álbum).

## [8.1.0] — 2026-06-05 / 2026-06-07

Primera versión con IA activa, sistema JadiBot (sub-bots), `groupinfo`, gacha, RPG base, comandos de owner y mejoras generales de terminal.

## [8.0.0] — 2026-06-01

Primera versión de la arquitectura de tres capas: **TypeScript + Python + Rust**.

---

[8.5.0]: https://github.com/Brashkie/WinsiBot/compare/v8.4.3...v8.5.0
[8.4.3]: https://github.com/Brashkie/WinsiBot/compare/v8.4.2...v8.4.3
[8.4.2]: https://github.com/Brashkie/WinsiBot/compare/v8.4.1...v8.4.2
[8.4.1]: https://github.com/Brashkie/WinsiBot/compare/v8.4.0...v8.4.1
[8.4.0]: https://github.com/Brashkie/WinsiBot/compare/v8.2.1...v8.4.0
[8.2.1]: https://github.com/Brashkie/WinsiBot/compare/v8.2.0...v8.2.1
