// Inspecciona un modelo ONNX: nombres y formas de entrada y salida.
// Hace falta para implementar el pre/post-procesado sin adivinar.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ruta = std::env::args().nth(1).expect("ruta del .onnx");
    let sesion = ort::session::Session::builder()?.commit_from_file(&ruta)?;

    println!("modelo: {ruta}");
    println!("\nentradas:");
    for e in sesion.inputs() {
        println!("  {:<14} {:?}", e.name(), e.dtype());
    }
    println!("\nsalidas:");
    for s in sesion.outputs() {
        println!("  {:<14} {:?}", s.name(), s.dtype());
    }
    Ok(())
}
