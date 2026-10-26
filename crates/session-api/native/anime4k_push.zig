//! anime4k_push.zig — pushColor y pushGradient de Anime4K, de a 8 píxeles y sin saltos.
//!
//! Mismo cálculo que `push_color_rust` y `push_gradient_rust` en
//! src/anime4k.rs, que son la referencia: los tests de Rust exigen que dé lo
//! mismo BIT A BIT sobre imágenes al azar, como a la versión en C.
//!
//! Por qué no estaban vectorizados: cada píxel elige entre ocho direcciones
//! según sus vecinos, y en C eso es una cadena de `if`. Medido en la 8.17.0,
//! eran más de la mitad de `#upscale` (84 + 70 ms sobre 3072x2048), ~150 ciclos
//! por píxel para unas pocas comparaciones: casi todo eran saltos mal
//! predichos, porque los bordes de una imagen no siguen ningún patrón.
//!
//! Acá los ocho carriles evalúan TODAS las condiciones a la vez como máscaras
//! y el empuje se aplica con `@select` solo en los carriles que lo piden. Un
//! empuje que ningún carril pide no se calcula (`@reduce(.Or, ...)`), así que
//! una zona plana cuesta casi nada.
//!
//! Por qué da lo mismo bit a bit: cada carril hace las mismas operaciones de
//! f32 y en el mismo orden que la versión escalar —((a + b) + c) / 3, después
//! mc * (1 - f) + media * f—, y Zig no fusiona `a * b + c` en una FMA salvo que
//! se le pida con @mulAdd. El redondeo es el mismo: suma 0,5, acota a [0, 255]
//! y trunca (nada de @round, que en x86 básico es una llamada a libm).
//!
//! El cálculo está escrito UNA vez, genérico en la cantidad de carriles: el
//! interior va de a 8, cargando los vecinos de memoria contigua; los bordes y
//! la cola van de a 1, con los vecinos acotados a la imagen, que es lo que
//! "replicar los bordes" quiere decir. Así no hay una versión escalar aparte
//! que se pueda desincronizar.

const N = 8;
const sobel = @import("anime4k.zig");

fn Px(comptime n: usize) type {
    return struct { c: [4]@Vector(n, u8) };
}

/// Los nueve píxeles de la vecindad: t/m/b (arriba, medio, abajo) × l/c/r.
fn Vec9(comptime n: usize) type {
    return struct { tl: Px(n), tc: Px(n), tr: Px(n), ml: Px(n), mm: Px(n), mr: Px(n), bl: Px(n), bc: Px(n), br: Px(n) };
}

// ── Cargar los vecinos ────────────────────────────────────────────────────────

/// `n` píxeles seguidos desde `x`, separados por canal: una carga contigua de
/// 4n bytes y un @shuffle por canal.
inline fn seguidos(comptime n: usize, fila: [*]const u8, x: usize) Px(n) {
    const bytes: @Vector(4 * n, u8) = fila[x * 4 ..][0 .. 4 * n].*;
    var p: Px(n) = undefined;
    inline for (0..4) |k| {
        const idx = comptime blk: {
            var m: [n]i32 = undefined;
            for (0..n) |i| m[i] = @intCast(i * 4 + k);
            break :blk m;
        };
        p.c[k] = @shuffle(u8, bytes, undefined, idx);
    }
    return p;
}

// Los cargadores reciben las tres filas (arriba, medio, abajo) ya elegidas:
// quien llama replica los bordes de arriba y de abajo eligiendo la fila, y así
// las filas pueden venir de la imagen o de un búfer de tres filas (el Sobel
// fusionado, abajo).

/// Los n píxeles más sus vecinos de los costados dentro de la fila: todo se
/// carga de memoria contigua.
inline fn interior(comptime n: usize, a: [*]const u8, m: [*]const u8, b: [*]const u8, x: usize) Vec9(n) {
    return .{
        .tl = seguidos(n, a, x - 1), .tc = seguidos(n, a, x), .tr = seguidos(n, a, x + 1),
        .ml = seguidos(n, m, x - 1), .mm = seguidos(n, m, x), .mr = seguidos(n, m, x + 1),
        .bl = seguidos(n, b, x - 1), .bc = seguidos(n, b, x), .br = seguidos(n, b, x + 1),
    };
}

