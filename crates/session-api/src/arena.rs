//! La pelea de `#arena` y su CPU, para `#simular` (POST /arena/simular).
//!
//! La referencia son `Arena.processAction` (src/lib/pvp.ts) y
//! `mejorAccion`/`elegirAccion` (src/lib/arenaAI.ts). Esto es una SEGUNDA
//! copia, y por eso tiene un test cruzado: `scripts/arena_fixture.js` genera
//! desde el TypeScript miles de casos —una acción con sus tiradas, y la
//! decisión de la CPU en cada nivel—, y `la_pelea_y_la_cpu_dan_lo_mismo_que_typescript`
//! exige el mismo resultado en todos. Si se cambia una regla en pvp.ts, el test
//! de vitest que compara el archivo con el TypeScript falla primero.
//!
//! Para que dé lo mismo: las mismas operaciones en el mismo orden (f64 igual
//! que los números de JavaScript), el mismo orden de las acciones, y el mismo
//! desempate (la primera que supera a la mejor).
//!
//! Por qué en Rust: contra la CPU difícil cada decisión son ~50.000 nodos de
//! búsqueda, ~8,6 ms en JavaScript. Acá el estado es un `Copy` de 16 bytes, sin
//! objetos ni texto, y las peleas se reparten entre los núcleos.

use std::collections::HashMap;

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::routes::AppState;

pub const MAX_HP: i32 = 100;
const GANA: f64 = 1000.0;
const CUANTILES: [f64; 3] = [0.15, 0.5, 0.85];

/// El jugador es 0 (p1) y la CPU es 1 (p2), como en pvp.ts.
pub const JUGADOR: usize = 0;
pub const CPU: usize = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Estado {
    pub hp: [i32; 2],
    pub escudo: [i32; 2],
    pub ultimate: [bool; 2],
    pub turno: usize,
}

