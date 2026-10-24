/*
 * anime4k.c — los tres kernels por píxel de Anime4K, en C.
 *
 * Misma especificación que `push_color_rust`, `gradiente_rust` y
 * `push_gradient_rust` en src/anime4k.rs, que son la referencia: los tests de
 * Rust exigen que esto dé lo mismo BIT A BIT sobre imágenes al azar.
 *
 * Lo que cambia respecto de la versión de Rust no es el algoritmo sino el
 * acceso: acá se recorre el búfer RGBA crudo con aritmética de punteros, sin la
 * comprobación de límites que `get_pixel()` hace en cada uno de los nueve
 * accesos por píxel.
 *
 * Se compila con `zig cc` (Zig también es compilador de C) y con
 * -ffp-contract=off: sin eso clang puede fusionar `a*b + c` en una FMA, que
 * redondea una sola vez en lugar de dos, y el resultado deja de coincidir con
 * Rust, que no fusiona nunca. No usa libc: solo cabeceras independientes.
 *
 * Formato: RGBA de 8 bits, filas contiguas, `w * h * 4` bytes. `src` y `dst`
 * no se solapan. Los bordes se replican, como en la referencia.
 *
 * Cada kernel procesa SOLO las filas [y0, y1) de la salida, leyendo de `src`
 * las vecinas que necesite. Así Rust reparte una imagen en franjas entre
 * todos los núcleos: cada hilo escribe filas distintas de `dst` y nadie
 * escribe `src`, así que no hace falta coordinarlos.
 */

#include <stdint.h>

/* Como `redondear` en Rust: suma 0,5, acota a [0, 255] y trunca. */
static inline uint8_t redondear(float n) {
    n = n + 0.5f;
    if (n >= 255.0f) return 255;
    if (n <= 0.0f) return 0;
    return (uint8_t)n;
}

static inline uint8_t max3(uint8_t a, uint8_t b, uint8_t c) {
    uint8_t m = a > b ? a : b;
    return m > c ? m : c;
}

static inline uint8_t min3(uint8_t a, uint8_t b, uint8_t c) {
    uint8_t m = a < b ? a : b;
    return m < c ? m : c;
}

/* Mezcla `mc` hacia el promedio de tres vecinos. Mismo orden de operaciones
 * que Rust: ((a + b) + c) / 3, y después mc * (1 - f) + media * f. */
static inline void empujar(float mc[4], const uint8_t *a, const uint8_t *b,
                           const uint8_t *c, float f, int alfa_fija) {
    for (int i = 0; i < 3; i++) {
        float media = ((float)a[i] + (float)b[i] + (float)c[i]) / 3.0f;
        mc[i] = mc[i] * (1.0f - f) + media * f;
    }
    if (alfa_fija) {
        mc[3] = 255.0f;
    } else {
        float media = ((float)a[3] + (float)b[3] + (float)c[3]) / 3.0f;
        mc[3] = mc[3] * (1.0f - f) + media * f;
    }
}

/* Los ocho vecinos de (x, y), con los bordes replicados. */
typedef struct {
    const uint8_t *tl, *tc, *tr, *ml, *mr, *bl, *bc, *br;
} vecindad;

static inline vecindad vecinos(const uint8_t *img, uint32_t w, uint32_t h,
                               uint32_t x, uint32_t y) {
    uint32_t xn = x == 0 ? 0 : x - 1;
    uint32_t xp = x == w - 1 ? x : x + 1;
    uint32_t yn = y == 0 ? 0 : y - 1;
    uint32_t yp = y == h - 1 ? y : y + 1;
#define P(a, b) (img + ((uint64_t)(b) * w + (a)) * 4)
    vecindad v = {P(xn, yn), P(x, yn), P(xp, yn), P(xn, y),
                  P(xp, y),  P(xn, yp), P(x, yp), P(xp, yp)};
#undef P
    return v;
}

static inline void escribir(uint8_t *d, const float mc[4]) {
    d[0] = redondear(mc[0]);
    d[1] = redondear(mc[1]);
    d[2] = redondear(mc[2]);
    d[3] = redondear(mc[3]);
}

/* pushColor: los cuatro bloques se evalúan EN CADENA sobre el mismo `mc`, y
 * cada uno ve el alfa que dejó el anterior, como en la referencia. */
void winsi_a4k_push_color_c(const uint8_t *src, uint8_t *dst, uint32_t w,
                            uint32_t h, float f, uint32_t y0, uint32_t y1) {
    if (y1 > h) y1 = h;
    for (uint32_t y = y0; y < y1; y++) {
        for (uint32_t x = 0; x < w; x++) {
            vecindad v = vecinos(src, w, h, x, y);
            const uint8_t *p = src + ((uint64_t)y * w + x) * 4;
            float mc[4] = {(float)p[0], (float)p[1], (float)p[2], (float)p[3]};
#define A redondear(mc[3])
            /* arriba y abajo */
            if (min3(v.tl[3], v.tc[3], v.tr[3]) > A && A > max3(v.bl[3], v.bc[3], v.br[3]))
                empujar(mc, v.tl, v.tc, v.tr, f, 0);
            else if (min3(v.bl[3], v.bc[3], v.br[3]) > A && A > max3(v.tl[3], v.tc[3], v.tr[3]))
                empujar(mc, v.bl, v.bc, v.br, f, 0);
            /* subdiagonal */
            if (min3(v.tc[3], v.tr[3], v.mr[3]) > max3(v.ml[3], A, v.bc[3]))
                empujar(mc, v.tc, v.tr, v.mr, f, 0);
            else if (min3(v.ml[3], v.bl[3], v.bc[3]) > max3(v.tc[3], A, v.mr[3]))
                empujar(mc, v.ml, v.bl, v.bc, f, 0);
            /* izquierda y derecha */
            if (min3(v.tr[3], v.mr[3], v.br[3]) > A && A > max3(v.tl[3], v.ml[3], v.bl[3]))
                empujar(mc, v.tr, v.mr, v.br, f, 0);
            else if (min3(v.tl[3], v.ml[3], v.bl[3]) > A && A > max3(v.tr[3], v.mr[3], v.br[3]))
                empujar(mc, v.tl, v.ml, v.bl, f, 0);
            /* diagonal */
            if (min3(v.mr[3], v.br[3], v.bc[3]) > max3(v.tc[3], A, v.ml[3]))
                empujar(mc, v.mr, v.br, v.bc, f, 0);
            else if (min3(v.ml[3], v.tl[3], v.tc[3]) > max3(v.bc[3], A, v.mr[3]))
                empujar(mc, v.ml, v.tl, v.tc, f, 0);
#undef A
            escribir(dst + ((uint64_t)y * w + x) * 4, mc);
        }
    }
}