/// Cualquier columna: los vecinos de los costados acotados a la fila (bordes
/// replicados).
inline fn acotado(comptime n: usize, a: [*]const u8, m: [*]const u8, b: [*]const u8, w: usize, x: usize) Vec9(n) {
    var v: Vec9(n) = undefined;
    inline for (.{ .{ "tl", -1, 0 }, .{ "tc", 0, 0 }, .{ "tr", 1, 0 }, .{ "ml", -1, 1 }, .{ "mm", 0, 1 }, .{ "mr", 1, 1 }, .{ "bl", -1, 2 }, .{ "bc", 0, 2 }, .{ "br", 1, 2 } }) |d| {
        const fila = switch (d[2]) {
            0 => a,
            1 => m,
            else => b,
        };
        var p: Px(n) = undefined;
        inline for (0..n) |i| {
            const xi = x + i;
            const fx = if (d[1] < 0) (if (xi == 0) 0 else xi - 1) else if (d[1] > 0) (if (xi == w - 1) xi else xi + 1) else xi;
            inline for (0..4) |k| p.c[k][i] = fila[fx * 4 + k];
        }
        @field(v, d[0]) = p;
    }
    return v;
}

// ── Lo común ──────────────────────────────────────────────────────────────────

inline fn falso(comptime n: usize) @Vector(n, bool) {
    return @splat(false);
}
/// `a and b`, carril por carril (los vectores de bool no tienen `&` en Zig 0.14).
inline fn y_(comptime n: usize, a: @Vector(n, bool), b: @Vector(n, bool)) @Vector(n, bool) {
    return @select(bool, a, b, falso(n));
}
inline fn no(comptime n: usize, a: @Vector(n, bool)) @Vector(n, bool) {
    return @select(bool, a, falso(n), @as(@Vector(n, bool), @splat(true)));
}

inline fn max3(a: anytype, b: @TypeOf(a), c: @TypeOf(a)) @TypeOf(a) {
    return @max(@max(a, b), c);
}
inline fn min3(a: anytype, b: @TypeOf(a), c: @TypeOf(a)) @TypeOf(a) {
    return @min(@min(a, b), c);
}

inline fn aF(comptime n: usize, v: @Vector(n, u8)) @Vector(n, f32) {
    return @floatFromInt(v);
}

/// Como `redondear` en Rust: suma 0,5, acota a [0, 255] y trunca.
inline fn redondear(comptime n: usize, v: @Vector(n, f32)) @Vector(n, u8) {
    const s = v + @as(@Vector(n, f32), @splat(0.5));
    const c = @min(@max(s, @as(@Vector(n, f32), @splat(0.0))), @as(@Vector(n, f32), @splat(255.0)));
    return @intFromFloat(c);
}

/// Empuja `mc` hacia el promedio de a, b, c en los carriles de `m`. Si ningún
/// carril lo pide, no se calcula.
inline fn empujar(comptime n: usize, mc: *[4]@Vector(n, f32), a: Px(n), b: Px(n), c: Px(n), f: f32, comptime alfa_fija: bool, m: @Vector(n, bool)) void {
    if (!@reduce(.Or, m)) return;
    const resto: @Vector(n, f32) = @splat(1.0 - f);
    const fv: @Vector(n, f32) = @splat(f);
    const tres: @Vector(n, f32) = @splat(3.0);
    const canales = if (alfa_fija) 3 else 4;
    inline for (0..canales) |i| {
        const media = (aF(n, a.c[i]) + aF(n, b.c[i]) + aF(n, c.c[i])) / tres;
        mc[i] = @select(f32, m, mc[i] * resto + media * fv, mc[i]);
    }
    if (alfa_fija) mc[3] = @select(f32, m, @as(@Vector(n, f32), @splat(255.0)), mc[3]);
}

/// "Uno arriba y el otro abajo": min(primeros) > A y A > max(segundos).
inline fn entre(comptime n: usize, lo: @Vector(n, u8), a: @Vector(n, u8), hi: @Vector(n, u8)) @Vector(n, bool) {
    return y_(n, lo > a, a > hi);
}

// ── pushColor ─────────────────────────────────────────────────────────────────

