param(
  [string]$Fqbn = "esp32:esp32:esp32",
  [string]$SketchDir = "firmware/esp32-shutter",
  [string]$OutputDir = ".arduino-build/firmware/esp32-shutter"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$syncScriptPath = Join-Path $repoRoot "scripts\sync-firmware-versions.mjs"
$resolvedSketchDir = Join-Path $repoRoot $SketchDir
$resolvedOutputDir = Join-Path $repoRoot $OutputDir
$configPath = Join-Path $resolvedSketchDir "config.h"
$configExamplePath = Join-Path $resolvedSketchDir "config.example.h"

if (Test-Path $syncScriptPath) {
  & node $syncScriptPath
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Get-RepoRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $normalizedBasePath = [System.IO.Path]::GetFullPath($BasePath)
  $normalizedTargetPath = [System.IO.Path]::GetFullPath($TargetPath)

  if ($normalizedTargetPath.StartsWith($normalizedBasePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relativePath = $normalizedTargetPath.Substring($normalizedBasePath.Length).TrimStart('\')
    if ($relativePath) {
      return $relativePath
    }
  }

  return $normalizedTargetPath
}

$relativeSketchDir = Get-RepoRelativePath -BasePath $repoRoot.Path -TargetPath $resolvedSketchDir
$relativeConfigPath = Get-RepoRelativePath -BasePath $repoRoot.Path -TargetPath $configPath

$arduinoCliPath = $null
$arduinoCli = Get-Command arduino-cli -ErrorAction SilentlyContinue
if ($arduinoCli) {
  $arduinoCliPath = $arduinoCli.Source
} else {
  $fallbackArduinoCliPath = "C:\Program Files\Arduino CLI\arduino-cli.exe"
  if (Test-Path $fallbackArduinoCliPath) {
    $arduinoCliPath = $fallbackArduinoCliPath
  }
}

if (-not $arduinoCliPath) {
  throw "arduino-cli was not found on PATH or at C:\Program Files\Arduino CLI\arduino-cli.exe. See docs/arduino-cli-build.md for setup steps."
}

if (-not (Test-Path $resolvedSketchDir)) {
  throw "Sketch directory not found: $resolvedSketchDir"
}

if (-not (Test-Path $configPath)) {
  if (-not (Test-Path $configExamplePath)) {
    throw "Missing config.h and config.example.h in $resolvedSketchDir"
  }

  Copy-Item $configExamplePath $configPath
  Write-Host "Created $relativeConfigPath from config.example.h." -ForegroundColor Yellow
  Write-Host "Update config.h with real WiFi and MQTT values before flashing hardware." -ForegroundColor Yellow
}

function Test-PlaceholderConfigValues {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath
  )

  $configSource = Get-Content -LiteralPath $ConfigPath -Raw
  $placeholderChecks = @(
    @{
      Label = "WIFI_SSID"
      Pattern = 'YOUR_WIFI_SSID'
    }
    @{
      Label = "WIFI_PASSWORD"
      Pattern = 'YOUR_WIFI_PASSWORD'
    }
    @{
      Label = "MQTT_HOST"
      Pattern = 'YOUR_HIVEMQ_HOST'
    }
    @{
      Label = "MQTT_USERNAME"
      Pattern = 'YOUR_HIVEMQ_USERNAME'
    }
    @{
      Label = "MQTT_PASSWORD"
      Pattern = 'YOUR_HIVEMQ_PASSWORD'
    }
    @{
      Label = "API_BASE_URL"
      Pattern = 'https://your-app\.example\.com'
    }
    @{
      Label = "DEVICE_ID"
      Pattern = 'shutter-dev-001'
    }
    @{
      Label = "COMMAND_TOPIC"
      Pattern = 'shutters/shutter-dev-001/commands'
    }
    @{
      Label = "STATUS_TOPIC"
      Pattern = 'shutters/shutter-dev-001/status'
    }
  )

  $offendingFields = @()
  foreach ($check in $placeholderChecks) {
    if ($configSource -match $check.Pattern) {
      $offendingFields += $check.Label
    }
  }

  if ($offendingFields.Count -gt 0) {
    $fields = ($offendingFields | Sort-Object -Unique) -join ", "
    throw "config.h still contains placeholder/example values for: $fields`nUpdate $relativeConfigPath with the real per-device settings before compiling."
  }
}

Test-PlaceholderConfigValues -ConfigPath $configPath

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$compileArgs = @(
  "compile"
  "--fqbn", $Fqbn
  "--output-dir", $resolvedOutputDir
  $resolvedSketchDir
)

Write-Host "Compiling Smart Shutter firmware..." -ForegroundColor Cyan
Write-Host "Arduino CLI: $arduinoCliPath"
Write-Host "FQBN: $Fqbn"
Write-Host "Sketch: $relativeSketchDir"
Write-Host "Output: $resolvedOutputDir"

& $arduinoCliPath @compileArgs

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
