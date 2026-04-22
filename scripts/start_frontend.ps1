# scripts/start_frontend.ps1
# Starts the Vite dev server.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\start_frontend.ps1

$ErrorActionPreference = "Stop"

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"

Push-Location $FrontendDir
try {
    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        Write-Host "Installing npm packages (first run) ..." -ForegroundColor Cyan
        npm install
    }
    Write-Host "Starting Vite dev server ..." -ForegroundColor Cyan
    Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
    npm run dev
}
finally {
    Pop-Location
}