impl Estado {
    pub fn nuevo() -> Self {
        Self { hp: [MAX_HP; 2], escudo: [0; 2], ultimate: [false; 2], turno: JUGADOR }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Accion {
    Atacar,
    Poderoso,
    Defender,
    Curar,
    Ultimate,
}

/// En el mismo orden que ACCIONES en arenaAI.ts: el desempate depende de él.
pub const ACCIONES: [Accion; 5] = [Accion::Atacar, Accion::Poderoso, Accion::Defender, Accion::Curar, Accion::Ultimate];

impl Accion {
    pub fn nombre(self) -> &'static str {
        match self {
            Accion::Atacar => "atacar",
            Accion::Poderoso => "poderoso",
            Accion::Defender => "defender",
            Accion::Curar => "curar",
            Accion::Ultimate => "ultimate",
        }
    }
    pub fn de(s: &str) -> Option<Self> {
        ACCIONES.into_iter().find(|a| a.nombre() == s)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Nivel {
    Facil,
    Normal,
    Dificil,
}

impl Nivel {
    fn profundidad(self) -> i32 {
        match self {
            Nivel::Facil => 1,
            Nivel::Normal => 2,
            Nivel::Dificil => 4,
        }
    }
    /// Fácil y normal a veces eligen al azar, a propósito (ERROR en arenaAI.ts).
    fn error(self) -> f64 {
        match self {
            Nivel::Facil => 0.4,
            Nivel::Normal => 0.1,
            Nivel::Dificil => 0.0,
        }
    }
}

/// `Arena.processAction`: `actor` hace `accion`. `tirar(min, max)` da un
/// entero en [min, max]. Devuelve si la pelea terminó.
pub fn procesar(s: &mut Estado, actor: usize, accion: Accion, tirar: &mut impl FnMut(i32, i32) -> i32) -> bool {
    let rival = 1 - actor;
    match accion {
        Accion::Atacar => {
            let base = tirar(8, 18);
            let dmg = (base - s.escudo[rival]).max(1);
            s.escudo[rival] = (s.escudo[rival] - 2).max(0);
            s.hp[rival] -= dmg;
        }
        Accion::Poderoso => {
            if tirar(1, 10) > 3 {
                let base = tirar(18, 32);
                let dmg = (base - s.escudo[rival]).max(1);
                s.escudo[rival] = 0;
                s.hp[rival] -= dmg;
            }
        }
        Accion::Defender => s.escudo[actor] = tirar(8, 16),
        Accion::Curar => {
            let cura = tirar(10, 20);
            s.hp[actor] = MAX_HP.min(s.hp[actor] + cura);
        }
        Accion::Ultimate => {
            // Como en pvp.ts: un ultimate ya usado no hace nada y NO pasa el turno.
            if s.ultimate[actor] {
                return false;
            }
            let dmg = tirar(30, 50);
            s.hp[rival] -= dmg;
            s.hp[actor] = MAX_HP.min(s.hp[actor] + 15);
            s.ultimate[actor] = true;
        }
    }
    s.hp = [s.hp[0].max(0), s.hp[1].max(0)];
    let fin = s.hp[0] <= 0 || s.hp[1] <= 0;
    if !fin {
        s.turno = 1 - s.turno;
    }
    fin
}

/// `tiradaCuantil` de arenaAI.ts: `min + Math.round(q · (max − min))`. Para
/// positivos, el redondeo de Rust (lejos del cero) y Math.round dan lo mismo.
fn cuantil(q: f64) -> impl FnMut(i32, i32) -> i32 {
    move |min, max| min + (q * f64::from(max - min)).round() as i32
}

fn legales(s: &Estado, lado: usize) -> impl Iterator<Item = Accion> + '_ {
    ACCIONES.into_iter().filter(move |a| !(*a == Accion::Ultimate && s.ultimate[lado]))
}

/// `evaluar` de arenaAI.ts: lo bien que le va a la CPU, en el mismo orden de sumas.
pub fn evaluar(s: &Estado) -> f64 {
    if s.hp[1] <= 0 {
        return -GANA;
    }
    if s.hp[0] <= 0 {
        return GANA;
    }
    f64::from(s.hp[1] - s.hp[0]) + 0.5 * f64::from(s.escudo[1] - s.escudo[0])
        + (if s.ultimate[1] { 0.0 } else { 12.0 })
        - (if s.ultimate[0] { 0.0 } else { 12.0 })
}

/// La búsqueda de UNA decisión, con lo ya calculado (la misma situación a la
/// misma profundidad vale lo mismo, como el `memo` de arenaAI.ts).
struct Busqueda {
    memo: HashMap<(Estado, i32), f64>,
}

impl Busqueda {
    fn esperado(&mut self, s: &Estado, accion: Accion, prof: i32) -> f64 {
        let actor = s.turno;
        let mut total = 0.0;
        for q in CUANTILES {
            let mut h = *s;
            let fin = procesar(&mut h, actor, accion, &mut cuantil(q));
            total += if fin {
                evaluar(&h) + if h.hp[0] <= 0 { f64::from(prof) } else { -f64::from(prof) }
            } else {
                self.valor(&h, prof - 1)
            };
        }
        total / CUANTILES.len() as f64
    }

    fn valor(&mut self, s: &Estado, prof: i32) -> f64 {
        if prof <= 0 || s.hp[0] <= 0 || s.hp[1] <= 0 {
            return evaluar(s);
        }
        if let Some(v) = self.memo.get(&(*s, prof)) {
            return *v;
        }
        let es_cpu = s.turno == CPU;
        let mut mejor = if es_cpu { f64::NEG_INFINITY } else { f64::INFINITY };
        for a in legales(s, s.turno) {
            let v = self.esperado(s, a, prof);
            if if es_cpu { v > mejor } else { v < mejor } {
                mejor = v;
            }
        }
        self.memo.insert((*s, prof), mejor);
        mejor
    }
}

/// `mejorAccion` de arenaAI.ts: lo que el cálculo elige para la CPU.
pub fn mejor_accion(s: &Estado, nivel: Nivel) -> Accion {
    let prof = nivel.profundidad();
    let mut b = Busqueda { memo: HashMap::new() };
    let mut mejor = Accion::Atacar;
    let mut mejor_v = f64::NEG_INFINITY;
    let mut primera = true;
    for a in legales(s, CPU) {
        let v = b.esperado(s, a, prof);
        if primera || v > mejor_v {
            primera = false;
            mejor_v = v;
            mejor = a;
        }
    }
    mejor
}

// ── La simulación ───────────────────────────────────────────────────────────

/// Un generador chico y rápido (xorshift64*): para Monte Carlo alcanza, y no
/// suma una dependencia. `f64` en [0, 1) como Math.random.
pub struct Azar(u64);

impl Azar {
    pub fn new(semilla: u64) -> Self {
        Self(semilla | 1)
    }
    pub fn f64(&mut self) -> f64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        (self.0.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11) as f64 / (1u64 << 53) as f64
    }
    /// `tirar` de pvp.ts: un entero en [min, max].
    pub fn entero(&mut self, min: i32, max: i32) -> i32 {
        (self.f64() * f64::from(max - min + 1)).floor() as i32 + min
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Estilo {
    Agresivo,
    Arriesgado,
    Defensivo,
    Inteligente,
}

pub const ESTILOS: [Estilo; 4] = [Estilo::Agresivo, Estilo::Arriesgado, Estilo::Defensivo, Estilo::Inteligente];

/// La pelea vista desde el jugador, como si fuera la CPU (`espejo` de arenaSim.ts).
fn espejo(s: &Estado) -> Estado {
    Estado { hp: [s.hp[1], s.hp[0]], escudo: [s.escudo[1], s.escudo[0]], ultimate: [s.ultimate[1], s.ultimate[0]], turno: CPU }
}

/// Las decisiones ya pensadas, de una simulación (`cacheDeDecisiones`),
/// COMPARTIDAS entre los hilos: con una por hilo, cada uno repensaba lo que otro
/// ya había pensado, y contra la CPU difícil 12 hilos rendían 2,25x lo de uno.
type Cache = dashmap::DashMap<(Estado, Nivel), Accion>;

fn decidir(cache: &Cache, s: &Estado, nivel: Nivel) -> Accion {
    if let Some(a) = cache.get(&(*s, nivel)) {
        return *a;
    }
    // Pensada fuera del candado: dos hilos pueden pensar la misma a la vez, y
    // dan lo mismo; tenerla bloqueada mientras se piensa frenaría a todos.
    let a = mejor_accion(s, nivel);
    cache.insert((*s, nivel), a);
    a
}

/// `elegirAccion`: con el error a propósito del nivel, y si no, lo pensado.
fn elegir(cache: &Cache, s: &Estado, nivel: Nivel, azar: &mut Azar) -> Accion {
    if azar.f64() < nivel.error() {
        let opciones: Vec<Accion> = legales(s, CPU).collect();
        return opciones[(azar.f64() * opciones.len() as f64).floor() as usize];
    }
    decidir(cache, s, nivel)
}

/// `jugada` de arenaSim.ts.
fn jugada(cache: &Cache, s: &Estado, estilo: Estilo, azar: &mut Azar) -> Accion {
    let ult = !s.ultimate[0];
    match estilo {
        Estilo::Agresivo => if ult { Accion::Ultimate } else { Accion::Atacar },
        Estilo::Arriesgado => if ult { Accion::Ultimate } else { Accion::Poderoso },
        Estilo::Defensivo => {
            if ult && s.hp[1] <= 50 {
                Accion::Ultimate
            } else if s.hp[0] < 40 {
                Accion::Curar
            } else if s.escudo[0] == 0 && s.hp[0] < 75 {
                Accion::Defender
            } else {
                Accion::Atacar
            }
        }
        Estilo::Inteligente => elegir(cache, &espejo(s), Nivel::Normal, azar),
    }
}

const MAX_TURNOS: i32 = 200;

/// Una pelea entera: si ganó el jugador (None, empate) y los turnos.
fn pelea(cache: &Cache, nivel: Nivel, estilo: Estilo, azar: &mut Azar) -> (Option<bool>, i32) {
    let mut s = Estado::nuevo();
    for t in 0..MAX_TURNOS {
        let actor = s.turno;
        let accion = if actor == JUGADOR { jugada(cache, &s, estilo, azar) } else { elegir(cache, &s, nivel, azar) };
        if procesar(&mut s, actor, accion, &mut |min, max| azar.entero(min, max)) {
            return (Some(s.hp[1] <= 0), (t + 2) / 2);
        }
    }
    (None, MAX_TURNOS / 2)
}

#[derive(Serialize, Debug, Clone, Copy)]
pub struct Cuenta {
    pub estilo: Estilo,
    pub peleas: u32,
    pub victorias: u32,
    pub turnos: u64,
}

/// Hasta `peleas` por estilo, repartidas entre `hilos`, cortando a `max_ms`.
/// Cada hilo tiene su azar; el caché de decisiones es de todos.
pub fn simular(nivel: Nivel, peleas: u32, max_ms: u64, hilos: usize, semilla: u64) -> Vec<Cuenta> {
    let fin = std::time::Instant::now() + std::time::Duration::from_millis(max_ms);
    let hilos = hilos.max(1) as u32;
    let cache = Cache::new();
    let parciales: Vec<Vec<Cuenta>> = std::thread::scope(|sc| {
        let tareas: Vec<_> = (0..hilos)
            .map(|h| {
                let cache = &cache;
                sc.spawn(move || {
                    let mut azar = Azar::new(semilla ^ (u64::from(h) + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15));
                    let mias = peleas / hilos + u32::from(h < peleas % hilos);
                    let mut c: Vec<Cuenta> = ESTILOS.map(|estilo| Cuenta { estilo, peleas: 0, victorias: 0, turnos: 0 }).to_vec();
                    // En rueda: si se corta por tiempo, todos los estilos quedan parejos.
                    'afuera: for _ in 0..mias {
                        for x in c.iter_mut() {
                            if std::time::Instant::now() >= fin {
                                break 'afuera;
                            }
                            let (gano, t) = pelea(cache, nivel, x.estilo, &mut azar);
                            x.peleas += 1;
                            x.victorias += u32::from(gano == Some(true));
                            x.turnos += t as u64;
                        }
                    }
                    c
                })
            })
            .collect();
        tareas.into_iter().map(|t| t.join().expect("hilo de simulación")).collect()
    });
    let mut total: Vec<Cuenta> = ESTILOS.map(|estilo| Cuenta { estilo, peleas: 0, victorias: 0, turnos: 0 }).to_vec();
    for p in parciales {
        for (t, x) in total.iter_mut().zip(p) {
            t.peleas += x.peleas;
            t.victorias += x.victorias;
            t.turnos += x.turnos;
        }
    }
    total
}

#[derive(Deserialize)]
pub struct SimularRequest {
    pub nivel: Nivel,
    #[serde(default = "por_defecto_peleas")]
    pub peleas: u32,
    #[serde(default = "por_defecto_ms")]
    pub max_ms: u64,
}
fn por_defecto_peleas() -> u32 {
    2000
}
fn por_defecto_ms() -> u64 {
    4000
}

/// POST /arena/simular — en un hilo bloqueante, con todos los núcleos.
pub async fn simular_handler(State(_s): State<AppState>, Json(req): Json<SimularRequest>) -> Json<serde_json::Value> {
    let peleas = req.peleas.min(20_000);
    let max_ms = req.max_ms.min(15_000);
    let semilla = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(1, |d| d.as_nanos() as u64);
    match tokio::task::spawn_blocking(move || simular(req.nivel, peleas, max_ms, crate::anime4k::hilos(), semilla)).await {
        Ok(r) => Json(serde_json::json!({ "ok": true, "resultados": r })),
        Err(e) => Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct EstadoJs {
        hp1: i32,
        hp2: i32,
        shield1: i32,
        shield2: i32,
        #[serde(rename = "ultimateUsed1")]
        ult1: bool,
        #[serde(rename = "ultimateUsed2")]
        ult2: bool,
        cpu: bool,
    }
    impl EstadoJs {
        fn a(&self) -> Estado {
            Estado { hp: [self.hp1, self.hp2], escudo: [self.shield1, self.shield2], ultimate: [self.ult1, self.ult2], turno: if self.cpu { CPU } else { JUGADOR } }
        }
    }
    #[derive(Deserialize)]
    struct Accionado {
        antes: EstadoJs,
        accion: String,
        tiradas: Vec<i32>,
        despues: EstadoJs,
        fin: bool,
    }
    #[derive(Deserialize)]
    struct Decision {
        estado: EstadoJs,
        nivel: Nivel,
        accion: String,
    }
    #[derive(Deserialize)]
    struct Fixture {
        acciones: Vec<Accionado>,
        decisiones: Vec<Decision>,
    }

    #[test]
    fn la_pelea_y_la_cpu_dan_lo_mismo_que_typescript() {
        let f: Fixture = serde_json::from_str(include_str!("../tests/fixtures/arena.json")).unwrap();
        assert!(f.acciones.len() >= 1000 && f.decisiones.len() >= 300);
        for (i, c) in f.acciones.iter().enumerate() {
            let mut s = c.antes.a();
            let actor = s.turno;
            let mut t = c.tiradas.iter().copied();
            let fin = procesar(&mut s, actor, Accion::de(&c.accion).unwrap(), &mut |_, _| t.next().expect("faltan tiradas"));
            assert_eq!((s, fin), (c.despues.a(), c.fin), "acción {i}: {}", c.accion);
        }
        for (i, d) in f.decisiones.iter().enumerate() {
            assert_eq!(mejor_accion(&d.estado.a(), d.nivel).nombre(), d.accion, "decisión {i} ({:?})", d.nivel);
        }
    }

    #[test]
    fn simular_reparte_y_cuenta() {
        let r = simular(Nivel::Facil, 200, 10_000, 4, 42);
        assert_eq!(r.len(), 4);
        for c in &r {
            assert_eq!(c.peleas, 200, "{:?}", c.estilo);
            assert!(c.victorias <= c.peleas);
        }
    }

    #[test]
    fn el_azar_da_enteros_en_el_rango() {
        let mut a = Azar::new(7);
        let mut vistos = [false; 11];
        for _ in 0..10_000 {
            let n = a.entero(8, 18);
            assert!((8..=18).contains(&n));
            vistos[(n - 8) as usize] = true;
        }
        assert!(vistos.iter().all(|v| *v));
    }
}
