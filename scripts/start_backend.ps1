# scripts/start_backend.ps1
# Starts ADK Agent (port 8001) and API Proxy (port 8000) in one shell.
# Ctrl+C stops both.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AdkDir   = Join-Path $RepoRoot "backend\adk_agent"
$VenvPy   = Join-Path $AdkDir ".venv\Scripts\python.exe"
$EnvFile  = Join-Path $AdkDir "gemini_agent\.env"

if (-not (Test-Path $VenvPy)) {
    throw "Missing $VenvPy. Run .\scripts\setup_backend.ps1 first."
}
if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile. Run setup_backend.ps1 first and set GOOGLE_API_KEY."
}

Push-Location $AdkDir
$adk = $null
try {
    Write-Host "Starting ADK Agent Web UI (port 8001) ..." -ForegroundColor Cyan
    $adkLog = Join-Path $AdkDir "adk_server.log"
    $adkExe = Join-Path $AdkDir ".venv\Scripts\adk.exe"
    if (-not (Test-Path $adkExe)) {
        throw "Cannot find $adkExe. Try re-running setup_backend.ps1."
    }
    if (Test-Path $adkLog) { Remove-Item $adkLog -Force -ErrorAction SilentlyContinue }

    # Start ADK in a PowerShell background job. Job stdout/stderr is captured
    # to $adkLog via a small relay below. This avoids both the
    # Start-Process -RedirectStandardOutput bug and .cmd wrappers breaking on
    # non-ASCII repo paths.
    $adkJob = Start-Job -ArgumentList $adkExe, $AdkDir -ScriptBlock {
        param($exe, $workDir)
        Set-Location $workDir
        # NB: don't pass `--allow_origins "*"` here — on Windows the glob gets
        # expanded by the shell wrapper and confuses click's positional parser.
        # CORS isn't needed for local dev because Vite proxies all /api calls.
        & $exe web --host 0.0.0.0 --port 8001 2>&1
    }

    # Probe the port while also relaying job output to the log file.
    $bound = $false
    $adkJobFailed = $false
    for ($i = 0; $i -lt 60; $i++) {
        # Drain any new lines from the job into the log
        $lines = Receive-Job -Job $adkJob -Keep:$false 2>&1
        if ($lines) { $lines | Out-File -FilePath $adkLog -Append -Encoding utf8 }

        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", 8001)
            $tcp.Close()
            $bound = $true
            break
        } catch { Start-Sleep -Milliseconds 500 }

        if ($adkJob.State -eq "Completed" -or $adkJob.State -eq "Failed") {
            $adkJobFailed = $true
            break
        }
    }
    # Final drain
    $lines = Receive-Job -Job $adkJob -Keep:$false 2>&1
    if ($lines) { $lines | Out-File -FilePath $adkLog -Append -Encoding utf8 }

    if (-not $bound) {
        Write-Host "--- adk_server.log ---" -ForegroundColor Yellow
        if (Test-Path $adkLog) { Get-Content $adkLog -Tail 50 }
        throw "ADK Agent failed to bind port 8001. See $adkLog"
    }

    Write-Host "Starting API Proxy (port 8000) ..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Frontend:   http://127.0.0.1:5173  (vite dev)" -ForegroundColor Green
    Write-Host "Backend:    http://127.0.0.1:8000" -ForegroundColor Green
    Write-Host "ADK UI:     http://127.0.0.1:8001" -ForegroundColor Green
    Write-Host ""

    $env:ADK_PORT = "8001"
    & $VenvPy -m uvicorn api_proxy_server:app --host 0.0.0.0 --port 8000
}
finally {
    Write-Host ""
    Write-Host "Stopping ADK Agent ..." -ForegroundColor Yellow
    if ($adkJob) {
        try {
            # Stop-Job signals, but the adk.exe child process often outlives the
            # PS job host — kill by executable path explicitly.
            Stop-Job -Job $adkJob -ErrorAction SilentlyContinue
            Remove-Job -Job $adkJob -Force -ErrorAction SilentlyContinue
        } catch {}
    }
    Get-Process -Name "adk" -ErrorAction SilentlyContinue | ForEach-Object {
        try { if ($_.Path -and $_.Path.StartsWith($AdkDir)) { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } } catch {}
    }
    Pop-Location
}
