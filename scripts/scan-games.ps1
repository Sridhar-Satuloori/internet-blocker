$ErrorActionPreference = 'SilentlyContinue'
$games = @{}
$keywords = @(
  'game','steam','epic games','riot','blizzard','battle.net','ubisoft','ea ',
  'electronic arts','xbox','gog','minecraft','fortnite','valorant',
  'league of legends','overwatch','call of duty','rockstar','bethesda',
  'square enix','capcom','bandai','sega','nintendo','playstation','activision'
)

function Add-Game($name, $exePath, $source) {
  if (-not $name -or -not $exePath) { return }
  if ($exePath -notmatch '\.exe$') { return }
  if (-not (Test-Path -LiteralPath $exePath)) { return }
  $key = $exePath.ToLower()
  if ($games.ContainsKey($key)) { return }
  $games[$key] = [ordered]@{
    name = $name
    path = $exePath
    source = $source
  }
}

function LooksLikeGame($displayName, $publisher, $category) {
  $blob = ("$displayName $publisher $category").ToLower()
  foreach ($word in $keywords) {
    if ($blob.Contains($word)) { return $true }
  }
  if ($category -match 'game') { return $true }
  return $false
}

function Resolve-Exe($installLocation, $displayIcon, $displayName) {
  if ($displayIcon -and $displayIcon -match '\.exe') {
    $icon = ($displayIcon -split ',')[0].Trim('"')
    if (Test-Path -LiteralPath $icon) { return $icon }
  }
  if (-not $installLocation -or -not (Test-Path -LiteralPath $installLocation)) { return $null }
  $sameName = Join-Path $installLocation ($displayName + '.exe')
  if (Test-Path -LiteralPath $sameName) { return $sameName }
  $exes = Get-ChildItem -LiteralPath $installLocation -Filter *.exe -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch 'unins|setup|redist|crash|launcher|easyanticheat|battleye|install' } |
    Sort-Object Length -Descending
  if ($exes) { return $exes[0].FullName }
  return $null
}

$uninstallPaths = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)

foreach ($path in $uninstallPaths) {
  Get-ItemProperty $path | ForEach-Object {
    $name = $_.DisplayName
    if (-not $name) { return }
    $category = "$($_.ParentCategoryName) $($_.Category)"
    if (-not (LooksLikeGame $name $_.Publisher $category)) { return }
    $exe = Resolve-Exe $_.InstallLocation $_.DisplayIcon $name
    if ($exe) { Add-Game $name $exe 'registry' }
  }
}

function Get-SteamLibraries {
  $libs = @()
  $default = Join-Path ${env:ProgramFiles(x86)} 'Steam'
  if (Test-Path -LiteralPath $default) { $libs += $default }
  if (Test-Path -LiteralPath $default) {
    $vdf = Join-Path $default 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
      $content = Get-Content -LiteralPath $vdf -Raw
      foreach ($match in [regex]::Matches($content, '"path"\s+"([^"]+)"')) {
        $libs += ($match.Groups[1].Value -replace '\\\\','\')
      }
    }
  }
  return $libs | Select-Object -Unique
}

foreach ($library in Get-SteamLibraries) {
  $manifestDir = Join-Path $library 'steamapps'
  if (-not (Test-Path -LiteralPath $manifestDir)) { continue }
  Get-ChildItem -LiteralPath $manifestDir -Filter 'appmanifest_*.acf' | ForEach-Object {
    $content = Get-Content -LiteralPath $_.FullName -Raw
    $nameMatch = [regex]::Match($content, '"name"\s+"([^"]+)"')
    $dirMatch = [regex]::Match($content, '"installdir"\s+"([^"]+)"')
    if (-not $nameMatch.Success -or -not $dirMatch.Success) { return }
    $gameDir = Join-Path $library (Join-Path 'steamapps\common' $dirMatch.Groups[1].Value)
    if (-not (Test-Path -LiteralPath $gameDir)) { return }
    $exe = Resolve-Exe $gameDir $null $nameMatch.Groups[1].Value
    if ($exe) { Add-Game $nameMatch.Groups[1].Value $exe 'steam' }
  }
}

$extraRoots = @(
  (Join-Path $env:ProgramFiles 'Epic Games'),
  (Join-Path $env:ProgramFiles 'EA Games'),
  (Join-Path $env:ProgramFiles 'Rockstar Games'),
  (Join-Path $env:ProgramFiles 'Ubisoft'),
  (Join-Path $env:ProgramFiles 'Riot Games')
)

foreach ($root in $extraRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $exe = Resolve-Exe $_.FullName $null $_.Name
    if ($exe) { Add-Game $_.Name $exe 'folder' }
  }
}

$games.Values | Sort-Object name | ConvertTo-Json -Compress
