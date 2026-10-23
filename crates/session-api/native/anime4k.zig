//! anime4k.zig — el Sobel de Anime4K, vectorizado.
//!
//! Mismo cálculo que `gradiente_rust` en src/anime4k.rs, que es la referencia:
//! los tests de Rust exigen que dé lo mismo BIT A BIT.
//!
//! De los tres kernels de Anime4K este es el único sin decisiones por píxel:
//! hace la misma cuenta en todos, así que se puede hacer de a 8 píxeles por
//! instrucción con `@Vector(8, f32)`. Los otros dos eligen una de ocho
//! direcciones según los vecinos, y ahí los vectores no tienen dónde entrar;
//! esos están en C (anime4k.c).
//!
//! Por qué da lo mismo que la versión escalar: las entradas son enteros de 0 a
//! 255, así que las sumas de Sobel y sus cuadrados son enteros exactos en un
//! f32 (el máximo, 2 * 1020², cabe de sobra en 2^24) y el orden de las
//! operaciones no cambia nada. La raíz cuadrada es la de IEEE, correctamente
//! redondeada, en los dos lados.

const V = @Vector(8, f32);
const N = 8;

/// El alfa de 8 píxeles seguidos desde `x`, como flotantes.
inline fn alfas(fila: [*]const u8, x: usize) V {
    var a: [N]f32 = undefined;
    inline for (0..N) |i| a[i] = @floatFromInt(fila[(x + i) * 4 + 3]);
    return a;
}

/// Como `redondear` en Rust para un valor que nunca es negativo: suma 0,5,
/// acota a 255 y trunca.
inline fn redondear(g: f32) u8 {
    const n = g + 0.5;
    if (n >= 255.0) return 255;
    return @intFromFloat(n);
}

fn sobel(arriba: [*]const u8, medio: [*]const u8, abajo: [*]const u8, x: usize) u8 {
    const a = struct {
        fn f(fila: [*]const u8, i: usize) f32 {
            return @floatFromInt(fila[i * 4 + 3]);
        }
    }.f;
    const gy = a(abajo, x - 1) + 2.0 * a(abajo, x) + a(abajo, x + 1) -
        a(arriba, x - 1) - 2.0 * a(arriba, x) - a(arriba, x + 1);
    const gx = a(arriba, x - 1) + 2.0 * a(medio, x - 1) + a(abajo, x - 1) -
        a(arriba, x + 1) - 2.0 * a(medio, x + 1) - a(abajo, x + 1);
    return 255 - redondear(@sqrt(gx * gx + gy * gy));
}

/// Sobel sobre el alfa, invertido. Solo el interior: `dst` tiene que llegar
/// con una copia de `src`, porque el borde queda como está.
export fn winsi_a4k_gradient_zig(src: [*]const u8, dst: [*]u8, w: u32, h: u32) callconv(.C) void {
    if (w < 3 or h < 3) return;
    const ancho: usize = w;
    const dos: V = @splat(2.0);
    const medio_: V = @splat(0.5);
    const techo: V = @splat(255.0);

    var y: usize = 1;
    while (y < h - 1) : (y += 1) {
        const arriba = src + (y - 1) * ancho * 4;
        const medio = src + y * ancho * 4;
        const abajo = src + (y + 1) * ancho * 4;

        var x: usize = 1;
        // De a 8 mientras quepan 8 píxeles interiores enteros.
        while (x + N <= ancho - 1) : (x += N) {
            const tl = alfas(arriba, x - 1);
            const tc = alfas(arriba, x);
            const tr = alfas(arriba, x + 1);
            const ml = alfas(medio, x - 1);
            const mr = alfas(medio, x + 1);
            const bl = alfas(abajo, x - 1);
            const bc = alfas(abajo, x);
            const br = alfas(abajo, x + 1);

            const gy = bl + dos * bc + br - tl - dos * tc - tr;
            const gx = tl + dos * ml + bl - tr - dos * mr - br;
            // g >= 0, así que n >= 0,5 y alcanza con el techo.
            const n = @min(@sqrt(gx * gx + gy * gy) + medio_, techo);
            const r: @Vector(N, u8) = @intFromFloat(n);
            inline for (0..N) |i| dst[(y * ancho + x + i) * 4 + 3] = 255 - r[i];
        }
        // La cola, de a uno.
        while (x < ancho - 1) : (x += 1) {
            dst[(y * ancho + x) * 4 + 3] = sobel(arriba, medio, abajo, x);
        }
    }
}
