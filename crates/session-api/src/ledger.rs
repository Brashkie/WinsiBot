//! Mover un monto de un saldo a otro: #pay, #transfer y el banco.
//!
//! La regla está en Ada/SPARK (`ada/src/ledger.ads`) y GNATprove demuestra,
//! para toda entrada, que se conserva el total, que ningún saldo queda
//! negativo ni pasa de 2^53 - 1 —el último entero exacto de JavaScript, donde
//! viven los saldos del bot—, que si no se puede no cambia nada, y que si se
//! puede se hace por exactamente el monto pedido. Con la feature `ada` se
//! enlaza ese objeto; sin ella —sin GNAT, o en Android— decide la copia de
//! abajo, comparada contra Ada en los bordes y en un millón de entradas al azar.
//!
//! Se llama una vez por transferencia, no por mensaje.

use axum::Json;
use serde::Deserialize;

/// Number.MAX_SAFE_INTEGER: de ahí para arriba JavaScript pierde exactitud.
pub const MAX_SALDO: i64 = (1 << 53) - 1;

/// Los resultados, en el orden del `Resultado` de Ada.
pub const HECHO: i32 = 0;
pub const MONTO_INVALIDO: i32 = 1;
pub const SIN_SALDO: i32 = 2;
pub const DESBORDA: i32 = 3;
pub const MISMA_CUENTA: i32 = 4;
pub const FUERA_DE_RANGO: i32 = 5;

/// Cuántos saldos cambia `aplicar` como mucho, como `Max_Cuentas` en Ada.
pub const MAX_CUENTAS: usize = 8;

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_ledger_apply(saldos: *mut i64, cambios: *const i64, n: i32, codigo: *mut i32);
    fn winsi_ledger_move(
        origen: i64,
        destino: i64,
        monto: i64,
        misma: i32,
        nuevo_origen: *mut i64,
        nuevo_destino: *mut i64,
        codigo: *mut i32,
    );
}

/// (código, nuevo origen, nuevo destino). Ada si se enlazó; si no, la copia.
pub fn mover(origen: i64, destino: i64, monto: i64, misma: bool) -> (i32, i64, i64) {
    #[cfg(winsi_ada)]
    {
        let (mut o, mut d, mut c) = (0i64, 0i64, 0i32);
        // SAFETY: tres punteros a locales vivas; GNATprove demuestra que la
        // función termina, no tiene errores en tiempo de ejecución y escribe
        // las tres salidas.
        unsafe { winsi_ledger_move(origen, destino, monto, misma as i32, &mut o, &mut d, &mut c) };
        (c, o, d)
    }
    #[cfg(not(winsi_ada))]
    {
        mover_rust(origen, destino, monto, misma)
    }
}

pub const fn motor() -> &'static str {
    if cfg!(winsi_ada) {
        "ada"
    } else {
        "rust"
    }
}

/// La misma regla que `Ledger.Mover_C`, en el mismo orden.
pub fn mover_rust(origen: i64, destino: i64, monto: i64, misma: bool) -> (i32, i64, i64) {
    let valido = |s: i64| (0..=MAX_SALDO).contains(&s);
    if !valido(origen) || !valido(destino) {
        return (FUERA_DE_RANGO, origen, destino);
    }
    let codigo = if misma {
        MISMA_CUENTA
    } else if monto < 1 {
        MONTO_INVALIDO
    } else if monto > origen {
        SIN_SALDO
    } else if destino > MAX_SALDO - monto {
        DESBORDA
    } else {
        return (HECHO, origen - monto, destino + monto);
    };
    (codigo, origen, destino)
}

/// Aplicar varios cambios a la vez, todo o nada: el código y los saldos
/// resultantes (los nuevos si se aplicó, los mismos si no). Ada si se enlazó.
pub fn aplicar(saldos: &[i64], cambios: &[i64]) -> (i32, Vec<i64>) {
    if saldos.len() != cambios.len() || saldos.len() > MAX_CUENTAS {
        return (FUERA_DE_RANGO, saldos.to_vec());
    }
    let n = saldos.len();
    let (mut s, mut c) = ([0i64; MAX_CUENTAS], [0i64; MAX_CUENTAS]);
    s[..n].copy_from_slice(saldos);
    c[..n].copy_from_slice(cambios);
    let codigo = aplicar_arreglo(&mut s, &c, n as i32);
    (codigo, s[..n].to_vec())
}

