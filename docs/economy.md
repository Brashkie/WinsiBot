# 💰 Guía de Economía — WinsiBot

Cómo conseguir BrasCoins, diamantes, mascotas, personajes, copas y objetos. Todos los comandos aquí abajo están verificados contra el código real del bot — si algo cambia, este documento se actualiza junto con él.

Para la lista completa de comandos (con aliases y permisos) ver [commands.md](commands.md). Para ver tus cooldowns en vivo, usa `!einfo`.

---

## 🪙 BrasCoins (tu moneda principal)

BrasCoins (¥) es la moneda con la que comprás huevos de dragón, regalos, y con la que apostás en los juegos. Se guarda en tu **billetera** (`money`) o en el **banco** (`bank`) — ver la sección [Banco](#-banco--protegé-tu-dinero) más abajo, es importante.

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
| `!crime` | 15 min | solo grupos | 50% de éxito (65% premium). Si sale bien: ¥500–8,000 + XP + a veces 💎. Si sale mal: perdés dinero y XP |
| `!slut` (+18) | 10 min | — | Sin riesgo de fallo — siempre da ¥1,000–10,000 (¥3,000–10,000 premium) |
| `!rob @usuario` | 2h | solo grupos | Le robás hasta 30% de lo que tiene en la **billetera** (máx ¥4,000). Si tiene menos de ¥100, no hay nada que robar |

⚠️ `!rob` solo puede tocar lo que la víctima tiene en la billetera — lo que está en el banco (`!dep`) está a salvo.

### Apuestas y juegos

| Comando | Cooldown | Cómo funciona |
|---------|:--------:|----------------|
| `!cf <cara\|cruz> <monto>` (coinflip) | 20s | 50/50 — si acertás, ganás ×2 tu apuesta |
| `!rt <red\|black\|0-36> <monto>` (roulette) | 15s | Color: paga ×2. Número exacto: paga ×35 |
| `!invertir <activo> <¥> <sube\|baja> [tiempo]` | 10s, 1 apuesta activa a la vez | Apuesta binaria sobre BTC/ETH/GOLD/SOL/WINSI/BRSCO. Si acertás la dirección: +80% de tu apuesta. Si fallás: perdés todo lo apostado |
| `!comprar <activo> <¥>` / `!vender <activo> <¥\|todo>` | 3s | Comprar y mantener de verdad — tu ganancia o pérdida depende de cuánto se mueva el precio real del activo. Ver posiciones con `!portafolio` |
| `!arena retar @usuario <apuesta>` | — | Duelo PvP por turnos — la apuesta se retiene a los dos al aceptar y quien gana se lleva el pozo (ver sección [Copas](#-copas--arena-pvp)) |
| `!poker <ante>` (Casino Hold'em) | 1 mano abierta a la vez | Ves tus 2 cartas y 3 de la mesa; `!poker ir` paga el doble del ante, `!poker retirarse` pierde el ante. El crupier juega con par de 4+; si no, el ante paga por tabla (escalera real 100:1 … color 2:1, resto 1:1) y la ida se devuelve. Si le ganás, la ida paga 1:1 |
| `!bj <monto>` (blackjack) | 1 mano abierta a la vez | Contra el crupier, que se planta en 17: ganar paga ×2, blackjack 3:2, empate devuelve. `!pedir`, `!plantarse`, `!doblar`. Si el bot se reinicia a mitad de una mano, la apuesta se devuelve |

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

## BrasEmbers

Moneda deliberadamente escasa — a diferencia de diamantes, no se regala en cantidad.

**Cómo conseguirlos:**

- `!ascuas` (alias `!embers`, `!brasas`) — fuente principal: CD 3h, 50% de éxito (60% premium), 1–2 por acierto (2–3 premium). Si falla, no da nada y igual consume el cooldown.
- Chance del 4% de +1 en `!daily`, `!work`, `!crime` (solo si el crimen sale bien) y `!minar` — de paso, sin comando dedicado.

**Para qué sirven:** cuestan 1 BrasEmber por uso en todos los comandos NSFW (`!rule34`, `!rule34video`, `!sexyimg`, `!stickerporn`, `!porn`) — además del `!on nsfw` que ya tiene que estar activo en el grupo. El toggle de grupo controla si el NSFW está permitido ahí; BrasEmbers controla si VOS podés seguir usándolo.

Se ven en `!profile`.

---

## 🏭 Negocios

Comprás un negocio una vez, y genera BrasCoins pasivos con el tiempo — no hace falta estar conectado, se acumula solo (hasta un tope de 24h; después de eso hay que cobrar para seguir acumulando).

```
!business                    — ver catálogo y tus negocios (con lo pendiente de cobrar)
!business comprar <id>       — comprar uno del catálogo
!collect                     — cobrar lo acumulado de todos tus negocios
```

**Catálogo:**

| Negocio | Costo | Produce |
|---------|------:|---------|
| 🌽 Granja (`farm`) | ¥5,000 | ¥120/hora |
| 🥖 Panadería (`bakery`) | ¥15,000 | ¥320/hora |
| 🏪 Tienda (`store`) | ¥40,000 | ¥800/hora |
| 🍔 Restaurante (`restaurant`) | ¥150,000 | ¥2,800/hora |
| 🏨 Hotel (`hotel`) | ¥500,000 | ¥9,000/hora |
| 🏭 Fábrica (`factory`) | ¥1,200,000 | ¥22,000/hora |

Podés tener varios negocios, incluso repetidos del mismo tipo — cada uno acumula por separado. `!collect` cobra todos de una.

---

## 🐉 Dragones (Dragon City)

Sistema completo en `!pet` (alias `!mascota`, `!dragon`, `!dragones`) — catálogo real de 579 dragones (Brashkie/module-data), con imagen y video de evolución reales.

```
!pet                          — ver tu colección (nivel, etapa, oro pendiente)
!pet hatch                    — incubar un huevo nuevo (cuesta ¥800, especie aleatoria)
!pet feed <#|nombre>          — alimentar con Oro (gana EXP, puede evolucionar)
!pet collect                  — cobrar el Oro pasivo acumulado de todos tus dragones
!pet info <#|nombre>          — ficha del dragón (rareza, elementos, habilidades, descripción)
!pet criar <#> <#>            — cruzar dos dragones propios (nivel 10+, 5.000 oro + ¥3.000, cada 8 h)
!pet companero <#|nombre>     — el que gana exp con tus mensajes y pelea en el raid
!pet rename <#> <nombre>      — renombrar
!pet release <#|nombre>       — liberar
```

**Oro** es una moneda nueva, separada de BrasCoins — cada dragón la genera pasivamente según su nivel (misma lógica de acumulación con tope de 24h que los negocios) y se gasta alimentándolo. El huevo se paga en BrasCoins (para no depender de tener ya un dragón).

Los dragones nacen ya en su forma joven —el huevo es solo la animación previa— y evolucionan a su forma final, adulto, en el nivel 25, con su video de evolución. La descripción de cada dragón se traduce al español al vuelo.

**Cría:** la especie que nace comparte al menos un elemento con cada padre, y cuantos más comparta, más probable. Las rarezas escasas (Mítico, Heroico) salen menos, y a veces sale la especie de uno de los padres. Nace en nivel 1.

**Compañero** (`!pet companero <#>`, ⭐ en la lista): el dragón que te acompaña. Si no elegís, es el de nivel más alto. Gana experiencia con tus mensajes —2 por mensaje, con 30 s entre uno y otro, hasta 120 por día; no lo hace evolucionar, eso es alimentándolo— y es el que pelea a tu lado en el raid: +4 de daño base por nivel, y sus elementos pueden dar una reacción (ver [Raid](#️-raid--jefe-de-mundo)).

---

## 🎴 Personajes / Harem (gacha)

```
!rw [marvel|pokedex|anime] — tira un personaje aleatorio (sin argumento, sortea entre las tres) — CD 20 min
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
!arena cpu [facil|normal|dificil]  — práctica contra la CPU (sin ELO ni apuesta)
```

Ganar duelos sube tu ELO y tu división; perder los baja. Si hay apuesta, al aceptar se le retiene a los dos y quien gana se lleva el pozo (las dos apuestas), también si el otro se rinde. Si la pelea se abandona o el bot se reinicia, se devuelve.

Aparte, existe un ítem de regalo literal llamado **Trofeo** 🏆 (rareza *rara*, valor ¥600) — se puede comprar y regalar con `!regalo` (ver abajo).

---

## 🎁 Regalos y objetos

```
!regalo catalogo              — ver todos los ítems disponibles, por rareza
!regalo enviar @usuario <id> [mensaje]   — comprar un ítem y enviárselo a alguien
```

El catálogo va de común (¥50) a legendario (hasta ¥9,000) — flores, chocolates, gemas, coronas, huevos de dragón, etc. El costo se cobra según la **rareza** del ítem, no su valor de reventa individual.

### Otros objetos que acumulás jugando

`!work`, `!minar`, `!daily`, `!weekly`, `!monthly` y `!cofre` también sueltan ítems de inventario — ⚔️ espadas, 🧪 pociones, ✨ puntos de magia, 🏆 legendarios. Se ven en tu `!xp`, se gastan en la [forja](#-forja) y se pueden vender en [subasta](#-subastas).

---

## 🔨 Forja

```
!forjar               — tu arma, lo que cuesta el próximo +1 y la probabilidad
!forjar mejorar       — intentar el +1
!forjar proteccion    — forjar una 🛡️ piedra de protección (4 ⚔️ + 1 🏆 + ¥5,000)
```

| Mejora | Éxito | Cuesta |
|--------|:-----:|--------|
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

Si falla hasta +3, solo se pierden los materiales. Desde +4, además el arma baja un nivel, salvo que tengas una 🛡️: se rompe ella en su lugar. El arma nunca se destruye. Cada nivel da **+8% de daño** contra el jefe de mundo.

---

## ⚔️ Raid — jefe de mundo

```
!raid             — el jefe actual: vida, tiempo, quién pegó más
!atacar           — un golpe (uno por minuto)
!raid on / off    — admins: avisos de raid en el grupo
```

Un solo jefe para **todos los grupos**: aparece cada ~6 h y se escapa a los 60 min. El daño sube con tu nivel, tu compañero y tu arma.

**Sinergia elemental:** si otro jugador golpeó hace menos de 90 s y los elementos de su compañero combinan con los del tuyo, tu golpe dispara una reacción y pega más — Eclipse (Luz + Oscuridad) ×1,8, Paradoja (Tiempo + Caos) ×1,7, Despertar ancestral (Primigenio + Leyenda) ×1,7, Tormenta de fuego (Fuego + Viento) ×1,6, Electrocución (Mar + Eléctrico) ×1,6, y diez más de ×1,3 a ×1,5. Un golpe que ya formó una reacción no sirve para otra: hay que turnarse.

Si el jefe cae, el botín (BrasCoins y XP) se reparte por daño, con +20% para el que más pegó y +10% para el que lo remató; si se escapa, se reparte un cuarto. La vida del siguiente crece con la cantidad de gente que peleó el anterior.

---

## 🏰 Mazmorra del día

```
!mazmorra entrar        — empezar la expedición del grupo
!mazmorra <puerta>      — abrir una puerta (cualquiera del grupo, y se suma)
!mazmorra salir         — retirarse y cobrar el botín
!mazmorra ranking       — los grupos que llegaron más hondo hoy
```

Una mazmorra nueva cada día, **la misma para todos los grupos**: 10 niveles de 2 o 3 puertas y un jefe al final. De cada puerta solo se ve una pista, y las pistas engañan: "huele a azufre" puede ser un monstruo o una trampa. El grupo comparte 100 de vida y un botín.

- Los monstruos siempre caen, pero cuestan vida: menos cuanto más poder tiene el grupo. El poder es la suma del **nivel**, el **compañero** y el **arma** de cada uno.
- Las trampas quitan vida, las fuentes curan, los tesoros dan BrasCoins y a veces ⚔️ ✨ 🏆 (para el que abrió la puerta).
- Retirarse cobra todo; caer rescata el 25%; tumbar al jefe lo multiplica por 1,5. Cada aventurero extra suma +25% al botín (hasta 8), que se reparte en partes iguales.
- Una expedición por persona por día. Al jefe no se le gana solo: uno típico lo logra ~7% de las veces, cuatro juntos ~48%.

---

## 🔨 Subastas

```
!subasta                                         — la subasta abierta en el grupo
!subasta vender dragon <#> <base> [minutos]      — subastar un dragón
!subasta vender <ítem> <cantidad> <base> [min]   — espada, proteccion, pocion, sp, legendario
!pujar <monto>  /  !pujar min                    — pujar
!subasta cancelar                                — retirarla, si nadie pujó
```

Una por grupo, de 5 a 120 minutos (30 por defecto). El objeto queda retenido desde que se publica, y tu puja desde que pujás: si te superan, se te devuelve en el acto. Pujar en el último minuto la alarga un minuto. Cada puja tiene que superar a la anterior en 5% (mínimo ¥50). La casa se queda el 5% de la venta. Si nadie puja, el objeto vuelve al vendedor.

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
| Un dragón | `!pet hatch` (¥800) o `!pet criar <#> <#>` |
| Darle uso a mis ⚔️ ✨ 🏆 | `!forjar mejorar` |
| Vender un dragón o ítems | `!subasta vender …` |
| Pelear con todos los grupos | `!raid` → `!atacar` |
| Una aventura en grupo cada día | `!mazmorra entrar` |
| Personajes/harem | `!rw` → `!c` (respondiendo su mensaje) |
| Subir de ranking competitivo | `!arena retar @usuario` |
| Un trofeo/regalo para alguien | `!regalo enviar @usuario trophy` |
| Proteger mis BrasCoins de robos | `!dep <monto>` |
| Ver mis cooldowns | `!einfo` |
| Ver mis stats completos | `!xp` o `!perfil` |
