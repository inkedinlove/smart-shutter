param(
  [string]$Fqbn = "esp32:esp32:esp32",
  [string]$SketchDir = "firmware/esp32-shutter",
  [string]$OutputDir = ".arduino-build/firmware/esp32-shutter"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resolvedSketchDir = Join-Path $repoRoot $SketchDir
$resolvedOutputDir = Join-Path $repoRoot $OutputDir
$configPath = Join-Path $resolvedSketchDir "config.h"
$configExamplePath = Join-Path $resolvedSketchDir "config.example.h"

$arduinoCli = Get-Command arduino-cli -ErrorAction SilentlyContinue
if (-not $arduinoCli) {
  throw "arduino-cli is not installed or not on PATH. See docs/arduino-cli-build.md for setup steps."
}

if (-not (Test-Path $resolvedSketchDir)) {
  throw "Sketch directory not found: $resolvedSketchDir"
}

if (-not (Test-Path $configPath)) {
  if (-not (Test-Path $configExamplePath)) {
    throw "Missing config.h and config.example.h in $resolvedSketchDir"
  }

  Copy-Item $configExamplePath $configPath
  Write-Host "Created firmware/esp32-shutter/config.h from config.example.h." -ForegroundColor Yellow
  Write-Host "Update config.h with real WiFi and MQTT values before flashing hardware." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$compileArgs = @(
  "compile"
  "--fqbn", $Fqbn
  "--output-dir", $resolvedOutputDir
  $resolvedSketchDir
)

Write-Host "Compiling Smart Shutter firmware..." -ForegroundColor Cyan
Write-Host "FQBN: $Fqbn"
Write-Host "Sketch: $resolvedSketchDir"
Write-Host "Output: $resolvedOutputDir"

& $arduinoCli.Source @compileArgs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$binFiles = Get-ChildItem -Path $resolvedOutputDir -Filter *.bin -File

if (-not $binFiles) {
  throw "Compile finished but no .bin artifacts were found in $resolvedOutputDir"
}

Write-Host ""
Write-Host "Firmware artifacts:" -ForegroundColor Green
$binFiles | ForEach-Object {
  Write-Host " - $($_.FullName)"
}
