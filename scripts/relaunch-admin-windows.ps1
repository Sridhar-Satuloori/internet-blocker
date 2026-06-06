param(
    [Parameter(Mandatory = $true)]
    [string]$ElectronPath,
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [string]$AppArgument = '',
    [string]$LogPath = ''
)

function Write-RelaunchLog {
    param(
        [string]$Level,
        [string]$Message
    )

    if (-not $LogPath) {
        $LogPath = Join-Path $WorkingDirectory 'logs\internet-blocker.log'
    }

    $logDir = Split-Path $LogPath -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    $line = "[$(Get-Date -Format o)] [$Level] $Message"
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

try {
    Write-RelaunchLog 'INFO' "Relaunch script started pid=$PID"
    Write-RelaunchLog 'INFO' "ElectronPath=$ElectronPath"
    Write-RelaunchLog 'INFO' "WorkingDirectory=$WorkingDirectory"
    Write-RelaunchLog 'INFO' "AppArgument=$AppArgument"
    Write-RelaunchLog 'INFO' "ELECTRON_RUN_AS_NODE(before)=$($env:ELECTRON_RUN_AS_NODE)"

    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    [System.Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')

    Write-RelaunchLog 'INFO' "ELECTRON_RUN_AS_NODE(after)=$(if ($env:ELECTRON_RUN_AS_NODE) { $env:ELECTRON_RUN_AS_NODE } else { '<unset>' })"

    if (-not (Test-Path $ElectronPath)) {
        throw "Electron executable not found: $ElectronPath"
    }

    if (-not (Test-Path $WorkingDirectory)) {
        throw "Working directory not found: $WorkingDirectory"
    }

    $startArgs = @{
        FilePath         = $ElectronPath
        WorkingDirectory = $WorkingDirectory
        PassThru         = $true
    }

    if ($AppArgument) {
        $startArgs.ArgumentList = $AppArgument
    }

    $process = Start-Process @startArgs
    Write-RelaunchLog 'INFO' "Started Electron pid=$($process.Id)"
}
catch {
    Write-RelaunchLog 'ERROR' "Relaunch failed: $($_.Exception.Message)"
    throw
}
