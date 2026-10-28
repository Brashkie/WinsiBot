//! antiban.rs — el ritmo de salida de cada cuenta, decidido en un solo sitio.
//!
//! El embudo de salida de TypeScript (`core/egress.ts`) ya garantizaba que
//! TODO envío pasara por un limitador: techo global de 3/s, cubeta por chat y
//! 300 ms entre mensajes. Le faltaban cinco cosas, y son las que este módulo
//! agrega:
//!
//! 1. **Ventanas largas.** Un techo por segundo no ve una hora entera a ritmo
//!    máximo, que son 10.800 mensajes. Aquí hay topes por minuto, por hora y
//!    por día, en ventanas deslizantes.
//! 2. **Calentamiento.** Un número recién vinculado —un sub-bot nuevo, o el
//!    principal tras escanear otra vez— arranca con un tope diario chico que
//!    sube día a día. Las sesiones que ya existían antes de este módulo NO
//!    entran en calentamiento: no hay forma de saber su edad, y frenar siete
//!    días a un bot que lleva meses andando sería romperlo.
//! 3. **Pausa con forma humana.** 300 ms fijos entre mensajes es la firma de un
//!    programa: siempre el mismo intervalo. La pausa sale de una normal, con
//!    media y desvío configurables y un piso, generada aquí con Box-Muller
//!    sobre el `rng.rs` del proyecto.
//! 4. **Error 463.** WhatsApp lo devuelve en el *ack* de un mensaje que no
//!    acepta entregar a ese contacto. No rechaza la promesa de `sendMessage`:
//!    llega después, por `messages.update`, y por eso el limitador de
//!    TypeScript, que buscaba el código en la excepción, nunca lo veía. Aquí
//!    ese contacto queda en espera con escalada, y muchos 463 en una hora
//!    frenan la cuenta entera, porque ya no es un contacto sino la cuenta.
//! 5. **429 que de verdad frena.** El retroceso de TypeScript solo existía en
//!    la cola de prioridades, por la que no pasa casi nada; el camino de
//!    `directForJid`, por el que pasa todo, no retrocedía nunca.
//!
//! ## Lo que NO hace, y por qué
//!
//! No rota IPs ni usa proxies residenciales. Eso no baja el riesgo de lo que el
//! bot hace: lo esconde, y deja de ser ritmo para pasar a ser evasión. El bot
//! responde en grupos a los que lo agregaron; lo que lo protege es no
//! comportarse como una ráfaga, y eso es lo que mide este módulo. Tampoco hay
//! garantía: Meta no publica sus umbrales, así que los topes de aquí son
//! márgenes, no números conocidos, y `status` existe para ajustarlos con el
//! volumen real del bot y no a ojo.
//!
//! ## Forma
//!
//! El núcleo, [`Motor`], es lógica pura: el tiempo y la aleatoriedad entran por
//! parámetro, así que los tests lo recorren días enteros en microsegundos. Lo
//! de alrededor —el `Mutex`, el archivo, las rutas HTTP— es la cáscara.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};

use crate::routes::AppState;

const MINUTO: u64 = 60_000;
const HORA: u64 = 60 * MINUTO;
const DIA: u64 = 24 * HORA;

// ── Política ─────────────────────────────────────────────────────────────────

/// Los números que deciden el ritmo. Todos salen de `.env` (ver
/// [`Politica::desde_entorno`]) y los valores por defecto están pensados para
/// un bot de cientos de grupos que responde comandos, no para un número que
/// difunde.
#[derive(Debug, Clone, Serialize)]
pub struct Politica {
    /// Envíos por cuenta en cualquier ventana de 60 s.
    pub por_minuto: u32,
    /// En cualquier ventana de una hora.
    pub por_hora: u32,
    /// En cualquier ventana de 24 h. 0 es sin tope fuera del calentamiento.
    pub por_dia: u32,
    /// Tope de 24 h para el día N desde que se vinculó el número. Pasado el
    /// último, rige `por_dia`.
    pub calentamiento: Vec<u32>,
    /// La pausa entre dos envíos de la misma cuenta: normal con esta media...
    pub pausa_media_ms: f64,
    /// ...este desvío...
    pub pausa_desvio_ms: f64,
    /// ...y este piso, que además corta la cola izquierda de la normal.
    pub pausa_min_ms: u64,
    /// Si el turno queda más lejos que esto, se rechaza en vez de esperar: una
    /// respuesta a un comando que sale diez minutos tarde ya no sirve, y
    /// colgar la promesa diez minutos traba a quien la espera.
    pub espera_max_ms: u64,
    /// Primer enfriamiento de la cuenta tras un 429. Se duplica en cada 429
    /// seguido, hasta `enfriamiento_429_max_ms`.
    pub enfriamiento_429_ms: u64,
    pub enfriamiento_429_max_ms: u64,
    /// Primera espera de un contacto tras un 463. Se duplica en cada 463 del
    /// mismo contacto, hasta un día.
    pub enfriamiento_463_ms: u64,
    /// Con tantos 463 en una hora, en contactos que sean, se enfría la cuenta
    /// entera como con un 429.
    pub umbral_463_hora: u32,
}

