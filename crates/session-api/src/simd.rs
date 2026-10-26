//! Qué versión de los kernels de Zig usar en esta CPU.
//!
//! En x86-64 la librería trae cada kernel dos veces (ver build.rs y
//! native/exports.zig): en baseline, que corre en cualquier PC, y para
//! x86-64-v3 (AVX2, BMI2, FMA…), con sufijo `_v3`. Se elige una vez, al
//! primer uso, mirando lo que la CPU dice tener —y lo que el sistema operativo
//! guarda al cambiar de hilo, que `is_x86_feature_detected!` también verifica
//! para AVX—. En ARM no hay nada que elegir: NEON es parte de la base.
//!
//! `WINSI_SIMD=baseline` fuerza la de siempre, para medir o si algo falla.

/// true si se pueden usar los kernels `_v3`.
pub fn v3() -> bool {
    #[cfg(winsi_v3)]
    {
        use std::sync::OnceLock;
        static V3: OnceLock<bool> = OnceLock::new();
        *V3.get_or_init(|| {
            std::env::var("WINSI_SIMD").as_deref() != Ok("baseline")
                && std::arch::is_x86_feature_detected!("avx2")
                && std::arch::is_x86_feature_detected!("fma")
                && std::arch::is_x86_feature_detected!("bmi1")
                && std::arch::is_x86_feature_detected!("bmi2")
                && std::arch::is_x86_feature_detected!("f16c")
                && std::arch::is_x86_feature_detected!("lzcnt")
                && std::arch::is_x86_feature_detected!("movbe")
        })
    }
    #[cfg(not(winsi_v3))]
    {
        false
    }
}

/// El nombre de lo que se está usando, para los logs y los ejemplos.
pub fn nombre() -> &'static str {
    if v3() { "x86-64-v3 (AVX2)" } else if cfg!(target_arch = "x86_64") { "baseline (SSE2)" } else { "baseline" }
}

/// Llama a un kernel de Zig en su versión `_v3` si la CPU la soporta, o en la
/// de siempre: `zig!(ffi::nombre, ffi::nombre_v3, args…)`. Sin `winsi_v3`, la
/// rama `_v3` ni se compila.
#[macro_export]
macro_rules! zig {
    ($base:path, $v3:path, $($arg:expr),* $(,)?) => {{
        #[cfg(winsi_v3)]
        {
            if $crate::simd::v3() { $v3($($arg),*) } else { $base($($arg),*) }
        }
        #[cfg(not(winsi_v3))]
        {
            $base($($arg),*)
        }
    }};
}
