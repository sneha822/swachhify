# Swacchify one-time setup (Windows PowerShell).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Safe to run again; it only installs what is missing or out of date.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

# 1. Check tools --------------------------------------------------------------------------
Step "Checking Python and Node.js"
$python = $null
foreach ($candidate in @("python", "py")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $ver = & $candidate -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($ver -and [version]$ver -ge [version]"3.11") { $python = $candidate; break }
    }
}
if (-not $python) { Fail "Python 3.11 or newer is required (3.12 recommended). Install it from https://www.python.org/downloads/ and tick 'Add python.exe to PATH'." }
Write-Host "   Python $(& $python --version)"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js 22 or newer is required. Install the LTS version from https://nodejs.org/" }
$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { Fail "Node.js $(node --version) is too old. Install Node.js 22 LTS from https://nodejs.org/" }
Write-Host "   Node $(node --version)"

# 2. Backend -------------------------------------------------------------------------------
Step "Setting up the backend (Python virtual environment + packages)"
$venvPython = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    & $python -m venv (Join-Path $root "backend\.venv")
}
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $root "backend\requirements-dev.txt")
if ($LASTEXITCODE -ne 0) { Fail "Installing backend packages failed. Check your internet connection and try again." }

$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root "backend\.env.example") $envFile
    Write-Host "   Created backend\.env (edit it to add your ANTHROPIC_API_KEY, optional)"
} else {
    Write-Host "   backend\.env already exists - left unchanged"
}

# 3. Frontend ------------------------------------------------------------------------------
Step "Setting up the frontend (npm packages)"
Push-Location (Join-Path $root "frontend")
try {
    npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed. Check your internet connection and try again." }
} finally {
    Pop-Location
}

Step "Setup complete!"
Write-Host "   Start the app with:  powershell -ExecutionPolicy Bypass -File .\start.ps1"
