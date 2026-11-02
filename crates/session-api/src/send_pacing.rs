//! El ritmo de salida de cada cuenta: cuándo sale el próximo envío.
//!
//! La regla está en Ada/SPARK (`ada/src/send_pacing.ads`) y GNATprove
//! demuestra, para toda entrada, que el turno nunca rompe un tope por minuto,
//! hora o día —tampoco el del calentamiento—, que respeta el enfriamiento y
//! la pausa, que nunca sale antes que el último envío, que no espera de más
//! (el motivo dice qué regla lo puso ahí), que se rechaza exactamente cuando
//! debe, y que la escalada de las esperas del 429 y del 463 nunca se
//! desborda. Con la feature `ada` se enlaza ese objeto; sin ella —sin GNAT,
//! o en Android— decide la copia de abajo, comparada contra Ada en un millón
//! de entradas al azar.
//!
//! El historial, los contactos y el archivo siguen en `antiban.rs`: aquí
//! entra lo que hace falta para decidir y sale la decisión.

/// Los instantes y las esperas, en ms, como `Ms` en Ada: dos sumados nunca
/// desbordan 64 bits.
pub const MAX_MS: i64 = 1 << 61;
/// Los envíos de 24 h que se miran como mucho; un tope mayor se lee como este.
pub const MAX_HISTORIAL: usize = 65_536;
/// Días de calentamiento como mucho.
pub const MAX_DIAS: usize = 64;

const MINUTO: i64 = 60_000;
const HORA: i64 = 60 * MINUTO;
const DIA: i64 = 24 * HORA;

/// Los motivos, en el orden de `antiban::Motivo`.
pub const M_LIBRE: i32 = 0;
pub const M_PAUSA: i32 = 1;
pub const M_MINUTO: i32 = 2;
pub const M_HORA: i32 = 3;
pub const M_DIA: i32 = 4;
pub const M_CALENTAMIENTO: i32 = 5;
pub const M_ENFRIAMIENTO: i32 = 6;
pub const M_CONTACTO: i32 = 7;

/// El `Pedido` de Ada. Lo que venga fuera de rango se lleva al borde.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct Pedido {
    pub ahora: i64,
    /// El contacto está en espera (463) hasta acá; 0 si no.
    pub contacto_hasta: i64,
    /// La cuenta está enfriada (429) hasta acá.
    pub enfriado_hasta: i64,
    /// La pausa sorteada para este envío.
    pub pausa: i64,
    pub espera_max: i64,
    /// 0 es sin tope.
    pub por_minuto: i64,
    pub por_hora: i64,
    pub por_dia: i64,
    /// Cuándo se vinculó el número; negativo es una sesión madura.
    pub emparejado: i64,
    pub calentamiento: [i64; MAX_DIAS],
    pub dias: i32,
    /// Cuántos envíos tiene el historial.
    pub largo: i32,
}

/// La `Respuesta` de Ada.
#[repr(C)]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Respuesta {
    /// Cuándo sale (0 si se rechaza).
    pub turno: i64,
    /// Cuánto falta para el turno, o para reintentar.
    pub espera: i64,
    /// 0 enviar, 1 rechazar.
    pub codigo: i32,
    pub motivo: i32,
}

/// Un instante de Rust, ya en el rango de Ada.
pub fn ms(x: u64) -> i64 {
    x.min(MAX_MS as u64) as i64
}

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_pacing_permit(p: *const Pedido, historial: *const i64, r: *mut Respuesta);
    fn winsi_pacing_backoff(base: i64, nivel: i32, techo: i64) -> i64;
}

/// La decisión. `historial` son los envíos de las últimas 24 h, del más
/// viejo al más nuevo; `p.largo` tiene que ser como mucho su largo.
#[cfg(winsi_ada)]
pub fn decidir(p: &Pedido, historial: &[u64]) -> Respuesta {
    assert!(p.largo <= 0 || p.largo as usize <= historial.len());
    let mut r = Respuesta::default();
    // SAFETY: Ada solo lee posiciones menores que el largo acotado, que es
    // como mucho historial.len() (el assert de arriba); u64 e i64 tienen la
    // misma forma, y un valor que no entre en i64 Ada lo lleva a 0. GNATprove
    // demuestra que la función no tiene errores en ejecución y escribe r.
    unsafe { winsi_pacing_permit(p, historial.as_ptr().cast(), &mut r) };
    r
}

#[cfg(not(winsi_ada))]
pub fn decidir(p: &Pedido, historial: &[u64]) -> Respuesta {
    decidir_rust(p, historial)
}

/// La espera del N-ésimo error seguido: `base` duplicada en cada uno —diez
/// veces como mucho—, con `techo`.
#[cfg(winsi_ada)]
pub fn escalada(base: u64, nivel: u32, techo: u64) -> u64 {
    // SAFETY: sin punteros; GNATprove demuestra que no desborda.
    unsafe { winsi_pacing_backoff(ms(base), nivel.min(i32::MAX as u32) as i32, ms(techo)) as u64 }
}

