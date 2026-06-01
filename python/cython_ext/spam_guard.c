/*
 * WinsiBot — SpamGuard
 * Rate limit + flood detection en C puro
 * Compilar: gcc -O2 -shared -fPIC -o spam_guard.so spam_guard.c
 * Windows:  gcc -O2 -shared -o spam_guard.dll spam_guard.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
  #define EXPORT __declspec(dllexport)
#else
  #define EXPORT __attribute__((visibility("default")))
#endif

// ─── Config ───────────────────────────────────────────────────────────────────
#define MAX_SENDERS      2048
#define MAX_WINDOW_HITS  20
#define HASH_SIZE        4096
#define MAX_TEXT_LEN     512
#define MAX_REPEAT_TRACK 8

#ifdef _WIN32
  #include <windows.h>
#else
  #include <time.h>
#endif

// ─── Estructuras ──────────────────────────────────────────────────────────────
typedef struct {
    long long timestamps[MAX_WINDOW_HITS];  // sliding window
    int       head;
    int       count;
} RateWindow;

typedef struct {
    char      texts[MAX_REPEAT_TRACK][MAX_TEXT_LEN];
    int       text_counts[MAX_REPEAT_TRACK];
    int       head;
    int       size;
    long long last_reset;
} RepeatTracker;

typedef struct SenderEntry {
    char           sender[64];
    RateWindow     rate;
    RepeatTracker  repeat;
    int            warn_count;
    long long      blocked_until;
    struct SenderEntry* next;
} SenderEntry;

// ─── Hash table ───────────────────────────────────────────────────────────────
static SenderEntry* table[HASH_SIZE] = { NULL };

static unsigned int hash_str(const char* s) {
    unsigned int h = 5381;
    while (*s) h = ((h << 5) + h) ^ (unsigned char)*s++;
    return h % HASH_SIZE;
}

#ifdef _WIN32
  #include <windows.h>
  static long long now_ms(void) {
      FILETIME ft;
      GetSystemTimeAsFileTime(&ft);
      long long t = ((long long)ft.dwHighDateTime << 32) | ft.dwLowDateTime;
      // FILETIME es en 100ns desde 1601 — convertir a ms desde epoch Unix
      return (t - 116444736000000000LL) / 10000LL;
  }
#else
  #include <time.h>
  static long long now_ms(void) {
      struct timespec ts;
      clock_gettime(CLOCK_REALTIME, &ts);
      return (long long)ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL;
  }
#endif

static SenderEntry* get_or_create(const char* sender) {
    unsigned int idx = hash_str(sender);
    SenderEntry* e   = table[idx];
    while (e) {
        if (strncmp(e->sender, sender, 63) == 0) return e;
        e = e->next;
    }
    // crear nuevo
    SenderEntry* ne = (SenderEntry*)calloc(1, sizeof(SenderEntry));
    if (!ne) return NULL;
    strncpy(ne->sender, sender, 63);
    ne->next   = table[idx];
    table[idx] = ne;
    return ne;
}

// ─── Rate limit — sliding window ─────────────────────────────────────────────
/*
 * Retorna:
 *   0 = permitido
 *   1 = rate limit superado
 *   2 = bloqueado temporalmente
 */
EXPORT int check_rate_limit(
    const char* sender,
    int         max_hits,
    long long   window_ms
) {
    SenderEntry* e = get_or_create(sender);
    if (!e) return 0;

    long long now = now_ms();

    // bloqueado?
    if (e->blocked_until > now) return 2;

    RateWindow* w = &e->rate;

    // limpiar entradas fuera de ventana
    int valid = 0;
    long long cutoff = now - window_ms;
    for (int i = 0; i < w->count; i++) {
        int idx = (w->head - w->count + i + MAX_WINDOW_HITS) % MAX_WINDOW_HITS;
        if (w->timestamps[idx] > cutoff) valid++;
    }
    // reconstruir solo válidos
    if (valid < w->count) {
        long long temp[MAX_WINDOW_HITS];
        int tc = 0;
        for (int i = 0; i < w->count; i++) {
            int idx = (w->head - w->count + i + MAX_WINDOW_HITS) % MAX_WINDOW_HITS;
            if (w->timestamps[idx] > cutoff)
                temp[tc++] = w->timestamps[idx];
        }
        for (int i = 0; i < tc; i++) w->timestamps[i] = temp[i];
        w->count = tc;
        w->head  = tc % MAX_WINDOW_HITS;
    }

    // agregar timestamp actual
    w->timestamps[w->head] = now;
    w->head = (w->head + 1) % MAX_WINDOW_HITS;
    if (w->count < MAX_WINDOW_HITS) w->count++;

    // supera límite?
    if (w->count > max_hits) {
        e->warn_count++;
        // bloqueo progresivo: 5s, 15s, 60s
        long long block_durations[] = { 5000, 15000, 60000 };
        int bi = e->warn_count - 1;
        if (bi > 2) bi = 2;
        e->blocked_until = now + block_durations[bi];
        return 1;
    }
    return 0;
}

