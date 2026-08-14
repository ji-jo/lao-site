<#!
.SYNOPSIS
Creates an optimized Imagify copy of the crowd persona sprite.

.DESCRIPTION
Reads the Imagify API key from the local .env.local file, uploads only
public/images/peeps/all-peeps.png, and writes an optimized sibling file.
The original sprite is never modified.

.EXAMPLE
pwsh -ExecutionPolicy Bypass -File .\scripts\optimize-crowd-imagify.ps1
#>

[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env.local'
$source = Join-Path $projectRoot 'public\images\peeps\all-peeps.png'
$output = Join-Path $projectRoot 'public\images\peeps\all-peeps.imagify.png'

function Get-ImagifyApiKey {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw ".env.local was not found at $Path"
  }

  $line = [System.IO.File]::ReadAllLines($Path) |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') } |
    Where-Object { $_ -match '(?i)^\s*imagify\s+api\s*:' } |
    Select-Object -First 1

  if (-not $line) {
    throw 'No "Imagify API: ..." entry was found in .env.local.'
  }

  $key = ($line -replace '(?i)^\s*imagify\s+api\s*:\s*', '').Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw 'The Imagify API entry in .env.local is empty.'
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
  throw "An optimized copy already exists at $output. Re-run with -Force to replace that copy."
}

$apiKey = Get-ImagifyApiKey -Path $envFile
$sourceDimensions = Get-PngDimensions -Path $source
$client = [System.Net.Http.HttpClient]::new()
$form = [System.Net.Http.MultipartFormDataContent]::new()

try {
  $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('token', $apiKey)

  $imageContent = [System.Net.Http.ByteArrayContent]::new([System.IO.File]::ReadAllBytes($source))
  $imageContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('image/png')
  $form.Add($imageContent, 'image', [System.IO.Path]::GetFileName($source))
  $form.Add([System.Net.Http.StringContent]::new('{"aggressive":true,"keep_exif":false}'), 'data')

  $response = $client.PostAsync('https://app.imagify.io/api/upload/', $form).GetAwaiter().GetResult()
  $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "Imagify returned HTTP $([int]$response.StatusCode)."
  }

  $payload = $responseBody | ConvertFrom-Json
  if (-not $payload.success -or [string]::IsNullOrWhiteSpace($payload.image)) {
    throw 'Imagify did not return an optimized image.'
  }

  [System.IO.File]::WriteAllBytes($output, $client.GetByteArrayAsync([string]$payload.image).GetAwaiter().GetResult())
  $outputDimensions = Get-PngDimensions -Path $output

  if ($sourceDimensions.Width -ne $outputDimensions.Width -or $sourceDimensions.Height -ne $outputDimensions.Height) {
    throw 'Imagify changed the sprite dimensions. The optimized copy was kept for inspection but will not be used.'
  }

  $sourceBytes = (Get-Item -LiteralPath $source).Length
  $outputBytes = (Get-Item -LiteralPath $output).Length
  if ($outputBytes -ge $sourceBytes) {
    Write-Warning 'Imagify completed, but the optimized copy is not smaller than the original.'
  }

  $savedBytes = $sourceBytes - $outputBytes
  $savedPercent = [Math]::Round(($savedBytes / $sourceBytes) * 100, 1)
  Write-Host "Created: $output"
  Write-Host "Dimensions: $($outputDimensions.Width) x $($outputDimensions.Height)"
  Write-Host "Size: $([Math]::Round($sourceBytes / 1KB, 1)) KiB -> $([Math]::Round($outputBytes / 1KB, 1)) KiB ($savedPercent% saved)"
} finally {
  $form.Dispose()
  $client.Dispose()
}
