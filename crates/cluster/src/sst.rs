//! La tabla ordenada en disco (SSTable): inmutable, se escribe una vez.
//!
//! ```text
//! archivo := bloque* · índice · bloom · pie
//! bloque  := entrada* · crc32(entradas):u32 LE          (~4 KB de entradas)
//! entrada := varint(largo clave) · clave · tipo:u8 · [varint(largo valor) · valor]
//!            tipo 0 = valor, 1 = borrado (lápida)
//! índice  := (varint(largo) · última clave del bloque · varint(desde) · varint(largo))*
//! pie     := desde_índice:u64 · largo_índice:u64 · desde_bloom:u64 · largo_bloom:u64
//!            · entradas:u64 · crc32(índice ‖ bloom):u32 · k_bloom:u32 · "WINSISST"   (56 bytes)
//! ```
//!
//! Al abrir se cargan en memoria el índice y el Bloom, y nada más: buscar una
//! clave es mirar el Bloom (si dice que no está, no se toca el disco), buscar
//! en el índice qué bloque la tendría, y leer ESE bloque.
//!
//! Las lápidas se guardan: una clave borrada en una tabla nueva tiene que tapar
//! el valor que siga en una más vieja. Solo la compactación total las tira.

use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::codec::{crc32, hash64, leer_bytes, leer_varint, mezclar, poner_varint};

const MAGIA: &[u8; 8] = b"WINSISST";
const PIE: usize = 56;
const BITS_POR_CLAVE: usize = 10; // ~1% de falsos positivos con k = 7
const K_BLOOM: u32 = 7;

pub(crate) type Entrada = (Vec<u8>, Option<Vec<u8>>);

pub(crate) fn ruta(dir: &Path, id: u64) -> PathBuf {
    dir.join(format!("sst-{id:016}.sst"))
}

fn corrupto(que: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, format!("sstable corrupta: {que}"))
}

// ─── Bloom ────────────────────────────────────────────────────────────────────

fn posiciones(h: u64, bits: u64, k: u32) -> impl Iterator<Item = u64> {
    // Doble hash (Kirsch–Mitzenmacher): k posiciones a partir de dos hashes.
    let h2 = mezclar(h ^ 0x9e37_79b9_7f4a_7c15) | 1;
    (0..k as u64).map(move |i| h.wrapping_add(i.wrapping_mul(h2)) % bits)
}

fn armar_bloom(hashes: &[u64]) -> Vec<u8> {
    // En bytes enteros: al leer, la cantidad de bits sale de `len() * 8`, y si
    // acá se usara otra (500 bits para 50 claves, en 63 bytes = 504) las
    // posiciones no coincidirían y el Bloom diría "no está" de claves que sí.
    let bytes = (hashes.len() * BITS_POR_CLAVE).max(64).div_ceil(8);
    let bits = (bytes * 8) as u64;
    let mut b = vec![0u8; bytes];
    for &h in hashes {
        for p in posiciones(h, bits, K_BLOOM) {
            b[(p / 8) as usize] |= 1 << (p % 8);
        }
    }
    b
}

fn quizas_en_bloom(bloom: &[u8], k: u32, h: u64) -> bool {
    let bits = (bloom.len() * 8) as u64;
    bits == 0 || posiciones(h, bits, k).all(|p| bloom[(p / 8) as usize] & (1 << (p % 8)) != 0)
}

// ─── Escribir ─────────────────────────────────────────────────────────────────

