# scripts/setup_backend.ps1
# Windows PowerShell backend bootstrap: create venv, install deps, copy .env.sample -> .env
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup_backend.ps1

$ErrorActionPreference = "Stop"

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$AdkDir     = Join-Path $RepoRoot "backend\adk_agent"
$VenvDir    = Join-Path $AdkDir ".venv"
$EnvFile    = Join-Path $AdkDir "gemini_agent\.env"
$EnvSample  = Join-Path $AdkDir "gemini_agent\.env.sample"

Write-Host "[1/4] Looking for Python..." -ForegroundColor Cyan
$py = $null
foreach ($candidate in @("py -3.12", "py -3.11", "py -3.13", "python")) {
    try {
        $ver = & cmd /c "$candidate --version 2>&1"
        if ($LASTEXITCODE -eq 0) { $py = $candidate; Write-Host "    using $candidate ($ver)"; break }
    } catch {}
}
if (-not $py) {
    throw "Python not found. Install Python 3.11 or 3.12 from https://www.python.org/downloads/"
}

Write-Host "[2/4] Creating venv at $VenvDir" -ForegroundColor Cyan
$VenvPy = Join-Path $VenvDir "Scripts\python.exe"
# If .venv exists but has no Windows python.exe (e.g. created under WSL), recreate it.
if ((Test-Path $VenvDir) -and -not (Test-Path $VenvPy)) {
    Write-Host "    Incompatible .venv detected (likely from WSL/macOS). Recreating..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $VenvDir
}
if (-not (Test-Path $VenvDir)) {
    & cmd /c "$py -m venv `"$VenvDir`""
    if ($LASTEXITCODE -ne 0) { throw "venv creation failed" }
} else {
    Write-Host "    Already exists, skipping."
}

Write-Host "[3/4] Installing Python packages..." -ForegroundColor Cyan
& $VenvPy -m pip install --upgrade pip
& $VenvPy -m pip install -r (Join-Path $AdkDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

Write-Host "[4/4] Preparing gemini_agent/.env ..." -ForegroundColor Cyan
if (-not (Test-Path $EnvFile)) {
    Copy-Item $EnvSample $EnvFile
    Write-Host "    Created .env from .env.sample -- edit it and fill in GOOGLE_API_KEY." -ForegroundColor Yellow
    Write-Host "    File: $EnvFile"
} else {
    Write-Host "    Already exists, not overwriting."
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Edit $EnvFile and set GOOGLE_API_KEY"
Write-Host "  2. Run .\scripts\start_backend.ps1  (serves port 8000)"
Write-Host "  3. In another terminal run .\scripts\start_frontend.ps1  (serves port 5173)"
