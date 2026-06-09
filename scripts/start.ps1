# scripts/start.ps1 — Inicia todos los servicios de WinsiBot en Windows
# Uso: npm run start:win   o   powershell -ExecutionPolicy Bypass -File scripts/start.ps1

$ErrorActionPreference = 'Continue'
$Root    = Split-Path $PSScriptRoot
$VenvPy  = "$Root\python\venv\Scripts\python.exe"
$RustDir = "$Root\rust"
$Dist    = "$Root\dist\index.js"

# Verifica que dist/ exista
if (-not (Test-Path $Dist)) {
    Write-Host "  ERROR: dist/index.js no encontrado. Ejecuta: npm run build" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  WinsiBot — Iniciando servicios (Windows)" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray

$jobs = @()

# ─── Redis ────────────────────────────────────────────────────────────────────
Write-Host "  [1/4] Redis..." -NoNewline
try {
    $r = Start-Process "redis-server" -WindowStyle Minimized -PassThru -ErrorAction Stop
    $jobs += $r
    Write-Host " PID $($r.Id)" -ForegroundColor Green
} catch {
    Write-Host " no disponible (instala Redis o ignorar)" -ForegroundColor Yellow
}

# ─── Flask / Python AI ───────────────────────────────────────────────────────
Write-Host "  [2/4] Flask (uvicorn)..." -NoNewline
if (Test-Path $VenvPy) {
    $flaskArgs = "-m uvicorn api.app:app --host 127.0.0.1 --port 5000 --workers 1 --log-level warning --no-access-log"
    $f = Start-Process $VenvPy -ArgumentList $flaskArgs `
         -WorkingDirectory "$Root\python" -WindowStyle Minimized -PassThru
    $jobs += $f
    Write-Host " PID $($f.Id)" -ForegroundColor Green
} else {
    Write-Host " venv no encontrado (npm run setup)" -ForegroundColor Yellow
}

# ─── Rust API ─────────────────────────────────────────────────────────────────
Write-Host "  [3/4] Rust API..." -NoNewline
$rustBins = Get-ChildItem "$RustDir\target\release\*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch '(deps|build|incremental)' } |
            Select-Object -First 1

if ($rustBins) {
    $rr = Start-Process $rustBins.FullName -WorkingDirectory $RustDir -WindowStyle Minimized -PassThru
    $jobs += $rr
    Write-Host " PID $($rr.Id)  ($($rustBins.Name))" -ForegroundColor Green
} else {
    Write-Host " no compilado (npm run rust:build)" -ForegroundColor Yellow
}

# ─── Esperar servicios ───────────────────────────────────────────────────────
Write-Host "  Esperando 3s para que arranquen..." -ForegroundColor DarkGray
Start-Sleep -Seconds 3

# ─── Bot ─────────────────────────────────────────────────────────────────────
Write-Host "  [4/4] Bot iniciando...`n" -ForegroundColor Cyan

# Cleanup al salir (Ctrl+C)
try {
    node $Dist
} finally {
    Write-Host "`n  Deteniendo servicios..." -ForegroundColor DarkGray
    foreach ($p in $jobs) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Write-Host "  Listo.`n"
}
