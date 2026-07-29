// platform.rs — detección de plataforma para winsibot-session-api.
//
// OS/ARCH/FAMILY vienen de std::env::consts — son constantes fijadas en
// tiempo de compilación (el binario para Linux ya "sabe" que es Linux, no
// hay nada que detectar en runtime), así que esto es de costo cero. Lo único
// que sí es información real de la máquina en la que corre este proceso es
// el número de núcleos, que si varía según el server.
//
// Sirve para lo mismo que ya resuelve src/lib/platform.ts del lado de
// Node/TS (IS_WINDOWS/IS_MAC/IS_LINUX, exeName…): un solo lugar del que
// leer la plataforma en vez de esparcir cfg!(...) sueltos por el código, más
// visibilidad real en logs/`/health` para diagnosticar en qué máquina está
// corriendo cada instancia cuando esto se despliegue en varios servidores.
//
// Es una tercera implementación (Node/TS, Node/JS plano, y esta) porque no
// hay forma real de compartir código entre un binario Rust separado y el
// proceso Node — a diferencia de src/lib/platform.ts vs scripts/_platform.js
// (mismo runtime, ver scripts/_platform.test.js), acá no hay un test de
// paridad posible porque no son el mismo lenguaje. La superficie que cubre
// (os/arch/cores) es intencionalmente chica para que esta duplicación no
// duela si algún día cambia.

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
}

pub fn detect() -> PlatformInfo {
    PlatformInfo {
        os:     std::env::consts::OS,
        arch:   std::env::consts::ARCH,
        family: std::env::consts::FAMILY,
        cores:  std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
    }
}

impl PlatformInfo {
    pub fn summary(&self) -> String {
        format!("{}/{} · {} núcleos", self.os, self.arch, self.cores)
    }
}