/// Los cuatro bloques EN CADENA sobre el mismo `mc`: cada uno ve el alfa que
/// dejó el anterior, como en la referencia.
inline fn pushColor(comptime n: usize, v: Vec9(n), f: f32) [4]@Vector(n, u8) {
    var mc: [4]@Vector(n, f32) = undefined;
    inline for (0..4) |k| mc[k] = aF(n, v.mm.c[k]);
    const tl = v.tl.c[3];
    const tc = v.tc.c[3];
    const tr = v.tr.c[3];
    const ml = v.ml.c[3];
    const mr = v.mr.c[3];
    const bl = v.bl.c[3];
    const bc = v.bc.c[3];
    const br = v.br.c[3];

    // arriba y abajo
    var a = redondear(n, mc[3]);
    var c1 = entre(n, min3(tl, tc, tr), a, max3(bl, bc, br));
    var c2 = y_(n, no(n, c1), entre(n, min3(bl, bc, br), a, max3(tl, tc, tr)));
    empujar(n, &mc, v.tl, v.tc, v.tr, f, false, c1);
    empujar(n, &mc, v.bl, v.bc, v.br, f, false, c2);
    // subdiagonal
    a = redondear(n, mc[3]);
    c1 = min3(tc, tr, mr) > max3(ml, a, bc);
    c2 = y_(n, no(n, c1), min3(ml, bl, bc) > max3(tc, a, mr));
    empujar(n, &mc, v.tc, v.tr, v.mr, f, false, c1);
    empujar(n, &mc, v.ml, v.bl, v.bc, f, false, c2);
    // izquierda y derecha
    a = redondear(n, mc[3]);
    c1 = entre(n, min3(tr, mr, br), a, max3(tl, ml, bl));
    c2 = y_(n, no(n, c1), entre(n, min3(tl, ml, bl), a, max3(tr, mr, br)));
    empujar(n, &mc, v.tr, v.mr, v.br, f, false, c1);
    empujar(n, &mc, v.tl, v.ml, v.bl, f, false, c2);
    // diagonal
    a = redondear(n, mc[3]);
    c1 = min3(mr, br, bc) > max3(tc, a, ml);
    c2 = y_(n, no(n, c1), min3(ml, tl, tc) > max3(bc, a, mr));
    empujar(n, &mc, v.mr, v.br, v.bc, f, false, c1);
    empujar(n, &mc, v.ml, v.tl, v.tc, f, false, c2);

    var out: [4]@Vector(n, u8) = undefined;
    inline for (0..4) |k| out[k] = redondear(n, mc[k]);
    return out;
}

// ── pushGradient ──────────────────────────────────────────────────────────────

/// Sale en la PRIMERA dirección que coincide (una cadena de else-if). El alfa
/// de salida es siempre 255: con dirección lo fija el empuje, sin ella también.
inline fn pushGradient(comptime n: usize, v: Vec9(n), f: f32) [4]@Vector(n, u8) {
    var mc: [4]@Vector(n, f32) = undefined;
    inline for (0..4) |k| mc[k] = aF(n, v.mm.c[k]);
    const ma = v.mm.c[3];
    const tl = v.tl.c[3];
    const tc = v.tc.c[3];
    const tr = v.tr.c[3];
    const ml = v.ml.c[3];
    const mr = v.mr.c[3];
    const bl = v.bl.c[3];
    const bc = v.bc.c[3];
    const br = v.br.c[3];

    const conds = [8]@Vector(n, bool){
        entre(n, min3(tl, tc, tr), ma, max3(bl, bc, br)),
        entre(n, min3(bl, bc, br), ma, max3(tl, tc, tr)),
        min3(tc, tr, mr) > max3(ml, ma, bc),
        min3(ml, bl, bc) > max3(tc, ma, mr),
        entre(n, min3(tr, mr, br), ma, max3(tl, ml, bl)),
        entre(n, min3(tl, ml, bl), ma, max3(tr, mr, br)),
        min3(mr, br, bc) > max3(tc, ma, ml),
        min3(ml, tl, tc) > max3(bc, ma, mr),
    };
    const trios = .{
        .{ v.tl, v.tc, v.tr }, .{ v.bl, v.bc, v.br }, .{ v.tc, v.tr, v.mr }, .{ v.ml, v.bl, v.bc },
        .{ v.tr, v.mr, v.br }, .{ v.tl, v.ml, v.bl }, .{ v.mr, v.br, v.bc }, .{ v.ml, v.tl, v.tc },
    };
    // Cada carril toma la primera que le coincide: las de después quedan
    // tapadas por las de antes. Se empuja por dirección, y una dirección que
    // ningún carril pide no se calcula. Se probó elegir primero los vecinos
    // con máscaras y empujar una sola vez: sale MÁS lento (48 → 63 ms sobre
    // 3072x2048), porque en una imagen real la mayoría de las direcciones no
    // las pide nadie y saltearlas es gratis, mientras que elegir se paga
    // siempre.
    var tomado = falso(n);
    inline for (0..8) |i| {
        const m = y_(n, conds[i], no(n, tomado));
        empujar(n, &mc, trios[i][0], trios[i][1], trios[i][2], f, true, m);
        tomado = @select(bool, conds[i], @as(@Vector(n, bool), @splat(true)), tomado);
    }

    var out: [4]@Vector(n, u8) = undefined;
    inline for (0..3) |k| out[k] = redondear(n, mc[k]);
    out[3] = @splat(255);
    return out;
}

