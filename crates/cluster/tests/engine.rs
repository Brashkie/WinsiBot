mod common;

use std::collections::BTreeMap;

use cluster::{Lote, Motor, Opciones};
use common::{Azar, Carpeta};

/// Opciones chicas para que haya muchas tablas, vaciados y compactaciones.
fn chicas() -> Opciones {
    Opciones { memtable_bytes: 8 << 10, compactar_desde: 3, bloque_bytes: 256, ..Opciones::default() }
}

#[test]
fn poner_leer_borrar() {
    let c = Carpeta::nueva("basico");
    let mut m = Motor::abrir(&c.0, Opciones::default()).unwrap();
    m.poner(b"a", b"1").unwrap();
    m.poner(b"b", b"2").unwrap();
    m.poner(b"a", b"3").unwrap();
    m.borrar(b"b").unwrap();
    assert_eq!(m.leer(b"a").unwrap(), Some(b"3".to_vec()));
    assert_eq!(m.leer(b"b").unwrap(), None);
    assert_eq!(m.leer(b"zz").unwrap(), None);
}

#[test]
fn la_lapida_tapa_lo_viejo_en_disco() {
    let c = Carpeta::nueva("lapida");
    let mut m = Motor::abrir(&c.0, Opciones { compactar_desde: 99, ..Opciones::default() }).unwrap();
    m.poner(b"k", b"viejo").unwrap();
    m.vaciar().unwrap();
    m.borrar(b"k").unwrap();
    m.vaciar().unwrap();
    assert_eq!(m.estadisticas().tablas, 2);
    assert_eq!(m.leer(b"k").unwrap(), None, "la lápida de la tabla nueva tapa la vieja");
    drop(m);
    let m = Motor::abrir(&c.0, Opciones::default()).unwrap();
    assert_eq!(m.leer(b"k").unwrap(), None);
}

#[test]
fn compactar_tira_lapidas_y_pisados() {
    let c = Carpeta::nueva("compactar");
    let mut m = Motor::abrir(&c.0, Opciones { compactar_desde: 99, ..Opciones::default() }).unwrap();
    for i in 0..100u32 {
        m.poner(format!("k{i:03}").as_bytes(), b"v1").unwrap();
    }
    m.vaciar().unwrap();
    for i in 0..50u32 {
        m.borrar(format!("k{i:03}").as_bytes()).unwrap();
    }
    for i in 50..100u32 {
        m.poner(format!("k{i:03}").as_bytes(), b"v2").unwrap();
    }
    m.vaciar().unwrap();
    m.compactar().unwrap();
    let e = m.estadisticas();
    assert_eq!(e.tablas, 1);
    assert_eq!(e.entradas_en_tablas, 50, "ni lápidas ni valores pisados");
    assert_eq!(m.leer(b"k075").unwrap(), Some(b"v2".to_vec()));
    assert_eq!(m.leer(b"k010").unwrap(), None);
}

#[test]
fn el_lote_entra_entero() {
    let c = Carpeta::nueva("lote");
    let mut m = Motor::abrir(&c.0, Opciones::default()).unwrap();
    let mut l = Lote::new();
    l.poner(b"x", b"1").poner(b"y", b"2").borrar(b"x");
    m.escribir(&l).unwrap();
    assert_eq!(m.leer(b"x").unwrap(), None, "dentro del lote vale el orden");
    assert_eq!(m.leer(b"y").unwrap(), Some(b"2".to_vec()));
}

#[test]
fn prefijo_y_rango() {
    let c = Carpeta::nueva("prefijo");
    let mut m = Motor::abrir(&c.0, chicas()).unwrap();
    for (k, v) in [("u:ana", "1"), ("u:beto", "2"), ("g:x", "3"), ("u:carla", "4"), ("v:z", "5")] {
        m.poner(k.as_bytes(), v.as_bytes()).unwrap();
    }
    m.vaciar().unwrap();
    m.borrar(b"u:beto").unwrap();
    let u: Vec<String> = m.prefijo(b"u:").unwrap().into_iter().map(|(k, _)| String::from_utf8(k).unwrap()).collect();
    assert_eq!(u, ["u:ana", "u:carla"]);
    assert_eq!(m.rango(b"g", Some(b"u")).unwrap().len(), 1);
}

#[test]
fn valores_grandes_y_claves_binarias() {
    let c = Carpeta::nueva("grandes");
    let mut m = Motor::abrir(&c.0, chicas()).unwrap();
    let grande = vec![7u8; 200_000];
    m.poner(&[0, 255, 0], &grande).unwrap();
    m.poner(b"", b"clave vacia").unwrap();
    m.vaciar().unwrap();
    drop(m);
    let m = Motor::abrir(&c.0, chicas()).unwrap();
    assert_eq!(m.leer(&[0, 255, 0]).unwrap(), Some(grande));
    assert_eq!(m.leer(b"").unwrap(), Some(b"clave vacia".to_vec()));
}

/// Miles de operaciones al azar —con vaciados, compactaciones y reaperturas
/// por el medio— comparadas en cada paso contra un BTreeMap.
#[test]
fn contra_un_modelo() {
    for semilla in 1..=4u64 {
        let c = Carpeta::nueva("modelo");
        let mut az = Azar(semilla.wrapping_mul(0x9e37_79b9_7f4a_7c15));
        let mut modelo: BTreeMap<Vec<u8>, Vec<u8>> = BTreeMap::new();
        let mut m = Motor::abrir(&c.0, chicas()).unwrap();

        for paso in 0..6000u32 {
            let k = format!("k{:04}", az.hasta(800)).into_bytes();
            match az.hasta(100) {
                0..=59 => {
                    let v = format!("v{paso}-{}", "x".repeat(az.hasta(60) as usize)).into_bytes();
                    m.poner(&k, &v).unwrap();
                    modelo.insert(k, v);
                }
                60..=79 => {
                    m.borrar(&k).unwrap();
                    modelo.remove(&k);
                }
                80..=96 => {
                    assert_eq!(m.leer(&k).unwrap(), modelo.get(&k).cloned(), "semilla {semilla}, paso {paso}");
                }
                97 => m.compactar().unwrap(),
                _ => {
                    drop(m);
                    m = Motor::abrir(&c.0, chicas()).unwrap();
                }
            }
        }

        let todo: BTreeMap<Vec<u8>, Vec<u8>> = m.rango(b"", None).unwrap().into_iter().collect();
        assert_eq!(todo, modelo, "semilla {semilla}: el contenido completo");
        drop(m);
        let m = Motor::abrir(&c.0, chicas()).unwrap();
        let todo: BTreeMap<Vec<u8>, Vec<u8>> = m.rango(b"", None).unwrap().into_iter().collect();
        assert_eq!(todo, modelo, "semilla {semilla}: después de reabrir");
    }
}
