//! Raíz de los kernels de Zig: `zig build-lib` compila un solo archivo .zig, y
//! este trae a los demás. Sin la referencia, Zig no analizaría esos archivos y
//! sus `export fn` no llegarían a la librería.

comptime {
    _ = @import("anime4k.zig");
    _ = @import("jpeg.zig");
}
