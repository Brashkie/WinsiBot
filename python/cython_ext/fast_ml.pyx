# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False

import numpy as np
cimport numpy as cnp

# ─── Normalización rápida ─────────────────────────────────────────────────────
def normalize(cnp.ndarray[cnp.float64_t, ndim=1] arr):
    """Normaliza un array numpy entre 0 y 1"""
    cdef double min_val = arr.min()
    cdef double max_val = arr.max()
    cdef double rng = max_val - min_val
    if rng == 0:
        return arr
    return (arr - min_val) / rng

# ─── Similaridad coseno ───────────────────────────────────────────────────────
def cosine_similarity(
    cnp.ndarray[cnp.float64_t, ndim=1] a,
    cnp.ndarray[cnp.float64_t, ndim=1] b
):
    """Calcula similitud coseno entre dos vectores"""
    cdef double dot   = np.dot(a, b)
    cdef double norm_a = np.sqrt(np.dot(a, a))
    cdef double norm_b = np.sqrt(np.dot(b, b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)

# ─── Tokenizer simple ─────────────────────────────────────────────────────────
def tokenize(str text, int max_len=128):
    """Tokeniza texto a lista de ints (para ML básico)"""
    cdef list tokens = []
    cdef str word
    for word in text.lower().split():
        tokens.append(hash(word) % 10000)
        if len(tokens) >= max_len:
            break
    return tokens