const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { hashAppPath } = require('./hosts');

const execFileAsync = promisify(execFile);
const WIN_SCRIPT = path.join(__dirname, '..', 'scripts', 'list-running-apps.ps1');

function normalizeEntry({ name, path: appPath, instances = 1, pids = [] }) {
  if (!appPath) return null;

  return {
    id: hashAppPath(appPath),
    name: name || path.basename(appPath),
    path: appPath,
    instances,
    pids,
    type: 'app',
  };
}

function parseWindowsOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === '[]') return [];

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map(normalizeEntry).filter(Boolean);
}

async function listWindowsRunningApps() {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_SCRIPT],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  );

  return parseWindowsOutput(stdout);
}

function parseCommandPath(command) {
  if (!command) return null;
  const trimmed = command.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 0) return trimmed.slice(1, end);
  }
  const first = trimmed.split(/\s+/)[0];
  return first.startsWith('/') ? first : null;
}

function shouldIncludeMacProcess(appPath) {
  if (!appPath) return false;
  if (appPath.startsWith('/System/')) return false;
  if (appPath.startsWith('/usr/') && !appPath.startsWith('/usr/local/')) return false;
  if (appPath.startsWith('/Library/') && !appPath.includes('.app/Contents/MacOS/')) return false;
  if (appPath.includes('.app/Contents/MacOS/')) return true;
  if (appPath.startsWith('/Applications/')) return true;
  if (/^\/Users\/[^/]+\/Applications\//.test(appPath)) return true;
  if (appPath.startsWith('/usr/local/') || appPath.startsWith('/opt/homebrew/')) return true;
  return false;
}

async function listMacRunningApps() {
  const { stdout } = await execFileAsync(
    'ps',
    ['-ax', '-o', 'pid=,command='],
    { maxBuffer: 16 * 1024 * 1024 }
  );

  const grouped = new Map();

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const pid = Number(match[1]);
    const command = match[2].trim();
    const appPath = parseCommandPath(command);
    if (!appPath || appPath.startsWith('[') || !shouldIncludeMacProcess(appPath)) continue;

    const key = appPath.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.instances += 1;
      existing.pids.push(pid);
      continue;
    }

    grouped.set(key, {
      name: path.basename(appPath),
      path: appPath,
      instances: 1,
      pids: [pid],
    });
  }

  return [...grouped.values()]
    .map(normalizeEntry)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listRunningApps() {
  if (process.platform === 'win32') {
    return listWindowsRunningApps();
  }
  if (process.platform === 'darwin') {
    return listMacRunningApps();
  }
  return [];
}

module.exports = { listRunningApps };
