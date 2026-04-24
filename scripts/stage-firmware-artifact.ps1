param(
  [string]$Version = "0.1.0-dev",
  [string]$SourcePath = ".arduino-build/firmware/esp32-shutter/esp32-shutter.ino.merged.bin"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$resolvedSourcePath = Join-Path $repoRoot $SourcePath
$releaseDir = Join-Path $repoRoot "apps/web/public/firmware/releases/$Version"
$outputFileName = "smart-shutter-$Version-merged.bin"
$resolvedOutputPath = Join-Path $releaseDir $outputFileName

if (-not (Test-Path $resolvedSourcePath)) {
  throw "Merged firmware binary not found: $resolvedSourcePath`nCompile firmware first so esp32-shutter.ino.merged.bin exists."
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item $resolvedSourcePath $resolvedOutputPath -Force

$hash = Get-FileHash -Path $resolvedOutputPath -Algorithm SHA256
$sizeBytes = (Get-Item $resolvedOutputPath).Length

Write-Host "Staged firmware artifact:" -ForegroundColor Green
Write-Host " - Source: $resolvedSourcePath"
Write-Host " - Output: $resolvedOutputPath"
Write-Host ""
Write-Host "Artifact metadata:" -ForegroundColor Cyan
Write-Host "sha256=$($hash.Hash.ToLowerInvariant())"
Write-Host "sizeBytes=$sizeBytes"