/// pushGradient, y en el alfa la luminancia del resultado en vez de 255: lo
/// que la pasada siguiente de Anime4K calcula de entrada (luminancia_en_alfa en
/// Rust), hecho acá mientras los píxeles todavía están en registros. Las mismas
/// operaciones en el mismo orden que `luminancia` en Rust —sin FMA, Zig no las
/// contrae—, así que da lo mismo bit a bit.
inline fn pushGradientLuma(comptime n: usize, v: Vec9(n), f: f32) [4]@Vector(n, u8) {
    var out = pushGradient(n, v, f);
    const l = aF(n, out[0]) * @as(@Vector(n, f32), @splat(0.299)) +
        aF(n, out[1]) * @as(@Vector(n, f32), @splat(0.587)) +
        aF(n, out[2]) * @as(@Vector(n, f32), @splat(0.114));
    out[3] = redondear(n, l);
    return out;
}

// ── Recorrer la imagen ────────────────────────────────────────────────────────

/// Los cuatro canales de vuelta a RGBA intercalado. De a 8: los canales
/// juntos en un vector de 32 bytes, UN @shuffle y UNA escritura; antes eran
/// 32 escrituras de un byte, el espejo de lo que `seguidos` ya hacía bien al
/// cargar. (Con @bitCast a vectores de u16 el LLVM de Zig 0.14 fallaba.)
inline fn guardar(comptime n: usize, salida: [*]u8, x: usize, out: [4]@Vector(n, u8)) void {
    if (n == 1) {
        inline for (0..4) |k| salida[x * 4 + k] = out[k][0];
        return;
    }
    const a0: [n]u8 = out[0];
    const a1: [n]u8 = out[1];
    const a2: [n]u8 = out[2];
    const a3: [n]u8 = out[3];
    const juntos: @Vector(4 * n, u8) = a0 ++ a1 ++ a2 ++ a3;
    salida[x * 4 ..][0 .. 4 * n].* = @shuffle(u8, juntos, undefined, intercalarRgba(n));
}

/// Del orden r0..r7 g0..g7 b0..b7 a0..a7 al de los píxeles: r0 g0 b0 a0 r1 …
fn intercalarRgba(comptime n: usize) [4 * n]i32 {
    var m: [4 * n]i32 = undefined;
    for (0..n) |i| {
        for (0..4) |k| m[i * 4 + k] = @intCast(k * n + i);
    }
    return m;
}

/// Una fila de salida a partir de sus tres filas de entrada.
inline fn unaFila(comptime kernel: anytype, a: [*]const u8, m: [*]const u8, b: [*]const u8, salida: [*]u8, w: usize, f: f32) void {
    var x: usize = 0;
    if (w >= N + 2) {
        guardar(1, salida, 0, kernel(1, acotado(1, a, m, b, w, 0), f));
        x = 1;
        // De a 8 mientras el vecino derecho del último (x + 8) siga dentro.
        while (x + N <= w - 1) : (x += N) {
            guardar(N, salida, x, kernel(N, interior(N, a, m, b, x), f));
        }
    }
    while (x < w) : (x += 1) {
        guardar(1, salida, x, kernel(1, acotado(1, a, m, b, w, x), f));
    }
}