#[cfg(not(winsi_ada))]
pub fn escalada(base: u64, nivel: u32, techo: u64) -> u64 {
    escalada_rust(ms(base), nivel.min(i32::MAX as u32) as i32, ms(techo)) as u64
}

fn acotar(x: i64) -> i64 {
    x.clamp(0, MAX_MS)
}

fn tope(x: i64) -> usize {
    x.clamp(0, MAX_HISTORIAL as i64) as usize
}

fn sumar(a: i64, b: i64) -> i64 {
    (a + b).min(MAX_MS)
}

/// La misma regla que `Send_Pacing.Permiso_C`.
pub fn decidir_rust(p: &Pedido, h: &[u64]) -> Respuesta {
    let largo = p.largo.clamp(0, MAX_HISTORIAL as i32) as usize;
    let dias = p.dias.clamp(0, MAX_DIAS as i32) as i64;
    let ahora = acotar(p.ahora);
    let envio = |i: usize| acotar(h[i] as i64);

    if acotar(p.contacto_hasta) > ahora {
        return Respuesta {
            turno: 0,
            espera: acotar(p.contacto_hasta) - ahora,
            codigo: 1,
            motivo: M_CONTACTO,
        };
    }

    // Con tope T en una ventana V: si hay T envíos o más, el T-ésimo desde el
    // más reciente tiene que haber salido de la ventana.
    let cota_ventana = |t: i64, v: i64| {
        let t = tope(t);
        if t > 0 && largo >= t {
            sumar(envio(largo - t), v)
        } else {
            0
        }
    };
    let (mut t, mut m) = (ahora, M_LIBRE);
    let mut empujar = |cota: i64, motivo: i32, t: &mut i64| {
        if cota > *t {
            *t = cota;
            m = motivo;
        }
    };

    empujar(acotar(p.enfriado_hasta), M_ENFRIAMIENTO, &mut t);
    let cota_pausa = if largo == 0 {
        0
    } else {
        sumar(envio(largo - 1), acotar(p.pausa))
    };
    empujar(cota_pausa, M_PAUSA, &mut t);
    empujar(cota_ventana(p.por_minuto, MINUTO), M_MINUTO, &mut t);
    empujar(cota_ventana(p.por_hora, HORA), M_HORA, &mut t);

    let desde = acotar(p.emparejado);
    let dia = if t > desde { (t - desde) / DIA } else { 0 };
    let en_calentamiento = p.emparejado >= 0 && dia < dias;
    let tope_dia = if en_calentamiento {
        p.calentamiento[dia as usize]
    } else {
        p.por_dia
    };
    empujar(
        cota_ventana(tope_dia, DIA),
        if en_calentamiento {
            M_CALENTAMIENTO
        } else {
            M_DIA
        },
        &mut t,
    );

    let espera = t - ahora;
    if espera <= acotar(p.espera_max) {
        Respuesta {
            turno: t,
            espera,
            codigo: 0,
            motivo: m,
        }
    } else {
        Respuesta {
            turno: 0,
            espera,
            codigo: 1,
            motivo: m,
        }
    }
}