// ─── Flood detector — texto repetido ─────────────────────────────────────────
/*
 * Retorna:
 *   0 = normal
 *   1 = texto repetido (flood)
 */
EXPORT int check_flood(
    const char* sender,
    const char* text,
    int         max_repeats,
    long long   window_ms
) {
    SenderEntry* e = get_or_create(sender);
    if (!e) return 0;

    long long      now = now_ms();
    RepeatTracker* rt  = &e->repeat;

    // reset ventana
    if (now - rt->last_reset > window_ms) {
        memset(rt->texts,       0, sizeof(rt->texts));
        memset(rt->text_counts, 0, sizeof(rt->text_counts));
        rt->head       = 0;
        rt->size       = 0;
        rt->last_reset = now;
    }

    // buscar texto existente
    for (int i = 0; i < rt->size; i++) {
        if (strncmp(rt->texts[i], text, MAX_TEXT_LEN - 1) == 0) {
            rt->text_counts[i]++;
            if (rt->text_counts[i] >= max_repeats) return 1;
            return 0;
        }
    }

    // texto nuevo
    int slot = rt->head % MAX_REPEAT_TRACK;
    strncpy(rt->texts[slot], text, MAX_TEXT_LEN - 1);
    rt->text_counts[slot] = 1;
    rt->head = (rt->head + 1) % MAX_REPEAT_TRACK;
    if (rt->size < MAX_REPEAT_TRACK) rt->size++;

    return 0;
}

// ─── Check combinado — rate + flood ──────────────────────────────────────────
/*
 * Retorna:
 *   0 = permitido
 *   1 = rate limit
 *   2 = bloqueado
 *   3 = flood (texto repetido)
 */
EXPORT int check_message(
    const char* sender,
    const char* text,
    int         max_hits,
    long long   window_ms,
    int         max_repeats,
    long long   flood_window_ms
) {
    int rate = check_rate_limit(sender, max_hits, window_ms);
    if (rate > 0) return rate;

    if (text && strlen(text) > 3) {
        int flood = check_flood(sender, text, max_repeats, flood_window_ms);
        if (flood) return 3;
    }
    return 0;
}

// ─── Cooldown ─────────────────────────────────────────────────────────────────
EXPORT long long get_cooldown_remaining(const char* sender) {
    SenderEntry* e = get_or_create(sender);
    if (!e) return 0;
    long long remaining = e->blocked_until - now_ms();
    return remaining > 0 ? remaining : 0;
}

// ─── Reset sender ─────────────────────────────────────────────────────────────
EXPORT void reset_sender(const char* sender) {
    unsigned int idx = hash_str(sender);
    SenderEntry* e   = table[idx];
    while (e) {
        if (strncmp(e->sender, sender, 63) == 0) {
            memset(&e->rate,   0, sizeof(RateWindow));
            memset(&e->repeat, 0, sizeof(RepeatTracker));
            e->warn_count    = 0;
            e->blocked_until = 0;
            return;
        }
        e = e->next;
    }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
EXPORT int get_active_senders(void) {
    int count = 0;
    for (int i = 0; i < HASH_SIZE; i++) {
        SenderEntry* e = table[i];
        while (e) { count++; e = e->next; }
    }
    return count;
}

EXPORT void cleanup_old_senders(long long max_age_ms) {
    long long cutoff = now_ms() - max_age_ms;
    for (int i = 0; i < HASH_SIZE; i++) {
        SenderEntry** prev = &table[i];
        SenderEntry*  e    = table[i];
        while (e) {
            // si no ha tenido actividad reciente — liberar
            long long last = 0;
            for (int j = 0; j < e->rate.count; j++) {
                int idx = (e->rate.head - e->rate.count + j + MAX_WINDOW_HITS) % MAX_WINDOW_HITS;
                if (e->rate.timestamps[idx] > last)
                    last = e->rate.timestamps[idx];
            }
            if (last > 0 && last < cutoff) {
                *prev    = e->next;
                free(e);
                e = *prev;
            } else {
                prev = &e->next;
                e    = e->next;
            }
        }
    }
}