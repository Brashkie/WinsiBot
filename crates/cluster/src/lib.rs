//! `cluster`: el motor de almacenamiento propio de WinsiBot, un árbol LSM.
//!
//! Del plan "un motor como Cassandra" quedó la parte que tiene uso para un bot
//! que corre en UNA máquina: el motor de almacenamiento. La parte distribuida
//! —repartir datos entre nodos— no tiene nada que repartir.
//!
//! ```text
//!   escribir ─▶ WAL (un registro por lote, con CRC) ─▶ memtable (BTreeMap)
//!                                                         │ llena (4 MB)
//!                                                         ▼
//!                       SSTables inmutables, de la más vieja a la más nueva
//!                                                         │ 4 o más
//!                                                         ▼
//!                                          compactación: todas en una
//! ```
//!
//! Leer mira la memtable y después las tablas de la más nueva a la más vieja;
//! la primera que tenga la clave gana, y una lápida dice "borrada".
//!
//! **Qué sobrevive a qué.** Con `Durabilidad::Proceso` (la de por defecto)
//! cada lote es un `write` al sistema operativo: si el PROCESO muere, no se
//! pierde nada de lo escrito. Con `Durabilidad::Disco` además se espera al
//! fsync, y sobrevive a un corte de luz. Es la misma diferencia que hay entre
//! `synchronous=NORMAL` y `FULL` en SQLite.
//!
//! **Por qué un corte en cualquier momento no rompe nada.** El MANIFEST dice
//! qué tablas valen y desde qué WAL hay que reproducir, y se reemplaza de una
//! vez (escribir aparte, sincronizar, renombrar). Una tabla se escribe aparte
//! y se renombra ANTES de anotarla, y el WAL viejo se borra DESPUÉS: si el
//! corte cae entre medio, al abrir hay una tabla que el MANIFEST no nombra
//! —se borra, porque sus datos siguen en el WAL— o un WAL que ya no hace falta
//! —se borra también—. Los tests de `tests/caidas.rs` cortan en cada uno de
//! esos puntos.
//!
//! Fase 1: un solo escritor (`&mut self`); para compartirlo, un `Mutex`. Sin
//! caché de bloques propia: la del sistema operativo alcanza para lo que hay.

mod codec;
mod sst;
mod wal;

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::ops::Bound;
use std::path::{Path, PathBuf};

pub use wal::Lote;

use std::sync::Arc;

use codec::crc32;
use sst::{Cache, Entrada, Sst};
use wal::Wal;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Durabilidad {
    /// Un `write` por lote: sobrevive a que muera el proceso.
    Proceso,
    /// Además fsync por lote: sobrevive a un corte de luz.
    Disco,
}

#[derive(Clone, Debug)]
pub struct Opciones {
    /// Cuánto junta la memtable antes de bajar a una SSTable.
    pub memtable_bytes: usize,
    /// Con cuántas SSTables se compactan todas en una.
    pub compactar_desde: usize,
    pub durabilidad: Durabilidad,
    pub bloque_bytes: usize,
    /// RAM para bloques leídos hace poco. 2 MB: lo mismo que trae SQLite.
    pub cache_bytes: usize,
}