/// La misma regla que `Send_Pacing.Escalada`.
pub fn escalada_rust(base: i64, nivel: i32, techo: i64) -> i64 {
    let (b, c) = (acotar(base), acotar(techo));
    let k = 1i64 << (nivel.max(1) - 1).min(10);
    if b <= c / k {
        b * k
    } else {
        c
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// xorshift: entradas al azar reproducibles, sin dependencias.
    fn azar(semilla: &mut u64) -> u64 {
        *semilla ^= *semilla << 13;
        *semilla ^= *semilla >> 7;
        *semilla ^= *semilla << 17;
        *semilla
    }

    /// Un pedido al azar, casi siempre con números de verdad —instantes cerca
    /// de ahora, topes chicos— para que pegue en los topes, y a veces basura.
    fn pedido_al_azar(s: &mut u64) -> (Pedido, Vec<u64>) {
        let ahora = 1_700_000_000_000 + (azar(s) % (30 * DIA as u64)) as i64;
        let cerca = |s: &mut u64| -> i64 {
            match azar(s) % 8 {
                0 => azar(s) as i64,
                1 => 0,
                _ => ahora - DIA + (azar(s) % (2 * DIA as u64)) as i64,
            }
        };
        let chico = |s: &mut u64| -> i64 {
            match azar(s) % 10 {
                0 => azar(s) as i64,
                1 => 0,
                _ => (azar(s) % 60) as i64,
            }
        };
        let largo = (azar(s) % 80) as usize;
        let mut h: Vec<u64> = (0..largo)
            .map(|_| (ahora - DIA + (azar(s) % (DIA as u64 + 5_000)) as i64) as u64)
            .collect();
        if !azar(s).is_multiple_of(10) {
            h.sort_unstable();
            // A veces apretados, para llenar el minuto.
            if azar(s).is_multiple_of(3) {
                let fin = ahora as u64 - azar(s) % 30_000;
                for (i, x) in h.iter_mut().enumerate() {
                    *x = fin - (largo - i) as u64 * (azar(s) % 2_000);
                }
                h.sort_unstable();
            }
        }
        let mut calentamiento = [0i64; MAX_DIAS];
        for c in calentamiento.iter_mut() {
            *c = chico(s);
        }
        let p = Pedido {
            ahora: if azar(s).is_multiple_of(50) {
                azar(s) as i64
            } else {
                ahora
            },
            contacto_hasta: if azar(s).is_multiple_of(4) {
                cerca(s)
            } else {
                0
            },
            enfriado_hasta: if azar(s).is_multiple_of(4) {
                cerca(s)
            } else {
                0
            },
            pausa: if azar(s).is_multiple_of(20) {
                azar(s) as i64
            } else {
                (azar(s) % 3_000) as i64
            },
            espera_max: if azar(s).is_multiple_of(20) {
                azar(s) as i64
            } else {
                (azar(s) % (2 * HORA as u64)) as i64
            },
            por_minuto: chico(s),
            por_hora: chico(s),
            por_dia: chico(s),
            emparejado: if azar(s).is_multiple_of(2) {
                -1
            } else {
                ahora - (azar(s) % (10 * DIA as u64)) as i64
            },
            calentamiento,
            dias: (azar(s) % 70) as i32 - 3,
            largo: if azar(s).is_multiple_of(30) {
                (azar(s) % (largo as u64 + 1)) as i32
            } else {
                largo as i32
            },
        };
        (p, h)
    }

    /// Las garantías del contrato de Ada, chequeadas sobre la copia en Rust.
    #[test]
    fn la_copia_cumple_el_contrato() {
        let mut s = 0x9E37_79B9_7F4A_7C15u64;
        for _ in 0..200_000 {
            let (p, h) = pedido_al_azar(&mut s);
            let r = decidir_rust(&p, &h);
            if r.codigo == 1 || acotar(p.contacto_hasta) > acotar(p.ahora) {
                continue;
            }
            let largo = p.largo.clamp(0, MAX_HISTORIAL as i32) as usize;
            let t = r.turno;
            assert!(
                t >= acotar(p.ahora) && t >= acotar(p.enfriado_hasta),
                "{p:?}"
            );
            assert!(r.espera <= acotar(p.espera_max));
            if largo > 0 {
                assert!(
                    t >= acotar(h[largo - 1] as i64),
                    "salió antes que el último"
                );
            }
            for (tp, v) in [(p.por_minuto, MINUTO), (p.por_hora, HORA)] {
                let tp = tope(tp);
                if tp > 0 && largo >= tp {
                    assert!(
                        t >= sumar(acotar(h[largo - tp] as i64), v),
                        "rompió un tope"
                    );
                }
            }
            assert_eq!(r.motivo == M_LIBRE, t == acotar(p.ahora));
        }
    }

    #[test]
    fn la_escalada_duplica_con_techo_y_sin_desbordar() {
        assert_eq!(escalada_rust(30_000, 1, 900_000), 30_000);
        assert_eq!(escalada_rust(30_000, 2, 900_000), 60_000);
        assert_eq!(escalada_rust(30_000, 6, 900_000), 900_000);
        assert_eq!(escalada_rust(HORA, 11, DIA), DIA);
        assert_eq!(
            escalada_rust(1, 50, i64::MAX),
            1024,
            "diez duplicaciones como mucho"
        );
        // Con `<<` esto daba basura en silencio.
        assert_eq!(escalada_rust(i64::MAX / 2, 10, i64::MAX), MAX_MS);
        assert_eq!(escalada_rust(-5, 3, 100), 0);
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_dan_lo_mismo() {
        let mut s = 0x2545_F491_4F6C_DD1Du64;
        for _ in 0..1_000_000 {
            let (p, h) = pedido_al_azar(&mut s);
            assert_eq!(decidir(&p, &h), decidir_rust(&p, &h), "{p:?} {h:?}");
        }
        let bordes = [
            i64::MIN,
            -1,
            0,
            1,
            2,
            1_000,
            30_000,
            HORA,
            DIA,
            MAX_MS / 1024,
            MAX_MS - 1,
            MAX_MS,
            MAX_MS + 1,
            i64::MAX,
        ];
        for &b in &bordes {
            for n in [i32::MIN, -1, 0, 1, 2, 5, 10, 11, 12, 100, i32::MAX] {
                for &c in &bordes {
                    let ada = unsafe { winsi_pacing_backoff(b, n, c) };
                    assert_eq!(ada, escalada_rust(b, n, c), "{b} {n} {c}");
                }
            }
        }
    }
}
