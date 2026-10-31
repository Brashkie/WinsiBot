//! El antirrobo de grupos: qué hacer cuando alguien degrada o saca a un admin.
//!
//! La decisión está escrita en Ada/SPARK (`ada/src/group_guard.ads`) y
//! GNATprove demuestra sus garantías para toda entrada: nunca actúa contra un
//! admin protegido ni contra el bot, nunca sin un autor identificado, sin ser
//! admin el bot solo avisa, y ante un ataque de verdad hace todo lo que puede.
//! Con la feature `ada` se enlaza ese objeto y se llama por la ABI de C.
//!
//! Sin la feature —sin GNAT instalado, o en Android, para el que no hay GNAT—
//! decide la copia de abajo, en Rust. No es una segunda opinión: el test
//! `rust_y_ada_dan_lo_mismo_en_toda_entrada` recorre las 1.280 entradas —los
//! tres tipos, uno inválido de cada lado y las 256 combinaciones de banderas—
//! y exige el mismo resultado, así que la copia hereda la
//! demostración. Y `la_copia_cumple_las_garantias` las vuelve a comprobar
//! sobre ella, también una por una.
//!
//! El bot la llama una vez por cada admin degradado o expulsado, no por
//! mensaje: no cuesta nada en el camino de cada mensaje.

use axum::Json;
use serde::Deserialize;

pub const DEGRADAR_AUTOR: u32 = 1;
pub const RESTAURAR_AFECTADO: u32 = 2;
pub const REVOCAR_ENLACE: u32 = 4;
pub const AVISAR_DUENO: u32 = 8;
pub const TODAS: u32 = DEGRADAR_AUTOR | RESTAURAR_AFECTADO | REVOCAR_ENLACE | AVISAR_DUENO;

/// Los bits de `banderas`, en el mismo orden que el record `Event` de Ada.
pub const ACTIVO: u32 = 1 << 0;
pub const AUTOR_CONOCIDO: u32 = 1 << 1;
pub const AUTOR_PROTEGIDO: u32 = 1 << 2;
pub const AUTOR_ES_BOT: u32 = 1 << 3;
pub const AUTOR_ES_AFECTADO: u32 = 1 << 4;
pub const AFECTADO_PROTEGIDO: u32 = 1 << 5;
pub const AFECTADO_ES_BOT: u32 = 1 << 6;
pub const BOT_ES_ADMIN: u32 = 1 << 7;

/// `tipo`: 0 ascenso, 1 degradación, 2 expulsión.
pub const ASCENSO: i32 = 0;

#[cfg(winsi_ada)]
extern "C" {
    fn winsi_group_guard_decide(kind: i32, flags: u32) -> u32;
}

/// Qué acciones tomar ante el evento. Ada si se enlazó; si no, la copia.
pub fn decidir(tipo: i32, banderas: u32) -> u32 {
    #[cfg(winsi_ada)]
    {
        // SAFETY: función pura de la ABI de C, sin punteros ni estado; GNATprove
        // demuestra que termina y que no tiene errores en tiempo de ejecución.
        unsafe { winsi_group_guard_decide(tipo, banderas) }
    }
    #[cfg(not(winsi_ada))]
    {
        decidir_rust(tipo, banderas)
    }
}

/// Quién decide en este binario.
pub const fn motor() -> &'static str {
    if cfg!(winsi_ada) {
        "ada"
    } else {
        "rust"
    }
}

/// La misma tabla que `Group_Guard.Decide`, renglón por renglón.
pub fn decidir_rust(tipo: i32, banderas: u32) -> u32 {
    if !(0..=2).contains(&tipo) {
        return 0;
    }
    let b = |m: u32| banderas & m != 0;
    let ataque = b(ACTIVO)
        && tipo != ASCENSO
        && b(AUTOR_CONOCIDO)
        && !b(AUTOR_PROTEGIDO)
        && !b(AUTOR_ES_BOT)
        && !b(AUTOR_ES_AFECTADO)
        && (b(AFECTADO_PROTEGIDO) || b(AFECTADO_ES_BOT));
    if !ataque {
        0
    } else if b(BOT_ES_ADMIN) {
        TODAS
    } else {
        AVISAR_DUENO
    }
}

#[derive(Deserialize)]
pub struct DecidirRequest {
    pub tipo: i32,
    pub banderas: u32,
}

/// POST /group/guard/decide — `{ tipo, banderas }` → `{ acciones, motor }`.
pub async fn decide(Json(req): Json<DecidirRequest>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "acciones": decidir(req.tipo, req.banderas),
        "motor": motor(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Los tres tipos válidos, uno inválido de cada lado, y las 256 banderas.
    fn todas_las_entradas() -> impl Iterator<Item = (i32, u32)> {
        (-1..=3).flat_map(|t| (0..256u32).map(move |f| (t, f)))
    }

    #[test]
    fn la_copia_cumple_las_garantias() {
        for (t, f) in todas_las_entradas() {
            let r = decidir_rust(t, f);
            let b = |m: u32| f & m != 0;
            let ctx = format!("tipo {t}, banderas {f:08b}");
            if b(AUTOR_PROTEGIDO) || b(AUTOR_ES_BOT) {
                assert_eq!(r, 0, "actuó contra un protegido: {ctx}");
            }
            if !b(AUTOR_CONOCIDO) || b(AUTOR_ES_AFECTADO) {
                assert_eq!(r, 0, "actuó sin autor o contra quien se fue solo: {ctx}");
            }
            if !b(ACTIVO) || t == ASCENSO || !(0..=2).contains(&t) {
                assert_eq!(r, 0, "actuó apagado, ante un ascenso o un tipo inválido: {ctx}");
            }
            if !b(BOT_ES_ADMIN) {
                assert!(r == 0 || r == AVISAR_DUENO, "sin ser admin hizo más que avisar: {ctx}");
            }
            assert_eq!(r & !TODAS, 0, "devolvió un bit que no es una acción: {ctx}");
        }
    }

    #[test]
    fn ante_un_ataque_hace_todo_lo_que_puede() {
        let ataque = ACTIVO | AUTOR_CONOCIDO | AFECTADO_PROTEGIDO;
        assert_eq!(decidir_rust(1, ataque | BOT_ES_ADMIN), TODAS);
        assert_eq!(decidir_rust(2, ataque | BOT_ES_ADMIN), TODAS);
        assert_eq!(decidir_rust(1, ataque), AVISAR_DUENO);
        // Sacar al bot es el primer paso de un robo.
        let contra_el_bot = ACTIVO | AUTOR_CONOCIDO | AFECTADO_ES_BOT;
        assert_eq!(decidir_rust(1, contra_el_bot), AVISAR_DUENO);
        // El dueño puede degradar a quien quiera.
        assert_eq!(decidir_rust(1, ataque | AUTOR_PROTEGIDO | BOT_ES_ADMIN), 0);
    }

    #[cfg(winsi_ada)]
    #[test]
    fn rust_y_ada_dan_lo_mismo_en_toda_entrada() {
        for (t, f) in todas_las_entradas() {
            assert_eq!(decidir(t, f), decidir_rust(t, f), "tipo {t}, banderas {f:08b}");
        }
        // Y valores de C que nunca deberían llegar.
        for t in [i32::MIN, -7, 3, 99, i32::MAX] {
            assert_eq!(decidir(t, u32::MAX), 0);
        }
        assert_eq!(decidir(1, u32::MAX & !(AUTOR_PROTEGIDO | AUTOR_ES_BOT | AUTOR_ES_AFECTADO)), TODAS);
    }
}