impl Default for Politica {
    fn default() -> Self {
        Self {
            // El limitador de TypeScript ya permite 3/s sostenidos; esto no
            // lo reemplaza, le pone techo a las ventanas largas. 40/min y
            // 1000/h dejan pasar el tráfico de un bot de comandos con cientos
            // de grupos y cortan una ráfaga sostenida.
            por_minuto: 40,
            por_hora: 1_000,
            por_dia: 0,
            // Siete días, doblando. El primer día alcanza para probar un
            // sub-bot en unos pocos grupos, no para meterlo en cuarenta.
            calentamiento: vec![40, 80, 160, 320, 640, 1_200, 2_400],
            pausa_media_ms: 900.0,
            pausa_desvio_ms: 350.0,
            pausa_min_ms: 350,
            espera_max_ms: 60_000,
            enfriamiento_429_ms: 30_000,
            enfriamiento_429_max_ms: 15 * MINUTO,
            enfriamiento_463_ms: HORA,
            umbral_463_hora: 5,
        }
    }
}

impl Politica {
    /// Lee `ANTIBAN_*` del entorno; lo que falte o no se entienda queda en el
    /// valor por defecto, con un aviso en vez de un pánico: una variable mal
    /// escrita no puede tirar abajo la API entera.
    pub fn desde_entorno() -> Self {
        let mut p = Self::default();
        fn leer<T: std::str::FromStr>(nombre: &str, destino: &mut T) {
            if let Ok(v) = std::env::var(nombre) {
                match v.trim().parse() {
                    Ok(x) => *destino = x,
                    Err(_) => {
                        tracing::warn!(variable = nombre, valor = %v, "valor no válido, queda el de por defecto")
                    }
                }
            }
        }
        leer("ANTIBAN_POR_MINUTO", &mut p.por_minuto);
        leer("ANTIBAN_POR_HORA", &mut p.por_hora);
        leer("ANTIBAN_POR_DIA", &mut p.por_dia);
        leer("ANTIBAN_PAUSA_MEDIA_MS", &mut p.pausa_media_ms);
        leer("ANTIBAN_PAUSA_DESVIO_MS", &mut p.pausa_desvio_ms);
        leer("ANTIBAN_PAUSA_MIN_MS", &mut p.pausa_min_ms);
        leer("ANTIBAN_ESPERA_MAX_MS", &mut p.espera_max_ms);
        leer("ANTIBAN_UMBRAL_463_HORA", &mut p.umbral_463_hora);
        if let Ok(v) = std::env::var("ANTIBAN_CALENTAMIENTO") {
            // Lista separada por comas; vacía apaga el calentamiento.
            let lista: Result<Vec<u32>, _> = v
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::parse)
                .collect();
            match lista {
                Ok(l) => p.calentamiento = l,
                Err(_) => {
                    tracing::warn!(valor = %v, "ANTIBAN_CALENTAMIENTO no válido, queda el de por defecto")
                }
            }
        }
        p
    }
}

// ── Decisión ─────────────────────────────────────────────────────────────────

/// Qué limitó el turno. Va en la respuesta para que el log diga por qué un
/// mensaje tardó, que es lo primero que uno pregunta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Motivo {
    Libre,
    Pausa,
    Minuto,
    Hora,
    Dia,
    Calentamiento,
    Enfriamiento,
    Contacto463,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Salir dentro de `esperar_ms`. El turno ya quedó reservado.
    Enviar { esperar_ms: u64, motivo: Motivo },
    /// No salir: el turno queda más allá de la espera máxima, o el contacto
    /// está en espera por 463. No se reserva nada.
    Rechazar {
        reintentar_en_ms: u64,
        motivo: Motivo,
    },
}

// ── Estado ───────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct Sesion {
    /// Turnos reservados de las últimas 24 h, en orden. Cada turno es mayor o
    /// igual que el anterior, porque se agenda después de él: por eso se puede
    /// buscar con `partition_point` sin ordenar nunca.
    envios: VecDeque<u64>,
    /// Cuándo se vinculó el número, si se vio. `None` es una sesión de antes
    /// de este módulo: madura, sin calentamiento.
    emparejado_ms: Option<u64>,
    /// Qué número es, para no confundir "otro número" con "el mismo número,
    /// vinculado otra vez" (ver `emparejado`).
    #[serde(default)]
    numero: Option<String>,
    enfriado_hasta: u64,
    racha_429: u32,
    ultimo_429: u64,
    /// Contacto → (en espera hasta, nivel de escalada).
    por_contacto: HashMap<String, (u64, u32)>,
    errores_463: VecDeque<u64>,
}