#[cfg(winsi_ada)]
fn aplicar_arreglo(s: &mut [i64; MAX_CUENTAS], c: &[i64; MAX_CUENTAS], n: i32) -> i32 {
    let mut codigo = 0i32;
    // SAFETY: dos arreglos de MAX_CUENTAS y un local; GNATprove demuestra que
    // la función solo toca los primeros n y no tiene errores en ejecución.
    unsafe { winsi_ledger_apply(s.as_mut_ptr(), c.as_ptr(), n, &mut codigo) };
    codigo
}

#[cfg(not(winsi_ada))]
fn aplicar_arreglo(s: &mut [i64; MAX_CUENTAS], c: &[i64; MAX_CUENTAS], n: i32) -> i32 {
    aplicar_rust(s, c, n)
}

/// La misma regla que `Ledger.Aplicar_C`: primero se revisa todo, después
/// se aplica.
pub fn aplicar_rust(s: &mut [i64; MAX_CUENTAS], c: &[i64; MAX_CUENTAS], n: i32) -> i32 {
    if !(0..=MAX_CUENTAS as i32).contains(&n) {
        return FUERA_DE_RANGO;
    }
    let n = n as usize;
    let valido =
        (0..n).all(|i| (0..=MAX_SALDO).contains(&s[i]) && (-MAX_SALDO..=MAX_SALDO).contains(&c[i]));
    if !valido {
        return FUERA_DE_RANGO;
    }
    for i in 0..n {
        let r = s[i] + c[i];
        if r < 0 {
            return SIN_SALDO;
        }
        if r > MAX_SALDO {
            return DESBORDA;
        }
    }
    for i in 0..n {
        s[i] += c[i];
    }
    HECHO
}

#[derive(Deserialize)]
pub struct AplicarRequest {
    pub saldos: Vec<i64>,
    pub cambios: Vec<i64>,
}

/// POST /economy/apply — `{ saldos, cambios }` → `{ codigo, saldos, motor }`.
pub async fn apply_handler(Json(req): Json<AplicarRequest>) -> Json<serde_json::Value> {
    let (codigo, saldos) = aplicar(&req.saldos, &req.cambios);
    Json(serde_json::json!({ "ok": true, "codigo": codigo, "saldos": saldos, "motor": motor() }))
}

#[derive(Deserialize)]
pub struct MoverRequest {
    pub origen: i64,
    pub destino: i64,
    pub monto: i64,
    #[serde(default)]
    pub misma: bool,
}

