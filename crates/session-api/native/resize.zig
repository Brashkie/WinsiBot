//! resize.zig — redimensionado bicúbico (Catmull-Rom) de RGBA, vectorizado.
//!
//! Hace lo mismo que `image::imageops::resize(.., FilterType::CatmullRom)`, y
//! da lo mismo BIT A BIT: los tests de src/resize.rs lo comparan contra el
//! crate. Para eso:
//!
//!   - los pesos los calcula Rust con la fórmula exacta del crate, y acá solo
//!     se acumula, en el mismo orden de sumas;
//!   - cada píxel RGBA es un @Vector(4, f32): los cuatro canales en una
//!     instrucción, con las mismas multiplicaciones y sumas que el crate hace
//!     canal por canal;
//!   - el redondeo final no usa @round, que en x86-64 básico es una llamada a
//!     roundf por valor (lo aprendido en jpeg.zig): trunca y suma uno si la
//!     fracción llega a 0,5, que es exacto entre 0 y 255.
//!
//! Lo que cambia respecto del crate es la memoria: él hace la pasada vertical
//! entera a una imagen intermedia de f32 —ancho original por alto nuevo, 50 MB
//! para un x2 de 1536x1024— y después la horizontal. Acá se fusionan fila por
//! fila: cada fila de salida solo necesita SU fila intermedia, que vive en un
//! búfer de una fila por hilo. Y se procesa en franjas de filas, una por hilo.

const V4 = @Vector(4, f32);

inline fn pixel(p: [*]const u8) V4 {
    return .{ @floatFromInt(p[0]), @floatFromInt(p[1]), @floatFromInt(p[2]), @floatFromInt(p[3]) };
}

/// Como `FloatNearest(clamp(t, 0, 255)).round()` del crate, sin @round.
inline fn a_u8(t: f32) u8 {
    const c = @min(@max(t, 0.0), 255.0);
    const i: u32 = @intFromFloat(c); // trunca
    const frac = c - @as(f32, @floatFromInt(i));
    return @intCast(if (frac >= 0.5) i + 1 else i);
}

/// Las filas de salida [y0, y1). `vy_*` dicen, por fila de salida, desde qué
/// fila de entrada (`left`), cuántas (`n`) y con qué pesos (`maxt` por fila);
/// `hx_*` lo mismo por columna. `fila` es un búfer de `w_in * 4` f32, propio
/// de cada hilo.
export fn winsi_resize_rgba(
    src: [*]const u8,
    w_in: u32,
    dst: [*]u8,
    w_out: u32,
    vy_left: [*]const u32,
    vy_n: [*]const u32,
    vy_w: [*]const f32,
    hx_left: [*]const u32,
    hx_n: [*]const u32,
    hx_w: [*]const f32,
    maxt: u32,
    y0: u32,
    y1: u32,
    fila: [*]f32,
) callconv(.C) void {
    const ancho_in: usize = w_in;
    const ancho_out: usize = w_out;
    const mt: usize = maxt;

    var y: usize = y0;
    while (y < y1) : (y += 1) {
        // ── Vertical: la fila intermedia y, a partir de las filas de entrada.
        const left: usize = vy_left[y];
        const n: usize = vy_n[y];
        const ws = vy_w + y * mt;
        var x: usize = 0;
        while (x < ancho_in) : (x += 1) {
            var t: V4 = @splat(0.0);
            var i: usize = 0;
            while (i < n) : (i += 1) {
                t += pixel(src + ((left + i) * ancho_in + x) * 4) * @as(V4, @splat(ws[i]));
            }
            (fila + x * 4)[0..4].* = t;
        }

        // ── Horizontal: la fila de salida, a partir de la intermedia.
        const out = dst + y * ancho_out * 4;
        var ox: usize = 0;
        while (ox < ancho_out) : (ox += 1) {
            const l: usize = hx_left[ox];
            const m: usize = hx_n[ox];
            const hw = hx_w + ox * mt;
            var t: V4 = @splat(0.0);
            var i: usize = 0;
            while (i < m) : (i += 1) {
                const v: V4 = (fila + (l + i) * 4)[0..4].*;
                t += v * @as(V4, @splat(hw[i]));
            }
            out[ox * 4 + 0] = a_u8(t[0]);
            out[ox * 4 + 1] = a_u8(t[1]);
            out[ox * 4 + 2] = a_u8(t[2]);
            out[ox * 4 + 3] = a_u8(t[3]);
        }
    }
}
