// platform.rs — en qué máquina corre la Session API, de verdad.
//
// OS/ARCH/FAMILY vienen de std::env::consts —constantes del binario—. Lo
// demás se mira al arrancar, porque el mismo binario corre en máquinas muy
// distintas: el de aarch64-linux-android, en un teléfono de gama baja con
// núcleos chicos y en uno de gama alta con un núcleo enorme; el de x86_64, en
// una PC sin AVX2 y en otra con AVX-512.
//
//   - Las instrucciones SIMD que la CPU tiene: AVX2 y compañía en x86 (son
//     las que decide simd.rs, la copia de los kernels para AVX2), NEON,
//     dotprod, i8mm y SVE en ARM.
//   - Los núcleos por grupo de velocidad, en Linux y Android: un teléfono
//     tiene núcleos grandes y chicos, y con un reparto fijo de trabajo los
//     chicos atrasan a todos (ver anime4k::repartir, que por eso reparte en
//     tandas). Sale de la frecuencia máxima de cada núcleo, en /sys.
//   - La memoria total y la disponible, de /proc/meminfo.
//   - Si corre dentro de Termux.
//
// Va al log al arrancar y a `/health`. La lectura de /proc y /sys está en
// funciones puras, que los tests prueban con textos de ejemplo en cualquier
// sistema.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PlatformInfo {
    /// "windows" | "linux" | "macos" | "android" | ...
    pub os: &'static str,
    /// "x86_64" | "aarch64" | "arm" | ...
    pub arch: &'static str,
    /// "windows" | "unix"
    pub family: &'static str,
    /// Núcleos lógicos disponibles para este proceso — 1 si no se pudo
    /// determinar (algunos entornos con cgroups muy restrictivos).
    pub cores: usize,
    /// Las extensiones SIMD que tiene la CPU, de las que importan acá.
    pub simd: Vec<&'static str>,
    /// Núcleos por grupo de velocidad, del más rápido al más lento: en un
    /// teléfono típico `[{mhz: 2800, nucleos: 1}, {mhz: 2400, nucleos: 3},
    /// {mhz: 1800, nucleos: 4}]`. Vacío si el sistema no lo dice.
    pub grupos: Vec<GrupoNucleos>,
    pub ram_mb: Option<u64>,
    pub ram_libre_mb: Option<u64>,
    pub termux: bool,
    /// Lo que usan los kernels: hilos y tandas por hilo (ver anime4k.rs).
    pub hilos: usize,
    pub tandas_por_hilo: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GrupoNucleos {
    pub mhz: u32,
    pub nucleos: u32,
}

pub fn detect() -> PlatformInfo {
    let (ram_mb, ram_libre_mb) = memoria();
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        family: std::env::consts::FAMILY,
        cores: std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1),
        simd: simd(),
        grupos: grupos(),
        ram_mb,
        ram_libre_mb,
        termux: std::env::var("PREFIX").is_ok_and(|p| p.contains("com.termux"))
            || std::env::var_os("TERMUX_VERSION").is_some(),
        hilos: crate::anime4k::hilos(),
        tandas_por_hilo: crate::anime4k::tandas_por_hilo(),
    }
}

#[cfg(target_arch = "x86_64")]
fn simd() -> Vec<&'static str> {
    let mut v = vec!["sse2"];
    if std::arch::is_x86_feature_detected!("sse4.1") {
        v.push("sse4.1");
    }
    if std::arch::is_x86_feature_detected!("avx2") {
        v.push("avx2");
    }
    if std::arch::is_x86_feature_detected!("fma") {
        v.push("fma");
    }
    if std::arch::is_x86_feature_detected!("avx512f") {
        v.push("avx512f");
    }
    v
}

#[cfg(target_arch = "aarch64")]
fn simd() -> Vec<&'static str> {
    let mut v = Vec::new();
    if std::arch::is_aarch64_feature_detected!("neon") {
        v.push("neon");
    }
    if std::arch::is_aarch64_feature_detected!("dotprod") {
        v.push("dotprod");
    }
    if std::arch::is_aarch64_feature_detected!("i8mm") {
        v.push("i8mm");
    }
    if std::arch::is_aarch64_feature_detected!("sve") {
        v.push("sve");
    }
    v
}

#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
fn simd() -> Vec<&'static str> {
    Vec::new()
}

