//! Compila los kernels nativos de `native/` —C y Zig— en una librería
//! estática que se enlaza dentro del binario.
//!
//! Solo con la feature `native`. Sin ella no hace nada y el crate compila sin
//! pedir nada instalado: instalar WinsiBot sigue siendo `npm install`, que baja
//! el binario ya compilado (con esta feature puesta) desde las releases.
//!
//! Una sola herramienta para los dos lenguajes: Zig también es compilador de C
//! (`zig cc`, que es clang), y además compila cruzado a cualquier target sin
//! instalar un toolchain por plataforma. Por eso alcanza con tener `zig`.

fn main() {
    println!("cargo:rerun-if-changed=native/");
    println!("cargo:rerun-if-changed=build.rs");

    #[cfg(feature = "native")]
    compilar_nativo();
}

/// Traduce el target de Rust al de Zig.
///
/// `-mcpu=baseline` en todos A PROPÓSITO: el binario de Rust tampoco pide
/// nada más que lo básico de cada arquitectura (no hay `target-cpu` en ningún
/// `.cargo/config.toml`), y la comparación tiene que ser entre lenguajes, no
/// entre conjuntos de instrucciones. Además el binario se publica para correr
/// en cualquier máquina: un `x86_64_v3` acá se moriría con instrucción ilegal
/// en una CPU sin AVX2.
#[cfg(feature = "native")]
fn zig_target(rust_target: &str) -> &'static str {
    match rust_target {
        "x86_64-pc-windows-msvc" => "x86_64-windows-msvc",
        "aarch64-pc-windows-msvc" => "aarch64-windows-msvc",
        "x86_64-unknown-linux-gnu" => "x86_64-linux-gnu",
        "aarch64-unknown-linux-gnu" => "aarch64-linux-gnu",
        "aarch64-linux-android" => "aarch64-linux-android",
        "aarch64-apple-darwin" => "aarch64-macos",
        "x86_64-apple-darwin" => "x86_64-macos",
        otro => panic!(
            "la feature `native` no sabe traducir el target {otro} al de Zig.\n\
             Agregalo en zig_target() de crates/session-api/build.rs, o compilá sin\n\
             la feature: los kernels de Rust hacen lo mismo."
        ),
    }
}

#[cfg(feature = "native")]
fn compilar_nativo() {
    use std::path::PathBuf;
    use std::process::Command;

    let salida = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let target = std::env::var("TARGET").expect("TARGET");
    let host = std::env::var("HOST").expect("HOST");
    // `TARGET` y `CARGO_CFG_TARGET_OS` y no `cfg!(...)`: un build script se
    // compila para el host, así que sus `cfg!` describen la máquina que
    // compila y no la que va a ejecutar. Lo aprendido en Cosxamix.
    let os = std::env::var("CARGO_CFG_TARGET_OS").expect("CARGO_CFG_TARGET_OS");
    let nombre = if os == "windows" {
        "winsi_native.lib"
    } else {
        "libwinsi_native.a"
    };
    let destino = salida.join(nombre);

    let mut cmd = Command::new("zig");
    // lib.zig es la raíz: trae anime4k.zig y jpeg.zig.
    cmd.args(["build-lib", "native/lib.zig"]);
    // Las banderas de C van entre `-cflags` y `--`, y valen para los .c que
    // siguen. -ffp-contract=off es la que importa: sin ella clang fusiona
    // `a*b + c` en una FMA, que redondea distinto, y los kernels dejan de dar
    // lo mismo bit a bit que Rust, que no fusiona nunca.
    cmd.args([
        "-cflags",
        "-std=c11",
        "-ffp-contract=off",
        "--",
        "native/anime4k.c",
        "native/jpeg.c",
    ]);
    cmd.args(["-static", "-OReleaseFast", "-fPIC", "-mcpu=baseline"]);
    // Compilando para la propia máquina no se pasa -target, que es lo probado
    // en Cosxamix con el mismo toolchain de Rust (MSVC en Windows).
    if target != host {
        cmd.arg("-target").arg(zig_target(&target));
    } else {
        let _ = zig_target(&target); // que un target desconocido falle igual
    }
    // `-femit-bin=RUTA` en UN argumento; separados, Zig escribe con el nombre
    // por defecto y el linker no encuentra nada.
    cmd.arg(format!("-femit-bin={}", destino.display()));

    match cmd.status() {
        Ok(s) if s.success() => {}
        Ok(s) => panic!("zig build-lib falló ({s:?}) para {target}"),
        Err(e) => panic!(
            "no pude ejecutar `zig`: {e}\n\
             La feature `native` necesita Zig instalado (https://ziglang.org). Sin la\n\
             feature el crate compila igual, con los kernels de Rust."
        ),
    }

    println!("cargo:rustc-link-search=native={}", salida.display());
    println!("cargo:rustc-link-lib=static=winsi_native");
}