/// POST /economy/move — `{ origen, destino, monto, misma }` →
/// `{ codigo, origen, destino, motor }`.
pub async fn move_handler(Json(req): Json<MoverRequest>) -> Json<serde_json::Value> {
    let (codigo, origen, destino) = mover(req.origen, req.destino, req.monto, req.misma);
    Json(serde_json::json!({
        "ok": true,
        "codigo": codigo,
        "origen": origen,
        "destino": destino,
        "motor": motor(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Los bordes que importan, y basura de int64.
    const BORDES: [i64; 14] = [
        i64::MIN,
        -1,
        0,
        1,
        2,
        100,
        MAX_SALDO / 2,
        MAX_SALDO - 2,
        MAX_SALDO - 1,
        MAX_SALDO,
        MAX_SALDO + 1,
        MAX_SALDO * 2,
        i64::MAX - 1,
        i64::MAX,
    ];

    /// xorshift: entradas al azar reproducibles, sin dependencias.
    fn azar(semilla: &mut u64) -> u64 {
        *semilla ^= *semilla << 13;
        *semilla ^= *semilla >> 7;
        *semilla ^= *semilla << 17;
        *semilla
    }

    fn garantias(o: i64, d: i64, m: i64, misma: bool, (c, no, nd): (i32, i64, i64)) {
        let ctx = format!("origen {o}, destino {d}, monto {m}, misma {misma}");
        let validos = (0..=MAX_SALDO).contains(&o) && (0..=MAX_SALDO).contains(&d);
        if validos {
            assert_eq!(
                no as i128 + nd as i128,
                o as i128 + d as i128,
                "no conserva: {ctx}"
            );
            assert!(
                (0..=MAX_SALDO).contains(&no) && (0..=MAX_SALDO).contains(&nd),
                "fuera de rango: {ctx}"
            );
        }
        let se_puede = validos && !misma && m >= 1 && m <= o && d <= MAX_SALDO - m;
        assert_eq!(
            c == HECHO,
            se_puede,
            "hecho cuando no se podia, o al reves: {ctx}"
        );
        if c == HECHO {
            assert_eq!(
                (no, nd),
                (o - m, d + m),
                "no movio exactamente el monto: {ctx}"
            );
        } else {
            assert_eq!((no, nd), (o, d), "cambio algo sin hacerse: {ctx}");
        }
        assert!(
            (0..=FUERA_DE_RANGO).contains(&c),
            "codigo desconocido: {ctx}"
        );
    }

    #[test]
    fn la_copia_cumple_las_garantias_en_los_bordes() {
        for &o in &BORDES {
            for &d in &BORDES {
                for &m in &BORDES {
                    for misma in [false, true] {
                        garantias(o, d, m, misma, mover_rust(o, d, m, misma));
                    }
                }
            }
        }
    }

    #[test]
    fn la_copia_cumple_las_garantias_al_azar() {
        let mut s = 0x9E37_79B9_7F4A_7C15;
        for _ in 0..200_000 {
            // Saldos y montos de toda escala: de unidades a cerca del máximo.
            let escala = |s: &mut u64| (azar(s) >> (azar(s) % 60)) as i64 % (MAX_SALDO + 2);
            let (o, d, m) = (escala(&mut s), escala(&mut s), escala(&mut s));
            garantias(o, d, m, false, mover_rust(o, d, m, false));
        }
    }

    #[test]
    fn los_casos_de_todos_los_dias() {
        assert_eq!(mover_rust(1000, 50, 300, false), (HECHO, 700, 350));
        assert_eq!(mover_rust(1000, 50, 1000, false), (HECHO, 0, 1050));
        assert_eq!(mover_rust(1000, 50, 1001, false), (SIN_SALDO, 1000, 50));
        assert_eq!(mover_rust(1000, 50, 0, false), (MONTO_INVALIDO, 1000, 50));
        assert_eq!(mover_rust(1000, 50, 10, true), (MISMA_CUENTA, 1000, 50));
        assert_eq!(
            mover_rust(10, MAX_SALDO - 5, 6, false),
            (DESBORDA, 10, MAX_SALDO - 5)
        );
        assert_eq!(mover_rust(-5, 0, 1, false), (FUERA_DE_RANGO, -5, 0));
    }

    fn garantias_aplicar(
        s0: [i64; MAX_CUENTAS],
        c: [i64; MAX_CUENTAS],
        n: i32,
        codigo: i32,
        s: [i64; MAX_CUENTAS],
    ) {
        let ctx = format!("{s0:?} {c:?} n={n}");
        let nn = n.clamp(0, MAX_CUENTAS as i32) as usize;
        let valida = (0..=MAX_CUENTAS as i32).contains(&n)
            && (0..nn).all(|i| {
                (0..=MAX_SALDO).contains(&s0[i]) && (-MAX_SALDO..=MAX_SALDO).contains(&c[i])
            });
        let en_rango = valida && (0..nn).all(|i| (0..=MAX_SALDO).contains(&(s0[i] + c[i])));
        assert_eq!(
            codigo == HECHO,
            en_rango,
            "se aplico cuando no debia, o al reves: {ctx}"
        );
        if codigo == HECHO {
            for i in 0..MAX_CUENTAS {
                let esperado = if i < nn { s0[i] + c[i] } else { s0[i] };
                assert_eq!(s[i], esperado, "saldo {i} mal: {ctx}");
            }
        } else {
            assert_eq!(s, s0, "toco algo sin aplicar (no es todo o nada): {ctx}");
        }
        assert!(
            [HECHO, SIN_SALDO, DESBORDA, FUERA_DE_RANGO].contains(&codigo),
            "codigo raro: {ctx}"
        );
    }

    #[test]
    fn aplicar_es_todo_o_nada() {
        // Dos saldos: el primero alcanza, el segundo no. No se toca ninguno.
        let (c, s) = aplicar(&[100, 5], &[-50, -10]);
        assert_eq!((c, s), (SIN_SALDO, vec![100, 5]));
        let (c, s) = aplicar(&[100, MAX_SALDO], &[10, 1]);
        assert_eq!((c, s), (DESBORDA, vec![100, MAX_SALDO]));
        // Un cofre: dinero y diamantes juntos.
        assert_eq!(aplicar(&[100, 3], &[250, 2]), (HECHO, vec![350, 5]));
        assert_eq!(aplicar(&[], &[]), (HECHO, vec![]));
        assert_eq!(aplicar(&[1; 9], &[1; 9]).0, FUERA_DE_RANGO);
        assert_eq!(aplicar(&[1, 2], &[1]).0, FUERA_DE_RANGO);
    }

    #[test]
    fn aplicar_cumple_las_garantias_al_azar() {
        let mut sem = 0x1234_5678_9ABC_DEF1u64;
        for _ in 0..200_000 {
            let mut s0 = [0i64; MAX_CUENTAS];
            let mut c = [0i64; MAX_CUENTAS];
            for i in 0..MAX_CUENTAS {
                s0[i] = (azar(&mut sem) >> (azar(&mut sem) % 63)) as i64 % (MAX_SALDO + 2);
                let m = (azar(&mut sem) >> (azar(&mut sem) % 63)) as i64 % (MAX_SALDO + 2);
                c[i] = if azar(&mut sem).is_multiple_of(2) {
                    m
                } else {
                    -m
                };
            }
            let n = (azar(&mut sem) % 10) as i32 - 1;
            let mut s = s0;
            let codigo = aplicar_rust(&mut s, &c, n);
            garantias_aplicar(s0, c, n, codigo, s);
        }
    }

    #[cfg(winsi_ada)]
    #[test]
    fn aplicar_rust_y_ada_dan_lo_mismo() {
        let mut sem = 0xDEAD_BEEF_CAFE_F00Du64;
        for _ in 0..1_000_000 {
            let mut s0 = [0i64; MAX_CUENTAS];
            let mut c = [0i64; MAX_CUENTAS];
            for i in 0..MAX_CUENTAS {
                s0[i] = (azar(&mut sem) as i64) >> (azar(&mut sem) % 64);
                c[i] = (azar(&mut sem) as i64) >> (azar(&mut sem) % 64);
            }
            let n = (azar(&mut sem) % 12) as i32 - 2;
            let (mut a, mut r) = (s0, s0);
            let ca = aplicar_arreglo(&mut a, &c, n);
            let cr = aplicar_rust(&mut r, &c, n);
            assert_eq!((ca, a), (cr, r), "{s0:?} {c:?} {n}");
        }
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_dan_lo_mismo() {
        for &o in &BORDES {
            for &d in &BORDES {
                for &m in &BORDES {
                    for misma in [false, true] {
                        assert_eq!(
                            mover(o, d, m, misma),
                            mover_rust(o, d, m, misma),
                            "{o} {d} {m} {misma}"
                        );
                    }
                }
            }
        }
        let mut s = 0x2545_F491_4F6C_DD1D;
        for _ in 0..1_000_000 {
            let (o, d, m) = (
                azar(&mut s) as i64,
                azar(&mut s) as i64,
                azar(&mut s) as i64,
            );
            let escala = |x: i64, k: u64| x >> (k % 63);
            let (o, d, m) = (
                escala(o, azar(&mut s)),
                escala(d, azar(&mut s)),
                escala(m, azar(&mut s)),
            );
            let misma = azar(&mut s).is_multiple_of(16);
            assert_eq!(
                mover(o, d, m, misma),
                mover_rust(o, d, m, misma),
                "{o} {d} {m} {misma}"
            );
        }
    }
}
