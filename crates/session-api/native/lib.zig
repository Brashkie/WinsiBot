//! Raíz de los kernels de Zig en baseline: `zig build-lib` compila un solo
//! archivo .zig, y este trae a los demás. Los símbolos los exporta exports.zig,
//! sin sufijo; la versión para x86-64-v3 es lib_v3.zig.

comptime {
    @import("exports.zig").exportar("");
}