/// Los núcleos agrupados por frecuencia máxima (en kHz, como /sys), del más
/// rápido al más lento.
pub fn agrupar(frecuencias_khz: &[u32]) -> Vec<GrupoNucleos> {
    let mut grupos: Vec<GrupoNucleos> = Vec::new();
    for &khz in frecuencias_khz {
        let mhz = khz / 1000;
        match grupos.iter_mut().find(|g| g.mhz == mhz) {
            Some(g) => g.nucleos += 1,
            None => grupos.push(GrupoNucleos { mhz, nucleos: 1 }),
        }
    }
    grupos.sort_by_key(|g| std::cmp::Reverse(g.mhz));
    grupos
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn grupos() -> Vec<GrupoNucleos> {
    let Ok(dir) = std::fs::read_dir("/sys/devices/system/cpu") else {
        return Vec::new();
    };
    let frecuencias: Vec<u32> = dir
        .flatten()
        .filter(|e| {
            let n = e.file_name();
            let n = n.to_string_lossy();
            n.len() > 3 && n.starts_with("cpu") && n[3..].bytes().all(|b| b.is_ascii_digit())
        })
        .filter_map(|e| {
            std::fs::read_to_string(e.path().join("cpufreq/cpuinfo_max_freq"))
                .ok()?
                .trim()
                .parse()
                .ok()
        })
        .collect();
    agrupar(&frecuencias)
}

#[cfg(not(any(target_os = "linux", target_os = "android")))]
fn grupos() -> Vec<GrupoNucleos> {
    Vec::new()
}

/// `MemTotal` y `MemAvailable` de un /proc/meminfo, en MB.
pub fn leer_meminfo(texto: &str) -> (Option<u64>, Option<u64>) {
    let campo = |nombre: &str| {
        texto.lines().find_map(|l| {
            let resto = l.strip_prefix(nombre)?.strip_prefix(':')?;
            let kb: u64 = resto.split_whitespace().next()?.parse().ok()?;
            Some(kb / 1024)
        })
    };
    (campo("MemTotal"), campo("MemAvailable"))
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn memoria() -> (Option<u64>, Option<u64>) {
    std::fs::read_to_string("/proc/meminfo").map_or((None, None), |t| leer_meminfo(&t))
}

#[cfg(not(any(target_os = "linux", target_os = "android")))]
fn memoria() -> (Option<u64>, Option<u64>) {
    (None, None)
}

impl PlatformInfo {
    /// "android/aarch64 · 8 núcleos (1×2800 + 3×2400 + 4×1800 MHz) · neon
    /// dotprod · RAM 3100/7600 MB · Termux · 8 hilos de a 4 tandas".
    pub fn summary(&self) -> String {
        let mut s = format!("{}/{} · {} núcleos", self.os, self.arch, self.cores);
        if self.grupos.len() > 1 {
            let g: Vec<String> = self
                .grupos
                .iter()
                .map(|g| format!("{}×{}", g.nucleos, g.mhz))
                .collect();
            s += &format!(" ({} MHz)", g.join(" + "));
        }
        if !self.simd.is_empty() {
            s += &format!(" · {}", self.simd.join(" "));
        }
        if let (Some(libre), Some(total)) = (self.ram_libre_mb, self.ram_mb) {
            s += &format!(" · RAM {libre}/{total} MB");
        }
        if self.termux {
            s += " · Termux";
        }
        let hilos = match self.hilos {
            1 => "1 hilo".to_string(),
            n => format!("{n} hilos"),
        };
        s + &format!(" · {hilos} de a {} tandas", self.tandas_por_hilo)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agrupa_los_nucleos_de_un_telefono() {
        // Un Snapdragon típico: 1 enorme, 3 grandes, 4 chicos (kHz, como /sys).
        let f = [
            1_804_800, 1_804_800, 2_419_200, 1_804_800, 2_841_600, 2_419_200, 1_804_800, 2_419_200,
        ];
        assert_eq!(
            agrupar(&f),
            [
                GrupoNucleos {
                    mhz: 2841,
                    nucleos: 1
                },
                GrupoNucleos {
                    mhz: 2419,
                    nucleos: 3
                },
                GrupoNucleos {
                    mhz: 1804,
                    nucleos: 4
                },
            ]
        );
        assert!(agrupar(&[]).is_empty());
    }

    #[test]
    fn lee_la_memoria() {
        let t = "MemTotal:        7812344 kB\nMemFree:          120000 kB\nMemAvailable:    3174400 kB\n";
        assert_eq!(leer_meminfo(t), (Some(7629), Some(3100)));
        assert_eq!(leer_meminfo("nada"), (None, None));
    }

    #[test]
    fn el_resumen_dice_lo_que_se_sabe() {
        let p = PlatformInfo {
            os: "android",
            arch: "aarch64",
            family: "unix",
            cores: 8,
            simd: vec!["neon", "dotprod"],
            grupos: agrupar(&[2_841_600, 1_804_800, 1_804_800]),
            ram_mb: Some(7629),
            ram_libre_mb: Some(3100),
            termux: true,
            hilos: 8,
            tandas_por_hilo: 4,
        };
        assert_eq!(
            p.summary(),
            "android/aarch64 · 8 núcleos (1×2841 + 2×1804 MHz) · neon dotprod · RAM 3100/7629 MB · Termux · 8 hilos de a 4 tandas"
        );
        let aqui = detect();
        assert!(aqui.cores >= 1 && aqui.hilos >= 1);
    }
}
