$ErrorActionPreference = 'SilentlyContinue'

$items = @()

Get-Process | Where-Object { $_.Path -and $_.Path -match '\.exe$' } | Group-Object -Property Path | ForEach-Object {
  $first = $_.Group[0]
  $items += [ordered]@{
    name = $first.ProcessName
    path = $first.Path
    instances = $_.Count
    pids = @($_.Group | ForEach-Object { $_.Id })
  }
}

$items = $items | Sort-Object { $_.name.ToLower() }

if ($items.Count -eq 0) {
  '[]'
} else {
  $items | ConvertTo-Json -Compress -Depth 4
}
