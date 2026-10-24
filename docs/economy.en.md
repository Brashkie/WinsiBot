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
| `!crime` | 15 min | groups only | 50% success chance (65% premium). Success: ¥500–8,000 + XP + sometimes 💎. Failure: you lose money and XP |
| `!slut` (+18) | 10 min | — | No fail chance — always gives ¥1,000–10,000 (¥3,000–10,000 premium) |
| `!rob @user` | 2h | groups only | Steals up to 30% of what the target has in their **wallet** (max ¥4,000). If they have under ¥100, there's nothing to steal |

⚠️ `!rob` can only touch what the victim has in their wallet — anything in their bank (`!dep`) is safe.

### Betting and games

| Command | Cooldown | How it works |
|---------|:--------:|----------------|
| `!cf <heads\|tails> <amount>` (coinflip) | 20s | 50/50 — guess right and win ×2 your bet |
| `!rt <red\|black\|0-36> <amount>` (roulette) | 15s | Color: pays ×2. Exact number: pays ×35 |
| `!invertir <asset> <¥> <up\|down> [time]` (invest) | 10s, 1 active bet at a time | Binary bet on BTC/ETH/GOLD/SOL/WINSI/BRSCO. Right direction: +80% of your stake. Wrong: you lose the entire stake |
| `!comprar <asset> <¥>` / `!vender <asset> <¥\|todo>` (buy/sell) | 3s | Real buy-and-hold — your profit or loss depends on how much the asset's real price moves. Check positions with `!portafolio` |
| `!arena retar @user <bet>` (challenge) | — | Turn-based PvP duel — the bet is held from both on accept and the winner takes the pot (see [Trophies](#-trophies--pvp-arena)) |
| `!poker <ante>` (Casino Hold'em) | 1 open hand at a time | You see your 2 cards and 3 on the board; `!poker ir` pays double the ante, `!poker retirarse` loses the ante. Dealer qualifies with a pair of 4s+; if not, the ante pays by the table (royal flush 100:1 … flush 2:1, rest 1:1) and the call is returned. If you beat it, the call pays 1:1 |
| `!bj <amount>` (blackjack) | 1 open hand at a time | Against the dealer, who stands on 17: a win pays ×2, blackjack 3:2, a push returns the bet. `!pedir` (hit), `!plantarse` (stand), `!doblar` (double). If the bot restarts mid-hand, the bet is refunded |

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
!pet criar <#> <#>            — breed two of your dragons (level 10+, 5,000 gold + ¥3,000, every 8 h)
!pet companero <#|name>       — the one that gains exp from your messages and fights in the raid
!pet rename <#> <name>        — rename
!pet release <#|name>         — release
```

**Gold** is a new currency, separate from BrasCoins — each dragon generates it passively based on its level (same 24h accumulation cap logic as businesses) and it's spent feeding it. The egg itself is paid in BrasCoins (so you're not stuck needing a dragon to afford your first one).

Dragons are born already in their young form —the egg is only the hatching animation— and evolve to their final adult form at level 25, with their evolution video. Each dragon's description is translated to Spanish on the fly for the in-chat text.

**Breeding:** the species that hatches shares at least one element with each parent, and the more it shares, the likelier it is. Scarce rarities (Mythical, Heroic) come out less often, and sometimes the offspring is one of the parents' species. It hatches at level 1.

**Companion** (`!pet companero <#>`, ⭐ in the list): the dragon that goes with you. If you don't pick one, it's your highest-level one. It gains experience from your messages —2 per message, 30 s apart, up to 120 a day; it won't evolve from this, that's by feeding it— and it's the one fighting beside you in the raid: +4 base damage per level, and its elements can trigger a reaction (see [Raid](#️-raid--world-boss)).

---

## 🎴 Characters / Harem (gacha)

```
!rw [marvel|pokedex|anime] — roll a random character (no argument rolls across all three) — 20 min cooldown
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
!arena cpu [facil|normal|dificil]  — practice against the CPU (no ELO or bet)
```

Winning duels raises your ELO and division; losing lowers them. If there's a bet, it's held from both players on accept and the winner takes the pot (both bets), also if the other one surrenders. If the battle is abandoned or the bot restarts, it's refunded.

Separately, there's a literal gift item called **Trofeo** (Trophy) 🏆 (*rare* rarity, worth ¥600) — buyable and giftable through `!regalo` (see below).

---

## 🎁 Gifts and items

```
!regalo catalogo              — view all available items, by rarity
!regalo enviar @user <id> [message]   — buy an item and send it to someone
```

The catalog ranges from common (¥50) to legendary (up to ¥9,000) — flowers, chocolates, gems, crowns, dragon eggs, etc. Cost is charged by the item's **rarity**, not its individual resale value.

### Other items you collect along the way

`!work`, `!minar`, `!daily`, `!weekly`, `!monthly` and `!cofre` also drop inventory items — ⚔️ swords, 🧪 potions, ✨ magic points, 🏆 legendaries. You can see them in your `!xp`, spend them at the [forge](#-forge) and sell them at [auction](#-auctions).

---

## 🔨 Forge

```
!forjar               — your weapon, what the next +1 costs and its odds
!forjar mejorar       — attempt the +1
!forjar proteccion    — forge a 🛡️ protection stone (4 ⚔️ + 1 🏆 + ¥5,000)
```

| Upgrade | Success | Cost |
|---------|:-------:|------|
| +0 → +1 | 100% | 1 ⚔️ + 2 ✨ + ¥1,000 |
| +1 → +2 | 95% | 1 ⚔️ + 3 ✨ + ¥4,000 |
| +2 → +3 | 90% | 2 ⚔️ + 4 ✨ + ¥9,000 |
| +3 → +4 | 80% | 2 ⚔️ + 5 ✨ + ¥16,000 |
| +4 → +5 | 70% | 3 ⚔️ + 6 ✨ + ¥25,000 |
| +5 → +6 | 60% | 3 ⚔️ + 7 ✨ + ¥36,000 |
| +6 → +7 | 50% | 4 ⚔️ + 8 ✨ + 1 🏆 + ¥49,000 |
| +7 → +8 | 40% | 4 ⚔️ + 9 ✨ + 1 🏆 + ¥64,000 |
| +8 → +9 | 30% | 5 ⚔️ + 10 ✨ + 1 🏆 + ¥81,000 |
| +9 → +10 | 20% | 5 ⚔️ + 11 ✨ + 1 🏆 + ¥100,000 |

Failing up to +3 only costs the materials. From +4, the weapon also drops a level, unless you have a 🛡️: it breaks instead. The weapon is never destroyed. Each level gives **+8% damage** against the world boss.

---

## ⚔️ Raid — world boss

```
!raid             — the current boss: health, time left, top damage
!atacar           — one hit (one per minute)
!raid on / off    — admins: raid announcements in the group
```

A single boss for **every group**: it spawns every ~6 h and escapes after 60 min. Damage grows with your level, your companion and your weapon.

**Elemental synergy:** if another player hit less than 90 s ago and their companion's elements combine with yours, your hit triggers a reaction and deals more — Eclipse (Light + Dark) ×1.8, Paradox (Time + Chaos) ×1.7, Ancestral Awakening (Primal + Legend) ×1.7, Firestorm (Flame + Wind) ×1.6, Electrocution (Sea + Electric) ×1.6, and ten more from ×1.3 to ×1.5. A hit that already formed a reaction can't start another: you have to take turns.

If the boss falls, the loot (BrasCoins and XP) is split by damage, +20% for the top damage dealer and +10% for the finishing blow; if it escapes, a quarter is split. The next boss's health grows with how many people fought the last one.

---

## 🏰 Daily dungeon

```
!mazmorra entrar        — start the group's expedition
!mazmorra <door>        — open a door (anyone in the group, and they join)
!mazmorra salir         — retreat and cash out the loot
!mazmorra ranking       — the groups that got deepest today
```

A new dungeon every day, **the same for every group**: 10 levels of 2 or 3 doors and a boss at the end. You only see a hint for each door, and the hints mislead: "smells of sulfur" can be a monster or a trap. The group shares 100 health and the loot.

- Monsters always fall, but cost health: less the more power the group has. Power is the sum of each member's **level**, **companion** and **weapon**.
- Traps take health, fountains heal, treasures give BrasCoins and sometimes ⚔️ ✨ 🏆 (for whoever opened the door).
- Retreating cashes out everything; falling rescues 25%; beating the boss multiplies it by 1.5. Each extra adventurer adds +25% to the loot (up to 8), split evenly.
- One expedition per person per day. The boss can't be beaten alone: a typical player manages ~7% of the time, four together ~48%.

---

## 🔨 Auctions

```
!subasta                                          — the open auction in the group
!subasta vender dragon <#> <base> [minutes]       — auction a dragon
!subasta vender <item> <amount> <base> [min]      — espada, proteccion, pocion, sp, legendario
!pujar <amount>  /  !pujar min                    — bid
!subasta cancelar                                 — withdraw it, if nobody has bid
```

One per group, 5 to 120 minutes (30 by default). The item is held from the moment it's listed, and your bid from the moment you place it: if you're outbid, it's refunded right away. A bid in the last minute extends it by one minute. Each bid has to beat the previous one by 5% (at least ¥50). The house keeps 5% of the sale. If nobody bids, the item goes back to the seller.

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
| A dragon | `!pet hatch` (¥800) or `!pet criar <#> <#>` |
| A use for my ⚔️ ✨ 🏆 | `!forjar mejorar` |
| To sell a dragon or items | `!subasta vender …` |
| To fight alongside every group | `!raid` → `!atacar` |
| A group adventure every day | `!mazmorra entrar` |
| Characters/harem | `!rw` → `!c` (replying to its message) |
| To climb the competitive ranking | `!arena retar @user` |
| A trophy/gift for someone | `!regalo enviar @user trophy` |
| To protect my BrasCoins from theft | `!dep <amount>` |
| To see my cooldowns | `!einfo` |
| To see my full stats | `!xp` or `!perfil` |
