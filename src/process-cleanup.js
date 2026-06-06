const { execFileSync } = require('child_process');

function findInternetBlockerMainPids() {
  if (process.platform !== 'win32') {
    return [];
  }

  const ps = `
$processes = Get-CimInstance Win32_Process -Filter "Name='InternetBlocker.exe' OR Name='electron.exe'"
$mainPids = New-Object System.Collections.Generic.List[int]

foreach ($proc in $processes) {
  $cmd = $proc.CommandLine
  if ($cmd -like '*--type=*') { continue }

  if ($proc.Name -eq 'InternetBlocker.exe') {
    [void]$mainPids.Add([int]$proc.ProcessId)
    continue
  }

  if ($cmd -like '*internet-blocker*' -or $cmd -like '*InternetBlocker*') {
    [void]$mainPids.Add([int]$proc.ProcessId)
    continue
  }

  if ([string]::IsNullOrWhiteSpace($cmd)) {
    foreach ($child in $processes) {
      $childCmd = $child.CommandLine
      if ($child.ParentProcessId -eq $proc.ProcessId -and (
        $childCmd -like '*internet-blocker*' -or $childCmd -like '*InternetBlocker*'
      )) {
        [void]$mainPids.Add([int]$proc.ProcessId)
        break
      }
    }
  }
}

if ($mainPids.Count -eq 0) { '[]' } else { $mainPids | ConvertTo-Json -Compress }
`;

  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    }).trim();

    if (!output || output === '[]') {
      return [];
    }

    const parsed = JSON.parse(output);
    if (typeof parsed === 'number') {
      return [parsed];
    }

    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function killProcessTree(pid) {
  try {
    execFileSync('taskkill', ['/F', '/PID', String(pid), '/T'], {
      windowsHide: true,
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

function cleanupStaleAppProcesses({ currentPid, logger }) {
  if (process.platform !== 'win32') {
    return { killed: [], skipped: true, reason: 'unsupported-platform' };
  }

  const mainPids = findInternetBlockerMainPids();
  const stalePids = mainPids.filter((pid) => pid !== currentPid);

  if (stalePids.length === 0) {
    logger.info('Stale process cleanup: no extra main process trees found', {
      currentPid,
      mainPids,
    });
    return { killed: [], mainPids };
  }

  logger.warn('Stale process cleanup: removing extra main process trees', {
    currentPid,
    mainPids,
    stalePids,
  });

  const killed = [];
  for (const pid of stalePids) {
    if (killProcessTree(pid)) {
      killed.push(pid);
      logger.info('Stale process cleanup: terminated process tree', { pid });
    } else {
      logger.warn('Stale process cleanup: failed to terminate process tree', { pid });
    }
  }

  return { killed, mainPids, stalePids };
}

module.exports = {
  findInternetBlockerMainPids,
  cleanupStaleAppProcesses,
};
