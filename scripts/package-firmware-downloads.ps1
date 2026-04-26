param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$publicDownloadsDir = Join-Path $repoRoot "apps\web\public\downloads"
$tempRoot = Join-Path $repoRoot ".tmp\firmware-download-packages"

function Reset-Directory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }

  New-Item -ItemType Directory -Path $Path | Out-Null
}

function Write-Readme {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string[]]$Lines
  )

  $content = ($Lines -join [Environment]::NewLine) + [Environment]::NewLine
  Set-Content -LiteralPath $Path -Value $content -Encoding ASCII
}

function New-FirmwarePackage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SketchDirName,
    [Parameter(Mandatory = $true)]
    [string]$ZipBaseName,
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string[]]$ReadmeLines
  )

  $sourceDir = Join-Path $repoRoot "firmware\$SketchDirName"
  $sourceInoPath = Join-Path $sourceDir "$SketchDirName.ino"
  $sourceConfigPath = Join-Path $sourceDir "config.example.h"

  if (!(Test-Path -LiteralPath $sourceInoPath)) {
    throw "Missing sketch file: $sourceInoPath"
  }

  if (!(Test-Path -LiteralPath $sourceConfigPath)) {
    throw "Missing config example file: $sourceConfigPath"
  }

  $packageRoot = Join-Path $tempRoot $ZipBaseName
  $packageSketchDir = Join-Path $packageRoot $SketchDirName

  Reset-Directory -Path $packageRoot
  New-Item -ItemType Directory -Path $packageSketchDir | Out-Null

  Copy-Item -LiteralPath $sourceInoPath -Destination (Join-Path $packageSketchDir "$SketchDirName.ino")
  Copy-Item -LiteralPath $sourceConfigPath -Destination (Join-Path $packageSketchDir "config.example.h")

  Write-Readme -Path (Join-Path $packageRoot "README.txt") -Lines $ReadmeLines

  $destinationZip = Join-Path $publicDownloadsDir "$ZipBaseName.zip"

  if (Test-Path -LiteralPath $destinationZip) {
    Remove-Item -LiteralPath $destinationZip -Force
  }

  Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $destinationZip -Force

  return $destinationZip
}

Reset-Directory -Path $publicDownloadsDir
Reset-Directory -Path $tempRoot

$esp8266Zip = New-FirmwarePackage `
  -SketchDirName "esp8266-shutter" `
  -ZipBaseName "smart-shutter-esp8266-sketch" `
  -ReadmeLines @(
    "Smart Shutter ESP8266 Sketch Package",
    "",
    "Contents:",
    "- esp8266-shutter\esp8266-shutter.ino",
    "- esp8266-shutter\config.example.h",
    "",
    "Quick steps:",
    "1. Open Arduino IDE.",
    "2. Install the 'esp8266 by ESP8266 Community' board package.",
    "3. Open esp8266-shutter\esp8266-shutter.ino.",
    "4. Copy config.example.h to config.h and edit it before flashing.",
    "5. For NodeMCU boards, use: NodeMCU 1.0 (ESP-12E Module).",
    "6. Upload, then watch Serial Monitor at 115200.",
    "",
    "Site help:",
    "- Open /flash on Smart Shutter for the latest recovery steps."
  )

$esp32Zip = New-FirmwarePackage `
  -SketchDirName "esp32-shutter" `
  -ZipBaseName "smart-shutter-esp32-sketch" `
  -ReadmeLines @(
    "Smart Shutter ESP32 Sketch Package",
    "",
    "Contents:",
    "- esp32-shutter\esp32-shutter.ino",
    "- esp32-shutter\config.example.h",
    "",
    "Quick steps:",
    "1. Open Arduino IDE.",
    "2. Install the ESP32 board package if it is not already present.",
    "3. Open esp32-shutter\esp32-shutter.ino.",
    "4. Copy config.example.h to config.h and edit it before flashing.",
    "5. Select the matching ESP32 board and COM port.",
    "6. Upload, then watch Serial Monitor at 115200.",
    "",
    "Site help:",
    "- Open /flash on Smart Shutter for the latest recovery steps."
  )

Write-Host "Created firmware download packages:"
Write-Host " - $esp8266Zip"
Write-Host " - $esp32Zip"

if (Test-Path -LiteralPath $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