impl Sesion {
    fn podar(&mut self, ahora: u64) {
        // `checked_sub` y no `saturating_sub`: con menos de un dia de reloj el
        // corte seria 0, y `<= 0` tiraria lo enviado en el instante 0.
        if let Some(corte) = ahora.checked_sub(DIA) {
            while self.envios.front().is_some_and(|&t| t <= corte) {
                self.envios.pop_front();
            }
        }
        if let Some(corte) = ahora.checked_sub(HORA) {
            while self.errores_463.front().is_some_and(|&t| t <= corte) {
                self.errores_463.pop_front();
            }
        }
        // Barato y raro: solo cuando el mapa creció.
        if self.por_contacto.len() > 512 {
            self.por_contacto.retain(|_, (hasta, _)| *hasta > ahora);
        }
    }

    /// Envíos reservados en `(t - ventana, t]`.
    fn en_ventana(&self, t: u64, ventana: u64) -> usize {
        match t.checked_sub(ventana) {
            Some(desde) => self.envios.len() - self.envios.partition_point(|&x| x <= desde),
            None => self.envios.len(),
        }
    }

    /// El primer instante `>= t` en que la ventana tiene lugar para uno más
    /// con tope `tope`. Si ya está llena, es cuando sale el más viejo que
    /// sobra: el `tope`-ésimo más reciente, más la ventana.
    fn hueco(&self, t: u64, ventana: u64, tope: u32) -> u64 {
        let tope = tope as usize;
        if tope == 0 || self.en_ventana(t, ventana) < tope {
            return t;
        }
        // `e` sale de la ventana `(t - ventana, t]` justo en `e + ventana`.
        let e = self.envios[self.envios.len() - tope];
        t.max(e + ventana)
    }

    fn tope_dia(&self, p: &Politica, t: u64) -> (u32, Motivo) {
        if let Some(desde) = self.emparejado_ms {
            let dia = (t.saturating_sub(desde) / DIA) as usize;
            if let Some(&tope) = p.calentamiento.get(dia) {
                return (tope, Motivo::Calentamiento);
            }
        }
        (p.por_dia, Motivo::Dia)
    }
}

