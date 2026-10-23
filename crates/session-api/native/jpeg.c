/*
 * jpeg.c — la mitad en C del codificador JPEG: tablas, cabeceras y Huffman.
 *
 * La otra mitad está en jpeg.zig: color, submuestreo y DCT con vectores. El
 * reparto es por la forma del trabajo, no por gusto:
 *
 *   - Zig hace aritmética pura y uniforme —convertir cada píxel, transformar
 *     cada bloque de 8x8—, donde 8 valores por instrucción rinden.
 *   - C hace la codificación de entropía: decidir bit a bit qué código va,
 *     contar ceros, meter bytes de relleno. Ramas por todos lados, nada que
 *     vectorizar.
 *
 * JPEG de base (baseline), JFIF, YCbCr 4:2:0, con las tablas de cuantización
 * y de Huffman estándar del Anexo K de la norma. Es lo que cualquier
 * decodificador lee, WhatsApp incluido, y lo que WhatsApp mismo genera.
 *
 * Sin libc: solo cabeceras independientes. Se compila con `zig cc` igual que
 * anime4k.c.
 */

#include <stddef.h>
#include <stdint.h>

/* Orden zigzag: la posición k del flujo es el índice natural zz[k]. */
static const uint8_t ZZ[64] = {
    0,  1,  8,  16, 9,  2,  3,  10, 17, 24, 32, 25, 18, 11, 4,  5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6,  7,  14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63};

/* Cuantización estándar (Anexo K.1), en orden natural. */
static const uint8_t QL[64] = {
    16, 11, 10, 16, 24,  40,  51,  61,  12, 12, 14, 19, 26,  58,  60,  55,
    14, 13, 16, 24, 40,  57,  69,  56,  14, 17, 22, 29, 51,  87,  80,  62,
    18, 22, 37, 56, 68,  109, 103, 77,  24, 35, 55, 64, 81,  104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99};
static const uint8_t QC[64] = {
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99};

/* Huffman estándar (Anexo K.3): cuántos códigos de cada largo, y símbolos. */
static const uint8_t DC_L_BITS[16] = {0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0};
static const uint8_t DC_C_BITS[16] = {0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0};
static const uint8_t DC_VALS[12] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
static const uint8_t AC_L_BITS[16] = {0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d};
static const uint8_t AC_L_VALS[162] = {
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61,
    0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52,
    0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25,
    0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
    0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83,
    0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99,
    0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3,
    0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8,
    0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa};
static const uint8_t AC_C_BITS[16] = {0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77};
static const uint8_t AC_C_VALS[162] = {
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61,
    0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33,
    0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18,
    0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44,
    0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63,
    0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a,
    0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97,
    0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
    0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca,
    0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7,
    0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa};

/* Las tablas de cuantización para una calidad de 1 a 100, en orden natural.
 * La escala es la de libjpeg, que es la que todo el mundo entiende por
 * "calidad 90". */
void winsi_jpeg_tables(int calidad, uint8_t qy[64], uint8_t qc[64]) {
    if (calidad < 1) calidad = 1;
    if (calidad > 100) calidad = 100;
    int escala = calidad < 50 ? 5000 / calidad : 200 - calidad * 2;
    for (int i = 0; i < 64; i++) {
        int y = (QL[i] * escala + 50) / 100;
        int c = (QC[i] * escala + 50) / 100;
        qy[i] = (uint8_t)(y < 1 ? 1 : y > 255 ? 255 : y);
        qc[i] = (uint8_t)(c < 1 ? 1 : c > 255 ? 255 : c);
    }
}

/* ── Huffman ─────────────────────────────────────────────────────────────── */

typedef struct {
    uint16_t codigo[256];
    uint8_t largo[256];
} tabla;

/* Códigos canónicos a partir de "cuántos de cada largo". */
static void armar(tabla *t, const uint8_t bits[16], const uint8_t *vals) {
    uint32_t codigo = 0;
    int k = 0;
    for (int largo = 1; largo <= 16; largo++) {
        for (int i = 0; i < bits[largo - 1]; i++) {
            t->codigo[vals[k]] = (uint16_t)codigo++;
            t->largo[vals[k]] = (uint8_t)largo;
            k++;
        }
        codigo <<= 1;
    }
}

/* ── Escritura de bits ───────────────────────────────────────────────────── */

