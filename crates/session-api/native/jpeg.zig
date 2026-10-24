//! jpeg.zig — la mitad en Zig del codificador JPEG: color, submuestreo y DCT.
//!
//! Recibe la imagen RGB y deja los coeficientes cuantizados de cada bloque de
//! 8x8, en orden zigzag, listos para que jpeg.c los codifique con Huffman.
//!
//! Lo que se vectoriza:
//!   - la conversión a YCbCr, de a 8 píxeles por instrucción;
//!   - la DCT de cada bloque: el bloque es 8 vectores de 8 lanes, así que una
//!     pasada de la DCT de 1 dimensión transforma las 8 columnas A LA VEZ; se
//!     traspone y otra pasada hace las 8 filas;
//!   - la cuantización, 8 coeficientes por instrucción.
//!
//! La DCT es la de Arai, Agui y Nakajima (AAN) en flotante, la misma que la
//! `jfdctflt.c` de libjpeg: 5 multiplicaciones por pasada en lugar de 64, y su
//! escala propia se pliega dentro de los divisores de cuantización.

const V = @Vector(8, f32);
const Vi = @Vector(8, i16);

/// Orden zigzag: la posición k del flujo es el índice natural ZZ[k].
const ZZ = [64]u8{
    0,  1,  8,  16, 9,  2,  3,  10, 17, 24, 32, 25, 18, 11, 4,  5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6,  7,  14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
};

/// Factores de escala de la DCT AAN: cos(k·π/16)·√2, con el 0 en 1.
const AAN = [8]f32{ 1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.541196100, 0.275899379 };

inline fn s(x: f32) V {
    return @splat(x);
}

/// Una pasada de la DCT AAN sobre 8 vectores: cada lane es una secuencia de
/// 8 muestras independiente, así que se transforman 8 a la vez.
inline fn fdct(d: *[8]V) void {
    const t0 = d[0] + d[7];
    const t7 = d[0] - d[7];
    const t1 = d[1] + d[6];
    const t6 = d[1] - d[6];
    const t2 = d[2] + d[5];
    const t5 = d[2] - d[5];
    const t3 = d[3] + d[4];
    const t4 = d[3] - d[4];

    // Parte par
    const t10 = t0 + t3;
    const t13 = t0 - t3;
    const t11 = t1 + t2;
    const t12 = t1 - t2;
    d[0] = t10 + t11;
    d[4] = t10 - t11;
    const z1 = (t12 + t13) * s(0.707106781);
    d[2] = t13 + z1;
    d[6] = t13 - z1;

    // Parte impar
    const odd10 = t4 + t5;
    const odd11 = t5 + t6;
    const odd12 = t6 + t7;
    const z5 = (odd10 - odd12) * s(0.382683433);
    const z2 = s(0.541196100) * odd10 + z5;
    const z4 = s(1.306562965) * odd12 + z5;
    const z3 = odd11 * s(0.707106781);
    const z11 = t7 + z3;
    const z13 = t7 - z3;
    d[5] = z13 + z2;
    d[3] = z13 - z2;
    d[1] = z11 + z4;
    d[7] = z11 - z4;
}

fn trasponer(m: *[8]V) void {
    var a: [8][8]f32 = undefined;
    for (0..8) |i| a[i] = m[i];
    for (0..8) |i| {
        var fila: [8]f32 = undefined;
        for (0..8) |j| fila[j] = a[j][i];
        m[i] = fila;
    }
}

/// Divisores de cuantización con la escala AAN plegada, ya traspuestos para
/// el orden en que sale la DCT: `div[u]` lane `v` corresponde al coeficiente
/// natural `v*8 + u`.
fn divisores(q: *const [64]u8) [8]V {
    var d: [8]V = undefined;
    inline for (0..8) |u| {
        var fila: [8]f32 = undefined;
        inline for (0..8) |v| {
            const qi: f32 = @floatFromInt(q[v * 8 + u]);
            fila[v] = 1.0 / (qi * AAN[v] * AAN[u] * 8.0);
        }
        d[u] = fila;
    }
    return d;
}

