$ErrorActionPreference = 'SilentlyContinue'

function Get-LinkSpeedMbps {
  param([string]$LinkSpeed)
  if (-not $LinkSpeed) { return $null }
  if ($LinkSpeed -match '(\d+(?:\.\d+)?)\s*Gbps') { return [double]$Matches[1] * 1000 }
  if ($LinkSpeed -match '(\d+(?:\.\d+)?)\s*Mbps') { return [double]$Matches[1] }
  if ($LinkSpeed -match '(\d+(?:\.\d+)?)\s*Kbps') { return [double]$Matches[1] / 1000 }
  return $null
}

$adapters = @()
try {
  $nets = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual } | Sort-Object {
    if ($_.InterfaceAlias -match 'Wi-Fi|Wireless|WLAN') { 1 } else { 0 }
  }
  foreach ($net in $nets) {
    $media = 'Unknown'
    if ($net.NdisPhysicalMedium -eq 0) { $media = '802.3 (Ethernet)' }
    elseif ($net.NdisPhysicalMedium -eq 1) { $media = '802.11 (Wireless)' }
    elseif ($net.MediaType) { $media = [string]$net.MediaType }

    $metered = $false
    try {
      $metered = (Get-NetAdapterAdvancedProperty -Name $net.Name -RegistryKeyword '*NdisMedium' -ErrorAction SilentlyContinue) -ne $null
    } catch {}

    $adapters += [ordered]@{
      name = $net.Name
      description = $net.InterfaceDescription
      linkSpeed = $net.LinkSpeed
      linkSpeedMbps = Get-LinkSpeedMbps $net.LinkSpeed
      mediaType = $media
      driver = $net.DriverInformation
      status = $net.Status
      connectionType = 'unknown'
      networkName = $null
      networkLabel = $null
    }
  }
} catch {}

$primary = $adapters | Select-Object -First 1

function Get-ConnectedWifiInfo {
  $out = netsh wlan show interfaces 2>$null
  if (-not $out) { return $null }

  $blocks = ($out -split "(\r?\n)\r?\n") | Where-Object { $_ -match 'SSID' }
  foreach ($block in ($out -split '(?=\r?\n\s*Name\s*:)')) {
    if ($block -notmatch 'State\s*:\s*connected') { continue }
    if ($block -match '(?m)^\s*SSID\s*:\s*(.+)$') {
      $ssid = $Matches[1].Trim()
      if ($ssid -and $ssid -ne '<redacted>') {
        $iface = $null
        if ($block -match '(?m)^\s*Name\s*:\s*(.+)$') { $iface = $Matches[1].Trim() }
        $rate = $null
        if ($block -match 'Receive rate \(Mbps\)\s*:\s*(\d+)') { $rate = [double]$Matches[1] }
        return @{ ssid = $ssid; interface = $iface; linkRateMbps = $rate }
      }
    }
  }
  return $null
}

function Get-DefaultRouteAdapterName {
  try {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Sort-Object RouteMetric, InterfaceMetric |
      Select-Object -First 1
    if ($route) {
      $adapter = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
      if ($adapter) { return $adapter.Name }
    }
  } catch {}
  return $null
}

$defaultAdapter = Get-DefaultRouteAdapterName
if ($defaultAdapter) {
  $matched = $adapters | Where-Object { $_.name -eq $defaultAdapter } | Select-Object -First 1
  if ($matched) { $primary = $matched }
}

$wifiInfo = Get-ConnectedWifiInfo

if ($primary) {
  if ($wifiInfo -and ($primary.mediaType -match '802.11|Wireless|Wi-Fi' -or $primary.name -match 'Wi-Fi|Wireless|WLAN' -or $defaultAdapter -match 'Wi-Fi|Wireless|WLAN')) {
    $primary.connectionType = 'wifi'
    $primary.networkName = $wifiInfo.ssid
    $primary.networkLabel = "Wi-Fi: $($wifiInfo.ssid)"
    if ($wifiInfo.linkRateMbps) { $script:wifiLinkMbps = $wifiInfo.linkRateMbps }
  } elseif ($primary.mediaType -match '802.11|Wireless|Wi-Fi' -or $primary.name -match 'Wi-Fi|Wireless|WLAN') {
    $wlan = netsh wlan show interfaces 2>$null
    if ($wlan -match '(?m)^\s*SSID\s*:\s*(.+)$') {
      $ssid = $Matches[1].Trim()
      if ($ssid -and $ssid -ne '<redacted>') {
        $primary.connectionType = 'wifi'
        $primary.networkName = $ssid
        $primary.networkLabel = "Wi-Fi: $ssid"
      }
    }
    if (-not $primary.networkName) {
      $primary.connectionType = 'wifi'
      $primary.networkName = $primary.name
      $primary.networkLabel = "Wi-Fi ($($primary.name)) — not connected"
    }
  } else {
    $primary.connectionType = 'ethernet'
    $primary.networkName = $primary.name
    $primary.networkLabel = "LAN: $($primary.name)"
  }

  if ($adapters.Count -gt 0) {
    $adapters[0] = $primary
  }
}

