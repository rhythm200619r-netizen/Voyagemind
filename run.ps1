$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

$pythonExe = Join-Path $backendDir '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
  Write-Host "Backend venv not found at: $pythonExe" -ForegroundColor Red
  Write-Host "Create it + install deps first (Python 3.11 recommended)." -ForegroundColor Yellow
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm was not found on PATH. Install Node.js (includes npm) and try again." -ForegroundColor Red
  exit 1
}

$backendCmd = "Set-Location -LiteralPath '$backendDir'; & '$pythonExe' -m uvicorn app.main:app --app-dir '$backendDir' --reload --port 8000"
$frontendCmd = "Set-Location -LiteralPath '$frontendDir'; npm run dev"

Write-Host "Starting backend (FastAPI) in a new window..." -ForegroundColor Cyan
Start-Process -FilePath powershell -ArgumentList @('-NoExit', '-Command', $backendCmd) | Out-Null

Write-Host "Starting frontend (Vite) in a new window..." -ForegroundColor Cyan
Start-Process -FilePath powershell -ArgumentList @('-NoExit', '-Command', $frontendCmd) | Out-Null

Start-Sleep -Seconds 1
Write-Host "Opening http://localhost:5173" -ForegroundColor Green
Start-Process 'http://localhost:5173/' | Out-Null

Write-Host "" 
Write-Host "To stop: close the two PowerShell windows or press Ctrl+C in each." -ForegroundColor Yellow
