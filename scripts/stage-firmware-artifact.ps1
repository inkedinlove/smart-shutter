param(
  [string]$Board = "esp32",
  [string]$Version = "",
  [string]$SourcePath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$syncScriptPath = Join-Path $repoRoot "scripts\sync-firmware-versions.mjs"
$firmwareVersionsPath = Join-Path $repoRoot "apps\web\config\firmware-versions.json"
$webFlashManifestPath = Join-Path $repoRoot "apps\web\public\firmware\manifest.json"

if (Test-Path $syncScriptPath) {
  & node $syncScriptPath
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path -LiteralPath $firmwareVersionsPath)) {
  throw "Firmware version catalog not found: $firmwareVersionsPath"
}

$firmwareVersions = Get-Content -LiteralPath $firmwareVersionsPath -Raw | ConvertFrom-Json
$normalizedBoard = $Board.Trim().ToLowerInvariant()

function Get-CatalogBoardVersion {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Catalog,
    [Parameter(Mandatory = $true)]
    [string]$BoardName
  )

  $property = $Catalog.boards.PSObject.Properties[$BoardName]
  if ($null -eq $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
    throw "No firmware version is configured for board '$BoardName' in $firmwareVersionsPath"
  }

  return [string]$property.Value
}

$resolvedVersion =
  if ([string]::IsNullOrWhiteSpace($Version)) {
    Get-CatalogBoardVersion -Catalog $firmwareVersions -BoardName $normalizedBoard
  } else {
    $Version.Trim()
  }

$boardDefaults = @{
  "esp32" = @{
    otaSourcePath = ".arduino-build/firmware/esp32-shutter/esp32-shutter.ino.bin"
    flashSourcePath = ".arduino-build/firmware/esp32-shutter/esp32-shutter.ino.merged.bin"
    otaOutputFileName = "smart-shutter-$resolvedVersion.bin"
    flashOutputFileName = "smart-shutter-$resolvedVersion-merged.bin"
    chipFamily = "ESP32"
    updateWebFlashManifest = $true
  }
  "esp8266" = @{
    otaSourcePath = ".arduino-build/firmware/esp8266-shutter/esp8266-shutter.ino.bin"
    flashSourcePath = $null
    otaOutputFileName = "smart-shutter-$resolvedVersion.bin"
    flashOutputFileName = $null
    chipFamily = $null
    updateWebFlashManifest = $false
  }
  "esp8266-d1d4" = @{
    otaSourcePath = ".arduino-build/firmware/esp8266-d1d4-shutter/esp8266-d1d4-shutter.ino.bin"
    flashSourcePath = $null
    otaOutputFileName = "smart-shutter-$resolvedVersion.bin"
    flashOutputFileName = $null
    chipFamily = $null
    updateWebFlashManifest = $false
  }
  "esp8266-servo" = @{
    otaSourcePath = ".arduino-build/firmware/esp8266-servo-shutter/esp8266-servo-shutter.ino.bin"
    flashSourcePath = $null
    otaOutputFileName = "smart-shutter-$resolvedVersion.bin"
    flashOutputFileName = $null
    chipFamily = $null
    updateWebFlashManifest = $false
  }
}

$boardConfig = $boardDefaults[$normalizedBoard]
if ($null -eq $boardConfig) {
  throw "Unsupported board '$Board'. Expected one of: $($boardDefaults.Keys -join ', ')"
}

$otaSourcePath =
  if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $boardConfig.otaSourcePath
  } else {
    $SourcePath
  }

$resolvedOtaSourcePath = Join-Path $repoRoot $otaSourcePath
$releaseDir = Join-Path $repoRoot "apps/web/public/firmware/releases/$resolvedVersion"
$resolvedOtaOutputPath = Join-Path $releaseDir $boardConfig.otaOutputFileName

if (-not (Test-Path -LiteralPath $resolvedOtaSourcePath)) {
  throw "OTA firmware artifact not found: $resolvedOtaSourcePath`nCompile firmware first so the board-specific .bin exists."
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item -LiteralPath $resolvedOtaSourcePath -Destination $resolvedOtaOutputPath -Force

$hash = Get-FileHash -Path $resolvedOtaOutputPath -Algorithm SHA256
$sizeBytes = (Get-Item $resolvedOtaOutputPath).Length

$resolvedFlashOutputPath = $null
if ($boardConfig.updateWebFlashManifest) {
  $resolvedFlashSourcePath = Join-Path $repoRoot $boardConfig.flashSourcePath

  if (-not (Test-Path -LiteralPath $resolvedFlashSourcePath)) {
    throw "Browser flash artifact not found: $resolvedFlashSourcePath`nCompile firmware first so the merged browser-flash binary exists."
  }

  $resolvedFlashOutputPath = Join-Path $releaseDir $boardConfig.flashOutputFileName
  Copy-Item -LiteralPath $resolvedFlashSourcePath -Destination $resolvedFlashOutputPath -Force

  $flashManifest = @{
    name = "Smart Shutter"
    version = $resolvedVersion
    home_assistant_domain = "smart_shutter"
    funding_url = ""
    new_install_prompt_erase = $true
    builds = @(
      @{
        chipFamily = $boardConfig.chipFamily
        parts = @(
          @{
            path = "/firmware/releases/$resolvedVersion/$($boardConfig.flashOutputFileName)"
            offset = 0
          }
        )
      }
    )
  }

  $manifestJson = $flashManifest | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $webFlashManifestPath -Value ($manifestJson + [Environment]::NewLine) -Encoding UTF8
}

$artifactUrl = "/firmware/releases/$resolvedVersion/$($boardConfig.otaOutputFileName)"

Write-Host "Staged firmware artifact:" -ForegroundColor Green
Write-Host " - Board: $normalizedBoard"
Write-Host " - OTA source: $resolvedOtaSourcePath"
Write-Host " - OTA output: $resolvedOtaOutputPath"

if ($resolvedFlashOutputPath) {
  Write-Host " - Browser flash output: $resolvedFlashOutputPath"
  Write-Host " - Browser flash manifest: $webFlashManifestPath"
}

Write-Host ""
Write-Host "Artifact metadata:" -ForegroundColor Cyan
Write-Host "version=$resolvedVersion"
Write-Host "board=$normalizedBoard"
Write-Host "artifactUrl=$artifactUrl"
Write-Host "sha256=$($hash.Hash.ToLowerInvariant())"
Write-Host "sizeBytes=$sizeBytes"
Write-Host "channel=$($firmwareVersions.defaultChannel)"
