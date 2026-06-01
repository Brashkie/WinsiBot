Write-Host "Compilando modulos Cython..." -ForegroundColor Cyan
Set-Location python/cython_ext
..\..\python\venv\Scripts\python.exe setup.py build_ext --inplace
Set-Location ..\..
Write-Host "Compilacion completada" -ForegroundColor Green