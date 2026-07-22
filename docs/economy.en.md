# 💰 Economy Guide — WinsiBot

How to earn BrasCoins, diamonds, pets, characters, trophies and items. Every command below was verified against the bot's actual code — if something changes, this doc gets updated along with it.

For the full command list (with aliases and permissions) see [commands.en.md](commands.en.md). To check your live cooldowns, use `!einfo`.

---

## 🪙 BrasCoins (your main currency)

BrasCoins (¥) is what you use to buy dragon eggs, gifts, and bet in games. It's kept either in your **wallet** (`money`) or your **bank** (`bank`) — see the [Bank](#-bank--protect-your-money) section below, it matters.

### Recurring income (no risk)

| Command | Cooldown | Requirement | Reward |
|---------|:--------:|:-----------:|--------|
| `!work` | 10 min | — | ¥300–1,500 (¥1,000–4,000 premium) + 50–200 XP |
| `!minar` (mine) | 10 min | — | ¥100–2,000 + XP + 0–5 💎 + magic points ✨ |
| `!daily` | 1×/day — resets at midnight | — | ¥300–3,500 + XP + 1–12 💎 + daily streak bonus (×1.00–×1.20+) |
| `!cofre` (chest) | 1×/day — resets at midnight | level 5 | ¥500–5,000 + XP + 3–30 💎 + ✨ |
| `!weekly` | every 3 days | level 7 | ¥500–4,000 + XP + 3–40 💎 + ⚔️ swords + ✨ |
| `!monthly` | every 5 days | level 10 | ¥2,000–15,000 + XP + 15–150 💎 + 🏆 legendaries + ⚔️ + ✨ |

All of these scale up if you're premium (see [Premium](#-premium)).

### Risk / reward

| Command | Cooldown | Requirement | How it works |
|---------|:--------:|:-----------:|----------------|
| `!crime` | 1h | groups only | 50% success chance (65% premium). Success: ¥500–8,000 + XP + sometimes 💎. Failure: you lose money and XP |
| `!slut` (+18) | 1h | — | No fail chance — always gives ¥1,000–10,000 (¥3,000–10,000 premium) |
| `!rob @user` | 2h | groups only | Steals up to 30% of what the target has in their **wallet** (max ¥4,000). If they have under ¥100, there's nothing to steal |

⚠️ `!rob` can only touch what the victim has in their wallet — anything in their bank (`!dep`) is safe.

### Betting and games

