<div align="center">

# 📖 Referencia de Comandos — WinsiBot v8.5.0

[![Comandos](https://img.shields.io/badge/Comandos-150%2B-6C63FF?style=for-the-badge)](.)
[![Categorías](https://img.shields.io/badge/Categorías-19-00C9FF?style=for-the-badge)](.)
[![Versión](https://img.shields.io/badge/Versión-8.5.0-brightgreen?style=flat-square)](../README.md)

[🇬🇧 English version →](commands.en.md) &nbsp;·&nbsp; [💰 Guía de economía →](economy.md) &nbsp;·&nbsp; [← Volver al README](../README.md)

</div>

---

## Convenciones

| Símbolo | Significado |
|:-------:|-------------|
| `<arg>` | Argumento requerido |
| `[arg]` | Argumento opcional |
| `@mención` | Mencionar un usuario en el mensaje |
| `↩️ citar` | Responder (citar) el mensaje del usuario |
| `⏱️ Xs` | Cooldown entre usos del comando |
| `👤` | Cualquier usuario registrado |
| `⭐` | Usuario premium o superior |
| `🤝` | Helper o superior |
| `🛡️` | Mod o superior |
| `🔧` | Dev o superior |
| `👑` | Solo Owner |
| `🔑` | Admin del grupo (WhatsApp) |

> **Prefijos:** `!` · `.` · `#` · `/`
> Ejemplos: `!ping`, `.gpt Hola`, `#perfil`, `/menu`

---

## Índice de Categorías

| # | Categoría | Comandos |
|---|-----------|:--------:|
| 1 | [🛠️ General](#%EF%B8%8F-general) | 7 |
| 2 | [🤖 IA / ChatGPT](#-ia--chatgpt) | 4 |
| 3 | [🎮 RPG / Economía](#-rpg--economía) | 20 |
| 4 | [🎴 Gacha / Personajes](#-gacha--personajes) | 6 |
| 5 | [💑 Parejas](#-parejas) | 5 |
| 6 | [🎭 Roleplay](#-roleplay) | 9 |
| 7 | [🎉 Diversión](#-diversión) | 12 |
| 8 | [🕹️ Juegos](#%EF%B8%8F-juegos) | 3 |
| 9 | [🎁 Regalos](#-regalos) | 1 |
| 10 | [🖼️ Media & Stickers](#%EF%B8%8F-media--stickers) | 6 |
| 11 | [🔽 Descargas](#-descargas) | 7 |
| 12 | [🔍 Scrapers / Búsqueda](#-scrapers--búsqueda) | 4 |
| 13 | [🎵 Música](#-música) | 1 |
| 14 | [🔞 NSFW](#-nsfw) | 5 |
| 15 | [🔑 Admin del grupo](#-admin-del-grupo) | 13 |
| 16 | [🤖 JadiBot](#-jadibot) | 2 |
| 17 | [ℹ️ Info](#%EF%B8%8F-info) | 2 |
| 18 | [👑 Owner / Sistema](#-owner--sistema) | 23 |

---

## 🛠️ General

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `ping` | `p` | 3s | 👤 | Verifica que el bot esté activo, muestra latencia |
| `menu` | `help`, `ayuda` | — | 👤 | Lista todas las categorías de comandos |
| `categoria` | `cat`, `category` | — | 👤 | Muestra los comandos de una categoría específica |
| `afk` | `ausente` | 10s | 👤 | Activa modo AFK con una razón personalizada |
| `creator` | `info`, `about`, `botinfo`, `creador` | — | 👤 | Información del bot y su creador |

```
!ping
!menu
!categoria rpg
!afk estudiando para el examen
```

---

## 🤖 IA / ChatGPT

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `gpt` | `ai`, `chatgpt`, `ask` | — | 👤 | Chat con GPT-4o-mini, conserva historial por usuario |
| `gptreset` | — | — | 👤 | Borra tu historial de conversación con la IA |
| `imagine` | `dalle`, `img`, `imagen` | — | ⭐ | Genera una imagen con DALL-E 3 |
| `traducir` | `tl`, `translate`, `tr` | — | 👤 | Traduce texto a cualquier idioma (50+ idiomas) |

> Prioridad: **Ollama (local)** → GPT → Claude → Gemini (fallback automático). Límite: 20 mensajes/hora por usuario.

```
!gpt Explícame la relatividad
!gptreset
!imagine un dragón en el espacio
!traducir en Hello world
!tl ja こんにちは
```

---

## 🎮 RPG / Economía

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `perfil` | `profile`, `miperfil`, `yo` | 5s | 👤 | Ver tu perfil o el de otro usuario (`@mención`) |
| `xp` | `exp`, `experiencia`, `stats`, `nivel` | 5s | 👤 | Estadísticas RPG detalladas |
| `rangos` | `roles`, `rango`, `rol`, `ranks` | 10s | 👤 | Tabla de rangos del servidor |
| `work` | `trabajar`, `trabajo`, `w` | 10min | 👤 | Trabaja para ganar BrasCoins (cada 10 min) |
| `daily` | `claim`, `reclamar`, `regalo` | diario (medianoche) | 👤 | Recompensa diaria — sube con tu racha de días consecutivos (bono ×1.00–×1.20+, combina racha, fin de semana, premium y prestigio) |
| `weekly` | `semana`, `semanal`, `cadasemana` | 3d | 👤 | Recompensa semanal (cada 3 días) |
| `monthly` | `mes`, `mensual`, `cadames` | 5d | 👤 | Recompensa mensual (cada 5 días) |
| `minar` | `mine`, `minarxp`, `mining` | 10min | 👤 | Mina recursos para ganar XP y materiales |
| `cofre` | `coffer`, `abrircofre`, `caja` | diario (medianoche) | 👤 | Abre el cofre diario con recompensas aleatorias |
| `crime` | `crimen`, `delito` | 1h | 👤 | Comete un crimen — gana o pierde monedas |
| `rob` | `robar` | 2h | 👤 | Roba BrasCoins a otro usuario (`@mención`) |
| `transfer` | `transferir`, `dar`, `enviar` | 5s | 👤 | Transfiere BrasCoins o XP a otro usuario |
| `bal` | `balance`, `billetera`, `wallet`, `dinero`, `coins` | 3s | 👤 | Ver tu balance (billetera + banco), con ícono de BrasCoins |
| `baltop` | `balancetop`, `richtop`, `richlist`, `topbal`, `tbal` | 10s | 👤 | Top de usuarios con más CodPoints |
| `leveltop` | `toplevel`, `topnivel`, `niveltop`, `levelrank` | 10s | 👤 | Top de usuarios con más nivel |
| `depositar` | `dep`, `deposit`, `retirar`, `withdraw`, `banco` | 3s | 👤 | Deposita o retira monedas del banco |
| `prestige` | `prestigio`, `ascender` | — | 👤 | Reinicia progreso a cambio de recompensas exclusivas |
| `mascota` | `pet`, `mimasocta`, `mipet` | 5s | 👤 | Gestiona tu mascota: alimentar, entrenar, evolucionar |
| `harem` | `waifus`, `claims`, `coleccion` | 5s | 👤 | Ver los personajes reclamados con `!rw`, ordenados por valor |
| `regalo` | `gift`, `dar`, `regalar` | 10s | 👤 | Regala monedas, XP o ítems a otro usuario |

```
!perfil
!perfil @usuario
!work
!daily
!minar
!rob @usuario
!transfer @usuario 500
!bal
!baltop
!leveltop
!depositar 1000
!retirar 500
!prestige
!mascota alimentar
!harem
!harem @usuario 2
!regalo @usuario 500 coins
```

---

---

## 🕹️ Juegos

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `arena` | `pvp`, `batalla`, `fight` | 30s | 👤 | Reta a otro usuario a un duelo PvP con apuesta de diamantes |
| `quiz` | `qz`, `pregunta`, `coding` | 15s | 👤 | Pregunta de programación por categoría (JS, Python, SQL…) |
| `adivinar` | `drawguess`, `dibujar`, `guess` | 20s | 👤 | Mini-juego de dibujar y adivinar en grupo |

```
!arena @usuario 10
!quiz javascript
!adivinar iniciar
```

---

## 🎁 Regalos

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `regalo` | `gift`, `dar`, `regalar` | 10s | 👤 | Regala BrasCoins, XP o ítems a otro usuario |

```
!regalo @usuario 500 coins
!regalo @usuario 200 xp
```

---

## 🎴 Gacha / Personajes

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `rw` | `roll`, `rollimage`, `gacha`, `rollwaifu` | variable | 👤 | Obtiene un personaje aleatorio del gacha |
| `c` | `claim`, `reclamar` | — | 👤 | Reclama el personaje activo (citando su mensaje) |
| `wimage` | `waifuimage`, `wi` | 5s | 👤 | Imagen aleatoria de un personaje |
| `winfo` | `waifuinfo`, `charinfo` | 5s | 👤 | Información detallada de un personaje |
| `trade` | `intercambio`, `cambio` | 10s | 👤 | Intercambia personajes con otro usuario |

```
!rw
!c          ← citar el mensaje del personaje
!wimage Rem
!winfo Naruto
!trade @usuario
```

---

## 💑 Parejas

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `pareja` | `couple`, `elegirpareja`, `serpareja` | — | 👤 | Propone una relación a alguien (`@mención`) |
| `aceptar` | `acepto`, `accept` | — | 👤 | Acepta una propuesta de pareja |
| `rechazar` | `cancelar`, `decline` | — | 👤 | Rechaza una propuesta de pareja |
| `mipareja` | `miamor`, `mylove`, `minovio`, `minovia` | — | 👤 | Ver el estado de tu relación actual |
| `terminar` | `cortar`, `romper`, `finish` | — | 👤 | Termina tu relación o cancela una propuesta |

```
!pareja @usuario
!aceptar @quien_propuso
!mipareja
!terminar
```

---

## 🎭 Roleplay

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `hug` | `abrazar`, `abrazo`, `hug1` | 5s | 👤 | Abraza a alguien (`@mención`) |
| `kiss` | `beso`, `kiss1` | 5s | 👤 | Besa a alguien (`@mención`) |
| `kisscheeks` | `besomejilla`, `mejilla`, `kisscheek` | 5s | 👤 | Besa la mejilla de alguien (`@mención`) |
| `pat` | `acariciar`, `pat1` | 5s | 👤 | Acaricia a alguien (`@mención`) |
| `kill` | `matar`, `kill1` | 5s | 👤 | Mata a alguien en roleplay (`@mención`) |
| `punch` | `golpear`, `puñetazo`, `puñete` | 5s | 👤 | Golpea a alguien (`@mención`) |
| `laugh` | `reir`, `jaja`, `lol` | 5s | 👤 | Ríe (o se ríe de alguien) |
| `sad` | `triste` | 5s | 👤 | Muestra tristeza (o pone triste a alguien) |
| `sleep` | `dormir`, `duerme` | 5s | 👤 | Se queda dormido (o hace dormir a alguien) |

```
!hug @usuario
!kiss @usuario
!kisscheeks @usuario
!pat @usuario
!kill @usuario
!punch @usuario
!laugh
!sad
!sleep
```

---

## 🎉 Diversión

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `meme` | `memes`, `randommeme` | 5s | 👤 | Meme aleatorio de Reddit |
| `memepe` | `mecausa`, `memeperu` | 5s | 👤 | Meme peruano aleatorio |
| `giphy` | `gif` | 5s | 👤 | Busca un GIF en GIPHY |
| `top` | `top10`, `ranking` | 5s | 👤 | Top 10 aleatorio con miembros del grupo |
| `sus` | `impostor`, `among` | 5s | 👤 | Acusa a alguien de ser el impostor |
| `insultar` | `insult`, `abuse`, `ofender` | 5s | 👤 | Insulta a alguien creativamente |
| `banana` | `bana`, `pito`, `pp`, `miembro` | 5s | 👤 | Mide el pito con probabilidades reales xd |
| `melones` | `pechos`, `boobs`, `copa` | 5s | 👤 | Mide los melones con probabilidades reales xd |
| `sega` | `fap`, `paja`, `chaquetita`, `ganzo` | 10s | 👤 | Animación divertida |
| `follar` | `coger` | 5s | 👤 | Comando +18 (requiere NSFW activado en el grupo) |
| `reto` | `dare` | 5s | 👤 | Reto aleatorio para jugar en el grupo (@mención o ↩️ citar opcional) |
| `verdad` | `truth` | 5s | 👤 | Pregunta aleatoria de Verdad o Reto (@mención o ↩️ citar opcional) |
| `tweet` | `faketweet` | 10s | 👤 | Genera una imagen de tweet falso con tu texto — mandá/citá una imagen junto al texto para incluirla en el tweet |

```
!meme
!giphy gato bailando
!top mejores gamers
!sus @usuario
!insultar @usuario
!reto @usuario
!verdad
!tweet hoy es un buen día
```

---

## 🖼️ Media & Stickers

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `sticker` | `s`, `stiker` | — | 👤 | Convierte imagen/video a sticker |
| `stickerpack` | `packsticker`, `spack` | 30s | 👤 | Descarga un paquete de stickers desde getstickerpack.com |
| `removebg` | `rmbg`, `sinfondo`, `nobg`, `quitarfondo` | 30s | 👤 | Elimina el fondo de una imagen |
| `anime` | `anime4k` | 30s | 👤 | Mejora la resolución de una imagen (x2 o x4) — no cambia el estilo |
| `toanime` | `animegan`, `cartoonize` | 30s | 👤 | Convierte una foto real a estilo anime de verdad (AnimeGANv2) |
| `imagen` | `img`, `image`, `gimage`, `buscarimg` | 10s | 👤 | Busca imágenes en internet |
| `lego` | `legofy`, `legoimg` | 15s | 👤 | Convierte una imagen en un mosaico estilo LEGO — citar imagen, tamaño de ficha opcional |

```
!sticker          ← adjuntar o citar imagen
!stickerpack https://getstickerpack.com/stickers/flork-memes
!removebg         ← citar imagen
!anime x4         ← citar imagen
!imagen perros jugando
!lego             ← citar imagen (tamaño de ficha por defecto)
!lego 10          ← citar imagen, fichas chicas (más detalle)
```

---

## 🔽 Descargas

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `ytmp3` | `yt`, `youtube`, `ytaudio` | 15s | 👤 | Descarga audio de YouTube como MP3 — tarjeta con canal, duración, vistas, fecha y enlace |
| `ytmp4` | `play2`, `mp4`, `ytvideo`, `playvideo` | 15s | 👤 | Descarga video de YouTube (360p) — misma tarjeta + calidad y tamaño |
| `tiktok` | `tt`, `tik` | 10s | 👤 | Descarga video de TikTok sin marca de agua |
| `ttsearch` | `vitiktok`, `tiktoksearch`, `ttsb` | 15s | 👤 | Busca videos en TikTok y muestra carrusel con botones de descarga |
| `ig` | `instagram`, `insta` | — | 👤 | Descarga foto/video de Instagram |
| `apk` | `apkdl`, `buscarapk` | 10s | 👤 | Busca una aplicación en Aptoide y muestra resultados en carrusel |
| `downloadapk` | `apkdownload`, `getapk` | 30s | 💎×2 | Descarga el APK seleccionado del carrusel `!apk` |

```
!ytmp3 https://youtube.com/watch?v=...
!ytmp3 Shape of You Ed Sheeran
!ytmp4 Shape of You Ed Sheeran
!tiktok https://vm.tiktok.com/...
!ttsearch gatos graciosos
!ig https://www.instagram.com/p/...
!apk minecraft
!downloadapk          ← pulsar botón del carrusel !apk
```

---

## 🔍 Scrapers / Búsqueda

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `imagen` | `img`, `gimage`, `buscarimg` | 10s | 👤 | Busca imágenes en internet |
| `pinterest` | `pin`, `pint` | 8s | 👤 | Busca imágenes en Pinterest |
| `giphy` | `gif` | 5s | 👤 | Busca GIFs en GIPHY |
| `clima` | `weather`, `tiempo` | — | 👤 | Consulta el clima de una ciudad |

```
!pinterest aesthetic room
!clima Lima
!clima New York
```

---

## 🎵 Música

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `spotify` | `sp`, `spoti` | — | 👤 | Información de una canción en Spotify |

```
!spotify Bohemian Rhapsody
!sp Feid INTER SHIBUYA
```

---

## 🔞 NSFW

> ⚠️ Requiere que el admin del grupo active NSFW con `!on nsfw`

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `porn` | `porngif` | 10s | 👤 | Video para adultos (solo si NSFW está activado) |
| `rule34` | `r34` | 10s | 👤 | Busca una imagen en Rule34 por tag |
| `rule34video` | `r34video`, `r34v`, `rvideo34` | 15s | 👤 | Busca un video en rule34video.com por texto — no requiere API key |
| `sexyimg` | `imgsexy`, `randomsexy` | 8s | 👤 | Imagen +18 aleatoria |
| `stickerporn` | `stickernsfw`, `sticker18` | 10s | 👤 | Sticker +18 aleatorio |

```
!rule34 hinata
!rule34video hinata
!sexyimg
!stickerporn
```

---

## 🔑 Admin del grupo

> Todos requieren ser admin del grupo en WhatsApp, salvo indicación.

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `ban` | `banear` | — | 🔑 | Banea a un usuario del bot |
| `kick` | `expulsar` | — | 🔑 | Expulsa a un usuario del grupo |
| `warn` | `advertir` | — | 🔑 | Advierte a un usuario (auto-kick al límite) |
| `demote` | `quitaradmin`, `desadmin` | — | 🔑 | Quita el rol de administrador a un miembro |
| `tag` | `tagall`, `todos`, `all` | — | 🔑 | Menciona a todos los miembros del grupo |
| `tagone` | `tago`, `mention` | — | 🔑 | Menciona a una persona específica |
| `delete` | `del`, `borrar`, `eliminar` | — | 🔑 | Elimina el mensaje citado |
| `antilink` | `antienlace` | — | 🔑 | Activa/desactiva filtro de links |
| `mute` | `silenciar`, `unmute` | — | 🔑 | Silencia o activa el bot en el grupo |
| `banchat` | `bangrupo`, `unbanchat` | — | 🛡️ | Silencia/activa el bot en este grupo |
| `groupinfo` | `grupoinfo`, `gcfg` | — | 🔑 | Información del grupo + tu perfil en él |
| `stats` | `estadisticas` | — | 🔑 | Estadísticas del bot en el grupo |
| `on` / `off` | `enable`, `disable` | — | 🔑 | Activa o desactiva funciones del grupo |

**Configuraciones con `!on` / `!off`:**

| Clave | Descripción | Requiere |
|-------|-------------|:--------:|
| `antilink` | Elimina links del grupo | 🔑 |
| `antispam` | Detecta y elimina spam | 🔑 |
| `antifake` | Bloquea números falsos/virtuales | 🔑 |
| `antidelete` | Muestra mensajes eliminados | 🔑 |
| `modoadmin` | Solo admins pueden usar comandos | 🔑 |
| `welcome` | Mensajes de bienvenida y despedida | 🔑 |
| `detect` | Avisos de cambios en el grupo | 🔑 |
| `nsfw` | Activa comandos +18 | 🔑 |
| `muted` | Bot no responde en este grupo | 🔑 |
| `hepein` | IA responde cuando la mencionan | 🔑 |
| `autolevelup` | Anuncia en el chat cuando alguien sube de nivel (desactivado por defecto) | 🔑 |
| `anticall` | Rechaza llamadas automáticamente | 👑 |

```
!ban @usuario
!kick @usuario
!warn @usuario 3
!tag Atención a todos
!on antilink
!off welcome
!on nsfw
!groupinfo
```

---

## 🤖 JadiBot

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `serbot` | `jadibot`, `subbot`, `listbots` | — | 👤 | Conviértete en sub-bot · `serbot lista` para ver activos · `serbot reconectar` (👑) fuerza el reintento de todos los caídos |
| `stopbot` | `salirbot`, `desconectarbot`, `pararbot` | — | 👤 | Desconectarte como sub-bot |

```
!serbot
!serbot lista
!serbot reconectar
!stopbot
```

---

## ℹ️ Info

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `creator` | `info`, `about`, `botinfo`, `creador` | — | 👤 | Información del bot y su creador |
| `infobot` | `botstatus`, `enterprise` | — | 👤 | Tarjeta de identidad del bot — versión, comandos, uptime, características |
| `roblox` | `rbx`, `robloxinfo` | 8s | 👤 | Busca un usuario de Roblox por nombre o ID |
| `mcsearch` | `xblsearch`, `gamertag` | 8s | 👤 | Busca un perfil de Xbox Live por Gamertag *(requiere `XBL_API_KEY`)* |
| `mcfriends` | `xblfriends` | 10s | 👤 | Amigos de Xbox Live de un jugador, en carrusel *(requiere `XBL_API_KEY`)* |
| `mcachievement` | `mcachievements`, `xblachievement` | 10s | 👤 | Logros de Xbox Live de un jugador *(requiere `XBL_API_KEY`)* |
| `mcuuid` | — | 5s | 👤 | UUID de un jugador de Minecraft Java |
| `mcavatar` | — | 5s | 👤 | Avatar (cara+cuerpo) de un jugador de Minecraft Java |
| `mchead` | — | 5s | 👤 | Cabeza 3D de un jugador de Minecraft Java |
| `mcbody` | — | 5s | 👤 | Cuerpo 3D de un jugador de Minecraft Java |
| `mcskin` | — | 5s | 👤 | Descarga la skin de un jugador de Minecraft Java |

```
!creator
!infobot
!roblox builderman
!mcsearch Notch
!mcfriends Notch
!mcavatar Notch
```

---

## 👑 Owner / Sistema

> Solo disponible para el owner configurado en `.env` y en `src/lib/globals.ts`.

| Comando | Aliases | Cooldown | Permiso | Descripción |
|---------|---------|:--------:|:-------:|-------------|
| `addpremium` | `delpremium`, `addvip`, `delvip` | — | 👑 | Añade o quita premium a un usuario |
| `addcoins` | `delcoins`, `darcoins`, `quitarcoins` | — | 👑 | Añade o quita BrasCoins a un usuario |
| `adddiamonds` | `deldiamonds`, `dardiamantes` | — | 👑 | Añade o quita diamantes a un usuario |
| `addexp` | `delexp`, `addxp`, `darexp` | — | 👑 | Añade o quita EXP a un usuario |
| `addowner` | `delowner` | — | 👑 | Agrega o remueve un owner en runtime |
| `unban` | `desbanear`, `unbanuser` | — | 👑 | Desbanea a un usuario de la base de datos |
| `resetuser` | `resetdata`, `borrardatos` | — | 👑 | Reinicia todos los datos de un usuario |
| `block` | `unblock`, `bloquear`, `desbloquear` | — | 👑 | Bloquea o desbloquea un número en WhatsApp |
| `bc` | `bcgroup`, `bcprivate`, `broadcast` | — | 👑 | Envía un mensaje a todos los chats |
| `boost` | `refresh`, `acelerar` | — | 👑 | Reinicia caché y muestra estado del bot |
| `backup` | `respaldo` | — | 👑 | Envía `creds.json` al privado del owner |
| `clearsession` | `clearsess`, `limpiarsesion` | — | 👑 | Elimina archivos de sesión excepto `creds.json` |
| `cleartmp` | `limpiartmp`, `clearcache` | — | 👑 | Limpia archivos temporales del servidor |
| `creategroup` | `creargc`, `newgroup`, `nuevogc` | — | 👑 | Crea un nuevo grupo con una lista de JIDs |
| `join` | `joingroup`, `unirse` | — | 👑 | Une el bot a un grupo por link de invitación |
| `leave` | `leavegc`, `salir`, `salirgrupo` | — | 👑 | Hace que el bot salga del grupo actual o por ID |
| `setbio` | `bio`, `estado` | — | 👑 | Cambia la bio/estado del bot en WhatsApp |
| `setname` | `nombrar`, `nombre` | — | 👑 | Cambia el nombre del bot en WhatsApp |
| `setpp` | `fotobot`, `cambiafoto` | — | 👑 | Cambia la foto de perfil del bot |
| `exec` | `eval`, `run` | — | 👑 | Ejecuta código JavaScript en el contexto del bot |
| `terminal` | `term`, `shell`, `cmd` | — | 👑 | Ejecuta un comando en la terminal del servidor |
| `fetch` | `get`, `url` | — | 👑 | Obtiene el contenido de una URL |
| `restart` | `reiniciar`, `reboot`, `reset` | — | 👑 | Reinicia el bot (requiere PM2 o nodemon) |

```
!addpremium @usuario 30        ← 30 días de premium
!delpremium @usuario
!addcoins @usuario 5000
!bc Hola a todos!
!exec ctx.userData.size
!terminal ls -la
!setbio WinsiBot está en línea 🟢
!restart
```

---

<div align="center">

**[← Volver al README](../README.md)** &nbsp;·&nbsp; **[🇬🇧 English version →](commands.en.md)**

*WinsiBot v8.3.0 — Desarrollado por [Brashkie](https://github.com/Brashkie)*

</div>
