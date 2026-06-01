from setuptools import setup, Extension
from Cython.Build import cythonize
import numpy as np

extensions = [
    Extension(
        "fast_utils",
        ["fast_utils.pyx"],
        extra_compile_args=["-O3", "-march=native"],
    ),
    Extension(
        "fast_ml",
        ["fast_ml.pyx"],
        include_dirs=[np.get_include()],
        extra_compile_args=["-O3", "-march=native"],
    ),
]

setup(
    name="winsibot_ext",
    ext_modules=cythonize(
        extensions,
        compiler_directives={
            "language_level": "3",
            "boundscheck": False,
            "wraparound": False,
            "cdivision": True,
        },
        annotate=True,
    ),
)