impl Default for Opciones {
    fn default() -> Self {
        Self {
            memtable_bytes: 4 << 20,
            compactar_desde: 4,
            durabilidad: Durabilidad::Proceso,
            bloque_bytes: 4096,
            cache_bytes: 2 << 20,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Estadisticas {
    pub tablas: usize,
    pub entradas_en_tablas: u64,
    pub bytes_en_disco: u64,
    pub memtable_claves: usize,
}

// ─── MANIFEST ─────────────────────────────────────────────────────────────────

const CABECERA: &str = "WINSI-CLUSTER 1";

#[derive(Default)]
struct Manifest {
    siguiente: u64,
    wal_min: u64,
    tablas: Vec<u64>,
}

impl Manifest {
    fn texto(&self) -> String {
        let mut s = format!("{CABECERA}\nsiguiente {}\nwal_min {}\n", self.siguiente, self.wal_min);
        for t in &self.tablas {
            s.push_str(&format!("sst {t}\n"));
        }
        let crc = crc32(s.as_bytes());
        s.push_str(&format!("crc {crc:08x}\n"));
        s
    }

    fn leer(dir: &Path) -> io::Result<Option<Self>> {
        let texto = match fs::read_to_string(dir.join("MANIFEST")) {
            Ok(t) => t,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let mal = |que: &str| io::Error::new(io::ErrorKind::InvalidData, format!("MANIFEST: {que}"));
        // Un MANIFEST roto NO se reemplaza por uno vacío: eso sería decidir en
        // silencio que no hay datos. Se devuelve el error.
        let corte = texto.rfind("crc ").ok_or_else(|| mal("sin crc"))?;
        let (cuerpo, pie) = texto.split_at(corte);
        let crc = u32::from_str_radix(pie.trim_start_matches("crc ").trim(), 16).map_err(|_| mal("crc ilegible"))?;
        if crc32(cuerpo.as_bytes()) != crc {
            return Err(mal("el crc no cuadra"));
        }
        let mut lineas = cuerpo.lines();
        if lineas.next() != Some(CABECERA) {
            return Err(mal("versión desconocida"));
        }
        let mut m = Manifest::default();
        for l in lineas {
            let (k, v) = l.split_once(' ').ok_or_else(|| mal("línea ilegible"))?;
            let n: u64 = v.parse().map_err(|_| mal("número ilegible"))?;
            match k {
                "siguiente" => m.siguiente = n,
                "wal_min" => m.wal_min = n,
                "sst" => m.tablas.push(n),
                _ => return Err(mal("clave desconocida")),
            }
        }
        Ok(Some(m))
    }

    /// Reemplaza el MANIFEST de una vez: aparte, al disco, y renombrar.
    fn guardar(&self, dir: &Path) -> io::Result<()> {
        let tmp = dir.join("MANIFEST.tmp");
        {
            let f = fs::File::create(&tmp)?;
            io::Write::write_all(&mut &f, self.texto().as_bytes())?;
            f.sync_all()?;
        }
        fs::rename(&tmp, dir.join("MANIFEST"))?;
        sincronizar_dir(dir)
    }
}

/// En Unix, un rename no es durable hasta sincronizar la carpeta. Windows no
/// deja abrir una carpeta como archivo, y NTFS registra el rename en su diario.
fn sincronizar_dir(dir: &Path) -> io::Result<()> {
    #[cfg(unix)]
    fs::File::open(dir)?.sync_all()?;
    #[cfg(not(unix))]
    let _ = dir;
    Ok(())
}

fn numero_de(nombre: &str, prefijo: &str, sufijo: &str) -> Option<u64> {
    nombre.strip_prefix(prefijo)?.strip_suffix(sufijo)?.parse().ok()
}

// ─── El motor ─────────────────────────────────────────────────────────────────

pub struct Motor {
    dir: PathBuf,
    op: Opciones,
    mem: BTreeMap<Vec<u8>, Option<Vec<u8>>>,
    mem_bytes: usize,
    wal: Wal,
    /// De la más vieja a la más nueva.
    tablas: Vec<Sst>,
    siguiente: u64,
    cache: Arc<Cache>,
}

impl Motor {
    pub fn abrir(dir: impl AsRef<Path>, op: Opciones) -> io::Result<Self> {
        let dir = dir.as_ref().to_path_buf();
        fs::create_dir_all(&dir)?;
        let m = Manifest::leer(&dir)?.unwrap_or_default();

        // Lo que dejó un corte a mitad de algo.
        let mut wals = Vec::new();
        for e in fs::read_dir(&dir)? {
            let e = e?;
            let nombre = e.file_name().to_string_lossy().into_owned();
            if nombre.ends_with(".tmp") {
                fs::remove_file(e.path())?;
            } else if let Some(id) = numero_de(&nombre, "sst-", ".sst") {
                // Una tabla que el MANIFEST no nombra: un corte entre escribirla
                // y anotarla (sus datos siguen en el WAL), o una vieja que la
                // compactación ya reemplazó.
                if !m.tablas.contains(&id) {
                    fs::remove_file(e.path())?;
                }
            } else if let Some(seq) = numero_de(&nombre, "wal-", ".log") {
                if seq < m.wal_min {
                    fs::remove_file(e.path())?; // ya está en una tabla
                } else {
                    wals.push(seq);
                }
            }
        }
        wals.sort_unstable();

        let cache = Cache::new(op.cache_bytes);
        let mut tablas = Vec::with_capacity(m.tablas.len());
        for &id in &m.tablas {
            tablas.push(Sst::abrir(&dir, id, cache.clone())?);
        }

        let mut mem = BTreeMap::new();
        let mut mem_bytes = 0usize;
        for &seq in &wals {
            wal::reproducir(&wal::ruta(&dir, seq), |k, v| {
                mem_bytes += k.len() + v.as_ref().map_or(0, |v| v.len()) + 32;
                mem.insert(k, v);
            })?;
        }

        let seq = wals.last().copied().unwrap_or(m.wal_min);
        let wal = Wal::abrir(&dir, seq)?;
        let siguiente = m.siguiente.max(m.tablas.iter().max().map_or(0, |x| x + 1));
        let mut motor = Self { dir, op, mem, mem_bytes, wal, tablas, siguiente, cache };
        if motor.mem_bytes >= motor.op.memtable_bytes {
            motor.vaciar()?;
        }
        Ok(motor)
    }

    pub fn poner(&mut self, clave: &[u8], valor: &[u8]) -> io::Result<()> {
        let mut l = Lote::new();
        l.poner(clave, valor);
        self.escribir(&l)
    }

    pub fn borrar(&mut self, clave: &[u8]) -> io::Result<()> {
        let mut l = Lote::new();
        l.borrar(clave);
        self.escribir(&l)
    }

    /// Escribe el lote entero, o nada: es UN registro del WAL.
    pub fn escribir(&mut self, lote: &Lote) -> io::Result<()> {
        if lote.is_empty() {
            return Ok(());
        }
        self.wal.escribir(lote, self.op.durabilidad == Durabilidad::Disco)?;
        for (k, v) in &lote.ops {
            self.mem_bytes += k.len() + v.as_ref().map_or(0, |v| v.len()) + 32;
            self.mem.insert(k.clone(), v.clone());
        }
        if self.mem_bytes >= self.op.memtable_bytes {
            self.vaciar()?;
        }
        Ok(())
    }

    pub fn leer(&self, clave: &[u8]) -> io::Result<Option<Vec<u8>>> {
        if let Some(v) = self.mem.get(clave) {
            return Ok(v.clone());
        }
        for t in self.tablas.iter().rev() {
            if let Some(v) = t.leer(clave)? {
                return Ok(v);
            }
        }
        Ok(None)
    }

    /// Las claves en `[desde, hasta)` con su valor, en orden. `hasta = None`:
    /// hasta el final. Para buscar por prefijo, ver [`Motor::prefijo`].
    pub fn rango(&self, desde: &[u8], hasta: Option<&[u8]>) -> io::Result<Vec<(Vec<u8>, Vec<u8>)>> {
        // De la más vieja a la más nueva: la más nueva pisa. Cada tabla se lee
        // desde el bloque donde empieza el rango y hasta donde termina. Fase 1:
        // el rango se junta en memoria en vez de mezclar iteradores.
        let mut vista: BTreeMap<Vec<u8>, Option<Vec<u8>>> = BTreeMap::new();
        for t in &self.tablas {
            for e in t.iterar_desde(desde) {
                let (k, v) = e?;
                if hasta.is_some_and(|h| k.as_slice() >= h) {
                    break;
                }
                if k.as_slice() >= desde {
                    vista.insert(k, v);
                }
            }
        }
        let hasta_b = hasta.map_or(Bound::Unbounded, |h| Bound::Excluded(h.to_vec()));
        for (k, v) in self.mem.range((Bound::Included(desde.to_vec()), hasta_b)) {
            vista.insert(k.clone(), v.clone());
        }
        Ok(vista.into_iter().filter_map(|(k, v)| v.map(|v| (k, v))).collect())
    }

    pub fn prefijo(&self, p: &[u8]) -> io::Result<Vec<(Vec<u8>, Vec<u8>)>> {
        match siguiente_prefijo(p) {
            Some(fin) => self.rango(p, Some(&fin)),
            None => self.rango(p, None),
        }
    }

    /// Espera a que todo lo escrito esté en el disco (fsync del WAL).
    pub fn sincronizar(&mut self) -> io::Result<()> {
        self.wal.sincronizar()
    }

    /// Baja la memtable a una SSTable nueva y empieza un WAL nuevo.
    pub fn vaciar(&mut self) -> io::Result<()> {
        if self.mem.is_empty() {
            return Ok(());
        }
        let id = self.siguiente;
        let tmp = self.dir.join(format!("sst-{id:016}.sst.tmp"));
        let entradas = self.mem.iter().map(|(k, v)| Ok((k.clone(), v.clone())));
        sst::escribir(&tmp, entradas, self.op.bloque_bytes)?;
        fs::rename(&tmp, sst::ruta(&self.dir, id))?;
        let tabla = Sst::abrir(&self.dir, id, self.cache.clone())?;

        // Anotar la tabla y que el WAL actual ya no hace falta, en un solo
        // cambio del MANIFEST. Recién después se abre el WAL nuevo y se borra
        // el viejo: un corte entre medio deja un WAL que se descarta al abrir.
        let viejo = self.wal.seq;
        let mut ids: Vec<u64> = self.tablas.iter().map(|t| t.id).collect();
        ids.push(id);
        Manifest { siguiente: id + 1, wal_min: viejo + 1, tablas: ids }.guardar(&self.dir)?;

        self.tablas.push(tabla);
        self.siguiente = id + 1;
        self.wal = Wal::abrir(&self.dir, viejo + 1)?;
        fs::remove_file(wal::ruta(&self.dir, viejo))?;
        self.mem.clear();
        self.mem_bytes = 0;

        if self.tablas.len() >= self.op.compactar_desde {
            self.compactar()?;
        }
        Ok(())
    }

    /// Junta todas las SSTables en una. Como entran TODAS, las lápidas ya no
    /// tapan nada más viejo y se tiran, igual que los valores pisados.
    pub fn compactar(&mut self) -> io::Result<()> {
        if self.tablas.len() < 2 {
            return Ok(());
        }
        let id = self.siguiente;
        let tmp = self.dir.join(format!("sst-{id:016}.sst.tmp"));
        {
            let mezcla = Mezcla::new(self.tablas.iter().map(|t| t.iterar()).collect());
            let vivas = mezcla.filter(|e| !matches!(e, Ok((_, None))));
            sst::escribir(&tmp, vivas, self.op.bloque_bytes)?;
        }
        fs::rename(&tmp, sst::ruta(&self.dir, id))?;
        let nueva = Sst::abrir(&self.dir, id, self.cache.clone())?;
        Manifest { siguiente: id + 1, wal_min: self.wal.seq, tablas: vec![id] }.guardar(&self.dir)?;

        // Cerrar las viejas antes de borrarlas: Windows no borra un archivo abierto.
        let viejas: Vec<u64> = std::mem::replace(&mut self.tablas, vec![nueva]).into_iter().map(|t| t.id).collect();
        self.siguiente = id + 1;
        for v in viejas {
            fs::remove_file(sst::ruta(&self.dir, v))?;
        }
        Ok(())
    }

    pub fn estadisticas(&self) -> Estadisticas {
        Estadisticas {
            tablas: self.tablas.len(),
            entradas_en_tablas: self.tablas.iter().map(|t| t.entradas).sum(),
            bytes_en_disco: self.tablas.iter().map(|t| t.bytes).sum::<u64>()
                + fs::metadata(wal::ruta(&self.dir, self.wal.seq)).map_or(0, |m| m.len()),
            memtable_claves: self.mem.len(),
        }
    }
}

/// La primera clave mayor que todas las que empiezan con `p`, o `None` si no
/// hay (`p` vacío o todo 0xff).
fn siguiente_prefijo(p: &[u8]) -> Option<Vec<u8>> {
    let mut v = p.to_vec();
    while let Some(ultimo) = v.pop() {
        if ultimo < 0xff {
            v.push(ultimo + 1);
            return Some(v);
        }
    }
    None
}

/// Mezcla k iteradores ordenados en uno; con claves iguales, gana el de índice
/// mayor (la tabla más nueva). k es chico (las tablas antes de compactar), así
/// que buscar el mínimo de punta a punta le gana a un montículo.
struct Mezcla<I: Iterator<Item = io::Result<Entrada>>> {
    its: Vec<std::iter::Peekable<I>>,
}

impl<I: Iterator<Item = io::Result<Entrada>>> Mezcla<I> {
    fn new(its: Vec<I>) -> Self {
        Self { its: its.into_iter().map(|i| i.peekable()).collect() }
    }
}

impl<I: Iterator<Item = io::Result<Entrada>>> Iterator for Mezcla<I> {
    type Item = io::Result<Entrada>;

    fn next(&mut self) -> Option<Self::Item> {
        // Un error en cualquiera corta la mezcla: no se escribe una tabla a medias.
        for it in &mut self.its {
            if matches!(it.peek(), Some(Err(_))) {
                return it.next();
            }
        }
        let min = self
            .its
            .iter_mut()
            .filter_map(|it| match it.peek() {
                Some(Ok((k, _))) => Some(k.clone()),
                _ => None,
            })
            .min()?;
        let mut ganador = None;
        for it in &mut self.its {
            if matches!(it.peek(), Some(Ok((k, _))) if *k == min) {
                ganador = it.next();
            }
        }
        ganador
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn siguiente_prefijo_casos() {
        assert_eq!(siguiente_prefijo(b"ab"), Some(b"ac".to_vec()));
        assert_eq!(siguiente_prefijo(&[b'a', 0xff]), Some(b"b".to_vec()));
        assert_eq!(siguiente_prefijo(&[0xff, 0xff]), None);
        assert_eq!(siguiente_prefijo(b""), None);
    }
}
