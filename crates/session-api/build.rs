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
    // Hay kernels de Zig para x86-64-v3 en la librería (ver compilar_nativo).
    println!("cargo:rustc-check-cfg=cfg(winsi_v3)");
    println!("cargo:rerun-if-changed=ada/src/");
    println!("cargo:rustc-check-cfg=cfg(winsi_ada)");

    #[cfg(feature = "native")]
    compilar_nativo();
    #[cfg(feature = "ada")]
    compilar_ada();
}

/// El antirrobo de grupos en Ada/SPARK (ada/src/group_guard.adb), a un objeto
/// que se enlaza dentro del binario.
///
/// `-gnatp` quita los chequeos en tiempo de ejecución: GNATprove ya demostró
/// que ninguno puede fallar (`alr exec -- gnatprove -P ada/group_guard.gpr`).
/// El paquete es Pure y sin elaboración, así que el objeto no pide el runtime
/// de Ada: no tiene ni un símbolo sin resolver, y enlaza también con MSVC.
#[cfg(feature = "ada")]
fn compilar_ada() {
    use std::path::PathBuf;
    use std::process::Command;

    let salida = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let gcc = std::env::var("WINSI_GNAT_GCC").unwrap_or_else(|_| "gcc".into());
    println!("cargo:rerun-if-env-changed=WINSI_GNAT_GCC");
    let objeto = salida.join("group_guard.o");

    let estado = Command::new(&gcc)
        .args(["-c", "-O2", "-gnatp", "-gnatn", "-fPIC"])
        .arg("-Iada/src")
        .arg("ada/src/group_guard.adb")
        .arg("-o")
        .arg(&objeto)
        // gcc deja el .ali junto al objeto; que no ensucie ada/src.
        .current_dir(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"))
        .status();
    match estado {
        Ok(s) if s.success() => {}
        Ok(s) => panic!("GNAT no compiló ada/src/group_guard.adb ({s:?})"),
        Err(e) => panic!(
            "no pude ejecutar `{gcc}`: {e}\n\
             La feature `ada` necesita el gcc de GNAT: con Alire, `alr exec -- cargo build\n\
             --features ada` desde ada/, o la ruta en WINSI_GNAT_GCC. Sin la feature\n\
             decide la copia en Rust."
        ),
    }

    // Una librería estática de un solo objeto, con el ar de GNAT si está junto
    // a su gcc. Con MSVC, el nombre es el que busca link.exe.
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    let lib = salida.join(if msvc { "winsi_ada.lib" } else { "libwinsi_ada.a" });
    let _ = std::fs::remove_file(&lib);
    let ar = PathBuf::from(&gcc).with_file_name(if cfg!(windows) { "ar.exe" } else { "ar" });
    let ar = if ar.exists() { ar } else { PathBuf::from("ar") };
    match Command::new(&ar).arg("crs").arg(&lib).arg(&objeto).status() {
        Ok(s) if s.success() => {}
        otro => panic!("no pude armar {} con {}: {otro:?}", lib.display(), ar.display()),
    }

    println!("cargo:rustc-link-search=native={}", salida.display());
    println!("cargo:rustc-link-lib=static=winsi_ada");
    println!("cargo:rustc-cfg=winsi_ada");
}

/// Traduce el target de Rust al de Zig.
///
/// `-mcpu=baseline` en la librería principal: el binario se publica para
/// correr en cualquier máquina, y un `x86_64_v3` ahí se moriría con
/// instrucción ilegal en una CPU sin AVX2. Lo que sí se aprovecha, desde la
/// 8.18.0, es una SEGUNDA copia de los kernels de Zig para x86-64-v3 que Rust
/// elige al arrancar si la CPU la soporta (ver compilar_nativo y src/simd.rs).
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

    // En x86-64, los kernels de Zig también para x86-64-v3 (AVX2, BMI2, FMA),
    // con sufijo `_v3` (native/lib_v3.zig): un objeto aparte que entra en la
    // misma librería, así compiler-rt va una sola vez. Rust los usa solo si la
    // CPU los soporta (src/simd.rs); el resto sigue en baseline. Medido sobre
    // #upscale en un hilo: 507 → 378 ms, igual bit a bit.
    let arch = std::env::var("CARGO_CFG_TARGET_ARCH").expect("CARGO_CFG_TARGET_ARCH");
    let objeto_v3 = (arch == "x86_64" && std::env::var("WINSI_SIN_V3").is_err()).then(|| {
        let obj = salida.join(if os == "windows" { "winsi_v3.obj" } else { "winsi_v3.o" });
        let mut c = Command::new("zig");
        c.args(["build-obj", "native/lib_v3.zig", "-OReleaseFast", "-fPIC", "-mcpu=x86_64_v3"]);
        if target != host {
            c.arg("-target").arg(zig_target(&target));
        }
        c.arg(format!("-femit-bin={}", obj.display()));
        match c.status() {
            Ok(st) if st.success() => obj,
            Ok(st) => panic!("zig build-obj (x86-64-v3) falló ({st:?}) para {target}"),
            Err(e) => panic!("no pude ejecutar `zig`: {e}"),
        }
    });
    println!("cargo:rerun-if-env-changed=WINSI_SIN_V3");

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
    if let Some(obj) = &objeto_v3 {
        cmd.arg(obj);
    }
    // WINSI_ZIG_CPU cambia el conjunto de instrucciones (`native`, `x86_64_v3`…)
    // para medir o para una máquina propia; lo publicado sigue en baseline.
    println!("cargo:rerun-if-env-changed=WINSI_ZIG_CPU");
    let cpu = std::env::var("WINSI_ZIG_CPU").unwrap_or_else(|_| "baseline".into());
    cmd.args(["-static", "-OReleaseFast", "-fPIC"]);
    cmd.arg(format!("-mcpu={cpu}"));
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
    if objeto_v3.is_some() {
        println!("cargo:rustc-cfg=winsi_v3");
    }
}