$limiterPatterns = @(
  @{ category = 'Killer Networking'; patterns = @('KillerControlCenter', 'KillerNetworkService', 'KillerAnalyticsService', 'KillerProviderDataHelperService', 'xTUService', 'Killer') },
  @{ category = 'VPN'; patterns = @('nordvpn', 'expressvpn', 'openvpn', 'wireguard', 'tailscale', 'zerotier', 'protonvpn', 'mullvad', 'ciscoanyconnect', 'forticlient') },
  @{ category = 'Network optimizer'; patterns = @('cFosSpeed', 'NetLimiter', 'GlassWire', 'ProcessLasso') }
)

$limiters = @()
$processes = Get-Process | Where-Object { $_.ProcessName }

foreach ($group in $limiterPatterns) {
  foreach ($proc in $processes) {
    foreach ($pattern in $group.patterns) {
      if ($proc.ProcessName -like "*$pattern*") {
        $limiters += [ordered]@{
          category = $group.category
          name = $proc.ProcessName
          detail = "Running (PID $($proc.Id))"
          severity = if ($group.category -eq 'Killer Networking') { 'high' } else { 'medium' }
        }
        break
      }
    }
  }
}

$killerPaths = @(
  "${env:ProgramFiles}\Killer Networking",
  "${env:ProgramFiles(x86)}\Killer Networking",
  "${env:ProgramFiles}\Intel\Killer Networking"
)
foreach ($kp in $killerPaths) {
  if (Test-Path $kp) {
    $exists = $limiters | Where-Object { $_.category -eq 'Killer Networking' }
    if (-not $exists) {
      $limiters += [ordered]@{
        category = 'Killer Networking'
        name = 'Killer Networking'
        detail = "Installed at $kp (may cap or prioritize bandwidth)"
        severity = 'high'
      }
    }
    break
  }
}

Get-Service | Where-Object {
  $_.DisplayName -match 'Killer|Rivet|NetLimiter|cFos'
} | ForEach-Object {
  $limiters += [ordered]@{
    category = 'Network service'
    name = $_.DisplayName
    detail = "Service status: $($_.Status)"
    severity = 'medium'
  }
}

$qos = @()
try {
  $tcpGlobal = netsh int tcp show global 2>$null
  if ($tcpGlobal -match 'Receive Window Auto-Tuning Level\s*:\s*disabled') {
    $qos += 'TCP auto-tuning is disabled (can reduce throughput on high-speed links)'
  }
} catch {}

$wifiLinkMbps = $null
if ($wifiInfo -and $wifiInfo.linkRateMbps) {
  $wifiLinkMbps = $wifiInfo.linkRateMbps
} elseif ($primary -and $primary.mediaType -match '802.11|Wireless|Wi-Fi') {
  $wlan = netsh wlan show interfaces 2>$null
  if ($wlan -match 'Receive rate \(Mbps\)\s*:\s*(\d+)') {
    $wifiLinkMbps = [double]$Matches[1]
  }
}

$wifiConnection = $null
if ($wifiInfo -and $wifiInfo.ssid) {
  $wifiConnection = [ordered]@{
    ssid = $wifiInfo.ssid
    interface = $wifiInfo.interface
  }
}

$result = [ordered]@{
  platform = 'win32'
  primaryAdapter = $primary
  adapters = $adapters
  wifiLinkMbps = $wifiLinkMbps
  wifiConnection = $wifiConnection
  limiters = $limiters
  qosNotes = $qos
}

$result | ConvertTo-Json -Compress -Depth 6