/// DCT + cuantización de un bloque de 8x8 (filas en `m`), en zigzag a `out`.
fn bloque(m: *[8]V, div: *const [8]V, out: [*]i16) void {
    fdct(m); // columnas: m[v], lanes x
    trasponer(m); // m[x], lanes v
    fdct(m); // filas: m[u], lanes v  →  coeficiente (fila v, columna u)
    var q: [8][8]i16 = undefined;
    inline for (0..8) |u| {
        // Redondeo a lo más cercano, la mitad lejos del cero, SIN `@round`: el
        // x86-64 básico no tiene instrucción de redondeo (llegó con SSE4.1) y
        // `@round` se volvía 64 llamadas a `roundf` por bloque. Sumar ±0,5 y
        // truncar da lo mismo y es `cvttps2dq`, que SSE2 sí tiene.
        const x = m[u] * div[u];
        const medio = @select(f32, x < s(0.0), s(-0.5), s(0.5));
        const r: @Vector(8, i32) = @intFromFloat(x + medio);
        q[u] = @as(Vi, @intCast(r));
    }
    for (0..64) |k| {
        const nat = ZZ[k];
        out[k] = q[nat % 8][nat / 8];
    }
}

/// Cuántos `f32` de borrador necesita `winsi_jpeg_coefs` para una imagen de
/// ancho `w`: una franja de 16 filas de Y, Cb y Cr a resolución completa, más
/// las 8 filas de Cb y Cr submuestreadas.
export fn winsi_jpeg_scratch_len(w: u32) callconv(.C) usize {
    const pw: usize = ((w + 15) / 16) * 16;
    return 16 * pw * 3 + 8 * (pw / 2) * 2;
}

/// Convierte la fila `sy` de la imagen a Y, Cb y Cr en flotante, `pw` muestras
/// (las que pasan de `w` repiten el último píxel, como hace libjpeg).
fn fila_ycc(rgb: [*]const u8, w: usize, sy: usize, pw: usize, y: [*]f32, cb: [*]f32, cr: [*]f32) void {
    const fila = rgb + sy * w * 3;
    var x: usize = 0;
    // El interior, de a 8 píxeles por instrucción y sin recortar índices.
    while (x + 8 <= w) : (x += 8) {
        var r: [8]f32 = undefined;
        var g: [8]f32 = undefined;
        var b: [8]f32 = undefined;
        inline for (0..8) |i| {
            r[i] = @floatFromInt(fila[(x + i) * 3]);
            g[i] = @floatFromInt(fila[(x + i) * 3 + 1]);
            b[i] = @floatFromInt(fila[(x + i) * 3 + 2]);
        }
        const rv: V = r;
        const gv: V = g;
        const bv: V = b;
        y[x..][0..8].* = rv * s(0.299) + gv * s(0.587) + bv * s(0.114) - s(128.0);
        cb[x..][0..8].* = rv * s(-0.168736) + gv * s(-0.331264) + bv * s(0.5);
        cr[x..][0..8].* = rv * s(0.5) + gv * s(-0.418688) + bv * s(-0.081312);
    }
    // La cola y el relleno hasta `pw`, de a uno.
    while (x < pw) : (x += 1) {
        const p = fila + @min(x, w - 1) * 3;
        const r: f32 = @floatFromInt(p[0]);
        const g: f32 = @floatFromInt(p[1]);
        const b: f32 = @floatFromInt(p[2]);
        y[x] = r * 0.299 + g * 0.587 + b * 0.114 - 128.0;
        cb[x] = r * -0.168736 + g * -0.331264 + b * 0.5;
        cr[x] = r * 0.5 + g * -0.418688 + b * -0.081312;
    }
}

