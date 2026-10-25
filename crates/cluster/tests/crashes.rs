//! Cortes en cada punto donde el proceso puede morir.
//!
//! No hace falta matar un proceso de verdad para probarlos: lo que queda en el
//! disco después de un corte es un estado concreto —un WAL con la cola a
//! medias, una tabla que el MANIFEST no nombra, un .tmp—, y esos estados se
//! fabrican acá y se abre el motor encima.

mod common;

use std::fs::{self, OpenOptions};
use std::io::Write;

use cluster::{Lote, Motor, Opciones};
use common::Carpeta;

fn sin_vaciar() -> Opciones {
    Opciones { memtable_bytes: usize::MAX, compactar_desde: 99, ..Opciones::default() }
}

/// Morir sin cerrar: con Durabilidad::Proceso cada lote ya está en el SO.
#[test]
fn morir_sin_cerrar_no_pierde_nada() {
    let c = Carpeta::nueva("morir");
    let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    for i in 0..1000u32 {
        m.poner(format!("k{i}").as_bytes(), format!("v{i}").as_bytes()).unwrap();
    }
    std::mem::forget(m); // ni Drop: como un kill
    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    for i in 0..1000u32 {
        assert_eq!(m.leer(format!("k{i}").as_bytes()).unwrap(), Some(format!("v{i}").into_bytes()));
    }
}

/// El WAL cortado en CADA byte del último lote: se recupera todo lo anterior,
/// nada del lote cortado (un lote entra entero o no entra), y lo que se
/// escribe después sobrevive a otra reapertura —es decir, la cola se truncó y
/// no quedó basura delante—.
#[test]
fn wal_cortado_en_cada_byte() {
    let base = Carpeta::nueva("wal-base");
    {
        let mut m = Motor::abrir(&base.0, sin_vaciar()).unwrap();
        for i in 0..5u32 {
            m.poner(format!("k{i}").as_bytes(), b"ok").unwrap();
        }
        let mut l = Lote::new();
        l.poner(b"lote-a", b"1").poner(b"lote-b", b"2").borrar(b"k0");
        m.escribir(&l).unwrap();
    }
    let wal = base.archivos("wal-").pop().unwrap();
    let entero = fs::read(&wal).unwrap();
    let largo_lote = 8 + (1 + 1 + 6 + 1 + 1) * 2 + (1 + 1 + 2);
    let inicio = entero.len() - largo_lote;

    for corte in inicio..entero.len() {
        let c = Carpeta::nueva("wal-corte");
        fs::create_dir_all(&c.0).unwrap();
        fs::write(c.0.join(wal.file_name().unwrap()), &entero[..corte]).unwrap();

        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        assert_eq!(m.leer(b"k4").unwrap(), Some(b"ok".to_vec()), "corte en {corte}");
        assert_eq!(m.leer(b"k0").unwrap(), Some(b"ok".to_vec()), "el borrado del lote cortado no se aplica");
        assert_eq!(m.leer(b"lote-a").unwrap(), None, "ni medio lote");
        m.poner(b"despues", b"si").unwrap();
        drop(m);

        let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        assert_eq!(m.leer(b"despues").unwrap(), Some(b"si".to_vec()), "corte en {corte}: lo de después quedó detrás de basura");
    }
}

/// Un byte cambiado a mitad del WAL: se recupera hasta ahí, sin pánico.
#[test]
fn wal_con_un_byte_corrupto() {
    let c = Carpeta::nueva("wal-corrupto");
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        for i in 0..100u32 {
            m.poner(format!("k{i:03}").as_bytes(), b"valor").unwrap();
        }
    }
    let wal = c.archivos("wal-").pop().unwrap();
    let mut d = fs::read(&wal).unwrap();
    let medio = d.len() / 2;
    d[medio] ^= 0x55;
    fs::write(&wal, d).unwrap();

    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    assert_eq!(m.leer(b"k000").unwrap(), Some(b"valor".to_vec()));
    assert_eq!(m.leer(b"k099").unwrap(), None, "después de la corrupción no se confía en nada");
}

/// Corte durante un vaciado: quedó el .tmp de la tabla a medio escribir.
#[test]
fn tabla_tmp_a_medias() {
    let c = Carpeta::nueva("tmp");
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.poner(b"k", b"v").unwrap();
    }
    fs::write(c.0.join("sst-0000000000000007.sst.tmp"), b"basura a medias").unwrap();
    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    assert_eq!(m.leer(b"k").unwrap(), Some(b"v".to_vec()));
    assert!(c.archivos("sst-").is_empty(), "el .tmp se borra");
}

