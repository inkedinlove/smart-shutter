param(
  [string]$Fqbn = "esp32:esp32:esp32",
  [string]$SketchDir = "firmware/esp32-shutter",
  [string]$OutputDir = ".arduino-build/firmware/esp32-shutter",
  [switch]$RequireProvisionedConfig
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$syncScriptPath = Join-Path $repoRoot "scripts\sync-firmware-versions.mjs"
$generateSharedOtaConfigScriptPath = Join-Path $repoRoot "scripts\generate-shared-ota-config.mjs"
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

function Get-SharedOtaBoardName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ResolvedSketchDir
  )

  $sketchDirName = (Split-Path -Path $ResolvedSketchDir -Leaf).Trim().ToLowerInvariant()

  switch ($sketchDirName) {
    "esp32-shutter" { return "esp32" }
    "esp8266-d1d4-shutter" { return "esp8266-d1d4" }
    default { return $null }
  }
}

$relativeSketchDir = Get-RepoRelativePath -BasePath $repoRoot.Path -TargetPath $resolvedSketchDir
$relativeConfigPath = Get-RepoRelativePath -BasePath $repoRoot.Path -TargetPath $configPath
$sharedOtaBoardName = Get-SharedOtaBoardName -ResolvedSketchDir $resolvedSketchDir
$shouldUseSharedOtaConfig = (-not $RequireProvisionedConfig) -and ($null -ne $sharedOtaBoardName)
$resolvedCompileSketchDir = $resolvedSketchDir
$relativeCompileSketchDir = $relativeSketchDir

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

if ($shouldUseSharedOtaConfig) {
  if (-not (Test-Path $configExamplePath)) {
    throw "Missing config.example.h in $resolvedSketchDir"
  }
} elseif (-not (Test-Path $configPath)) {
  if (-not (Test-Path $configExamplePath)) {
    throw "Missing config.h and config.example.h in $resolvedSketchDir"
  }

  Copy-Item $configExamplePath $configPath
  Write-Host "Created $relativeConfigPath from config.example.h." -ForegroundColor Yellow
  Write-Host "Update config.h with real WiFi and MQTT values before flashing hardware." -ForegroundColor Yellow
}

function Get-PlaceholderConfigFields {
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

  return $offendingFields | Sort-Object -Unique
}

$placeholderFields = @()
if (Test-Path $configPath) {
  $placeholderFields = @(Get-PlaceholderConfigFields -ConfigPath $configPath)
  if ($placeholderFields.Count -gt 0) {
    $fields = $placeholderFields -join ", "
    if ($RequireProvisionedConfig) {
      throw "config.h still contains placeholder/example values for: $fields`nUpdate $relativeConfigPath with the real per-device settings before compiling."
    }

    Write-Host "config.h contains placeholder/generic values for: $fields" -ForegroundColor Yellow
  }
}

if ($shouldUseSharedOtaConfig) {
  if (-not (Test-Path $generateSharedOtaConfigScriptPath)) {
    throw "Shared OTA config generator not found: $generateSharedOtaConfigScriptPath"
  }

  $temporarySketchRoot = Join-Path $repoRoot ".arduino-build\tmp"
  $temporaryBuildSessionDir = Join-Path $temporarySketchRoot ([Guid]::NewGuid().ToString("N"))
  $temporarySketchDir = Join-Path $temporaryBuildSessionDir (Split-Path -Path $resolvedSketchDir -Leaf)
  New-Item -ItemType Directory -Force -Path $temporarySketchDir | Out-Null
  Copy-Item -Path (Join-Path $resolvedSketchDir "*") -Destination $temporarySketchDir -Recurse -Force

  $generatedConfig = & node $generateSharedOtaConfigScriptPath $sharedOtaBoardName
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $generatedConfigPath = Join-Path $temporarySketchDir "config.h"
  $utf8NoBomEncoding = New-Object System.Text.UTF8Encoding($false)
  $generatedConfigText = (($generatedConfig | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)
  [System.IO.File]::WriteAllText(
    $generatedConfigPath,
    $generatedConfigText + [Environment]::NewLine,
    $utf8NoBomEncoding
  )

  $resolvedCompileSketchDir = $temporarySketchDir
  $relativeCompileSketchDir =
    Get-RepoRelativePath -BasePath $repoRoot.Path -TargetPath $resolvedCompileSketchDir

  Write-Host "Using generated shared-cloud OTA config for board '$sharedOtaBoardName'." -ForegroundColor Yellow
  Write-Host "WiFi remains blank and device identity stays generic so saved per-device settings can win at runtime." -ForegroundColor Yellow
} elseif ($placeholderFields.Count -gt 0) {
  Write-Host "Continuing because generic OTA/factory builds are allowed; use -RequireProvisionedConfig for a strict recovery/manual-flash build." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$compileArgs = @(
  "compile"
  "--fqbn", $Fqbn
  "--output-dir", $resolvedOutputDir
  $resolvedCompileSketchDir
)

Write-Host "Compiling Smart Shutter firmware..." -ForegroundColor Cyan
Write-Host "Arduino CLI: $arduinoCliPath"
Write-Host "FQBN: $Fqbn"
Write-Host "Sketch: $relativeCompileSketchDir"
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
