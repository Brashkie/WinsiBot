//! Los símbolos que ve Rust, con un sufijo.
//!
//! Los kernels se compilan dos veces en x86-64: `lib.zig` en baseline (SSE2,
//! corre en cualquier PC) sin sufijo, y `lib_v3.zig` para x86-64-v3 (AVX2,
//! BMI2, FMA…) con `_v3`. Rust elige al arrancar según la CPU (src/simd.rs).
//! Es el mismo código fuente: lo que cambia son las instrucciones que el
//! compilador puede usar. En SSE2 no hay `pshufb`, así que cada @shuffle de
//! bytes —36 por cada 8 píxeles en los empujes— se arma con varias
//! instrucciones, y un vector de 8 flotantes son dos de 4.
//!
//! Da lo mismo bit a bit en las dos: Zig no fusiona `a * b + c` en una FMA
//! aunque la CPU la tenga, salvo que se le pida con @mulAdd.

const anime4k = @import("anime4k.zig");
const anime4k_push = @import("anime4k_push.zig");
const jpeg = @import("jpeg.zig");
const resize = @import("resize.zig");

pub fn exportar(comptime sufijo: []const u8) void {
    @export(&anime4k.winsi_a4k_gradient_zig, .{ .name = "winsi_a4k_gradient_zig" ++ sufijo });
    @export(&anime4k_push.winsi_a4k_push_color_zig, .{ .name = "winsi_a4k_push_color_zig" ++ sufijo });
    @export(&anime4k_push.winsi_a4k_push_gradient_zig, .{ .name = "winsi_a4k_push_gradient_zig" ++ sufijo });
    @export(&anime4k_push.winsi_a4k_gradient_push_zig, .{ .name = "winsi_a4k_gradient_push_zig" ++ sufijo });
    @export(&anime4k_push.winsi_a4k_pass_zig, .{ .name = "winsi_a4k_pass_zig" ++ sufijo });
    @export(&jpeg.winsi_jpeg_scratch_len, .{ .name = "winsi_jpeg_scratch_len" ++ sufijo });
    @export(&jpeg.winsi_jpeg_coefs, .{ .name = "winsi_jpeg_coefs" ++ sufijo });
    @export(&resize.winsi_resize_rgba, .{ .name = "winsi_resize_rgba" ++ sufijo });
}