fn recorrer(comptime kernel: anytype, src: [*]const u8, dst: [*]u8, w32: u32, h32: u32, f: f32, y0: u32, y1: u32) void {
    // Todo lo de arriba es `inline` y se expande acá: las máscaras y los
    // `inline for` pasan de lejos las 1000 ramas que Zig deja evaluar al
    // compilar por defecto.
    @setEvalBranchQuota(100_000);
    const w: usize = w32;
    const h: usize = h32;
    var y: usize = y0;
    while (y < @min(y1, h32)) : (y += 1) {
        const yn = if (y == 0) 0 else y - 1;
        const yp = if (y == h - 1) y else y + 1;
        unaFila(kernel, src + yn * w * 4, src + y * w * 4, src + yp * w * 4, dst + y * w * 4, w, f);
    }
}

/// pushColor de las filas [y0, y1) de la salida (Rust reparte franjas entre núcleos).
pub fn winsi_a4k_push_color_zig(src: [*]const u8, dst: [*]u8, w: u32, h: u32, f: f32, y0: u32, y1: u32) callconv(.C) void {
    recorrer(pushColor, src, dst, w, h, f, y0, y1);
}

/// pushGradient de las filas [y0, y1) de la salida.
pub fn winsi_a4k_push_gradient_zig(src: [*]const u8, dst: [*]u8, w: u32, h: u32, f: f32, y0: u32, y1: u32) callconv(.C) void {
    recorrer(pushGradient, src, dst, w, h, f, y0, y1);
}

/// El Sobel y pushGradient JUNTOS, de las filas [y0, y1) de la salida: lo
/// mismo que winsi_a4k_gradient_zig seguido de winsi_a4k_push_gradient_zig,
/// bit a bit, sin la imagen del gradiente en el medio.
///
/// Separados, el Sobel escribía una imagen entera (25 MB sobre 3072x2048) y
/// pushGradient la volvía a leer. Acá cada fila del gradiente se calcula en
/// `anillo` —tres filas, w·4·3 bytes, que entran en la caché— justo cuando
/// hace falta, y se usa enseguida. Cada hilo recalcula las filas de gradiente
/// de los bordes de su franja: una fila más arriba y una más abajo.
///
/// Con `luma` distinto de 0, el alfa de la salida es su luminancia (ver
/// pushGradientLuma): la pasada siguiente no tiene que recorrer la imagen otra
/// vez para calcularla.
pub fn winsi_a4k_gradient_push_zig(src: [*]const u8, dst: [*]u8, w32: u32, h32: u32, f: f32, y0: u32, y1: u32, anillo: [*]u8, luma: u32) callconv(.C) void {
    @setEvalBranchQuota(100_000);
    const w: usize = w32;
    const h: usize = h32;
    const largo = w * 4;
    // Qué fila del gradiente tiene cada lugar del anillo. Las tres que usa una
    // fila de salida son consecutivas, así que `r % 3` nunca se pisa.
    var en = [3]usize{ ~@as(usize, 0), ~@as(usize, 0), ~@as(usize, 0) };
    const G = struct {
        fn fila_(r: usize, s: [*]const u8, ww: usize, hh: usize, an: [*]u8, cache: *[3]usize) [*]const u8 {
            const lugar = r % 3;
            const destino = an + lugar * ww * 4;
            if (cache[lugar] != r) {
                const esInterior = hh >= 3 and r >= 1 and r + 1 < hh;
                const arriba = s + (if (esInterior) r - 1 else r) * ww * 4;
                const abajo = s + (if (esInterior) r + 1 else r) * ww * 4;
                sobel.filaSobel(arriba, s + r * ww * 4, abajo, destino, ww, esInterior);
                cache[lugar] = r;
            }
            return destino;
        }
    };
    var y: usize = y0;
    while (y < @min(y1, h32)) : (y += 1) {
        const yn = if (y == 0) 0 else y - 1;
        const yp = if (y == h - 1) y else y + 1;
        const a = G.fila_(yn, src, w, h, anillo, &en);
        const m = G.fila_(y, src, w, h, anillo, &en);
        const b = G.fila_(yp, src, w, h, anillo, &en);
        if (luma != 0) {
            unaFila(pushGradientLuma, a, m, b, dst + y * largo, w, f);
        } else {
            unaFila(pushGradient, a, m, b, dst + y * largo, w, f);
        }
    }
}