/// Coeficientes cuantizados de toda la imagen, MCU por MCU (16x16, 4:2:0):
/// cuatro bloques de luma y uno de cada croma, 6·64 `i16` por MCU, en zigzag.
///
/// Trabaja de a una franja de 16 filas: primero las pasa enteras a Y/Cb/Cr con
/// vectores (`fila_ycc`), submuestrea el color, y recién ahí arma los bloques
/// leyendo filas CONTIGUAS de 8 flotantes, que son una carga vectorial. La
/// primera versión iba píxel por píxel con un `@min` por acceso y 4 lecturas
/// por cada muestra de croma, y se llevaba 12,5 de los 18,4 ms del total.
///
/// `scratch` mide `winsi_jpeg_scratch_len(w)` flotantes: la franja, no la
/// imagen, así que la memoria extra no crece con el alto.
export fn winsi_jpeg_coefs(
    rgb: [*]const u8,
    w: u32,
    h: u32,
    qy: *const [64]u8,
    qc: *const [64]u8,
    out: [*]i16,
    scratch: [*]f32,
    my0: u32,
    my1: u32,
) callconv(.C) void {
    const div_y = divisores(qy);
    const div_c = divisores(qc);
    const ancho: usize = w;
    const mcux: usize = (w + 15) / 16;
    const mcuy: usize = (h + 15) / 16;
    const pw: usize = mcux * 16;
    const pc: usize = pw / 2;

    const Y = scratch;
    const CBf = scratch + 16 * pw;
    const CRf = scratch + 32 * pw;
    const CB = scratch + 48 * pw;
    const CR = CB + 8 * pc;

    // Solo las filas de MCU [my0, my1): Rust reparte la imagen en franjas entre
    // los núcleos. Cada franja escribe sus propios coeficientes —la posición
    // de cada MCU es fija— y tiene su propio `scratch`, así que no se pisan.
    var my: usize = my0;
    while (my < @min(my1, mcuy)) : (my += 1) {
        // La franja: 16 filas a Y/Cb/Cr, repitiendo la última si no alcanzan.
        for (0..16) |fila| {
            const sy = @min(my * 16 + fila, h - 1);
            fila_ycc(rgb, ancho, sy, pw, Y + fila * pw, CBf + fila * pw, CRf + fila * pw);
        }
        // El color, submuestreado: el promedio de cada 2x2.
        for (0..8) |cy| {
            const a = CBf + (2 * cy) * pw;
            const b = CBf + (2 * cy + 1) * pw;
            const c = CRf + (2 * cy) * pw;
            const d = CRf + (2 * cy + 1) * pw;
            for (0..pc) |cx| {
                CB[cy * pc + cx] = (a[2 * cx] + a[2 * cx + 1] + b[2 * cx] + b[2 * cx + 1]) * 0.25;
                CR[cy * pc + cx] = (c[2 * cx] + c[2 * cx + 1] + d[2 * cx] + d[2 * cx + 1]) * 0.25;
            }
        }
        // Los bloques, leyendo filas contiguas.
        var mx: usize = 0;
        while (mx < mcux) : (mx += 1) {
            const base = out + (my * mcux + mx) * 6 * 64;
            for (0..4) |blk| {
                var m: [8]V = undefined;
                const x0 = mx * 16 + (blk % 2) * 8;
                const y0 = (blk / 2) * 8;
                inline for (0..8) |i| m[i] = (Y + (y0 + i) * pw + x0)[0..8].*;
                bloque(&m, &div_y, base + blk * 64);
            }
            var mcb: [8]V = undefined;
            var mcr: [8]V = undefined;
            inline for (0..8) |i| {
                mcb[i] = (CB + i * pc + mx * 8)[0..8].*;
                mcr[i] = (CR + i * pc + mx * 8)[0..8].*;
            }
            bloque(&mcb, &div_c, base + 4 * 64);
            bloque(&mcr, &div_c, base + 5 * 64);
        }
    }
}
