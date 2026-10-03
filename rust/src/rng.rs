//! rng.rs — aleatoriedad barata para elegir frases y mezclar listas.
//!
//! No es criptográfica y no pretende serlo: lo que hace es elegir una respuesta
//! entre quince o barajar una lista de URLs. Para las claves y los nonces el
//! proyecto usa `@brashkie/signalis-core` del lado TypeScript, que sí tiene
//! garantías.
//!
//! Se escribió en vez de sumar el crate `rand` por dos motivos concretos: `rand`
//! arrastra `getrandom` y media docena de módulos que este uso no necesita, y la
//! primera versión de `imagesearch.rs` resolvía lo mismo sacando bytes de un
//! `Uuid::new_v4()` — un truco que funcionaba pero que estaba a punto de
//! repetirse en `personality.rs`.
//!
//! El algoritmo es xorshift64*, de Vigna: un estado de 64 bits, tres
//! desplazamientos y una multiplicación. Pasa BigCrush salvo por el bit más
//! bajo, que acá no importa porque siempre se usa un módulo sobre el valor
//! completo.

use std::cell::Cell;
use std::time::{SystemTime, UNIX_EPOCH};

thread_local! {
    /// Un estado por hilo: así no hay candado ni contención entre las tareas
    /// de tokio, que es donde esto se llama.
    static ESTADO: Cell<u64> = Cell::new(0);
}

fn semilla() -> u64 {
    // El reloj solo no alcanza: varios hilos arrancando a la vez pueden leer el
    // mismo nanosegundo y quedarían con secuencias idénticas. Los bytes del
    // UUID v4 (que sí viene del generador del sistema) los separan.
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E37_79B9_7F4A_7C15);
    let u = uuid::Uuid::new_v4();
    let b = u.as_bytes();
    let mezcla = u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]);
    // El estado de xorshift NUNCA puede ser 0: desde ahí solo genera ceros.
    (t ^ mezcla) | 1
}

/// Siguiente valor de 64 bits.
pub fn next_u64() -> u64 {
    ESTADO.with(|e| {
        let mut x = e.get();
        if x == 0 {
            x = semilla();
        }
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        e.set(x);
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    })
}

/// Entero en `[0, n)`. Devuelve 0 si `n` es 0.
pub fn below(n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    (next_u64() % n as u64) as usize
}

/// Flotante en `[0, 1)`.
pub fn unit() -> f64 {
    // Los 53 bits altos son los que tienen precisión en un f64.
    (next_u64() >> 11) as f64 / (1u64 << 53) as f64
}

/// Un elemento al azar, o `None` si el slice está vacío.
pub fn pick<T>(v: &[T]) -> Option<&T> {
    v.get(below(v.len()))
}

/// Mezcla en sitio (Fisher-Yates, de atrás para adelante).
pub fn shuffle<T>(v: &mut [T]) {
    for i in (1..v.len()).rev() {
        v.swap(i, below(i + 1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn below_respeta_el_rango() {
        for n in [1usize, 2, 7, 100] {
            for _ in 0..500 {
                assert!(below(n) < n, "below({n}) se salio del rango");
            }
        }
        assert_eq!(below(0), 0, "n=0 no debe entrar en panico");
    }

    #[test]
    fn below_cubre_todos_los_valores() {
        // Con 2000 tiradas sobre 5 valores, que alguno no salga nunca seria
        // senal de que el generador esta sesgado o roto.
        let vistos: HashSet<usize> = (0..2000).map(|_| below(5)).collect();
        assert_eq!(vistos.len(), 5, "no salieron los 5 valores: {vistos:?}");
    }

    #[test]
    fn unit_esta_entre_cero_y_uno() {
        for _ in 0..2000 {
            let u = unit();
            assert!((0.0..1.0).contains(&u), "unit() dio {u}");
        }
    }

    #[test]
    fn unit_no_se_queda_en_una_mitad() {
        // Un generador roto que devuelve siempre el mismo valor, o siempre
        // valores de la misma mitad, pasaria el test de rango pero no este.
        let n = 2000;
        let bajos = (0..n).filter(|_| unit() < 0.5).count();
        assert!(
            (n / 4..n * 3 / 4).contains(&bajos),
            "reparto muy desbalanceado: {bajos} de {n} por debajo de 0.5",
        );
    }

    #[test]
    fn pick_devuelve_none_con_slice_vacio() {
        let vacio: [u32; 0] = [];
        assert!(pick(&vacio).is_none());
        assert_eq!(pick(&[42]), Some(&42));
    }

    #[test]
    fn pick_elige_entre_todos() {
        let v = ['a', 'b', 'c'];
        let vistos: HashSet<char> = (0..500).map(|_| *pick(&v).unwrap()).collect();
        assert_eq!(vistos.len(), 3);
    }

    #[test]
    fn shuffle_conserva_los_elementos() {
        let original: Vec<u32> = (0..20).collect();
        for _ in 0..50 {
            let mut v = original.clone();
            shuffle(&mut v);
            v.sort_unstable();
            assert_eq!(v, original, "no debe perder ni duplicar nada");
        }
    }

    #[test]
    fn shuffle_no_falla_con_cero_ni_un_elemento() {
        let mut vacio: Vec<u32> = vec![];
        shuffle(&mut vacio);
        assert!(vacio.is_empty());

        let mut uno = vec![7];
        shuffle(&mut uno);
        assert_eq!(uno, vec![7]);
    }

    #[test]
    fn shuffle_de_verdad_cambia_el_orden() {
        let original: Vec<u32> = (0..20).collect();
        let cambio = (0..20).any(|_| {
            let mut v = original.clone();
            shuffle(&mut v);
            v != original
        });
        assert!(cambio, "shuffle() no estaria mezclando");
    }
}
