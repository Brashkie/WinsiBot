//! Raíz de los kernels de Zig para x86-64-v3 (AVX2): los mismos, con el sufijo
//! `_v3`. build.rs la compila aparte como objeto y la mete en la misma
//! librería; Rust la usa solo si la CPU tiene todo lo que pide (src/simd.rs).

comptime {
    @import("exports.zig").exportar("_v3");
}