/// Escribe las entradas —ordenadas y sin claves repetidas— en `destino` y lo
/// sincroniza al disco. Devuelve cuántas escribió.
pub(crate) fn escribir(
    destino: &Path,
    entradas: impl Iterator<Item = io::Result<Entrada>>,
    bloque_bytes: usize,
) -> io::Result<u64> {
    let archivo = File::create(destino)?;
    let mut w = BufWriter::with_capacity(64 << 10, archivo);
    let mut desde = 0u64;
    let mut indice = Vec::new();
    let mut hashes = Vec::new();
    let mut bloque = Vec::with_capacity(bloque_bytes + 256);
    let mut ultima: Vec<u8> = Vec::new();
    let mut n = 0u64;

    let mut cerrar = |bloque: &mut Vec<u8>, ultima: &[u8], w: &mut BufWriter<File>, desde: &mut u64| -> io::Result<()> {
        if bloque.is_empty() {
            return Ok(());
        }
        let crc = crc32(bloque);
        w.write_all(bloque)?;
        w.write_all(&crc.to_le_bytes())?;
        poner_varint(&mut indice, ultima.len() as u64);
        indice.extend_from_slice(ultima);
        poner_varint(&mut indice, *desde);
        poner_varint(&mut indice, bloque.len() as u64);
        *desde += bloque.len() as u64 + 4;
        bloque.clear();
        Ok(())
    };

    for e in entradas {
        let (k, v) = e?;
        debug_assert!(n == 0 || k > ultima, "las entradas tienen que venir ordenadas");
        poner_varint(&mut bloque, k.len() as u64);
        bloque.extend_from_slice(&k);
        match &v {
            Some(v) => {
                bloque.push(0);
                poner_varint(&mut bloque, v.len() as u64);
                bloque.extend_from_slice(v);
            }
            None => bloque.push(1),
        }
        hashes.push(hash64(&k));
        ultima = k;
        n += 1;
        if bloque.len() >= bloque_bytes {
            cerrar(&mut bloque, &ultima, &mut w, &mut desde)?;
        }
    }
    cerrar(&mut bloque, &ultima, &mut w, &mut desde)?;

    let bloom = armar_bloom(&hashes);
    let desde_indice = desde;
    w.write_all(&indice)?;
    w.write_all(&bloom)?;
    let mut meta = indice.clone();
    meta.extend_from_slice(&bloom);

    let mut pie = Vec::with_capacity(PIE);
    pie.extend_from_slice(&desde_indice.to_le_bytes());
    pie.extend_from_slice(&(indice.len() as u64).to_le_bytes());
    pie.extend_from_slice(&(desde_indice + indice.len() as u64).to_le_bytes());
    pie.extend_from_slice(&(bloom.len() as u64).to_le_bytes());
    pie.extend_from_slice(&n.to_le_bytes());
    pie.extend_from_slice(&crc32(&meta).to_le_bytes());
    pie.extend_from_slice(&K_BLOOM.to_le_bytes());
    pie.extend_from_slice(MAGIA);
    w.write_all(&pie)?;

    let archivo = w.into_inner().map_err(|e| e.into_error())?;
    archivo.sync_all()?;
    Ok(n)
}

// ─── Caché de bloques ─────────────────────────────────────────────────────────

/// Los bloques leídos hace poco, compartidos por todas las tablas, con un tope
/// en bytes. Sin esto cada lectura es una llamada al sistema operativo; con
/// esto, una clave caliente se lee de memoria, como hace SQLite con su caché
/// de páginas. Se compara contra SQLite con el MISMO presupuesto de RAM.
///
/// Sale el más viejo (FIFO): con accesos repartidos rinde como un LRU y no
/// paga mover nada en cada acierto. Las tablas que ya no existen no se
/// limpian: sus bloques salen solos al entrar otros.
pub(crate) struct Cache {
    max: usize,
    adentro: Mutex<Adentro>,
}

#[derive(Default)]
struct Adentro {
    mapa: HashMap<(u64, usize), Arc<Vec<u8>>>,
    orden: VecDeque<(u64, usize)>,
    bytes: usize,
}

impl Cache {
    pub fn new(max: usize) -> Arc<Self> {
        Arc::new(Self { max, adentro: Mutex::new(Adentro::default()) })
    }

    fn buscar(&self, clave: (u64, usize)) -> Option<Arc<Vec<u8>>> {
        if self.max == 0 {
            return None;
        }
        self.adentro.lock().unwrap().mapa.get(&clave).cloned()
    }

    fn guardar(&self, clave: (u64, usize), bloque: Arc<Vec<u8>>) {
        if self.max == 0 || bloque.len() > self.max {
            return;
        }
        let mut a = self.adentro.lock().unwrap();
        a.bytes += bloque.len();
        if a.mapa.insert(clave, bloque).is_none() {
            a.orden.push_back(clave);
        }
        while a.bytes > self.max {
            let Some(viejo) = a.orden.pop_front() else { break };
            if let Some(b) = a.mapa.remove(&viejo) {
                a.bytes -= b.len();
            }
        }
    }
}

// ─── Leer ─────────────────────────────────────────────────────────────────────