typedef struct {
    uint8_t *p, *fin;
    uint64_t acc;   /* bits pendientes, alineados a la derecha */
    int n;          /* cuántos */
    int desborde;
} escritor;

static inline void byte(escritor *e, uint8_t b) {
    if (e->p < e->fin) *e->p++ = b;
    else e->desborde = 1;
}

/* Vuelca los bytes completos. Un 0xFF en los datos va seguido de un 0x00, o
 * se leería como marcador. Camino rápido: si en los próximos 4 bytes no hay
 * ningún 0xFF y hay lugar, van de una. */
static inline void volcar(escritor *e) {
    while (e->n >= 32) {
        uint32_t w = (uint32_t)(e->acc >> (e->n - 32));
        uint32_t no = ~w;
        int hay_ff = ((no - 0x01010101u) & ~no & 0x80808080u) != 0;
        if (!hay_ff && e->fin - e->p >= 4) {
            e->p[0] = (uint8_t)(w >> 24);
            e->p[1] = (uint8_t)(w >> 16);
            e->p[2] = (uint8_t)(w >> 8);
            e->p[3] = (uint8_t)w;
            e->p += 4;
            e->n -= 32;
        } else {
            for (int i = 0; i < 4; i++) {
                uint8_t b = (uint8_t)(e->acc >> (e->n - 8));
                byte(e, b);
                if (b == 0xFF) byte(e, 0);
                e->n -= 8;
            }
        }
    }
}

/* Agrega `largo` bits (hasta 32). El acumulador es de 64 y se vacía cuando
 * pasa de 32, así que nunca se desborda. */
static inline void bits(escritor *e, uint32_t v, int largo) {
    e->acc = (e->acc << largo) | (v & (uint32_t)((1ull << largo) - 1));
    e->n += largo;
    if (e->n >= 32) volcar(e);
}

/* Lo que queda al final, de a byte, completando con unos. */
static void cerrar(escritor *e) {
    while (e->n >= 8) {
        uint8_t b = (uint8_t)(e->acc >> (e->n - 8));
        byte(e, b);
        if (b == 0xFF) byte(e, 0);
        e->n -= 8;
    }
    if (e->n) {
        int faltan = 8 - e->n;
        e->acc = (e->acc << faltan) | ((1u << faltan) - 1);
        e->n = 8;
        uint8_t b = (uint8_t)e->acc;
        byte(e, b);
        if (b == 0xFF) byte(e, 0);
        e->n = 0;
    }
}

static inline void palabra(escritor *e, uint16_t v) {
    byte(e, (uint8_t)(v >> 8));
    byte(e, (uint8_t)v);
}

/* Cuántos bits necesita |v|: la "categoría" del valor. Una instrucción. */
static inline int categoria(int v) {
    unsigned a = (unsigned)(v < 0 ? -v : v);
    return a ? 32 - __builtin_clz(a) : 0;
}

static void bloque(escritor *e, const int16_t c[64], int *dc_prev,
                   const tabla *dc, const tabla *ac) {
    int diff = c[0] - *dc_prev;
    *dc_prev = c[0];
    int n = categoria(diff);
    /* Código y valor en una sola escritura. Los negativos van como v - 1 en
     * n bits (complemento a uno). */
    uint32_t val = (uint32_t)(diff < 0 ? diff - 1 : diff) & ((1u << n) - 1);
    bits(e, ((uint32_t)dc->codigo[n] << n) | val, dc->largo[n] + n);

    int ceros = 0;
    for (int k = 1; k < 64; k++) {
        int v = c[k];
        if (v == 0) { ceros++; continue; }
        while (ceros > 15) {  /* ZRL: dieciséis ceros seguidos */
            bits(e, ac->codigo[0xF0], ac->largo[0xF0]);
            ceros -= 16;
        }
        n = categoria(v);
        int s = (ceros << 4) | n;
        uint32_t val = (uint32_t)(v < 0 ? v - 1 : v) & ((1u << n) - 1);
        bits(e, ((uint32_t)ac->codigo[s] << n) | val, ac->largo[s] + n);
        ceros = 0;
    }
    if (ceros) bits(e, ac->codigo[0x00], ac->largo[0x00]);  /* EOB */
}

