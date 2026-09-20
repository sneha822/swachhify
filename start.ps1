# Starts Swacchify: the API and the website each open in their own window, then your browser opens.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File .\start.ps1
# To stop: close the two windows (or press Ctrl+C in each).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$venvPython = Join-Path $root "backend\.venv\Scripts\python.exe"

if (-not (Test-Path $venvPython) -or -not (Test-Path (Join-Path $root "frontend\node_modules"))) {
    Write-Host "Swacchify isn't set up yet. Run this first:" -ForegroundColor Yellow
    Write-Host "   powershell -ExecutionPolicy Bypass -File .\setup.ps1"
    exit 1
}

function PortInUse($port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (PortInUse 8000) {
    Write-Host "Port 8000 is already in use - the API may already be running. Skipping." -ForegroundColor Yellow
} else {
    Write-Host "Starting the API on http://localhost:8000 ..." -ForegroundColor Green
    Start-Process powershell -WorkingDirectory (Join-Path $root "backend") -ArgumentList @(
        "-NoExit", "-Command",
        "`$host.UI.RawUI.WindowTitle = 'Swacchify API'; & '$venvPython' -m uvicorn app.main:app --reload --reload-dir app --port 8000"
    )
}

if (PortInUse 5173) {
    Write-Host "Port 5173 is already in use - the website may already be running. Skipping." -ForegroundColor Yellow
} else {
    Write-Host "Starting the website on http://localhost:5173 ..." -ForegroundColor Green
    Start-Process powershell -WorkingDirectory (Join-Path $root "frontend") -ArgumentList @(
        "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = 'Swacchify Web'; npm run dev"
    )
}

# The first start seeds the demo data, which takes 10-30 seconds.
Write-Host "Waiting for the API to be ready (first start takes up to a minute)..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        # 127.0.0.1, not "localhost": Windows may try IPv6 first, and uvicorn listens on IPv4.
        Invoke-WebRequest -Uri "http://127.0.0.1:8000/healthz" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($ready) {
    Write-Host "`nSwacchify is running:  http://localhost:5173" -ForegroundColor Green
    Write-Host "Demo sign-in password for every demo account:  Swacchify@123"
    Start-Process "http://localhost:5173"
} else {
    Write-Host "`nThe API didn't respond yet. Check the 'Swacchify API' window for errors." -ForegroundColor Yellow
}
