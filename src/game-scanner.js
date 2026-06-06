const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { hashAppPath } = require('./hosts');
const { resolveExternalScript } = require('./resolve-external-script');

const execFileAsync = promisify(execFile);
const SCAN_SCRIPT = path.join(__dirname, '..', 'scripts', 'scan-games.ps1');

async function scanInstalledGames() {
  if (process.platform !== 'win32') {
    return [];
  }

  const scriptPath = resolveExternalScript(SCAN_SCRIPT);
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }
  );

  const trimmed = stdout.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];

  return items
    .filter((item) => item && item.path)
    .map((item) => ({
      id: hashAppPath(item.path),
      name: item.name,
      path: item.path,
      source: item.source || 'scan',
      type: 'game',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { scanInstalledGames };
