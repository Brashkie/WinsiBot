//! El log de escritura (WAL): cada lote es UN registro.
//!
//! ```text
//! registro := largo:u32 LE · crc32(contenido):u32 LE · contenido
//! contenido := op*
//! op := 1 · varint(largo clave) · clave · varint(largo valor) · valor   (poner)
//!     | 2 · varint(largo clave) · clave                                 (borrar)
//! ```
//!
//! Un lote entra entero o no entra: el CRC cubre el registro completo, y al
//! recuperar se lee hasta el primer registro cortado o corrupto. Ese punto es
//! donde se cortó la escritura, y el archivo se TRUNCA ahí: si no, lo que se
//! escribiera después quedaría detrás de la basura y la próxima recuperación
//! no lo vería nunca.

use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use crate::codec::{crc32, leer_bytes, leer_varint, poner_varint};

const OP_PONER: u8 = 1;
const OP_BORRAR: u8 = 2;
/// Un registro más grande que esto es basura, no un lote: protege de reservar
/// gigas por un largo corrupto.
const MAX_REGISTRO: usize = 256 << 20;

/// Un conjunto de cambios que entra entero o no entra.
#[derive(Default, Clone)]
pub struct Lote {
    pub(crate) contenido: Vec<u8>,
    pub(crate) ops: Vec<(Vec<u8>, Option<Vec<u8>>)>,
}

impl Lote {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn poner(&mut self, clave: &[u8], valor: &[u8]) -> &mut Self {
        self.contenido.push(OP_PONER);
        poner_varint(&mut self.contenido, clave.len() as u64);
        self.contenido.extend_from_slice(clave);
        poner_varint(&mut self.contenido, valor.len() as u64);
        self.contenido.extend_from_slice(valor);
        self.ops.push((clave.to_vec(), Some(valor.to_vec())));
        self
    }

    pub fn borrar(&mut self, clave: &[u8]) -> &mut Self {
        self.contenido.push(OP_BORRAR);
        poner_varint(&mut self.contenido, clave.len() as u64);
        self.contenido.extend_from_slice(clave);
        self.ops.push((clave.to_vec(), None));
        self
    }

    pub fn len(&self) -> usize {
        self.ops.len()
    }

    pub fn is_empty(&self) -> bool {
        self.ops.is_empty()
    }

    fn registro(&self) -> Vec<u8> {
        let mut r = Vec::with_capacity(8 + self.contenido.len());
        r.extend_from_slice(&(self.contenido.len() as u32).to_le_bytes());
        r.extend_from_slice(&crc32(&self.contenido).to_le_bytes());
        r.extend_from_slice(&self.contenido);
        r
    }
}

pub(crate) fn ruta(dir: &Path, seq: u64) -> PathBuf {
    dir.join(format!("wal-{seq:016}.log"))
}

pub(crate) struct Wal {
    archivo: File,
    pub seq: u64,
}

impl Wal {
    pub fn abrir(dir: &Path, seq: u64) -> io::Result<Self> {
        let archivo = OpenOptions::new().create(true).append(true).open(ruta(dir, seq))?;
        Ok(Self { archivo, seq })
    }

    /// Un solo `write` por lote: si el proceso muere después de esto, el lote
    /// está en el sistema operativo. `disco` además espera a que llegue al
    /// disco (fsync), lo que también sobrevive a un corte de luz.
    pub fn escribir(&mut self, lote: &Lote, disco: bool) -> io::Result<()> {
        self.archivo.write_all(&lote.registro())?;
        if disco {
            self.archivo.sync_data()?;
        }
        Ok(())
    }

    pub fn sincronizar(&mut self) -> io::Result<()> {
        self.archivo.sync_data()
    }
}

/// Los cambios del WAL, en orden, hasta el primer registro cortado o corrupto,
/// que queda truncado. Devuelve también cuántos lotes se recuperaron.
pub(crate) fn reproducir(
    ruta: &Path,
    mut aplicar: impl FnMut(Vec<u8>, Option<Vec<u8>>),
) -> io::Result<usize> {
    let mut datos = Vec::new();
    File::open(ruta)?.read_to_end(&mut datos)?;

    let mut pos = 0usize;
    let mut lotes = 0usize;
    while let Some(fin) = registro_valido(&datos, pos) {
        let contenido = &datos[pos + 8..fin];
        // El CRC ya cuadró: si el contenido no se puede leer igual, es un bug
        // de escritura, no un corte; se trata como corte para no aplicar
        // medio lote.
        let Some(ops) = decodificar(contenido) else { break };
        for (k, v) in ops {
            aplicar(k, v);
        }
        lotes += 1;
        pos = fin;
    }

    if pos < datos.len() {
        let f = OpenOptions::new().write(true).open(ruta)?;
        f.set_len(pos as u64)?;
        f.sync_all()?;
    }
    Ok(lotes)
}

/// Dónde termina el registro que empieza en `pos`, si está entero y su CRC cuadra.
fn registro_valido(datos: &[u8], pos: usize) -> Option<usize> {
    let cab = datos.get(pos..pos + 8)?;
    let largo = u32::from_le_bytes(cab[0..4].try_into().ok()?) as usize;
    let crc = u32::from_le_bytes(cab[4..8].try_into().ok()?);
    if largo > MAX_REGISTRO {
        return None;
    }
    let fin = pos.checked_add(8 + largo)?;
    let contenido = datos.get(pos + 8..fin)?;
    (crc32(contenido) == crc).then_some(fin)
}

#[allow(clippy::type_complexity)]
fn decodificar(mut c: &[u8]) -> Option<Vec<(Vec<u8>, Option<Vec<u8>>)>> {
    let mut ops = Vec::new();
    while !c.is_empty() {
        let mut p = 1usize;
        let op = c[0];
        let kl = leer_varint(c, &mut p)? as usize;
        let k = leer_bytes(c, &mut p, kl)?.to_vec();
        let v = match op {
            OP_PONER => {
                let vl = leer_varint(c, &mut p)? as usize;
                Some(leer_bytes(c, &mut p, vl)?.to_vec())
            }
            OP_BORRAR => None,
            _ => return None,
        };
        ops.push((k, v));
        c = &c[p..];
    }
    Some(ops)
}
