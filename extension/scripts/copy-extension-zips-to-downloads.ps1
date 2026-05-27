$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$sourceDir = Join-Path $repoRoot "frontend\public\downloads"
$targetDir = Join-Path $env:USERPROFILE "Downloads"
$files = @("raceday-extension.zip", "raceday-extension-firefox.zip")

New-Item -Path $targetDir -ItemType Directory -Force | Out-Null

foreach ($file in $files) {
  $source = Join-Path $sourceDir $file
  $target = Join-Path $targetDir $file

  if (-not (Test-Path $source)) {
    throw "Missing extension zip: $source"
  }

  Copy-Item -Path $source -Destination $target -Force
  Write-Host "Copied $file to $target"
}