pub(crate) struct Sst {
    pub id: u64,
    archivo: File,
    /// (última clave del bloque, desde, largo sin el CRC)
    indice: Vec<(Vec<u8>, u64, u32)>,
    bloom: Vec<u8>,
    k: u32,
    pub entradas: u64,
    pub bytes: u64,
    cache: Arc<Cache>,
}

impl Sst {
    pub fn abrir(dir: &Path, id: u64, cache: Arc<Cache>) -> io::Result<Self> {
        let archivo = File::open(ruta(dir, id))?;
        let bytes = archivo.metadata()?.len();
        if bytes < PIE as u64 {
            return Err(corrupto("más corta que el pie"));
        }
        let mut pie = [0u8; PIE];
        leer_en(&archivo, bytes - PIE as u64, &mut pie)?;
        if &pie[48..56] != MAGIA {
            return Err(corrupto("sin la marca WINSISST"));
        }
        let u = |i: usize| u64::from_le_bytes(pie[i..i + 8].try_into().unwrap());
        let (di, li, db, lb, n) = (u(0), u(8), u(16), u(24), u(32));
        let crc = u32::from_le_bytes(pie[40..44].try_into().unwrap());
        let k = u32::from_le_bytes(pie[44..48].try_into().unwrap());
        if db != di + li || db + lb + PIE as u64 != bytes || k == 0 || k > 32 {
            return Err(corrupto("el pie no cuadra con el archivo"));
        }
        let mut meta = vec![0u8; (li + lb) as usize];
        leer_en(&archivo, di, &mut meta)?;
        if crc32(&meta) != crc {
            return Err(corrupto("el CRC del índice no cuadra"));
        }
        let bloom = meta.split_off(li as usize);

        let mut indice = Vec::new();
        let mut p = 0usize;
        while p < meta.len() {
            let mal = || corrupto("índice ilegible");
            let kl = leer_varint(&meta, &mut p).ok_or_else(mal)? as usize;
            let clave = leer_bytes(&meta, &mut p, kl).ok_or_else(mal)?.to_vec();
            let desde = leer_varint(&meta, &mut p).ok_or_else(mal)?;
            let largo = leer_varint(&meta, &mut p).ok_or_else(mal)? as u32;
            indice.push((clave, desde, largo));
        }
        Ok(Self { id, archivo, indice, bloom, k, entradas: n, bytes, cache })
    }

    /// Un bloque para buscar en él: de la caché si está, y si no se lee y se guarda.
    fn bloque_cacheado(&self, i: usize) -> io::Result<Arc<Vec<u8>>> {
        if let Some(b) = self.cache.buscar((self.id, i)) {
            return Ok(b);
        }
        let b = Arc::new(self.bloque(i)?);
        self.cache.guardar((self.id, i), b.clone());
        Ok(b)
    }

    /// Un bloque leído del disco y verificado. Los recorridos enteros (rangos,
    /// compactación) usan este y NO la caché: si no, una compactación echaría
    /// de la caché todo lo que se lee seguido.
    fn bloque(&self, i: usize) -> io::Result<Vec<u8>> {
        let (_, desde, largo) = &self.indice[i];
        let mut b = vec![0u8; *largo as usize + 4];
        leer_en(&self.archivo, *desde, &mut b)?;
        let crc = u32::from_le_bytes(b[b.len() - 4..].try_into().unwrap());
        b.truncate(*largo as usize);
        if crc32(&b) != crc {
            return Err(corrupto("el CRC de un bloque no cuadra"));
        }
        Ok(b)
    }

    /// `None`: no está en esta tabla. `Some(None)`: está borrada (lápida).
    pub fn leer(&self, clave: &[u8]) -> io::Result<Option<Option<Vec<u8>>>> {
        if !quizas_en_bloom(&self.bloom, self.k, hash64(clave)) {
            return Ok(None);
        }
        // El primer bloque cuya última clave es >= la buscada.
        let i = self.indice.partition_point(|(ultima, _, _)| ultima.as_slice() < clave);
        if i == self.indice.len() {
            return Ok(None);
        }
        // Se recorre el bloque sin copiar nada: solo se copia el valor encontrado.
        let b = self.bloque_cacheado(i)?;
        let mut p = 0usize;
        while let Some((k, v)) = siguiente_en_bloque(&b, &mut p)? {
            if k == clave {
                return Ok(Some(v.map(<[u8]>::to_vec)));
            }
            if k > clave {
                break;
            }
        }
        Ok(None)
    }