/// Una muestra de la pausa: normal por Box-Muller, con piso. `u1` y `u2` son
/// uniformes en `[0, 1)`.
fn pausa(p: &Politica, u1: f64, u2: f64) -> u64 {
    // `1 - u1` está en (0, 1]: el logaritmo nunca ve un cero.
    let z = (-2.0 * (1.0 - u1).ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
    let ms = p.pausa_media_ms + z * p.pausa_desvio_ms;
    (ms.max(0.0) as u64).max(p.pausa_min_ms)
}

/// El núcleo: sin reloj, sin archivos, sin candados.
#[derive(Debug, Default)]
pub struct Motor {
    sesiones: HashMap<String, Sesion>,
    politica: Politica,
}

impl Motor {
    pub fn new(politica: Politica) -> Self {
        Self {
            sesiones: HashMap::new(),
            politica,
        }
    }

    pub fn politica(&self) -> &Politica {
        &self.politica
    }

    /// Pide turno para un envío de `sesion` a `jid`. Si la respuesta es
    /// `Enviar`, el turno queda reservado aunque el envío después falle: es lo
    /// conservador, y evita que dos pedidos simultáneos tomen el mismo hueco,
    /// que es la carrera que tenía el limitador de TypeScript.
    pub fn permiso(&mut self, sesion: &str, jid: &str, ahora: u64, u1: f64, u2: f64) -> Decision {
        let p = &self.politica;
        let s = self.sesiones.entry(sesion.to_owned()).or_default();
        s.podar(ahora);

        if let Some(&(hasta, _)) = s.por_contacto.get(jid) {
            if hasta > ahora {
                return Decision::Rechazar {
                    reintentar_en_ms: hasta - ahora,
                    motivo: Motivo::Contacto463,
                };
            }
        }

        // Cada restricción empuja el turno hacia adelante y nunca hacia atrás,
        // así que basta una pasada: correrlo por una ventana solo puede vaciar
        // las otras. Se queda como motivo la que más lo empujó.
        let mut t = ahora;
        let mut motivo = Motivo::Libre;
        let mut empujar = |nuevo: u64, m: Motivo, t: &mut u64| {
            if nuevo > *t {
                *t = nuevo;
                motivo = m;
            }
        };

        empujar(s.enfriado_hasta, Motivo::Enfriamiento, &mut t);
        if let Some(&ultimo) = s.envios.back() {
            empujar(ultimo + pausa(p, u1, u2), Motivo::Pausa, &mut t);
        }
        empujar(s.hueco(t, MINUTO, p.por_minuto), Motivo::Minuto, &mut t);
        empujar(s.hueco(t, HORA, p.por_hora), Motivo::Hora, &mut t);
        let (tope_dia, m_dia) = s.tope_dia(p, t);
        empujar(s.hueco(t, DIA, tope_dia), m_dia, &mut t);

        let esperar = t - ahora;
        if esperar > p.espera_max_ms {
            return Decision::Rechazar {
                reintentar_en_ms: esperar,
                motivo,
            };
        }
        s.envios.push_back(t);
        Decision::Enviar {
            esperar_ms: esperar,
            motivo,
        }
    }

    /// WhatsApp devolvió un error en el *ack* de un envío. Devuelve cuánto
    /// queda enfriada la cuenta, o el contacto si es un 463.
    pub fn reportar(&mut self, sesion: &str, jid: &str, codigo: u16, ahora: u64) -> u64 {
        let p = &self.politica;
        let s = self.sesiones.entry(sesion.to_owned()).or_default();
        s.podar(ahora);
        match codigo {
            429 => enfriar_cuenta(s, p, ahora),
            463 => {
                let nivel = s.por_contacto.get(jid).map_or(0, |&(_, n)| n) + 1;
                let espera = (p.enfriamiento_463_ms << (nivel - 1).min(10)).min(DIA);
                s.por_contacto
                    .insert(jid.to_owned(), (ahora + espera, nivel));
                s.errores_463.push_back(ahora);
                if p.umbral_463_hora > 0 && s.errores_463.len() >= p.umbral_463_hora as usize {
                    // Ya no es un contacto: es la cuenta.
                    s.errores_463.clear();
                    return enfriar_cuenta(s, p, ahora);
                }
                espera
            }
            _ => 0,
        }
    }

    /// Se escaneó un QR: si es un número nuevo, empieza el calentamiento.
    /// Devuelve si empezó.
    ///
    /// Vincular **otra vez el mismo número** no lo vuelve nuevo: WhatsApp mide
    /// la cuenta, no el dispositivo. Hasta la 8.18.0 eso también arrancaba el
    /// calentamiento, y un bot con meses y miles de usuarios quedó con 40
    /// mensajes por día después de escanear el QR. Ahora, si el número es el
    /// que esta sesión ya tenía, no se toca nada: si venía en calentamiento lo
    /// sigue desde su fecha —vincular de nuevo no sirve para saltarlo—, y si
    /// era madura sigue madura.
    pub fn emparejado(&mut self, sesion: &str, numero: Option<&str>, ahora: u64) -> bool {
        let s = self.sesiones.entry(sesion.to_owned()).or_default();
        if numero.is_some() && s.numero.as_deref() == numero {
            return false;
        }
        if let Some(n) = numero {
            s.numero = Some(n.to_owned());
        }
        s.emparejado_ms = Some(ahora);
        // Lo que se haya enviado con un vínculo anterior no cuenta para este.
        s.envios.clear();
        true
    }

    /// El bot avisa qué número tiene la sesión cada vez que conecta. Solo se
    /// anota si no se sabía: es lo que deja reconocer a una sesión madura
    /// cuando, más adelante, se escanee el QR otra vez.
    pub fn conocer(&mut self, sesion: &str, numero: &str) {
        let s = self.sesiones.entry(sesion.to_owned()).or_default();
        if s.numero.is_none() && !numero.is_empty() {
            s.numero = Some(numero.to_owned());
        }
    }

    pub fn estado(&self, sesion: &str, ahora: u64) -> Estado {
        let vacia = Sesion::default();
        let s = self.sesiones.get(sesion).unwrap_or(&vacia);
        let (tope, motivo) = s.tope_dia(&self.politica, ahora);
        Estado {
            ultimo_minuto: s.en_ventana(ahora, MINUTO),
            ultima_hora: s.en_ventana(ahora, HORA),
            ultimas_24h: s.en_ventana(ahora, DIA),
            dia_calentamiento: s
                .emparejado_ms
                .filter(|_| motivo == Motivo::Calentamiento)
                .map(|d| ahora.saturating_sub(d) / DIA + 1),
            tope_24h: (tope > 0).then_some(tope),
            enfriada_ms: s.enfriado_hasta.saturating_sub(ahora),
            contactos_en_espera: s.por_contacto.values().filter(|(h, _)| *h > ahora).count(),
        }
    }
}

fn enfriar_cuenta(s: &mut Sesion, p: &Politica, ahora: u64) -> u64 {
    // Una racha se corta si pasó una hora sin otro 429.
    if ahora.saturating_sub(s.ultimo_429) > HORA {
        s.racha_429 = 0;
    }
    s.racha_429 += 1;
    s.ultimo_429 = ahora;
    let espera =
        (p.enfriamiento_429_ms << (s.racha_429 - 1).min(10)).min(p.enfriamiento_429_max_ms);
    s.enfriado_hasta = s.enfriado_hasta.max(ahora + espera);
    espera
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Estado {
    pub ultimo_minuto: usize,
    pub ultima_hora: usize,
    pub ultimas_24h: usize,
    /// 1 el día que se vinculó; `None` fuera del calentamiento.
    pub dia_calentamiento: Option<u64>,
    pub tope_24h: Option<u32>,
    pub enfriada_ms: u64,
    pub contactos_en_espera: usize,
}

// ── Persistencia ─────────────────────────────────────────────────────────────
//
// Se guarda todo el estado de las sesiones, no solo la fecha de vínculo: si un
// reinicio vaciara los envíos de las últimas 24 h, reiniciar el bot sería la
// forma de saltarse el tope del calentamiento. Va a un JSON con
// `atomic::atomic_write` —temporal, fsync y rename—, cada minuto y solo si
// cambió algo.

#[derive(Serialize, Deserialize)]
struct Guardado {
    sesiones: HashMap<String, Sesion>,
}

/// La cáscara compartida: el motor tras un candado, y si hay algo sin guardar.
#[derive(Clone)]
pub struct Antiban {
    motor: Arc<Mutex<Motor>>,
    sucio: Arc<std::sync::atomic::AtomicBool>,
    archivo: Arc<PathBuf>,
}

pub fn ahora_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Antiban {
    /// Carga el estado de `archivo` si existe. Un archivo ilegible no impide
    /// arrancar: se avisa y se empieza vacío, que es lo mismo que una sesión
    /// madura sin historial.
    pub fn cargar(archivo: &Path, politica: Politica) -> Self {
        let mut motor = Motor::new(politica);
        match std::fs::read(archivo) {
            Ok(b) => match serde_json::from_slice::<Guardado>(&b) {
                Ok(g) => motor.sesiones = g.sesiones,
                Err(e) => {
                    tracing::warn!(error = %e, archivo = %archivo.display(), "antiban: estado ilegible, se empieza vacío")
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => tracing::warn!(error = %e, "antiban: no se pudo leer el estado"),
        }
        Self {
            motor: Arc::new(Mutex::new(motor)),
            sucio: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            archivo: Arc::new(archivo.to_path_buf()),
        }
    }

    fn con<R>(&self, f: impl FnOnce(&mut Motor) -> R) -> R {
        // Un pánico con el candado tomado no puede dejar al bot sin poder
        // enviar nunca más: se sigue con el estado como haya quedado.
        let mut m = self.motor.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut m)
    }

    pub fn permiso(&self, sesion: &str, jid: &str) -> Decision {
        let d = self.con(|m| {
            m.permiso(
                sesion,
                jid,
                ahora_ms(),
                crate::rng::unit(),
                crate::rng::unit(),
            )
        });
        if matches!(d, Decision::Enviar { .. }) {
            self.sucio.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        d
    }

    pub fn reportar(&self, sesion: &str, jid: &str, codigo: u16) -> u64 {
        self.sucio.store(true, std::sync::atomic::Ordering::Relaxed);
        self.con(|m| m.reportar(sesion, jid, codigo, ahora_ms()))
    }

    pub fn emparejado(&self, sesion: &str, numero: Option<&str>) -> bool {
        let empezo = self.con(|m| m.emparejado(sesion, numero, ahora_ms()));
        // El vínculo es lo único que no se puede reconstruir: va ya.
        self.guardar();
        empezo
    }

    pub fn conocer(&self, sesion: &str, numero: &str) {
        self.con(|m| m.conocer(sesion, numero));
        self.sucio.store(true, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn estado(&self, sesion: &str) -> Estado {
        self.con(|m| m.estado(sesion, ahora_ms()))
    }

    /// Escribe el estado si cambió. Bloqueante: desde Tokio va por
    /// `spawn_blocking`.
    pub fn guardar(&self) {
        let datos = self.con(|m| {
            for s in m.sesiones.values_mut() {
                s.podar(ahora_ms());
            }
            serde_json::to_vec(&Guardado {
                sesiones: m.sesiones.clone(),
            })
        });
        self.sucio
            .store(false, std::sync::atomic::Ordering::Relaxed);
        match datos {
            Ok(b) => {
                if let Err(e) = crate::atomic::atomic_write(&self.archivo, &b) {
                    tracing::warn!(error = %e, "antiban: no se pudo guardar el estado");
                    self.sucio.store(true, std::sync::atomic::Ordering::Relaxed);
                }
            }
            Err(e) => tracing::warn!(error = %e, "antiban: no se pudo serializar el estado"),
        }
    }

    pub fn hay_cambios(&self) -> bool {
        self.sucio.load(std::sync::atomic::Ordering::Relaxed)
    }
}

// ── Rutas ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct PedidoPermiso {
    session: String,
    jid: String,
}

/// `POST /antiban/permit` — `{ session, jid }` →
/// `{ ok, send, waitMs, reason }` o `{ ok, send: false, retryInMs, reason }`.
/// `ok` va siempre: el cliente de TypeScript trata su ausencia como error.
pub async fn permit(
    State(st): State<AppState>,
    Json(b): Json<PedidoPermiso>,
) -> Json<serde_json::Value> {
    Json(match st.antiban.permiso(&b.session, &b.jid) {
        Decision::Enviar { esperar_ms, motivo } => {
            serde_json::json!({ "ok": true, "send": true, "waitMs": esperar_ms, "reason": motivo })
        }
        Decision::Rechazar {
            reintentar_en_ms,
            motivo,
        } => {
            serde_json::json!({ "ok": true, "send": false, "retryInMs": reintentar_en_ms, "reason": motivo })
        }
    })
}

#[derive(Deserialize)]
pub struct Reporte {
    session: String,
    jid: String,
    code: u16,
}

/// `POST /antiban/report` — `{ session, jid, code }` → `{ cooldownMs }`.
pub async fn report(State(st): State<AppState>, Json(b): Json<Reporte>) -> Json<serde_json::Value> {
    let espera = st.antiban.reportar(&b.session, &b.jid, b.code);
    if espera > 0 {
        tracing::warn!(session = %b.session, jid = %b.jid, code = b.code, cooldown_ms = espera, "antiban: WhatsApp rechazó un envío");
    }
    Json(serde_json::json!({ "ok": true, "cooldownMs": espera }))
}

#[derive(Deserialize)]
pub struct SoloSesion {
    session: String,
}

#[derive(Deserialize)]
pub struct SesionNumero {
    session: String,
    #[serde(default)]
    numero: Option<String>,
}

/// `POST /antiban/paired` — `{ session, numero? }`: se escaneó un QR.
pub async fn paired(
    State(st): State<AppState>,
    Json(b): Json<SesionNumero>,
) -> Json<serde_json::Value> {
    let a = st.antiban.clone();
    let (sesion, numero) = (b.session.clone(), b.numero.clone());
    let empezo = tokio::task::spawn_blocking(move || a.emparejado(&sesion, numero.as_deref()))
        .await
        .unwrap_or(false);
    if empezo {
        tracing::info!(session = %b.session, "antiban: número nuevo vinculado, empieza el calentamiento");
    } else {
        tracing::info!(session = %b.session, "antiban: el mismo número, vinculado otra vez: sin calentamiento nuevo");
    }
    Json(serde_json::json!({ "ok": true, "calentamiento": empezo }))
}

/// `POST /antiban/numero` — `{ session, numero }`: qué número tiene la sesión.
pub async fn numero(
    State(st): State<AppState>,
    Json(b): Json<SesionNumero>,
) -> Json<serde_json::Value> {
    if let Some(n) = b.numero.as_deref() {
        st.antiban.conocer(&b.session, n);
    }
    Json(serde_json::json!({ "ok": true }))
}

/// `GET /antiban/status?session=main` — cuánto envió y qué lo limita ahora.
pub async fn status(
    State(st): State<AppState>,
    Query(q): Query<SoloSesion>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "status": st.antiban.estado(&q.session),
        "policy": st.antiban.con(|m| m.politica().clone()),
    }))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Política sin pausa, para medir las ventanas solas.
    fn sin_pausa() -> Politica {
        Politica {
            pausa_media_ms: 0.0,
            pausa_desvio_ms: 0.0,
            pausa_min_ms: 0,
            ..Politica::default()
        }
    }

    /// `u1 = 0.5, u2 = 0.25`: cos(π/2) = 0, o sea z = 0 y la pausa es la media.
    fn pedir(m: &mut Motor, t: u64) -> Decision {
        m.permiso("main", "g@g.us", t, 0.5, 0.25)
    }

    #[test]
    fn la_pausa_es_normal_con_piso() {
        let p = Politica::default();
        // z = 0: la media exacta.
        assert_eq!(pausa(&p, 0.5, 0.25), 900);
        // z muy negativo: el piso.
        assert_eq!(pausa(&p, 0.999_999, 0.5), p.pausa_min_ms);
        // Muchas muestras: la media de lo generado ronda la configurada. El
        // piso recorta la cola izquierda, así que la media sale un poco arriba.
        let mut suma = 0u64;
        let n = 20_000;
        for _ in 0..n {
            suma += pausa(&p, crate::rng::unit(), crate::rng::unit());
        }
        let media = suma as f64 / n as f64;
        assert!((880.0..960.0).contains(&media), "media {media}");
    }

    #[test]
    fn la_primera_sale_ya_y_la_segunda_espera_la_pausa() {
        let mut m = Motor::new(Politica::default());
        assert_eq!(
            pedir(&mut m, 1_000),
            Decision::Enviar {
                esperar_ms: 0,
                motivo: Motivo::Libre
            }
        );
        assert_eq!(
            pedir(&mut m, 1_000),
            Decision::Enviar {
                esperar_ms: 900,
                motivo: Motivo::Pausa
            }
        );
        // Pedidos simultáneos se escalonan, no salen juntos.
        assert_eq!(
            pedir(&mut m, 1_000),
            Decision::Enviar {
                esperar_ms: 1_800,
                motivo: Motivo::Pausa
            }
        );
    }

    #[test]
    fn el_tope_por_minuto_corre_el_turno_al_hueco() {
        let mut m = Motor::new(Politica {
            por_minuto: 3,
            ..sin_pausa()
        });
        for _ in 0..3 {
            assert!(matches!(
                pedir(&mut m, 10_000),
                Decision::Enviar { esperar_ms: 0, .. }
            ));
        }
        // El cuarto espera a que el primero salga de la ventana de 60 s.
        assert_eq!(
            pedir(&mut m, 10_000),
            Decision::Enviar {
                esperar_ms: MINUTO,
                motivo: Motivo::Minuto
            }
        );
    }

    #[test]
    fn lo_que_queda_mas_alla_de_la_espera_maxima_se_rechaza_sin_reservar() {
        let mut m = Motor::new(Politica {
            por_hora: 2,
            ..sin_pausa()
        });
        pedir(&mut m, 0);
        pedir(&mut m, 0);
        let d = pedir(&mut m, 0);
        assert!(
            matches!(
                d,
                Decision::Rechazar {
                    motivo: Motivo::Hora,
                    ..
                }
            ),
            "{d:?}"
        );
        assert_eq!(
            m.estado("main", 0).ultima_hora,
            2,
            "el rechazo no reserva turno"
        );
        // Pasada la hora, vuelve a salir.
        assert!(matches!(pedir(&mut m, HORA + 1), Decision::Enviar { .. }));
    }

    #[test]
    fn una_sesion_vieja_no_tiene_calentamiento_y_una_vinculada_si() {
        let mut m = Motor::new(Politica {
            calentamiento: vec![2, 4],
            ..sin_pausa()
        });
        for _ in 0..10 {
            assert!(matches!(
                m.permiso("vieja", "x", 0, 0.5, 0.25),
                Decision::Enviar { .. }
            ));
        }
        m.emparejado("nueva", None, 0);
        assert!(matches!(
            m.permiso("nueva", "x", 0, 0.5, 0.25),
            Decision::Enviar { .. }
        ));
        assert!(matches!(
            m.permiso("nueva", "x", 0, 0.5, 0.25),
            Decision::Enviar { .. }
        ));
        assert!(matches!(
            m.permiso("nueva", "x", 0, 0.5, 0.25),
            Decision::Rechazar {
                motivo: Motivo::Calentamiento,
                ..
            }
        ));
        assert_eq!(m.estado("nueva", 0).dia_calentamiento, Some(1));
        // Día 2: tope 4 en 24 h deslizantes; los 2 del día 1 ya salieron.
        let d2 = DIA + 1;
        for _ in 0..4 {
            assert!(matches!(
                m.permiso("nueva", "x", d2, 0.5, 0.25),
                Decision::Enviar { .. }
            ));
        }
        assert!(matches!(
            m.permiso("nueva", "x", d2, 0.5, 0.25),
            Decision::Rechazar { .. }
        ));
        // Pasado el calentamiento, sin tope diario.
        let d3 = 2 * DIA + 1;
        assert_eq!(m.estado("nueva", d3).dia_calentamiento, None);
        for _ in 0..30 {
            assert!(matches!(
                m.permiso("nueva", "x", d3, 0.5, 0.25),
                Decision::Enviar { .. }
            ));
        }
    }

    #[test]
    fn el_mismo_numero_vinculado_otra_vez_no_empieza_calentamiento() {
        let mut m = Motor::new(Politica {
            calentamiento: vec![2, 4],
            ..sin_pausa()
        });
        // Una sesión madura de meses: el bot anota su número al conectar.
        m.conocer("main", "51950270105");
        // Se escanea el QR otra vez, con el mismo número: sin tope.
        assert!(!m.emparejado("main", Some("51950270105"), 0));
        for _ in 0..10 {
            assert!(matches!(m.permiso("main", "x", 0, 0.5, 0.25), Decision::Enviar { .. }));
        }
        // Con OTRO número sí: ese sí es nuevo.
        assert!(m.emparejado("main", Some("51999999999"), 0));
        assert_eq!(m.estado("main", 0).dia_calentamiento, Some(1));
    }

    #[test]
    fn vincular_otra_vez_no_salta_un_calentamiento_en_curso() {
        let mut m = Motor::new(Politica {
            calentamiento: vec![2, 4, 8],
            ..sin_pausa()
        });
        assert!(m.emparejado("sub", Some("51911111111"), 0));
        // Al día siguiente se vuelve a vincular: sigue en el día 2, no el 1,
        // y tampoco sale del calentamiento.
        let d2 = DIA + 1;
        assert!(!m.emparejado("sub", Some("51911111111"), d2));
        assert_eq!(m.estado("sub", d2).dia_calentamiento, Some(2));
    }

    #[test]
    fn un_429_enfria_la_cuenta_con_escalada() {
        let mut m = Motor::new(sin_pausa());
        assert_eq!(m.reportar("main", "g", 429, 0), 30_000);
        assert_eq!(
            pedir(&mut m, 0),
            Decision::Enviar {
                esperar_ms: 30_000,
                motivo: Motivo::Enfriamiento
            }
        );
        assert_eq!(m.reportar("main", "g", 429, 40_000), 60_000);
        assert_eq!(m.reportar("main", "g", 429, 50_000), 120_000);
        // Una hora sin 429 corta la racha.
        assert_eq!(m.reportar("main", "g", 429, 50_000 + HORA + 1), 30_000);
    }

    #[test]
    fn el_enfriamiento_del_429_tiene_techo() {
        let mut m = Motor::new(sin_pausa());
        let mut ultimo = 0;
        for i in 0..20 {
            ultimo = m.reportar("main", "g", 429, i * 1_000);
        }
        assert_eq!(ultimo, 15 * MINUTO);
    }

    #[test]
    fn un_463_deja_en_espera_al_contacto_y_no_a_los_demas() {
        let mut m = Motor::new(sin_pausa());
        assert_eq!(m.reportar("main", "a@s.whatsapp.net", 463, 0), HORA);
        assert!(matches!(
            m.permiso("main", "a@s.whatsapp.net", 1, 0.5, 0.25),
            Decision::Rechazar {
                motivo: Motivo::Contacto463,
                ..
            }
        ));
        assert!(matches!(
            m.permiso("main", "b@s.whatsapp.net", 1, 0.5, 0.25),
            Decision::Enviar { .. }
        ));
        // El segundo 463 del mismo contacto, el doble.
        assert_eq!(
            m.reportar("main", "a@s.whatsapp.net", 463, HORA + 1),
            2 * HORA
        );
    }

    #[test]
    fn muchos_463_en_una_hora_enfrian_la_cuenta() {
        let mut m = Motor::new(Politica {
            umbral_463_hora: 3,
            ..sin_pausa()
        });
        m.reportar("main", "a", 463, 0);
        m.reportar("main", "b", 463, 1);
        assert_eq!(m.estado("main", 2).enfriada_ms, 0);
        assert_eq!(m.reportar("main", "c", 463, 2), 30_000);
        assert!(matches!(
            m.permiso("main", "d", 3, 0.5, 0.25),
            Decision::Enviar {
                motivo: Motivo::Enfriamiento,
                ..
            }
        ));
    }

    #[test]
    fn otros_codigos_no_hacen_nada() {
        let mut m = Motor::new(sin_pausa());
        assert_eq!(m.reportar("main", "g", 500, 0), 0);
        assert_eq!(
            pedir(&mut m, 0),
            Decision::Enviar {
                esperar_ms: 0,
                motivo: Motivo::Libre
            }
        );
    }

    #[test]
    fn las_sesiones_no_se_pisan() {
        let mut m = Motor::new(Politica {
            por_minuto: 1,
            ..sin_pausa()
        });
        assert!(matches!(
            m.permiso("main", "g", 0, 0.5, 0.25),
            Decision::Enviar { esperar_ms: 0, .. }
        ));
        assert!(matches!(
            m.permiso("51999", "g", 0, 0.5, 0.25),
            Decision::Enviar { esperar_ms: 0, .. }
        ));
    }

    #[test]
    fn el_estado_sobrevive_a_guardar_y_cargar() {
        let dir = std::env::temp_dir().join(format!("antiban-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let archivo = dir.join("antiban.json");
        {
            let a = Antiban::cargar(&archivo, Politica::default());
            a.emparejado("sub", None);
            a.permiso("sub", "g");
            a.guardar();
        }
        let b = Antiban::cargar(&archivo, Politica::default());
        let e = b.estado("sub");
        assert_eq!(e.dia_calentamiento, Some(1), "el vínculo persiste");
        assert_eq!(
            e.ultimas_24h, 1,
            "y lo enviado, para que reiniciar no salte el tope"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn un_archivo_ilegible_no_impide_arrancar() {
        let dir = std::env::temp_dir().join(format!("antiban-roto-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let archivo = dir.join("antiban.json");
        std::fs::write(&archivo, b"{ esto no es json").unwrap();
        let a = Antiban::cargar(&archivo, Politica::default());
        assert!(matches!(a.permiso("main", "g"), Decision::Enviar { .. }));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
