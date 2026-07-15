# 💰 Economy Guide — WinsiBot

How to earn BrasCoins, diamonds, pets, characters, trophies and items. Every command below was verified against the bot's actual code — if something changes, this doc gets updated along with it.

For the full command list (with aliases and permissions) see [commands.en.md](commands.en.md). To check your live cooldowns, use `!einfo`.

---

## 🪙 BrasCoins (your main currency)

BrasCoins (¥) is what you use to buy pets, gifts, and bet in games. It's kept either in your **wallet** (`money`) or your **bank** (`bank`) — see the [Bank](#-bank--protect-your-money) section below, it matters.

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

## 🐾 Pets

Full system under `!pet` (alias `!mascota`).

```
!pet adoptar [species] <name>   — adopt (costs ¥500; no species = random)
!pet list                        — species catalog by rarity
!pet feed / play / clean / sleep — care for it (grants EXP, some have cooldowns: clean 2h)
!pet explore                     — 1h cooldown — ¥100–500 + XP
!pet adventure <zone>            — 4h cooldown — 5 zones, 75% success rate, better payout than explore
!pet battle @user                — fight another user's pet, both gain EXP
!pet stats / view                — view your pet
```

Pets level up from the EXP they earn while you take care of them, and evolve at certain levels (varies by species — check `!pet info <species>`). Rarity ranges from common to legendary.

---

## 🎴 Characters / Harem (gacha)

```
!rw                    — roll a random character (Marvel or Pokédex) — 29 min cooldown
!c                      — reply TO THE CHARACTER'S MESSAGE to claim it — you have 10 min before it expires
!harem [@user]           — view your collection, sorted by value
!winfo <name>            — character info
!wimage <name>           — character image
!trade @user             — trade characters with someone
```

Important: after claiming with `!c`, there's a **16-second** window where anyone else in the group can "steal" the claim by replying too — only after those 16s does the character lock into your collection for good.

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
| A pet | `!pet adoptar` (¥500) |
| Characters/harem | `!rw` → `!c` (replying to its message) |
| To climb the competitive ranking | `!arena retar @user` |
| A trophy/gift for someone | `!regalo enviar @user trophy` |
| To protect my BrasCoins from theft | `!dep <amount>` |
| To see my cooldowns | `!einfo` |
| To see my full stats | `!xp` or `!perfil` |
