/*
 * anime4k_neon.c — la pasada entera de Anime4K para ARM64, en C con NEON.
 *
 * Lo mismo que `winsi_a4k_pass_zig` (anime4k_push.zig): pushColor, el Sobel y
 * pushGradient —y, con `luma`, la luminancia de la pasada siguiente— en un
 * recorrido, con anillos de filas en vez de imágenes intermedias. Y lo mismo
 * BIT A BIT que la referencia de Rust: los tests lo comparan, y en CI corren
 * en un ARM64 de verdad.
 *
 * Por qué en C y a mano, si Zig ya vectoriza: en ARM las dos pasadas son el
 * 80 % de `#upscale`, y en el ensamblador que genera Zig se ve dónde se va el
 * tiempo. Acá cada paso es una instrucción elegida:
 *
 *   - `vld4_u8`: 8 píxeles RGBA, ya separados en cuatro registros de canal.
 *   - Las condiciones de dirección (min, max, mayor que) sobre el alfa, en u8:
 *     8 carriles por instrucción, sin pasar a flotante.
 *   - La media de tres vecinos: `vaddl_u8` + `vaddw_u8` los suma como enteros
 *     de 16 bits y se convierte a f32 una sola vez. Da el mismo flotante que
 *     ((a + b) + c) en f32: la suma va de 0 a 765, exacta en f32.
 *   - La división por 3 queda: multiplicar por 1/3 da distinto en 254 de las
 *     766 sumas posibles.
 *
 * Mismo orden de operaciones que la referencia, sin FMA (-ffp-contract=off y
 * multiplicación y suma por separado): mc * (1 - f) + media * f.
 *
 * En otra arquitectura este archivo no aporta nada: todo va dentro del #if.
 */

#include <stdint.h>

#if defined(__aarch64__)
#include <arm_neon.h>