/// Un anillo de filas calculadas a pedido: el lugar `r % n` guarda la fila `r`.
fn Anillo(comptime n: usize) type {
    return struct {
        mem: [*]u8,
        largo: usize,
        en: [n]usize = [_]usize{~@as(usize, 0)} ** n,

        /// El lugar de la fila `r`, y si ya estaba calculada.
        fn lugar(self: *@This(), r: usize) struct { p: [*]u8, lista: bool } {
            const i = r % n;
            const lista = self.en[i] == r;
            self.en[i] = r;
            return .{ .p = self.mem + i * self.largo, .lista = lista };
        }
    };
}

/// Una PASADA entera de Anime4K, filas [y0, y1) de la salida: pushColor, el
/// Sobel y pushGradient —y, con `luma`, la luminancia de la pasada siguiente—,
/// sin ninguna imagen intermedia. Lo mismo, bit a bit, que
/// winsi_a4k_push_color_zig seguido de winsi_a4k_gradient_push_zig.
///
/// Por qué: con los núcleos ocupados, la pasada deja de estar limitada por el
/// cálculo y pasa a estarlo por la memoria. Separados, pushColor escribía una
/// imagen entera (25 MB sobre 3072x2048) para que el Sobel la volviera a leer.
/// Acá cada fila de pushColor se calcula en un anillo de CINCO filas —el
/// Sobel de la fila r pide las de pushColor r-1..r+1, y el empuje de la fila y
/// pide las del Sobel y-1..y+1, o sea pushColor y-2..y+2— y el Sobel en otro de
/// tres, como en winsi_a4k_gradient_push_zig. Los dos entran en la caché: la
/// imagen se lee una vez y se escribe una vez por pasada. Cada hilo recalcula
/// dos filas de pushColor de más arriba y abajo de su franja.
///
/// `anillo_c` mide 5·w·4 bytes y `anillo_g`, 3·w·4.
pub fn winsi_a4k_pass_zig(src: [*]const u8, dst: [*]u8, w32: u32, h32: u32, fc: f32, fg: f32, y0: u32, y1: u32, anillo_c: [*]u8, anillo_g: [*]u8, luma: u32) callconv(.C) void {
    @setEvalBranchQuota(100_000);
    const w: usize = w32;
    const h: usize = h32;
    const largo = w * 4;
    var color = Anillo(5){ .mem = anillo_c, .largo = largo };
    var grad = Anillo(3){ .mem = anillo_g, .largo = largo };

    const F = struct {
        /// La fila `r` de la salida de pushColor.
        fn deColor(r: usize, s: [*]const u8, ww: usize, hh: usize, f: f32, an: *Anillo(5)) [*]const u8 {
            @setEvalBranchQuota(100_000);
            const l = an.lugar(r);
            if (!l.lista) {
                const rn = if (r == 0) 0 else r - 1;
                const rp = if (r == hh - 1) r else r + 1;
                unaFila(pushColor, s + rn * ww * 4, s + r * ww * 4, s + rp * ww * 4, l.p, ww, f);
            }
            return l.p;
        }
        /// La fila `r` del Sobel, sobre la salida de pushColor.
        fn deSobel(r: usize, s: [*]const u8, ww: usize, hh: usize, f: f32, an: *Anillo(5), ag: *Anillo(3)) [*]const u8 {
            const l = ag.lugar(r);
            if (!l.lista) {
                const esInterior = hh >= 3 and r >= 1 and r + 1 < hh;
                const arriba = deColor(if (esInterior) r - 1 else r, s, ww, hh, f, an);
                const medio = deColor(r, s, ww, hh, f, an);
                const abajo = deColor(if (esInterior) r + 1 else r, s, ww, hh, f, an);
                sobel.filaSobel(arriba, medio, abajo, l.p, ww, esInterior);
            }
            return l.p;
        }
    };

    var y: usize = y0;
    while (y < @min(y1, h32)) : (y += 1) {
        const yn = if (y == 0) 0 else y - 1;
        const yp = if (y == h - 1) y else y + 1;
        const a = F.deSobel(yn, src, w, h, fc, &color, &grad);
        const m = F.deSobel(y, src, w, h, fc, &color, &grad);
        const b = F.deSobel(yp, src, w, h, fc, &color, &grad);
        if (luma != 0) {
            unaFila(pushGradientLuma, a, m, b, dst + y * largo, w, fg);
        } else {
            unaFila(pushGradient, a, m, b, dst + y * largo, w, fg);
        }
    }
}
