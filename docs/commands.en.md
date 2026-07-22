<div align="center">

# 📖 Command Reference — WinsiBot v8.5.1

[![Commands](https://img.shields.io/badge/Commands-150%2B-6C63FF?style=for-the-badge)](.)
[![Categories](https://img.shields.io/badge/Categories-19-00C9FF?style=for-the-badge)](.)
[![Version](https://img.shields.io/badge/Version-8.5.1-brightgreen?style=flat-square)](../README.en.md)

[🇪🇸 Versión en español →](commands.md) &nbsp;·&nbsp; [💰 Economy guide →](economy.en.md) &nbsp;·&nbsp; [← Back to README](../README.en.md)

</div>

---

## Conventions

| Symbol | Meaning |
|:------:|---------|
| `<arg>` | Required argument |
| `[arg]` | Optional argument |
| `@mention` | Mention a user in the message |
| `↩️ reply` | Quote/reply to the user's message |
| `⏱️ Xs` | Cooldown between uses |
| `👤` | Any registered user |
| `⭐` | Premium user or higher |
| `🤝` | Helper or higher |
| `🛡️` | Mod or higher |
| `🔧` | Dev or higher |
| `👑` | Owner only |
| `🔑` | WhatsApp group admin |

> **Prefixes:** `!` · `.` · `#` · `/`
> Examples: `!ping`, `.gpt Hello`, `#profile`, `/menu`

---

## Category Index

| # | Category | Commands |
|---|----------|:--------:|
| 1 | [🛠️ General](#%EF%B8%8F-general) | 7 |
| 2 | [🤖 AI / ChatGPT](#-ai--chatgpt) | 4 |
| 3 | [🎮 RPG / Economy](#-rpg--economy) | 20 |
| 4 | [🎴 Gacha / Characters](#-gacha--characters) | 6 |
| 5 | [💑 Couples](#-couples) | 5 |
| 6 | [🎭 Roleplay](#-roleplay) | 9 |
| 7 | [🎉 Fun](#-fun) | 12 |
| 8 | [🕹️ Games](#%EF%B8%8F-games) | 3 |
| 9 | [🎁 Gifts](#-gifts) | 1 |
| 10 | [🖼️ Media & Stickers](#%EF%B8%8F-media--stickers) | 6 |
| 11 | [🔽 Downloads](#-downloads) | 7 |
| 12 | [🔍 Scrapers / Search](#-scrapers--search) | 4 |
| 13 | [🎵 Music](#-music) | 1 |
| 14 | [🔞 NSFW](#-nsfw) | 5 |
| 15 | [🔑 Group Admin](#-group-admin) | 13 |
| 16 | [🤖 JadiBot](#-jadibot) | 2 |
| 17 | [ℹ️ Info](#%EF%B8%8F-info) | 2 |
| 18 | [👑 Owner / System](#-owner--system) | 23 |

---

## 🛠️ General

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `ping` | `p` | 3s | 👤 | Check bot status and show latency |
| `menu` | `help`, `ayuda` | — | 👤 | List all command categories |
| `categoria` | `cat`, `category` | — | 👤 | Show commands for a specific category |
| `afk` | `ausente` | 10s | 👤 | Activate AFK mode with a custom reason |
| `creator` | `info`, `about`, `botinfo`, `creador` | — | 👤 | Bot and creator information |

```
!ping
!menu
!categoria rpg
!afk studying for exams
```

---

## 🤖 AI / ChatGPT

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `gpt` | `ai`, `chatgpt`, `ask` | — | 👤 | Chat with GPT-4o-mini, keeps history per user |
| `gptreset` | — | — | 👤 | Clear your AI conversation history |
| `imagine` | `dalle`, `img`, `imagen` | — | ⭐ | Generate an image with DALL-E 3 |
| `traducir` | `tl`, `translate`, `tr` | — | 👤 | Translate text to any language (50+ languages) |

> Priority: **Ollama (local)** → GPT → Claude → Gemini (automatic fallback). Limit: 20 messages/hour per user.

```
!gpt Explain relativity
!gptreset
!imagine a dragon in space
!traducir es Hello world
!tl ja こんにちは
```

---

## 🎮 RPG / Economy

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `perfil` | `profile`, `miperfil`, `yo` | 5s | 👤 | View your profile or another user's (`@mention`) |
| `xp` | `exp`, `experiencia`, `stats`, `nivel` | 5s | 👤 | Detailed RPG statistics |
| `rangos` | `roles`, `rango`, `rol`, `ranks` | 10s | 👤 | Server rank table |
| `work` | `trabajar`, `trabajo`, `w` | 10min | 👤 | Work to earn BrasCoins (every 10 min) |
| `daily` | `claim`, `reclamar`, `regalo` | daily (resets at midnight) | 👤 | Daily reward — scales with your consecutive-day streak (×1.00–×1.20+ bonus combining streak, weekend, premium and prestige) |
| `weekly` | `semana`, `semanal`, `cadasemana` | 3d | 👤 | Weekly reward (every 3 days) |
| `monthly` | `mes`, `mensual`, `cadames` | 5d | 👤 | Monthly reward (every 5 days) |
| `minar` | `mine`, `minarxp`, `mining` | 10min | 👤 | Mine resources for XP and materials |
| `cofre` | `coffer`, `abrircofre`, `caja` | daily (resets at midnight) | 👤 | Open the daily chest for random rewards |
| `crime` | `crimen`, `delito` | 1h | 👤 | Commit a crime — win or lose coins |
| `ascuas` | `embers`, `brasas` | 3h | 👤 | Search for BrasEmbers (scarce currency, costs to use on NSFW commands) — 50% success chance |
| `business` | `negocio`, `negocios`, `empresa`, `empresas` | 3s | 👤 | Buy businesses that generate passive BrasCoins per hour |
| `collect` | `recolectar`, `cobrar` | 5s | 👤 | Collect accumulated income from your businesses |
| `rob` | `robar` | 2h | 👤 | Steal BrasCoins from another user (`@mention`) |
| `transfer` | `transferir`, `dar`, `enviar` | 5s | 👤 | Transfer BrasCoins or XP to another user |
| `bal` | `balance`, `billetera`, `wallet`, `dinero`, `coins` | 3s | 👤 | View your balance (wallet + bank), with BrasCoins icon |
| `baltop` | `balancetop`, `richtop`, `richlist`, `topbal`, `tbal` | 10s | 👤 | Top users by CodPoints |
| `leveltop` | `toplevel`, `topnivel`, `niveltop`, `levelrank` | 10s | 👤 | Top users by level |
| `depositar` | `dep`, `deposit`, `retirar`, `withdraw`, `banco` | 3s | 👤 | Deposit or withdraw coins from the bank |
| `prestige` | `prestigio`, `ascender` | — | 👤 | Reset progress in exchange for exclusive prestige rewards |
| `pet` | `mascota`, `mipet`, `dragon`, `dragones` | 3s | 👤 | Dragon City: hatch eggs, feed with Gold and evolve your dragons (579 available) |
| `harem` | `waifus`, `claims`, `coleccion` | 5s | 👤 | View characters claimed with `!rw`, sorted by value |
| `regalo` | `gift`, `dar`, `regalar` | 10s | 👤 | Gift coins, XP or items to another user |

```
!perfil
!perfil @user
!work
!daily
!minar
!rob @user
!transfer @user 500
!bal
!baltop
!leveltop
!depositar 1000
!retirar 500
!prestige
!pet hatch
!pet feed 1
!pet collect
!harem
!harem @user 2
!regalo @user 500 coins
```

---

---

## 🕹️ Games

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `arena` | `pvp`, `batalla`, `fight` | 30s | 👤 | Challenge another user to a 1v1 PvP duel with a diamond wager |
| `quiz` | `qz`, `pregunta`, `coding` | 15s | 👤 | Programming question by category (JS, Python, SQL…) |
| `adivinar` | `drawguess`, `dibujar`, `guess` | 20s | 👤 | Group draw-and-guess mini-game |

```
!arena @user 10
!quiz javascript
!adivinar start
```

---

## 🎁 Gifts

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `regalo` | `gift`, `dar`, `regalar` | 10s | 👤 | Gift BrasCoins, XP or items to another user |

```
!regalo @user 500 coins
!regalo @user 200 xp
```

---

## 🎴 Gacha / Characters

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `rw` | `roll`, `rollimage`, `gacha`, `rollwaifu` | variable | 👤 | Get a random character from the gacha |
| `c` | `claim`, `reclamar` | — | 👤 | Claim the active character (by replying to its message) |
| `wimage` | `waifuimage`, `wi` | 5s | 👤 | Random image of a character |
| `winfo` | `waifuinfo`, `charinfo` | 5s | 👤 | Detailed information about a character |
| `trade` | `intercambio`, `cambio` | 10s | 👤 | Trade characters with another user |

```
!rw
!c          ← reply to the character's message
!wimage Rem
!winfo Naruto
!trade @user
```

---

## 💑 Couples

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `pareja` | `couple`, `elegirpareja`, `serpareja` | — | 👤 | Propose a relationship to someone (`@mention`) |
| `aceptar` | `acepto`, `accept` | — | 👤 | Accept a relationship proposal |
| `rechazar` | `cancelar`, `decline` | — | 👤 | Reject a relationship proposal |
| `mipareja` | `miamor`, `mylove`, `minovio`, `minovia` | — | 👤 | View your current relationship status |
| `terminar` | `cortar`, `romper`, `finish` | — | 👤 | End your relationship or cancel a pending proposal |

```
!pareja @user
!aceptar @who_proposed
!mipareja
!terminar
```

---

## 🎭 Roleplay

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `hug` | `abrazar`, `abrazo`, `hug1` | 5s | 👤 | Hug someone (`@mention`) |
| `kiss` | `beso`, `kiss1` | 5s | 👤 | Kiss someone (`@mention`) |
| `kisscheeks` | `besomejilla`, `mejilla`, `kisscheek` | 5s | 👤 | Kiss someone's cheek (`@mention`) |
| `pat` | `acariciar`, `pat1` | 5s | 👤 | Pat someone (`@mention`) |
| `kill` | `matar`, `kill1` | 5s | 👤 | Kill someone (roleplay) (`@mention`) |
| `punch` | `golpear`, `puñetazo`, `puñete` | 5s | 👤 | Punch someone (`@mention`) |
| `laugh` | `reir`, `jaja`, `lol` | 5s | 👤 | Laugh (or laugh at someone) |
| `sad` | `triste` | 5s | 👤 | Show sadness (or make someone sad) |
| `sleep` | `dormir`, `duerme` | 5s | 👤 | Fall asleep (or put someone to sleep) |

```
!hug @user
!kiss @user
!kisscheeks @user
!pat @user
!kill @user
!punch @user
!laugh
!sad
!sleep
```

---

## 🎉 Fun

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `meme` | `memes`, `randommeme` | 5s | 👤 | Random meme from Reddit |
| `memepe` | `mecausa`, `memeperu` | 5s | 👤 | Random Peruvian meme |
| `giphy` | `gif` | 5s | 👤 | Search a GIF on GIPHY |
| `top` | `top10`, `ranking` | 5s | 👤 | Random top 10 with group members |
| `sus` | `impostor`, `among` | 5s | 👤 | Accuse someone of being the impostor |
| `insultar` | `insult`, `abuse`, `ofender` | 5s | 👤 | Creatively insult someone |
| `banana` | `bana`, `pito`, `pp`, `miembro` | 5s | 👤 | Measure the pp (just for laughs) |
| `melones` | `pechos`, `boobs`, `copa` | 5s | 👤 | Measure the melons (just for laughs) |
| `sega` | `fap`, `paja`, `chaquetita`, `ganzo` | 10s | 👤 | Fun animation |
| `follar` | `coger` | 5s | 👤 | +18 command (requires NSFW enabled in group) |
| `reto` | `dare` | 5s | 👤 | Random dare to play in the group (optional @mention or ↩️ reply) |
| `verdad` | `truth` | 5s | 👤 | Random Truth or Dare question (optional @mention or ↩️ reply) |
| `tweet` | `faketweet` | 10s | 👤 | Generates a fake tweet image with your text — attach/reply with an image alongside the text to include it in the tweet |

```
!meme
!giphy dancing cat
!top best gamers
!sus @user
!insultar @user
!reto @user
!verdad
!tweet what a great day
```

---

## 🖼️ Media & Stickers

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `sticker` | `s`, `stiker` | — | 👤 | Convert image/video to sticker |
| `stickerpack` | `packsticker`, `spack` | 30s | 👤 | Download a sticker pack from getstickerpack.com |
| `removebg` | `rmbg`, `sinfondo`, `nobg`, `quitarfondo` | 30s | 👤 | Remove background from an image |
| `anime` | `anime4k` | 30s | 👤 | Upscale image resolution (x2 or x4) — does not change art style |
| `toanime` | `animegan`, `cartoonize` | 30s | 👤 | Converts a real photo into actual anime art style (AnimeGANv2) |
| `imagen` | `img`, `image`, `gimage`, `buscarimg` | 10s | 👤 | Search for images on the internet |
| `lego` | `legofy`, `legoimg` | 15s | 👤 | Turns an image into a LEGO-style mosaic — reply to an image, optional brick size |

```
!sticker        ← attach or reply to an image
!stickerpack https://getstickerpack.com/stickers/flork-memes
!removebg       ← reply to an image
!anime x4       ← reply to an image
!imagen dogs playing
!lego           ← reply to an image (default brick size)
!lego 10        ← reply to an image, small bricks (more detail)
```

---

## 🔽 Downloads

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `ytmp3` | `yt`, `youtube`, `ytaudio` | 15s | 👤 | Download YouTube audio as MP3 — card with channel, duration, views, upload date and link |
| `ytmp4` | `play2`, `mp4`, `ytvideo`, `playvideo` | 15s | 👤 | Download YouTube video (360p) — same card plus quality and size |
| `tiktok` | `tt`, `tik` | 10s | 👤 | Download TikTok video without watermark |
| `ttsearch` | `vitiktok`, `tiktoksearch`, `ttsb` | 15s | 👤 | Search TikTok videos, shows carousel with download buttons |
| `ig` | `instagram`, `insta` | — | 👤 | Download photo/video from Instagram |
| `apk` | `apkdl`, `buscarapk` | 10s | 👤 | Search an app on Aptoide and show results in a carousel |
| `downloadapk` | `apkdownload`, `getapk` | 30s | 💎×2 | Download the APK selected from the `!apk` carousel |

```
!ytmp3 https://youtube.com/watch?v=...
!ytmp3 Shape of You Ed Sheeran
!ytmp4 Shape of You Ed Sheeran
!tiktok https://vm.tiktok.com/...
!ttsearch funny cats
!ig https://www.instagram.com/p/...
!apk minecraft
!downloadapk        ← tap button from !apk carousel
```

---

## 🔍 Scrapers / Search

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `imagen` | `img`, `gimage`, `buscarimg` | 10s | 👤 | Search for images on the internet |
| `pinterest` | `pin`, `pint` | 8s | 👤 | Search images on Pinterest |
| `giphy` | `gif` | 5s | 👤 | Search GIFs on GIPHY |
| `clima` | `weather`, `tiempo` | — | 👤 | Check the weather in any city |

```
!pinterest aesthetic room
!weather London
!clima New York
```

---

## 🎵 Music

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `spotify` | `sp`, `spoti` | — | 👤 | Search song information on Spotify |
| `applemusic` | `am`, `itunes` | 5s | 👤 | Search a song on Apple Music |
| `deezer` | `dz` | 5s | 👤 | Search a song on Deezer |

```
!spotify Bohemian Rhapsody
!sp Feid INTER SHIBUYA
!applemusic Blinding Lights
!deezer Shape of You
```

---

## 🔞 NSFW

> ⚠️ Requires the group admin to enable NSFW with `!on nsfw`, and each costs **1 BrasEmber** per use (see `!ascuas` to earn them)

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `porn` | `porngif` | 10s | 👤 | Adult video (only if NSFW is enabled) |
| `rule34` | `r34` | 10s | 👤 | Search an image on Rule34 by tag |
| `rule34video` | `r34video`, `r34v`, `rvideo34` | 15s | 👤 | Search a video on rule34video.com by text — no API key required |
| `sexyimg` | `imgsexy`, `randomsexy` | 8s | 👤 | Random +18 image |
| `stickerporn` | `stickernsfw`, `sticker18` | 10s | 👤 | Random +18 sticker |

```
!rule34 hinata
!rule34video hinata
!sexyimg
!stickerporn
```

---

## 🔑 Group Admin

> All require being a WhatsApp group admin, unless noted otherwise.

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `ban` | `banear` | — | 🔑 | Ban a user from the bot |
| `kick` | `expulsar` | — | 🔑 | Remove a user from the group |
| `warn` | `advertir` | — | 🔑 | Warn a user (auto-kick at limit) |
| `demote` | `quitaradmin`, `desadmin` | — | 🔑 | Remove admin role from a member |
| `tag` | `tagall`, `todos`, `all` | — | 🔑 | Mention all group members |
| `tagone` | `tago`, `mention` | — | 🔑 | Mention a specific person |
| `delete` | `del`, `borrar`, `eliminar` | — | 🔑 | Delete a quoted message |
| `antilink` | `antienlace` | — | 🔑 | Toggle link filter |
| `mute` | `silenciar`, `unmute` | — | 🔑 | Mute or unmute the bot in the group |
| `banchat` | `bangrupo`, `unbanchat` | — | 🛡️ | Silence/activate the bot in this group |
| `groupinfo` | `grupoinfo`, `gcfg` | — | 🔑 | Group info + your profile in the group |
| `stats` | `estadisticas` | — | 🔑 | Bot statistics in the group |
| `on` / `off` | `enable`, `disable` | — | 🔑 | Toggle group features |

**Available settings with `!on` / `!off`:**

| Key | Description | Requires |
|-----|-------------|:--------:|
| `antilink` | Remove links from the group | 🔑 |
| `antispam` | Detect and remove spam | 🔑 |
| `antifake` | Block fake/virtual numbers | 🔑 |
| `antidelete` | Show deleted messages | 🔑 |
| `modoadmin` | Only admins can use commands | 🔑 |
| `welcome` | Welcome and goodbye messages | 🔑 |
| `detect` | Notifications for group changes | 🔑 |
| `nsfw` | Enable +18 commands | 🔑 |
| `muted` | Bot does not respond in this group | 🔑 |
| `hepein` | AI responds when mentioned | 🔑 |
| `autolevelup` | Announce in chat when someone levels up (disabled by default) | 🔑 |
| `anticall` | Automatically reject calls | 👑 |

```
!ban @user
!kick @user
!warn @user 3
!tag Attention everyone
!on antilink
!off welcome
!on nsfw
!groupinfo
```

---

## 🤖 JadiBot

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `serbot` | `jadibot`, `subbot`, `listbots` | — | 👤 | Become a sub-bot · `serbot lista` to list active · `serbot reconectar` (👑) forces an immediate retry of every disconnected sub-bot |
| `stopbot` | `salirbot`, `desconectarbot`, `pararbot` | — | 👤 | Disconnect as a sub-bot |

```
!serbot
!serbot lista
!serbot reconectar
!stopbot
```

---

## ℹ️ Info

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `creator` | `info`, `about`, `botinfo`, `creador` | — | 👤 | Bot and creator information |
| `infobot` | `botstatus`, `enterprise` | — | 👤 | Bot identity card — version, command count, uptime, features |
| `roblox` | `rbx`, `robloxinfo` | 8s | 👤 | Look up a Roblox user by name or ID |
| `mcsearch` | `xblsearch`, `gamertag` | 8s | 👤 | Look up an Xbox Live profile by Gamertag *(requires `XBL_API_KEY`)* |
| `mcfriends` | `xblfriends` | 10s | 👤 | Xbox Live friends of a player, shown as a carousel *(requires `XBL_API_KEY`)* |
| `mcachievement` | `mcachievements`, `xblachievement` | 10s | 👤 | Xbox Live achievements of a player *(requires `XBL_API_KEY`)* |
| `mcuuid` | — | 5s | 👤 | UUID of a Minecraft Java player |
| `mcavatar` | — | 5s | 👤 | Avatar (face+body) of a Minecraft Java player |
| `mchead` | — | 5s | 👤 | 3D head render of a Minecraft Java player |
| `mcbody` | — | 5s | 👤 | 3D body render of a Minecraft Java player |
| `mcskin` | — | 5s | 👤 | Download a Minecraft Java player's skin |

```
!creator
!infobot
!roblox builderman
!mcsearch Notch
!mcfriends Notch
!mcavatar Notch
```

---

## 👑 Owner / System

> Only available to the owner configured in `.env` and `src/lib/globals.ts`.

| Command | Aliases | Cooldown | Permission | Description |
|---------|---------|:--------:|:----------:|-------------|
| `addpremium` | `delpremium`, `addvip`, `delvip` | — | 👑 | Add or remove premium from a user |
| `addcoins` | `delcoins`, `darcoins`, `quitarcoins` | — | 👑 | Add or remove BrasCoins from a user |
| `adddiamonds` | `deldiamonds`, `dardiamantes` | — | 👑 | Add or remove diamonds from a user |
| `addexp` | `delexp`, `addxp`, `darexp` | — | 👑 | Add or remove EXP from a user |
| `addowner` | `delowner` | — | 👑 | Add or remove an owner at runtime |
| `unban` | `desbanear`, `unbanuser` | — | 👑 | Unban a user from the database |
| `resetuser` | `resetdata`, `borrardatos` | — | 👑 | Reset all data for a user |
| `block` | `unblock`, `bloquear`, `desbloquear` | — | 👑 | Block or unblock a number on WhatsApp |
| `bc` | `bcgroup`, `bcprivate`, `broadcast` | — | 👑 | Send a message to all chats |
| `boost` | `refresh`, `acelerar` | — | 👑 | Restart cache and show bot status |
| `backup` | `respaldo` | — | 👑 | Send `creds.json` to the owner's DM |
| `clearsession` | `clearsess`, `limpiarsesion` | — | 👑 | Delete session files except `creds.json` |
| `cleartmp` | `limpiartmp`, `clearcache` | — | 👑 | Clean temporary files on the server |
| `creategroup` | `creargc`, `newgroup`, `nuevogc` | — | 👑 | Create a new group with a list of JIDs |
| `join` | `joingroup`, `unirse` | — | 👑 | Make the bot join a group via invite link |
| `leave` | `leavegc`, `salir`, `salirgrupo` | — | 👑 | Make the bot leave the current or a specific group |
| `setbio` | `bio`, `estado` | — | 👑 | Change the bot's bio/status on WhatsApp |
| `setname` | `nombrar`, `nombre` | — | 👑 | Change the bot's display name on WhatsApp |
| `setpp` | `fotobot`, `cambiafoto` | — | 👑 | Change the bot's profile picture |
| `exec` | `eval`, `run` | — | 👑 | Execute JavaScript code in the bot's context |
| `terminal` | `term`, `shell`, `cmd` | — | 👑 | Execute a command in the server terminal |
| `fetch` | `get`, `url` | — | 👑 | Fetch the content of a URL |
| `restart` | `reiniciar`, `reboot`, `reset` | — | 👑 | Restart the bot (requires PM2 or nodemon) |

```
!addpremium @user 30        ← 30 days of premium
!delpremium @user
!addcoins @user 5000
!bc Hello everyone!
!exec ctx.userData.size
!terminal ls -la
!setbio WinsiBot is online 🟢
!restart
```

---

<div align="center">

**[← Back to README](../README.en.md)** &nbsp;·&nbsp; **[🇪🇸 Versión en español →](commands.md)**

*WinsiBot v8.3.0 — Developed by [Brashkie](https://github.com/Brashkie)*

</div>
