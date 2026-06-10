fn main() {
    // DuckDB en Windows usa la API Restart Manager (rstrtmgr.lib)
    // para detectar qué procesos tienen abierto un archivo de base de datos.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-lib=rstrtmgr");
    }
}
