<#!
.SYNOPSIS
Creates a Tinify-optimized copy of the crowd persona sprite.

.DESCRIPTION
Reads the Tinify/TinyPNG API key from .env.local and optimizes only the
3600 x 2268 crowd sprite used by the site. The original image is not changed.

.EXAMPLE
pwsh -ExecutionPolicy Bypass -File .\scripts\optimize-crowd-tinify.ps1
#>

[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env.local'
$source = Join-Path $projectRoot 'public\images\peeps\all-peeps.png'
$output = Join-Path $projectRoot 'public\images\peeps\all-peeps.tinify.png'

function Get-TinifyApiKey {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw ".env.local was not found at $Path"
  }

  $line = [System.IO.File]::ReadAllLines($Path) |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') } |
    Where-Object { $_ -match '(?i)^\s*(?:tinify|tinypng)\s+api\s*:' } |
    Select-Object -First 1

  if (-not $line) {
    throw 'No "Tinify API: ..." or "TinyPNG API: ..." entry was found in .env.local.'
  }

  $key = ($line -replace '(?i)^\s*(?:tinify|tinypng)\s+api\s*:\s*', '').Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw 'The Tinify API entry in .env.local is empty.'
  }

  return $key
}

function Get-PngDimensions {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $signature = [byte[]](137,80,78,71,13,10,26,10)
  $hasValidSignature = $bytes.Length -ge 24
  for ($index = 0; $hasValidSignature -and $index -lt $signature.Length; $index++) {
    $hasValidSignature = $bytes[$index] -eq $signature[$index]
  }

  if (-not $hasValidSignature) {
    throw "$Path is not a valid PNG file."
  }

  return [pscustomobject]@{
    Width  = ([int]$bytes[16] * 16777216) + ([int]$bytes[17] * 65536) + ([int]$bytes[18] * 256) + [int]$bytes[19]
    Height = ([int]$bytes[20] * 16777216) + ([int]$bytes[21] * 65536) + ([int]$bytes[22] * 256) + [int]$bytes[23]
  }
}

if (-not (Test-Path -LiteralPath $source)) {
  throw "Crowd sprite was not found at $source"
}

if ((Test-Path -LiteralPath $output) -and -not $Force) {
  throw "A Tinify copy already exists at $output. Re-run with -Force to replace it."
}

$apiKey = Get-TinifyApiKey -Path $envFile
$sourceDimensions = Get-PngDimensions -Path $source
$authorization = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes("api:$apiKey"))
$client = [System.Net.Http.HttpClient]::new()

try {
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, 'https://api.tinify.com/shrink')
  $request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::Parse("Basic $authorization")
  $request.Content = [System.Net.Http.ByteArrayContent]::new([System.IO.File]::ReadAllBytes($source))
  $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('image/png')

  $response = $client.SendAsync($request).GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "Tinify returned HTTP $([int]$response.StatusCode)."
  }

  $optimizedUrl = [string]$response.Headers.Location
  if ([string]::IsNullOrWhiteSpace($optimizedUrl)) {
    throw 'Tinify did not return an optimized image URL.'
  }

  $download = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $optimizedUrl)
  $download.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::Parse("Basic $authorization")
  $optimizedResponse = $client.SendAsync($download).GetAwaiter().GetResult()
  if (-not $optimizedResponse.IsSuccessStatusCode) {
    throw "Tinify could not download the optimized image (HTTP $([int]$optimizedResponse.StatusCode))."
  }

  [System.IO.File]::WriteAllBytes($output, $optimizedResponse.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult())
  $outputDimensions = Get-PngDimensions -Path $output
  if ($sourceDimensions.Width -ne $outputDimensions.Width -or $sourceDimensions.Height -ne $outputDimensions.Height) {
    throw 'Tinify changed the sprite dimensions. The copy was kept for inspection but will not be used.'
  }

  $sourceBytes = (Get-Item -LiteralPath $source).Length
  $outputBytes = (Get-Item -LiteralPath $output).Length
  $savedPercent = [Math]::Round((1 - ($outputBytes / $sourceBytes)) * 100, 1)
  Write-Host "Created: $output"
  Write-Host "Dimensions: $($outputDimensions.Width) x $($outputDimensions.Height)"
  Write-Host "Size: $([Math]::Round($sourceBytes / 1KB, 1)) KiB -> $([Math]::Round($outputBytes / 1KB, 1)) KiB ($savedPercent% saved)"
} finally {
  $client.Dispose()
}