/// Corte después de renombrar la tabla y ANTES de anotarla en el MANIFEST:
/// la tabla no cuenta (se borra) y los datos salen del WAL, que sigue ahí.
#[test]
fn tabla_sin_anotar() {
    let c = Carpeta::nueva("sin-anotar");
    let fuente = Carpeta::nueva("sin-anotar-fuente");
    {
        // Una tabla válida cualquiera, con OTRO contenido.
        let mut f = Motor::abrir(&fuente.0, sin_vaciar()).unwrap();
        f.poner(b"k", b"de la tabla huerfana").unwrap();
        f.vaciar().unwrap();
    }
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.poner(b"k", b"del wal").unwrap();
    }
    let huerfana = fuente.archivos("sst-").pop().unwrap();
    fs::copy(&huerfana, c.0.join("sst-0000000000000000.sst")).unwrap();

    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    assert_eq!(m.leer(b"k").unwrap(), Some(b"del wal".to_vec()));
    assert!(c.archivos("sst-").is_empty(), "la huérfana se borra");
}

/// Corte después de anotar la tabla y ANTES de borrar el WAL viejo: el WAL
/// viejo ya está en la tabla, no se reproduce dos veces y se borra.
#[test]
fn wal_viejo_que_sobro() {
    let c = Carpeta::nueva("wal-viejo");
    let copia;
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.poner(b"k", b"v1").unwrap();
        copia = (c.archivos("wal-").pop().unwrap(), fs::read(c.archivos("wal-").pop().unwrap()).unwrap());
        m.vaciar().unwrap();
        m.poner(b"k", b"v2").unwrap();
    }
    fs::write(&copia.0, &copia.1).unwrap(); // el WAL viejo "no llegó a borrarse"
    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    assert_eq!(m.leer(b"k").unwrap(), Some(b"v2".to_vec()), "el WAL viejo no pisa lo nuevo");
    assert!(!copia.0.exists(), "y se borra");
}

/// Corte en la compactación, después de escribir la tabla nueva y antes del
/// MANIFEST: las viejas siguen valiendo, la nueva se descarta.
#[test]
fn compactacion_cortada() {
    let c = Carpeta::nueva("compact-corte");
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.poner(b"a", b"1").unwrap();
        m.vaciar().unwrap();
        m.poner(b"b", b"2").unwrap();
        m.vaciar().unwrap();
    }
    let manifest = fs::read(c.0.join("MANIFEST")).unwrap();
    let antes: Vec<_> = c.archivos("sst-");
    let copias: Vec<_> = antes.iter().map(|p| (p.clone(), fs::read(p).unwrap())).collect();
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.compactar().unwrap();
    }
    // "Deshacer" el MANIFEST y las viejas: como si se cortara antes de anotar.
    let nueva = c.archivos("sst-").pop().unwrap();
    fs::write(c.0.join("MANIFEST"), manifest).unwrap();
    for (p, d) in copias {
        fs::write(p, d).unwrap();
    }
    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    assert_eq!(m.leer(b"a").unwrap(), Some(b"1".to_vec()));
    assert_eq!(m.leer(b"b").unwrap(), Some(b"2".to_vec()));
    assert!(!nueva.exists(), "la tabla de la compactación cortada se descarta");
}

/// Un MANIFEST roto NO se toma como "no hay datos": abrir falla.
#[test]
fn manifest_roto_es_error() {
    let c = Carpeta::nueva("manifest");
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.poner(b"k", b"v").unwrap();
        m.vaciar().unwrap();
    }
    let mut f = OpenOptions::new().append(true).open(c.0.join("MANIFEST")).unwrap();
    f.write_all(b"sst 999\n").unwrap();
    drop(f);
    assert!(Motor::abrir(&c.0, sin_vaciar()).is_err());
}

/// Una tabla con un bloque corrupto: leer da error, no un valor equivocado.
#[test]
fn bloque_corrupto_es_error() {
    let c = Carpeta::nueva("bloque");
    {
        let mut m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
        m.poner(b"k", b"un valor cualquiera").unwrap();
        m.vaciar().unwrap();
    }
    let t = c.archivos("sst-").pop().unwrap();
    let mut d = fs::read(&t).unwrap();
    d[3] ^= 0xff;
    fs::write(&t, d).unwrap();
    let m = Motor::abrir(&c.0, sin_vaciar()).unwrap();
    assert!(m.leer(b"k").is_err());
}
