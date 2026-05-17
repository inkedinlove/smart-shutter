param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$syncScriptPath = Join-Path $repoRoot "scripts\sync-firmware-versions.mjs"
$publicDownloadsDir = Join-Path $repoRoot "apps\web\public\downloads"
$publicProvisioningAssetsDir = Join-Path $repoRoot "apps\web\public\provisioning-assets"
$tempRoot = Join-Path $repoRoot ".tmp\firmware-download-packages"

if (Test-Path $syncScriptPath) {
  & node $syncScriptPath
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

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
  $publicAssetSketchDir = Join-Path $publicProvisioningAssetsDir $SketchDirName

  Reset-Directory -Path $packageRoot
  New-Item -ItemType Directory -Path $packageSketchDir | Out-Null
  Reset-Directory -Path $publicAssetSketchDir

  Copy-Item -LiteralPath $sourceInoPath -Destination (Join-Path $packageSketchDir "$SketchDirName.ino")
  Copy-Item -LiteralPath $sourceConfigPath -Destination (Join-Path $packageSketchDir "config.example.h")
  Copy-Item -LiteralPath $sourceConfigPath -Destination (Join-Path $packageSketchDir "config.h")
  Copy-Item -LiteralPath $sourceInoPath -Destination (Join-Path $publicAssetSketchDir "$SketchDirName.ino")
  Copy-Item -LiteralPath $sourceConfigPath -Destination (Join-Path $publicAssetSketchDir "config.example.h")

  Write-Readme -Path (Join-Path $packageRoot "README.txt") -Lines $ReadmeLines

  $destinationZip = Join-Path $publicDownloadsDir "$ZipBaseName.zip"

  if (Test-Path -LiteralPath $destinationZip) {
    Remove-Item -LiteralPath $destinationZip -Force
  }

  Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $destinationZip -Force

  return $destinationZip
}

Reset-Directory -Path $publicDownloadsDir
Reset-Directory -Path $publicProvisioningAssetsDir
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
    "- esp8266-shutter\config.h",
    "",
    "Quick steps:",
    "1. Open Arduino IDE.",
    "2. Install the 'esp8266 by ESP8266 Community' board package.",
    "3. Open esp8266-shutter\esp8266-shutter.ino.",
    "4. Edit config.h before flashing.",
    "5. For NodeMCU boards, use: NodeMCU 1.0 (ESP-12E Module).",
    "6. Upload, then watch Serial Monitor at 115200.",
    "",
    "Site help:",
    "- Open /flash on Smart Shutter for the latest recovery steps."
  )

$esp8266D1D4Zip = New-FirmwarePackage `
  -SketchDirName "esp8266-d1d4-shutter" `
  -ZipBaseName "smart-shutter-esp8266-d1d4-sketch" `
  -ReadmeLines @(
    "Smart Shutter ESP8266 D1-D4 Stepper Sketch Package",
    "",
    "Contents:",
    "- esp8266-d1d4-shutter\esp8266-d1d4-shutter.ino",
    "- esp8266-d1d4-shutter\config.example.h",
    "- esp8266-d1d4-shutter\config.h",
    "",
    "Quick steps:",
    "1. Open Arduino IDE.",
    "2. Install the 'esp8266 by ESP8266 Community' board package.",
    "3. Open esp8266-d1d4-shutter\esp8266-d1d4-shutter.ino.",
    "4. Use: NodeMCU 1.0 (ESP-12E Module), or the closest ESP8266 board match.",
    "5. Set Tools -> MMU to: 16KB cache + 48KB IRAM (IRAM).",
    "6. This package is for the known-good D1/D2/D3/D4 ULN2003 wiring profile.",
    "7. Upload, then watch Serial Monitor at 115200.",
    "",
    "Site help:",
    "- Open /flash on Smart Shutter for the latest recovery steps."
  )

$esp8266ServoZip = New-FirmwarePackage `
  -SketchDirName "esp8266-servo-shutter" `
  -ZipBaseName "smart-shutter-esp8266-servo-sketch" `
  -ReadmeLines @(
    "Smart Shutter ESP8266 Servo Sketch Package",
    "",
    "Contents:",
    "- esp8266-servo-shutter\esp8266-servo-shutter.ino",
    "- esp8266-servo-shutter\config.example.h",
    "- esp8266-servo-shutter\config.h",
    "",
    "Quick steps:",
    "1. Open Arduino IDE.",
    "2. Install the 'esp8266 by ESP8266 Community' board package.",
    "3. Open esp8266-servo-shutter\esp8266-servo-shutter.ino.",
    "4. Use: NodeMCU 1.0 (ESP-12E Module), or the closest ESP8266 board match.",
    "5. Upload, then watch Serial Monitor at 115200.",
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
    "- esp32-shutter\config.h",
    "",
    "Quick steps:",
    "1. Open Arduino IDE.",
    "2. Install the ESP32 board package if it is not already present.",
    "3. Open esp32-shutter\esp32-shutter.ino.",
    "4. Edit config.h before flashing.",
    "5. Select the matching ESP32 board and COM port.",
    "6. Upload, then watch Serial Monitor at 115200.",
    "",
    "Site help:",
    "- Open /flash on Smart Shutter for the latest recovery steps."
  )

Write-Host "Created firmware download packages:"
Write-Host " - $esp8266Zip"
Write-Host " - $esp8266D1D4Zip"
Write-Host " - $esp8266ServoZip"
Write-Host " - $esp32Zip"

if (Test-Path -LiteralPath $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