| Command | Cooldown | How it works |
|---------|:--------:|----------------|
| `!cf <heads\|tails> <amount>` (coinflip) | 20s | 50/50 — guess right and win ×2 your bet |
| `!rt <red\|black\|0-36> <amount>` (roulette) | 15s | Color: pays ×2. Exact number: pays ×35 |
| `!invertir <asset> <¥> <up\|down> [time]` (invest) | 10s, 1 active bet at a time | Binary bet on BTC/ETH/GOLD/SOL/WINSI/BRSCO. Right direction: +80% of your stake. Wrong: you lose the entire stake |
| `!comprar <asset> <¥>` / `!vender <asset> <¥\|todo>` (buy/sell) | 3s | Real buy-and-hold — your profit or loss depends on how much the asset's real price moves. Check positions with `!portafolio` |
| `!arena retar @user <bet>` (challenge) | — | Turn-based PvP duel — winner takes ×2 the bet (see [Trophies](#-trophies--pvp-arena)) |

Live prices via `!mercado` (aliases: `market`, `precios`, `bolsa`), chart with `!cotizacion <asset>`.

### 🏦 Bank — protect your money

```
!dep <amount>       — deposit (or !dep all)
!retirar <amount>   — withdraw
```

`!rob` can only steal from your wallet, never your bank. If you're carrying a lot of BrasCoins and playing in active groups, deposit it.

---

## 💎 Diamonds

**How to get them:** `!crime` (5–50), `!minar` (0–5), `!weekly` (3–40), `!monthly` (15–150), `!cofre` (3–30), `!daily` (1–12).

**What they're for:** they're the bot's "premium-lite" currency — a few special commands cost diamonds instead of BrasCoins (downloading APKs costs 💎2, for example). There isn't a dedicated diamond shop yet — for now they work more as a progress indicator than an active spending currency.

---

## BrasEmbers

A deliberately scarce currency — unlike diamonds, it's not handed out freely.

**How to get them:**

- `!ascuas` (aliases `!embers`, `!brasas`) — main source: 3h cooldown, 50% success chance (60% premium), 1–2 per success (2–3 premium). On failure you get nothing and the cooldown still applies.
- 4% chance of +1 from `!daily`, `!work`, `!crime` (only on a successful crime) and `!minar` — as a side bonus, no dedicated command needed.

**What they're for:** every NSFW command (`!rule34`, `!rule34video`, `!sexyimg`, `!stickerporn`, `!porn`) now costs 1 BrasEmber per use — on top of the group's `!on nsfw` toggle, which still has to be on. The group toggle controls whether NSFW is allowed there at all; BrasEmbers controls whether YOU can keep using it.

Shown in `!profile`.

---

## 🏭 Businesses

Buy a business once and it generates passive BrasCoins over time — no need to be online, it accumulates on its own (up to a 24h cap; after that you need to collect to keep accumulating).

```
!business                    — see the catalog and your businesses (with pending income)
!business comprar <id>       — buy one from the catalog
!collect                     — collect accumulated income from all your businesses
```

**Catalog:**

| Business | Cost | Produces |
|---------|------:|---------|
| 🌽 Farm (`farm`) | ¥5,000 | ¥120/hour |
| 🥖 Bakery (`bakery`) | ¥15,000 | ¥320/hour |
| 🏪 Store (`store`) | ¥40,000 | ¥800/hour |
| 🍔 Restaurant (`restaurant`) | ¥150,000 | ¥2,800/hour |
| 🏨 Hotel (`hotel`) | ¥500,000 | ¥9,000/hour |
| 🏭 Factory (`factory`) | ¥1,200,000 | ¥22,000/hour |

You can own several businesses, even repeats of the same type — each accumulates separately. `!collect` cashes in all of them at once.

---

## 🐉 Dragons (Dragon City)

Full system under `!pet` (alias `!mascota`, `!dragon`, `!dragones`) — a real 579-dragon catalog (Brashkie/module-data), with real evolution images and videos.

```
!pet                          — view your collection (level, stage, pending gold)
!pet hatch                    — hatch a new egg (costs ¥800, random species)
!pet feed <#|name>            — feed with Gold (grants EXP, may evolve)
!pet collect                  — collect the passive Gold accumulated by all your dragons
!pet info <#|name>            — dragon sheet (rarity, elements, skills, description)
!pet rename <#> <name>        — rename
!pet release <#|name>         — release
```

**Gold** is a new currency, separate from BrasCoins — each dragon generates it passively based on its level (same 24h accumulation cap logic as businesses) and it's spent feeding it. The egg itself is paid in BrasCoins (so you're not stuck needing a dragon to afford your first one).

Dragons evolve twice based on level: egg (0–9) → young (10–24, with an evolution animation) → adult (25+, final evolution). Each dragon's description is translated to Spanish on the fly for the in-chat text.

---

## 🎴 Characters / Harem (gacha)

```
!rw [marvel|pokedex|anime] — roll a random character (no argument rolls across all three) — 29 min cooldown
!c                      — reply TO THE CHARACTER'S MESSAGE to claim it — you have 10 min before it expires
!harem [@user]           — view your collection, sorted by value
!winfo <name>            — character info
!wimage <name>           — character image
!trade @user             — trade characters with someone
```

Important: after claiming with `!c`, there's a **16-second** window where anyone else in the group can "steal" the claim by replying too — only after those 16s does the character lock into your collection for good.

A character that's already been claimed **can no longer show up or be claimed again in that same group** — it already has an owner there. The same character can still show up and have a different owner in another group (each group is its own economy).

---

## 🏆 Trophies / PvP Arena

WinsiBot doesn't have a literal collectible "trophy" system — the closest thing is the competitive **Arena** system (`!arena`, alias `!pvp`), based on ELO and divisions:

```
!arena retar @user [bet]   — propose a duel (with an optional BrasCoins bet)
!arena aceptar / rechazar   — accept/decline a challenge
!arena atacar / poderoso / defender / curar / ultimate   — battle actions
!arena ranking               — top 10 ELO on the bot
```

Winning duels raises your ELO and division; losing lowers it. If there was a bet, the winner takes double.

Separately, there's a literal gift item called **Trofeo** (Trophy) 🏆 (*rare* rarity, worth ¥600) — buyable and giftable through `!regalo` (see below).

---

## 🎁 Gifts and items

```
!regalo catalogo              — view all available items, by rarity
!regalo enviar @user <id> [message]   — buy an item and send it to someone
```

The catalog ranges from common (¥50) to legendary (up to ¥9,000) — flowers, chocolates, gems, crowns, dragon eggs, etc. Cost is charged by the item's **rarity**, not its individual resale value.

### Other items you collect along the way

`!work`, `!minar`, `!daily`, `!weekly`, `!monthly` and `!cofre` also drop inventory items — ⚔️ swords, 🧪 potions, ✨ magic points, 🏆 legendaries. You can see them in your `!xp`. For now they're progress collectibles without a defined spending use yet.

---

## ⭐ Prestige, medals and multipliers

```
!prestige             — view your leveling profile
!prestige subir        — reset your level to 0 (requires level 100) in exchange for a permanent XP multiplier
!prestige medallas      — collectible achievements
!prestige racha         — your consecutive-day activity streak
```

XP multipliers that stack together:
- Premium: ×1.5
- Weekend: ×1.5
- 3+ day streak: ×1.1 — 7+ day streak: ×1.2
- Each prestige level: +10% permanent

---

## ⭐ Premium

Granted by the bot owner — there's no in-bot purchase. It boosts the amounts from `!work`, `!daily`, `!minar`, `!weekly`, `!monthly`, `!cofre`, `!crime` (including your crime success rate: 65% instead of 50%), and your XP multiplier.

---

## 👪 Clans

```
!clan crear <TAG> <name>     — create a clan
!clan info [TAG]              — view a clan's info
!clan miembros                — members of YOUR clan
!clan ranking                 — top 10 of ALL clans on the bot (level, members)
!clan territorios / guerra / alianza   — wars and territories system
```

A full social system with wars, territories and alliances between clans. Run `!clan` with no arguments for the full panel once you're in one.

---

## Quick reference

| I want... | Command |
|-----------|---------|
| Fast, safe BrasCoins | `!work`, `!minar` |
| Big BrasCoins (with risk) | `!crime`, `!slut` |
| Diamonds | `!crime`, `!minar`, `!weekly`, `!monthly` |
| A dragon | `!pet hatch` (¥800) |
| Characters/harem | `!rw` → `!c` (replying to its message) |
| To climb the competitive ranking | `!arena retar @user` |
| A trophy/gift for someone | `!regalo enviar @user trophy` |
| To protect my BrasCoins from theft | `!dep <amount>` |
| To see my cooldowns | `!einfo` |
| To see my full stats | `!xp` or `!perfil` |
