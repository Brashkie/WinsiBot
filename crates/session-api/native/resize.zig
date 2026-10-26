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

/// La luminancia como `luminancia` de anime4k.rs —los mismos tres productos
/// en el mismo orden, y el redondeo de Anime4K: suma 0,5, acota y trunca—, de
/// `n` píxeles a la vez.
inline fn luma(comptime n: usize, r: @Vector(n, u8), g: @Vector(n, u8), b: @Vector(n, u8)) @Vector(n, u8) {
    const F = @Vector(n, f32);
    const l = @as(F, @floatFromInt(r)) * @as(F, @splat(0.299)) +
        @as(F, @floatFromInt(g)) * @as(F, @splat(0.587)) +
        @as(F, @floatFromInt(b)) * @as(F, @splat(0.114));
    return @intFromFloat(@min(@max(l + @as(F, @splat(0.5)), @as(F, @splat(0.0))), @as(F, @splat(255.0))));
}

/// La luminancia de cada píxel de una fila RGBA, a su alfa. Por fila y no por
/// píxel: recién escrita, la fila todavía está en la caché, y de a 8 píxeles
/// es vectorial. Calculada píxel por píxel dentro del bucle del redimensionado
/// costaba ~35 ms en un hilo sobre 3072x2048, contra ~10 del recorrido aparte.
fn lumaFila(fila: [*]u8, ancho: usize) void {
    const N = 8;
    var x: usize = 0;
    while (x + N <= ancho) : (x += N) {
        const px: @Vector(4 * N, u8) = fila[x * 4 ..][0 .. 4 * N].*;
        const canal = struct {
            fn de(comptime k: usize) [N]i32 {
                var m: [N]i32 = undefined;
                for (0..N) |i| m[i] = @intCast(i * 4 + k);
                return m;
            }
            fn conAlfa() [4 * N]i32 {
                var m: [4 * N]i32 = undefined;
                for (0..N) |i| {
                    for (0..3) |k| m[i * 4 + k] = @intCast(i * 4 + k);
                    m[i * 4 + 3] = ~@as(i32, @intCast(i));
                }
                return m;
            }
        };
        const r: @Vector(N, u8) = @shuffle(u8, px, undefined, canal.de(0));
        const g: @Vector(N, u8) = @shuffle(u8, px, undefined, canal.de(1));
        const b: @Vector(N, u8) = @shuffle(u8, px, undefined, canal.de(2));
        fila[x * 4 ..][0 .. 4 * N].* = @shuffle(u8, px, luma(N, r, g, b), canal.conAlfa());
    }
    while (x < ancho) : (x += 1) {
        const p = fila + x * 4;
        p[3] = luma(1, .{p[0]}, .{p[1]}, .{p[2]})[0];
    }
}

/// Como `FloatNearest(clamp(t, 0, 255)).round()` del crate, sin @round —trunca
/// y suma uno si la fracción llega a 0,5—, en los cuatro canales a la vez.
/// Escrito como vector a propósito: canal por canal, con la luminancia pisando el alfa en medio, LLVM dejó de juntarlos
/// y el redimensionado pasó de ~55 a ~97 ms en un hilo.
inline fn a_u8x4(t: V4) @Vector(4, u8) {
    const c = @min(@max(t, @as(V4, @splat(0.0))), @as(V4, @splat(255.0)));
    const i: @Vector(4, u32) = @intFromFloat(c); // trunca
    const frac = c - @as(V4, @floatFromInt(i));
    const uno: @Vector(4, u32) = @intFromBool(frac >= @as(V4, @splat(0.5)));
    return @intCast(i + uno);
}

/// Las filas de salida [y0, y1). `vy_*` dicen, por fila de salida, desde qué
/// fila de entrada (`left`), cuántas (`n`) y con qué pesos (`maxt` por fila);
/// `hx_*` lo mismo por columna. `fila` es un búfer de `w_in * 4` f32, propio
/// de cada hilo.
///
/// Con `luma` distinto de 0, el alfa de la salida es la luminancia de su RGB,
/// lo que Anime4K pide al empezar (luminancia_en_alfa): #upscale ya no
/// recorre la imagen otra vez después (ver lumaFila).
///
/// Se probó también leer RGB directo (3 bytes por píxel) para no convertir a
/// RGBA antes: más lento, ~68 contra ~62 ms en un hilo sobre 1536x1024 → x2,
/// porque de a 3 bytes la carga no es un vector. Convertir antes cuesta 2,4 ms.
pub fn winsi_resize_rgba(
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
    luma_: u32,
) callconv(.C) void {
    const con_luma = luma_ != 0;
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
            (out + ox * 4)[0..4].* = a_u8x4(t);
        }
        if (con_luma) lumaFila(out, ancho_out);
    }
}