static void dht(escritor *e, uint8_t clase_id, const uint8_t b[16], const uint8_t *vals, int n) {
    byte(e, clase_id);
    for (int i = 0; i < 16; i++) byte(e, b[i]);
    for (int i = 0; i < n; i++) byte(e, vals[i]);
}

/*
 * Escribe el archivo JPEG entero a partir de los coeficientes ya cuantizados
 * que dejó jpeg.zig: por cada MCU de 16x16, cuatro bloques de luma y uno de
 * cada croma, 64 coeficientes cada uno EN ORDEN ZIGZAG.
 *
 * Devuelve los bytes escritos, o 0 si `cap` no alcanzó: quien llama reintenta
 * con más espacio.
 */
size_t winsi_jpeg_write(const int16_t *coefs, uint32_t w, uint32_t h,
                        const uint8_t qy[64], const uint8_t qc[64],
                        uint8_t *out, size_t cap) {
    escritor e = {out, out + cap, 0, 0, 0};
    static tabla dcl, dcc, acl, acc;
    static int listas = 0;
    if (!listas) {
        armar(&dcl, DC_L_BITS, DC_VALS);
        armar(&dcc, DC_C_BITS, DC_VALS);
        armar(&acl, AC_L_BITS, AC_L_VALS);
        armar(&acc, AC_C_BITS, AC_C_VALS);
        listas = 1;
    }

    palabra(&e, 0xFFD8);                                   /* SOI */
    palabra(&e, 0xFFE0); palabra(&e, 16);                  /* APP0 JFIF */
    byte(&e, 'J'); byte(&e, 'F'); byte(&e, 'I'); byte(&e, 'F'); byte(&e, 0);
    byte(&e, 1); byte(&e, 1); byte(&e, 0);
    palabra(&e, 1); palabra(&e, 1); byte(&e, 0); byte(&e, 0);

    palabra(&e, 0xFFDB); palabra(&e, 2 + 2 * 65);          /* DQT, en zigzag */
    byte(&e, 0);
    for (int k = 0; k < 64; k++) byte(&e, qy[ZZ[k]]);
    byte(&e, 1);
    for (int k = 0; k < 64; k++) byte(&e, qc[ZZ[k]]);

    palabra(&e, 0xFFC0); palabra(&e, 17);                  /* SOF0 */
    byte(&e, 8); palabra(&e, (uint16_t)h); palabra(&e, (uint16_t)w);
    byte(&e, 3);
    byte(&e, 1); byte(&e, 0x22); byte(&e, 0);              /* Y: 2x2, tabla 0 */
    byte(&e, 2); byte(&e, 0x11); byte(&e, 1);              /* Cb */
    byte(&e, 3); byte(&e, 0x11); byte(&e, 1);              /* Cr */

    palabra(&e, 0xFFC4); palabra(&e, 2 + 4 * 17 + 12 + 12 + 162 + 162);  /* DHT */
    dht(&e, 0x00, DC_L_BITS, DC_VALS, 12);
    dht(&e, 0x10, AC_L_BITS, AC_L_VALS, 162);
    dht(&e, 0x01, DC_C_BITS, DC_VALS, 12);
    dht(&e, 0x11, AC_C_BITS, AC_C_VALS, 162);

    palabra(&e, 0xFFDA); palabra(&e, 12);                  /* SOS */
    byte(&e, 3);
    byte(&e, 1); byte(&e, 0x00);
    byte(&e, 2); byte(&e, 0x11);
    byte(&e, 3); byte(&e, 0x11);
    byte(&e, 0); byte(&e, 63); byte(&e, 0);

    uint32_t mcus = ((w + 15) / 16) * ((h + 15) / 16);
    int py = 0, pcb = 0, pcr = 0;
    for (uint32_t m = 0; m < mcus && !e.desborde; m++) {
        const int16_t *b = coefs + (size_t)m * 6 * 64;
        for (int i = 0; i < 4; i++) bloque(&e, b + i * 64, &py, &dcl, &acl);
        bloque(&e, b + 4 * 64, &pcb, &dcc, &acc);
        bloque(&e, b + 5 * 64, &pcr, &dcc, &acc);
    }
    /* Completar el último byte con unos, como pide la norma. */
    cerrar(&e);
    palabra(&e, 0xFFD9);                                   /* EOI */

    return e.desborde ? 0 : (size_t)(e.p - out);
}