/* Sobel sobre el alfa, invertido, de las filas [y0, y1).
 *
 * Cada fila se COPIA de `src` a `dst` y después se le reescribe el alfa del
 * interior; el borde queda copiado tal cual. Antes Rust clonaba la imagen
 * entera antes de llamar —3 MB en un solo hilo, que con el cálculo repartido
 * en 8 pesaban más que el cálculo—; así la copia también va en franjas. */
void winsi_a4k_gradient_c(const uint8_t *src, uint8_t *dst, uint32_t w,
                          uint32_t h, uint32_t y0, uint32_t y1) {
    if (y1 > h) y1 = h;
    for (uint32_t y = y0; y < y1; y++)
        __builtin_memcpy(dst + (uint64_t)y * w * 4, src + (uint64_t)y * w * 4, (uint64_t)w * 4);
    if (w < 3 || h < 3) return;
    /* El borde no se calcula: se recorta el rango al interior. */
    if (y0 < 1) y0 = 1;
    if (y1 > h - 1) y1 = h - 1;
    for (uint32_t y = y0; y < y1; y++) {
        const uint8_t *arriba = src + (uint64_t)(y - 1) * w * 4;
        const uint8_t *medio = src + (uint64_t)y * w * 4;
        const uint8_t *abajo = src + (uint64_t)(y + 1) * w * 4;
        for (uint32_t x = 1; x < w - 1; x++) {
#define AL(fila, dx) ((float)(fila)[((x) + (dx)) * 4 + 3])
            float gy = AL(abajo, -1) + 2.0f * AL(abajo, 0) + AL(abajo, 1)
                     - AL(arriba, -1) - 2.0f * AL(arriba, 0) - AL(arriba, 1);
            float gx = AL(arriba, -1) + 2.0f * AL(medio, -1) + AL(abajo, -1)
                     - AL(arriba, 1) - 2.0f * AL(medio, 1) - AL(abajo, 1);
#undef AL
            float g = __builtin_sqrtf(gx * gx + gy * gy);
            dst[((uint64_t)y * w + x) * 4 + 3] = (uint8_t)(255 - redondear(g));
        }
    }
}

/* pushGradient: a diferencia de pushColor, sale en cuanto una dirección
 * coincide. Sin dirección, el píxel queda igual con el alfa a 255. */
void winsi_a4k_push_gradient_c(const uint8_t *src, uint8_t *dst, uint32_t w,
                               uint32_t h, float f, uint32_t y0, uint32_t y1) {
    if (y1 > h) y1 = h;
    for (uint32_t y = y0; y < y1; y++) {
        for (uint32_t x = 0; x < w; x++) {
            vecindad v = vecinos(src, w, h, x, y);
            const uint8_t *p = src + ((uint64_t)y * w + x) * 4;
            float mc[4] = {(float)p[0], (float)p[1], (float)p[2], (float)p[3]};
            uint8_t ma = p[3];
            const uint8_t *a = 0, *b = 0, *c = 0;

            if (min3(v.tl[3], v.tc[3], v.tr[3]) > ma && ma > max3(v.bl[3], v.bc[3], v.br[3]))
                { a = v.tl; b = v.tc; c = v.tr; }
            else if (min3(v.bl[3], v.bc[3], v.br[3]) > ma && ma > max3(v.tl[3], v.tc[3], v.tr[3]))
                { a = v.bl; b = v.bc; c = v.br; }
            else if (min3(v.tc[3], v.tr[3], v.mr[3]) > max3(v.ml[3], ma, v.bc[3]))
                { a = v.tc; b = v.tr; c = v.mr; }
            else if (min3(v.ml[3], v.bl[3], v.bc[3]) > max3(v.tc[3], ma, v.mr[3]))
                { a = v.ml; b = v.bl; c = v.bc; }
            else if (min3(v.tr[3], v.mr[3], v.br[3]) > ma && ma > max3(v.tl[3], v.ml[3], v.bl[3]))
                { a = v.tr; b = v.mr; c = v.br; }
            else if (min3(v.tl[3], v.ml[3], v.bl[3]) > ma && ma > max3(v.tr[3], v.mr[3], v.br[3]))
                { a = v.tl; b = v.ml; c = v.bl; }
            else if (min3(v.mr[3], v.br[3], v.bc[3]) > max3(v.tc[3], ma, v.ml[3]))
                { a = v.mr; b = v.br; c = v.bc; }
            else if (min3(v.ml[3], v.tl[3], v.tc[3]) > max3(v.bc[3], ma, v.mr[3]))
                { a = v.ml; b = v.tl; c = v.tc; }

            if (a) empujar(mc, a, b, c, f, 1);
            else mc[3] = 255.0f;
            escribir(dst + ((uint64_t)y * w + x) * 4, mc);
        }
    }
}