/* ── Escalar: los píxeles de los bordes ─────────────────────────────────── */

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
static inline void empujar1(float mc[4], const uint8_t *a, const uint8_t *b,
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

/* Los nueve píxeles de (x) sobre tres filas, con los costados replicados. */
typedef struct { const uint8_t *tl, *tc, *tr, *ml, *mm, *mr, *bl, *bc, *br; } vec9;
static inline vec9 vecinos(const uint8_t *a, const uint8_t *m, const uint8_t *b,
                           uint32_t w, uint32_t x) {
    uint32_t xn = x == 0 ? 0 : x - 1, xp = x == w - 1 ? x : x + 1;
    vec9 v = {a + xn * 4, a + x * 4, a + xp * 4, m + xn * 4, m + x * 4,
              m + xp * 4, b + xn * 4, b + x * 4, b + xp * 4};
    return v;
}

static void color1(vec9 v, uint8_t *d, float f) {
    float mc[4] = {(float)v.mm[0], (float)v.mm[1], (float)v.mm[2], (float)v.mm[3]};
#define A redondear(mc[3])
    if (min3(v.tl[3], v.tc[3], v.tr[3]) > A && A > max3(v.bl[3], v.bc[3], v.br[3]))
        empujar1(mc, v.tl, v.tc, v.tr, f, 0);
    else if (min3(v.bl[3], v.bc[3], v.br[3]) > A && A > max3(v.tl[3], v.tc[3], v.tr[3]))
        empujar1(mc, v.bl, v.bc, v.br, f, 0);
    if (min3(v.tc[3], v.tr[3], v.mr[3]) > max3(v.ml[3], A, v.bc[3]))
        empujar1(mc, v.tc, v.tr, v.mr, f, 0);
    else if (min3(v.ml[3], v.bl[3], v.bc[3]) > max3(v.tc[3], A, v.mr[3]))
        empujar1(mc, v.ml, v.bl, v.bc, f, 0);
    if (min3(v.tr[3], v.mr[3], v.br[3]) > A && A > max3(v.tl[3], v.ml[3], v.bl[3]))
        empujar1(mc, v.tr, v.mr, v.br, f, 0);
    else if (min3(v.tl[3], v.ml[3], v.bl[3]) > A && A > max3(v.tr[3], v.mr[3], v.br[3]))
        empujar1(mc, v.tl, v.ml, v.bl, f, 0);
    if (min3(v.mr[3], v.br[3], v.bc[3]) > max3(v.tc[3], A, v.ml[3]))
        empujar1(mc, v.mr, v.br, v.bc, f, 0);
    else if (min3(v.ml[3], v.tl[3], v.tc[3]) > max3(v.bc[3], A, v.mr[3]))
        empujar1(mc, v.ml, v.tl, v.tc, f, 0);
#undef A
    for (int i = 0; i < 4; i++) d[i] = redondear(mc[i]);
}

static void gradiente1(vec9 v, uint8_t *d, float f, int luma) {
    float mc[4] = {(float)v.mm[0], (float)v.mm[1], (float)v.mm[2], (float)v.mm[3]};
    uint8_t ma = v.mm[3];
    const uint8_t *a = 0, *b = 0, *c = 0;
    if (min3(v.tl[3], v.tc[3], v.tr[3]) > ma && ma > max3(v.bl[3], v.bc[3], v.br[3])) { a = v.tl; b = v.tc; c = v.tr; }
    else if (min3(v.bl[3], v.bc[3], v.br[3]) > ma && ma > max3(v.tl[3], v.tc[3], v.tr[3])) { a = v.bl; b = v.bc; c = v.br; }
    else if (min3(v.tc[3], v.tr[3], v.mr[3]) > max3(v.ml[3], ma, v.bc[3])) { a = v.tc; b = v.tr; c = v.mr; }
    else if (min3(v.ml[3], v.bl[3], v.bc[3]) > max3(v.tc[3], ma, v.mr[3])) { a = v.ml; b = v.bl; c = v.bc; }
    else if (min3(v.tr[3], v.mr[3], v.br[3]) > ma && ma > max3(v.tl[3], v.ml[3], v.bl[3])) { a = v.tr; b = v.mr; c = v.br; }
    else if (min3(v.tl[3], v.ml[3], v.bl[3]) > ma && ma > max3(v.tr[3], v.mr[3], v.br[3])) { a = v.tl; b = v.ml; c = v.bl; }
    else if (min3(v.mr[3], v.br[3], v.bc[3]) > max3(v.tc[3], ma, v.ml[3])) { a = v.mr; b = v.br; c = v.bc; }
    else if (min3(v.ml[3], v.tl[3], v.tc[3]) > max3(v.bc[3], ma, v.mr[3])) { a = v.ml; b = v.tl; c = v.tc; }
    if (a) empujar1(mc, a, b, c, f, 1);
    for (int i = 0; i < 3; i++) d[i] = redondear(mc[i]);
    if (luma) {
        float l = (float)d[0] * 0.299f + (float)d[1] * 0.587f + (float)d[2] * 0.114f;
        d[3] = redondear(l);
    } else {
        d[3] = 255;
    }
}

/* ── NEON: de a 8 píxeles ────────────────────────────────────────────────── */
/*
 * De a 8 y no de a 16: la primera versión iba de a 16 y en el runner ARM64
 * de CI perdió contra la de Zig de a 8 con suma entera (411,5 contra 384,6
 * ms en un núcleo). De a 16, cada canal en f32 son cuatro registros, y con
 * los cuatro canales más los vecinos no entran en los 32 de NEON. De a 8 son
 * dos por canal.
 */

/* 8 flotantes: dos registros de 4. */
typedef struct { float32x4_t v[2]; } f8;

static inline f8 de_u8(uint8x8_t x) {
    uint16x8_t a = vmovl_u8(x);
    f8 r = {{vcvtq_f32_u32(vmovl_u16(vget_low_u16(a))), vcvtq_f32_u32(vmovl_high_u16(a))}};
    return r;
}

/* Como `redondear`: suma 0,5, acota a [0, 255] y trunca. */
static inline uint8x8_t a_u8(f8 n) {
    const float32x4_t medio = vdupq_n_f32(0.5f), cero = vdupq_n_f32(0.0f), techo = vdupq_n_f32(255.0f);
    uint32x4_t q0 = vcvtq_u32_f32(vminq_f32(vmaxq_f32(vaddq_f32(n.v[0], medio), cero), techo));
    uint32x4_t q1 = vcvtq_u32_f32(vminq_f32(vmaxq_f32(vaddq_f32(n.v[1], medio), cero), techo));
    return vmovn_u16(vcombine_u16(vmovn_u32(q0), vmovn_u32(q1)));
}

/* Una máscara de bytes (0 o 0xFF) como dos máscaras de 32 bits. */
static inline void mascara(uint8x8_t m, uint32x4_t out[2]) {
    int16x8_t s = vmovl_s8(vreinterpret_s8_u8(m));
    out[0] = vreinterpretq_u32_s32(vmovl_s16(vget_low_s16(s)));
    out[1] = vreinterpretq_u32_s32(vmovl_high_s16(s));
}

/* Empuja `mc` hacia la media de a, b, c en los carriles de `m`. */
static inline void empujar8(f8 mc[4], uint8x8x4_t a, uint8x8x4_t b, uint8x8x4_t c,
                            float f, int alfa_fija, uint8x8_t m) {
    if (vmaxv_u8(m) == 0) return;
    uint32x4_t mk[2];
    mascara(m, mk);
    const float32x4_t resto = vdupq_n_f32(1.0f - f), fv = vdupq_n_f32(f), tres = vdupq_n_f32(3.0f);
    const int canales = alfa_fija ? 3 : 4;
    for (int i = 0; i < canales; i++) {
        /* La suma de los tres como enteros de 16 bits, y una sola conversión. */
        uint16x8_t suma = vaddw_u8(vaddl_u8(a.val[i], b.val[i]), c.val[i]);
        float32x4_t s[2] = {vcvtq_f32_u32(vmovl_u16(vget_low_u16(suma))), vcvtq_f32_u32(vmovl_high_u16(suma))};
        for (int k = 0; k < 2; k++) {
            float32x4_t media = vdivq_f32(s[k], tres);
            float32x4_t nuevo = vaddq_f32(vmulq_f32(mc[i].v[k], resto), vmulq_f32(media, fv));
            mc[i].v[k] = vbslq_f32(mk[k], nuevo, mc[i].v[k]);
        }
    }
    if (alfa_fija)
        for (int k = 0; k < 2; k++) mc[3].v[k] = vbslq_f32(mk[k], vdupq_n_f32(255.0f), mc[3].v[k]);
}

#define MIN3(a, b, c) vmin_u8(vmin_u8(a, b), c)
#define MAX3(a, b, c) vmax_u8(vmax_u8(a, b), c)
/* "Uno arriba y el otro abajo": lo > a y a > hi. */
#define ENTRE(lo, a, hi) vand_u8(vcgt_u8(lo, a), vcgt_u8(a, hi))

typedef struct { uint8x8x4_t tl, tc, tr, ml, mm, mr, bl, bc, br; } v8;
static inline v8 cargar(const uint8_t *a, const uint8_t *m, const uint8_t *b, uint32_t x) {
    v8 v;
    v.tl = vld4_u8(a + (x - 1) * 4); v.tc = vld4_u8(a + x * 4); v.tr = vld4_u8(a + (x + 1) * 4);
    v.ml = vld4_u8(m + (x - 1) * 4); v.mm = vld4_u8(m + x * 4); v.mr = vld4_u8(m + (x + 1) * 4);
    v.bl = vld4_u8(b + (x - 1) * 4); v.bc = vld4_u8(b + x * 4); v.br = vld4_u8(b + (x + 1) * 4);
    return v;
}

static inline void color8(v8 v, uint8_t *d, float f) {
    f8 mc[4];
    for (int k = 0; k < 4; k++) mc[k] = de_u8(v.mm.val[k]);
    uint8x8_t TL = v.tl.val[3], TC = v.tc.val[3], TR = v.tr.val[3], ML = v.ml.val[3];
    uint8x8_t MR = v.mr.val[3], BL = v.bl.val[3], BC = v.bc.val[3], BR = v.br.val[3];
    uint8x8_t A, c1, c2;
    /* arriba y abajo */
    A = a_u8(mc[3]);
    c1 = ENTRE(MIN3(TL, TC, TR), A, MAX3(BL, BC, BR));
    c2 = vbic_u8(ENTRE(MIN3(BL, BC, BR), A, MAX3(TL, TC, TR)), c1);
    empujar8(mc, v.tl, v.tc, v.tr, f, 0, c1);
    empujar8(mc, v.bl, v.bc, v.br, f, 0, c2);
    /* subdiagonal */
    A = a_u8(mc[3]);
    c1 = vcgt_u8(MIN3(TC, TR, MR), MAX3(ML, A, BC));
    c2 = vbic_u8(vcgt_u8(MIN3(ML, BL, BC), MAX3(TC, A, MR)), c1);
    empujar8(mc, v.tc, v.tr, v.mr, f, 0, c1);
    empujar8(mc, v.ml, v.bl, v.bc, f, 0, c2);
    /* izquierda y derecha */
    A = a_u8(mc[3]);
    c1 = ENTRE(MIN3(TR, MR, BR), A, MAX3(TL, ML, BL));
    c2 = vbic_u8(ENTRE(MIN3(TL, ML, BL), A, MAX3(TR, MR, BR)), c1);
    empujar8(mc, v.tr, v.mr, v.br, f, 0, c1);
    empujar8(mc, v.tl, v.ml, v.bl, f, 0, c2);
    /* diagonal */
    A = a_u8(mc[3]);
    c1 = vcgt_u8(MIN3(MR, BR, BC), MAX3(TC, A, ML));
    c2 = vbic_u8(vcgt_u8(MIN3(ML, TL, TC), MAX3(BC, A, MR)), c1);
    empujar8(mc, v.mr, v.br, v.bc, f, 0, c1);
    empujar8(mc, v.ml, v.tl, v.tc, f, 0, c2);

    uint8x8x4_t out;
    for (int k = 0; k < 4; k++) out.val[k] = a_u8(mc[k]);
    vst4_u8(d, out);
}

static inline void gradiente8(v8 v, uint8_t *d, float f, int luma) {
    f8 mc[4];
    for (int k = 0; k < 4; k++) mc[k] = de_u8(v.mm.val[k]);
    uint8x8_t MA = v.mm.val[3];
    uint8x8_t TL = v.tl.val[3], TC = v.tc.val[3], TR = v.tr.val[3], ML = v.ml.val[3];
    uint8x8_t MR = v.mr.val[3], BL = v.bl.val[3], BC = v.bc.val[3], BR = v.br.val[3];
    const uint8x8_t conds[8] = {
        ENTRE(MIN3(TL, TC, TR), MA, MAX3(BL, BC, BR)),
        ENTRE(MIN3(BL, BC, BR), MA, MAX3(TL, TC, TR)),
        vcgt_u8(MIN3(TC, TR, MR), MAX3(ML, MA, BC)),
        vcgt_u8(MIN3(ML, BL, BC), MAX3(TC, MA, MR)),
        ENTRE(MIN3(TR, MR, BR), MA, MAX3(TL, ML, BL)),
        ENTRE(MIN3(TL, ML, BL), MA, MAX3(TR, MR, BR)),
        vcgt_u8(MIN3(MR, BR, BC), MAX3(TC, MA, ML)),
        vcgt_u8(MIN3(ML, TL, TC), MAX3(BC, MA, MR)),
    };
    const uint8x8x4_t *trios[8][3] = {
        {&v.tl, &v.tc, &v.tr}, {&v.bl, &v.bc, &v.br}, {&v.tc, &v.tr, &v.mr}, {&v.ml, &v.bl, &v.bc},
        {&v.tr, &v.mr, &v.br}, {&v.tl, &v.ml, &v.bl}, {&v.mr, &v.br, &v.bc}, {&v.ml, &v.tl, &v.tc},
    };
    /* Cada carril toma la PRIMERA dirección que le coincide. */
    uint8x8_t tomado = vdup_n_u8(0);
    for (int i = 0; i < 8; i++) {
        uint8x8_t m = vbic_u8(conds[i], tomado);
        empujar8(mc, *trios[i][0], *trios[i][1], *trios[i][2], f, 1, m);
        tomado = vorr_u8(tomado, conds[i]);
    }
    uint8x8x4_t out;
    for (int k = 0; k < 3; k++) out.val[k] = a_u8(mc[k]);
    if (luma) {
        /* La luminancia del resultado, como `luminancia` en Rust. */
        f8 r = de_u8(out.val[0]), g = de_u8(out.val[1]), b = de_u8(out.val[2]), l;
        for (int k = 0; k < 2; k++)
            l.v[k] = vaddq_f32(vaddq_f32(vmulq_n_f32(r.v[k], 0.299f), vmulq_n_f32(g.v[k], 0.587f)),
                               vmulq_n_f32(b.v[k], 0.114f));
        out.val[3] = a_u8(l);
    } else {
        out.val[3] = vdup_n_u8(255);
    }
    vst4_u8(d, out);
}

/* ── Filas ───────────────────────────────────────────────────────────────── */

static void fila_color(const uint8_t *a, const uint8_t *m, const uint8_t *b, uint8_t *out, uint32_t w, float f) {
    uint32_t x = 0;
    if (w >= 8 + 2) {
        color1(vecinos(a, m, b, w, 0), out, f);
        for (x = 1; x + 8 <= w - 1; x += 8) color8(cargar(a, m, b, x), out + x * 4, f);
    }
    for (; x < w; x++) color1(vecinos(a, m, b, w, x), out + x * 4, f);
}

static void fila_gradiente(const uint8_t *a, const uint8_t *m, const uint8_t *b, uint8_t *out, uint32_t w, float f, int luma) {
    uint32_t x = 0;
    if (w >= 8 + 2) {
        gradiente1(vecinos(a, m, b, w, 0), out, f, luma);
        for (x = 1; x + 8 <= w - 1; x += 8) gradiente8(cargar(a, m, b, x), out + x * 4, f, luma);
    }
    for (; x < w; x++) gradiente1(vecinos(a, m, b, w, x), out + x * 4, f, luma);
}

/* El Sobel de una fila: la fila del medio copiada, con el alfa del interior
 * reescrito. Las sumas son enteros chicos, exactos en f32; la raíz es la de
 * IEEE, correctamente redondeada, como en Rust. */
static void fila_sobel(const uint8_t *arriba, const uint8_t *medio, const uint8_t *abajo,
                       uint8_t *out, uint32_t w, int interior) {
    __builtin_memcpy(out, medio, (uint64_t)w * 4);
    if (!interior || w < 3) return;
    uint32_t x = 1;
    const float32x4_t dos = vdupq_n_f32(2.0f), medio_ = vdupq_n_f32(0.5f), techo = vdupq_n_f32(255.0f);
    for (; x + 8 <= w - 1; x += 8) {
        f8 tl = de_u8(vld4_u8(arriba + (x - 1) * 4).val[3]), tc = de_u8(vld4_u8(arriba + x * 4).val[3]);
        f8 tr = de_u8(vld4_u8(arriba + (x + 1) * 4).val[3]), ml = de_u8(vld4_u8(medio + (x - 1) * 4).val[3]);
        f8 mr = de_u8(vld4_u8(medio + (x + 1) * 4).val[3]), bl = de_u8(vld4_u8(abajo + (x - 1) * 4).val[3]);
        f8 bc = de_u8(vld4_u8(abajo + x * 4).val[3]), br = de_u8(vld4_u8(abajo + (x + 1) * 4).val[3]);
        uint32x4_t q[2];
        for (int k = 0; k < 2; k++) {
            float32x4_t gy = vsubq_f32(vsubq_f32(vsubq_f32(vaddq_f32(vaddq_f32(bl.v[k], vmulq_f32(dos, bc.v[k])), br.v[k]), tl.v[k]), vmulq_f32(dos, tc.v[k])), tr.v[k]);
            float32x4_t gx = vsubq_f32(vsubq_f32(vsubq_f32(vaddq_f32(vaddq_f32(tl.v[k], vmulq_f32(dos, ml.v[k])), bl.v[k]), tr.v[k]), vmulq_f32(dos, mr.v[k])), br.v[k]);
            float32x4_t g = vsqrtq_f32(vaddq_f32(vmulq_f32(gx, gx), vmulq_f32(gy, gy)));
            q[k] = vcvtq_u32_f32(vminq_f32(vaddq_f32(g, medio_), techo));
        }
        uint8x8_t r = vmovn_u16(vcombine_u16(vmovn_u32(q[0]), vmovn_u32(q[1])));
        uint8x8x4_t px = vld4_u8(out + x * 4);
        px.val[3] = vsub_u8(vdup_n_u8(255), r);
        vst4_u8(out + x * 4, px);
    }
    for (; x < w - 1; x++) {
#define AL(fila, dx) ((float)(fila)[((x) + (dx)) * 4 + 3])
        float gy = AL(abajo, -1) + 2.0f * AL(abajo, 0) + AL(abajo, 1) - AL(arriba, -1) - 2.0f * AL(arriba, 0) - AL(arriba, 1);
        float gx = AL(arriba, -1) + 2.0f * AL(medio, -1) + AL(abajo, -1) - AL(arriba, 1) - 2.0f * AL(medio, 1) - AL(abajo, 1);
#undef AL
        out[x * 4 + 3] = (uint8_t)(255 - redondear(__builtin_sqrtf(gx * gx + gy * gy)));
    }
}

/* ── La pasada ───────────────────────────────────────────────────────────── */

/* Un anillo de filas calculadas a pedido: el lugar r % n guarda la fila r. */
typedef struct { uint8_t *mem; uint64_t largo; uint32_t n; uint64_t en[5]; } anillo;

static inline uint8_t *lugar(anillo *an, uint64_t r, int *lista) {
    uint32_t i = (uint32_t)(r % an->n);
    *lista = an->en[i] == r;
    an->en[i] = r;
    return an->mem + i * an->largo;
}

typedef struct {
    const uint8_t *src; uint32_t w, h; float fc; anillo color, grad;
} pasada;

static const uint8_t *de_color(pasada *p, uint64_t r) {
    int lista;
    uint8_t *l = lugar(&p->color, r, &lista);
    if (!lista) {
        uint64_t rn = r == 0 ? 0 : r - 1, rp = r == p->h - 1 ? r : r + 1, fila = (uint64_t)p->w * 4;
        fila_color(p->src + rn * fila, p->src + r * fila, p->src + rp * fila, l, p->w, p->fc);
    }
    return l;
}

static const uint8_t *de_sobel(pasada *p, uint64_t r) {
    int lista;
    uint8_t *l = lugar(&p->grad, r, &lista);
    if (!lista) {
        int interior = p->h >= 3 && r >= 1 && r + 1 < p->h;
        const uint8_t *arriba = de_color(p, interior ? r - 1 : r);
        const uint8_t *medio = de_color(p, r);
        const uint8_t *abajo = de_color(p, interior ? r + 1 : r);
        fila_sobel(arriba, medio, abajo, l, p->w, interior);
    }
    return l;
}

/* Filas [y0, y1) de la salida. `anillo_c` mide 5·w·4 bytes y `anillo_g`,
 * 3·w·4, como en winsi_a4k_pass_zig. */
void winsi_a4k_pass_neon(const uint8_t *src, uint8_t *dst, uint32_t w, uint32_t h,
                         float fc, float fg, uint32_t y0, uint32_t y1,
                         uint8_t *anillo_c, uint8_t *anillo_g, uint32_t luma) {
    pasada p = {src, w, h, fc,
                {anillo_c, (uint64_t)w * 4, 5, {~0ull, ~0ull, ~0ull, ~0ull, ~0ull}},
                {anillo_g, (uint64_t)w * 4, 3, {~0ull, ~0ull, ~0ull, ~0ull, ~0ull}}};
    if (y1 > h) y1 = h;
    for (uint64_t y = y0; y < y1; y++) {
        uint64_t yn = y == 0 ? 0 : y - 1, yp = y == h - 1 ? y : y + 1;
        const uint8_t *a = de_sobel(&p, yn);
        const uint8_t *m = de_sobel(&p, y);
        const uint8_t *b = de_sobel(&p, yp);
        fila_gradiente(a, m, b, dst + y * (uint64_t)w * 4, w, fg, luma != 0);
    }
}

#endif /* __aarch64__ */
