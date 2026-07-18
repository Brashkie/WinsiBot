# 💰 Guía de Economía — WinsiBot

Cómo conseguir BrasCoins, diamantes, mascotas, personajes, copas y objetos. Todos los comandos aquí abajo están verificados contra el código real del bot — si algo cambia, este documento se actualiza junto con él.

Para la lista completa de comandos (con aliases y permisos) ver [commands.md](commands.md). Para ver tus cooldowns en vivo, usa `!einfo`.

---

## 🪙 BrasCoins (tu moneda principal)

BrasCoins (¥) es la moneda con la que comprás mascotas, regalos, y con la que apostás en los juegos. Se guarda en tu **billetera** (`money`) o en el **banco** (`bank`) — ver la sección [Banco](#-banco--protegé-tu-dinero) más abajo, es importante.

### Ingreso recurrente (sin riesgo)

| Comando | Cooldown | Requisito | Qué da |
|---------|:--------:|:---------:|--------|
| `!work` | 10 min | — | ¥300–1,500 (¥1,000–4,000 premium) + 50–200 XP |
| `!minar` | 10 min | — | ¥100–2,000 + XP + 0–5 💎 + puntos de magia ✨ |
| `!daily` | 1×/día — se reinicia a medianoche | — | ¥300–3,500 + XP + 1–12 💎 + racha de días (bono ×1.00–×1.20+) |
| `!cofre` | 1×/día — se reinicia a medianoche | nivel 5 | ¥500–5,000 + XP + 3–30 💎 + ✨ |
| `!weekly` | cada 3 días | nivel 7 | ¥500–4,000 + XP + 3–40 💎 + ⚔️ espadas + ✨ |
| `!monthly` | cada 5 días | nivel 10 | ¥2,000–15,000 + XP + 15–150 💎 + 🏆 legendarios + ⚔️ + ✨ |

Todos escalan si sos premium (ver [sección Premium](#-premium)).

### Riesgo / recompensa

| Comando | Cooldown | Requisito | Cómo funciona |
|---------|:--------:|:---------:|----------------|
| `!crime` | 1h | solo grupos | 50% de éxito (65% premium). Si sale bien: ¥500–8,000 + XP + a veces 💎. Si sale mal: perdés dinero y XP |
| `!slut` (+18) | 1h | — | Sin riesgo de fallo — siempre da ¥1,000–10,000 (¥3,000–10,000 premium) |
| `!rob @usuario` | 2h | solo grupos | Le robás hasta 30% de lo que tiene en la **billetera** (máx ¥4,000). Si tiene menos de ¥100, no hay nada que robar |

⚠️ `!rob` solo puede tocar lo que la víctima tiene en la billetera — lo que está en el banco (`!dep`) está a salvo.

### Apuestas y juegos

| Comando | Cooldown | Cómo funciona |
|---------|:--------:|----------------|
| `!cf <cara\|cruz> <monto>` (coinflip) | 20s | 50/50 — si acertás, ganás ×2 tu apuesta |
| `!rt <red\|black\|0-36> <monto>` (roulette) | 15s | Color: paga ×2. Número exacto: paga ×35 |
| `!invertir <activo> <¥> <sube\|baja> [tiempo]` | 10s, 1 apuesta activa a la vez | Apuesta binaria sobre BTC/ETH/GOLD/SOL/WINSI/BRSCO. Si acertás la dirección: +80% de tu apuesta. Si fallás: perdés todo lo apostado |
| `!comprar <activo> <¥>` / `!vender <activo> <¥\|todo>` | 3s | Comprar y mantener de verdad — tu ganancia o pérdida depende de cuánto se mueva el precio real del activo. Ver posiciones con `!portafolio` |
| `!arena retar @usuario <apuesta>` | — | Duelo PvP por turnos — quien gana se lleva ×2 la apuesta (ver sección [Copas](#-copas--arena-pvp)) |

Precios en vivo con `!mercado` (aliases: `market`, `precios`, `bolsa`), gráfico con `!cotizacion <activo>`.

### 🏦 Banco — protegé tu dinero

```
!dep <monto>       — depositar (o !dep all)
!retirar <monto>   — retirar
```

`!rob` solo puede robar de tu billetera, nunca de tu banco. Si tenés mucho dinero acumulado y jugás en grupos activos, conviene depositarlo.

---

## 💎 Diamantes

**Cómo conseguirlos:** `!crime` (5–50), `!minar` (0–5), `!weekly` (3–40), `!monthly` (15–150), `!cofre` (3–30), `!daily` (1–12).

**Para qué sirven:** son la moneda "premium-lite" del bot — algunos comandos especiales cuestan diamantes en vez de BrasCoins (por ejemplo, descargar APKs cuesta 💎2). Todavía no hay una tienda de diamantes dedicada — por ahora funcionan más como indicador de progreso que como moneda de gasto activo.

---

## 🐾 Mascotas

Sistema completo en `!pet` (alias `!mascota`).

```
!pet adoptar [especie] <nombre>   — adoptar (cuesta ¥500; sin especie = aleatoria)
!pet list                          — catálogo de especies por rareza
!pet feed / play / clean / sleep   — cuidarla (dan EXP, algunas tienen cooldown: clean 2h)
!pet explore                       — CD 1h — ¥100–500 + XP
!pet adventure <zona>              — CD 4h — 5 zonas, 75% de éxito, mejor pago que explore
!pet battle @usuario               — pelea contra la mascota de otro, EXP para ambas
!pet stats / view                  — ver a tu mascota
```

Las mascotas suben de nivel con la EXP que ganan cuidándolas y evolucionan en ciertos niveles (varía por especie — ver `!pet info <especie>`). Rareza va de común a legendaria.

---

## 🎴 Personajes / Harem (gacha)

```
!rw [marvel|pokedex|anime] — tira un personaje aleatorio (sin argumento, sortea entre las tres) — CD 29 min
!c                      — responde AL MENSAJE del personaje para reclamarlo — tenés 10 min antes de que expire
!harem [@usuario]       — ver tu colección, ordenada por valor
!winfo <nombre>         — info de un personaje
!wimage <nombre>        — imagen de un personaje
!trade @usuario         — intercambiar personajes
```

Importante: después de reclamar con `!c`, hay una ventana de **16 segundos** donde cualquier otra persona del grupo puede "robarte" el claim respondiendo también — recién después de esos 16s el personaje pasa a tu colección en firme.

Un personaje ya reclamado **no puede volver a salir ni reclamarse de nuevo en ese mismo grupo** — ya tiene dueño ahí. El mismo personaje sí puede salir y tener un dueño distinto en otro grupo (cada grupo es su propia economía).

---

## 🏆 Copas / Arena PvP

WinsiBot no tiene una "copa" coleccionable como tal — lo más parecido es el sistema competitivo de **Arena** (`!arena`, alias `!pvp`), basado en ELO y divisiones:

```
!arena retar @usuario [apuesta]   — proponer duelo (con apuesta opcional de BrasCoins)
!arena aceptar / rechazar          — responder a un reto
!arena atacar / poderoso / defender / curar / ultimate   — acciones en batalla
!arena ranking                     — top 10 ELO del bot
```

Ganar duelos sube tu ELO y tu división; perder los baja. Si hubo apuesta, quien gana se lleva el doble.

Aparte, existe un ítem de regalo literal llamado **Trofeo** 🏆 (rareza *rara*, valor ¥600) — se puede comprar y regalar con `!regalo` (ver abajo).

---

## 🎁 Regalos y objetos

```
!regalo catalogo              — ver todos los ítems disponibles, por rareza
!regalo enviar @usuario <id> [mensaje]   — comprar un ítem y enviárselo a alguien
```

El catálogo va de común (¥50) a legendario (hasta ¥9,000) — flores, chocolates, gemas, coronas, huevos de dragón, etc. El costo se cobra según la **rareza** del ítem, no su valor de reventa individual.

### Otros objetos que acumulás jugando

`!work`, `!minar`, `!daily`, `!weekly`, `!monthly` y `!cofre` también sueltan ítems de inventario — ⚔️ espadas, 🧪 pociones, ✨ puntos de magia, 🏆 legendarios. Se ven en tu `!xp`. Por ahora son coleccionables de progreso (no tienen un "gasto" definido todavía).

---

## ⭐ Prestigio, medallas y multiplicadores

```
!prestige            — ver tu perfil de leveling
!prestige subir       — reiniciar tu nivel a 0 (requiere nivel 100) a cambio de un multiplicador de XP permanente
!prestige medallas     — logros coleccionables
!prestige racha        — tu racha de días activos consecutivos
```

Multiplicadores de XP que se combinan entre sí:
- Premium: ×1.5
- Fin de semana: ×1.5
- Racha de 3+ días: ×1.1 — de 7+ días: ×1.2
- Cada nivel de prestigio: +10% permanente

---

## ⭐ Premium

Lo otorga el owner del bot — no hay compra dentro del bot. Sube los montos de `!work`, `!daily`, `!minar`, `!weekly`, `!monthly`, `!cofre`, `!crime` (incluyendo tu tasa de éxito en crime: 65% en vez de 50%) y el multiplicador de XP.

---

## 👪 Clanes

```
!clan crear <TAG> <nombre>   — crear un clan
!clan info [TAG]              — ver info de un clan
!clan miembros                — miembros de TU clan
!clan ranking                 — top 10 de TODOS los clanes del bot (nivel, miembros)
!clan territorios / guerra / alianza   — sistema de guerras y territorios
```

Sistema social completo con guerras, territorios y alianzas entre clanes. Ver `!clan` sin argumentos para el panel completo una vez que estés en uno.

---

## Resumen rápido

| Quiero... | Comando |
|-----------|---------|
| BrasCoins rápido y seguro | `!work`, `!minar` |
| BrasCoins en grande (con riesgo) | `!crime`, `!slut` |
| Diamantes | `!crime`, `!minar`, `!weekly`, `!monthly` |
| Una mascota | `!pet adoptar` (¥500) |
| Personajes/harem | `!rw` → `!c` (respondiendo su mensaje) |
| Subir de ranking competitivo | `!arena retar @usuario` |
| Un trofeo/regalo para alguien | `!regalo enviar @usuario trophy` |
| Proteger mis BrasCoins de robos | `!dep <monto>` |
| Ver mis cooldowns | `!einfo` |
| Ver mis stats completos | `!xp` o `!perfil` |