    /// Todas las entradas en orden, bloque por bloque (no carga la tabla entera).
    pub fn iterar(&self) -> Iterador<'_> {
        Iterador { sst: self, bloque: 0, actuales: Vec::new().into_iter() }
    }

    /// Las entradas desde el bloque que podría tener `desde`: un rango no
    /// recorre la tabla desde el principio. El primer bloque puede traer claves
    /// menores; quien llama las salta.
    pub fn iterar_desde(&self, desde: &[u8]) -> Iterador<'_> {
        let bloque = self.indice.partition_point(|(ultima, _, _)| ultima.as_slice() < desde);
        Iterador { sst: self, bloque, actuales: Vec::new().into_iter() }
    }
}

pub(crate) struct Iterador<'a> {
    sst: &'a Sst,
    bloque: usize,
    actuales: std::vec::IntoIter<Entrada>,
}

impl Iterator for Iterador<'_> {
    type Item = io::Result<Entrada>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if let Some(e) = self.actuales.next() {
                return Some(Ok(e));
            }
            if self.bloque >= self.sst.indice.len() {
                return None;
            }
            let b = match self.sst.bloque(self.bloque).and_then(|b| entradas_de(&b)) {
                Ok(v) => v,
                Err(e) => {
                    self.bloque = self.sst.indice.len();
                    return Some(Err(e));
                }
            };
            self.bloque += 1;
            self.actuales = b.into_iter();
        }
    }
}

/// La entrada que empieza en `*pos`, sin copiar: `None` al final del bloque.
#[allow(clippy::type_complexity)]
fn siguiente_en_bloque<'a>(b: &'a [u8], p: &mut usize) -> io::Result<Option<(&'a [u8], Option<&'a [u8]>)>> {
    if *p >= b.len() {
        return Ok(None);
    }
    let mal = || corrupto("bloque ilegible");
    let kl = leer_varint(b, p).ok_or_else(mal)? as usize;
    let k = leer_bytes(b, p, kl).ok_or_else(mal)?;
    let tipo = *b.get(*p).ok_or_else(mal)?;
    *p += 1;
    let v = match tipo {
        0 => {
            let vl = leer_varint(b, p).ok_or_else(mal)? as usize;
            Some(leer_bytes(b, p, vl).ok_or_else(mal)?)
        }
        1 => None,
        _ => return Err(mal()),
    };
    Ok(Some((k, v)))
}

fn entradas_de(b: &[u8]) -> io::Result<Vec<Entrada>> {
    let mut v = Vec::new();
    let mut p = 0usize;
    while let Some((k, val)) = siguiente_en_bloque(b, &mut p)? {
        v.push((k.to_vec(), val.map(<[u8]>::to_vec)));
    }
    Ok(v)
}

/// Leer en una posición sin mover un cursor compartido.
#[cfg(unix)]
fn leer_en(f: &File, desde: u64, buf: &mut [u8]) -> io::Result<()> {
    use std::os::unix::fs::FileExt;
    f.read_exact_at(buf, desde)
}

#[cfg(windows)]
fn leer_en(f: &File, mut desde: u64, mut buf: &mut [u8]) -> io::Result<()> {
    use std::os::windows::fs::FileExt;
    while !buf.is_empty() {
        let n = f.seek_read(buf, desde)?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "fin de archivo"));
        }
        buf = &mut buf[n..];
        desde += n as u64;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_bloom_nunca_dice_que_no_de_algo_que_esta() {
        // Toda cantidad de claves, incluidas las que no dan bits múltiplos de 8.
        for n in 1..300u64 {
            let hashes: Vec<u64> = (0..n).map(|i| hash64(&i.to_le_bytes())).collect();
            let b = armar_bloom(&hashes);
            for &h in &hashes {
                assert!(quizas_en_bloom(&b, K_BLOOM, h), "falso negativo con {n} claves");
            }
        }
    }

    #[test]
    fn el_bloom_descarta_casi_todo_lo_que_no_esta() {
        let hashes: Vec<u64> = (0..10_000u64).map(|i| hash64(&i.to_le_bytes())).collect();
        let b = armar_bloom(&hashes);
        let falsos = (10_000..110_000u64).filter(|i| quizas_en_bloom(&b, K_BLOOM, hash64(&i.to_le_bytes()))).count();
        // ~1% esperado con 10 bits por clave y k = 7.
        assert!(falsos < 2_000, "{falsos} falsos positivos de 100.000");
    }
}
