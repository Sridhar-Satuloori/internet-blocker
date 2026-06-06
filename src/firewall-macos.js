const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const { app } = require('electron');
const {
  applyHostsBlocks,
  removeHostsBlocks,
  hasHostsBlocks,
  hashAppPath,
} = require('./hosts');
const {
  applyDnsBlocking,
  restoreDnsBlocking,
  isDnsBlockingActive,
} = require('./dns');

const execFileAsync = promisify(execFile);
const ANCHOR_NAME = 'internetblocker';

function getStatePath() {
  return path.join(app.getPath('userData'), 'mac-block-state.json');
}

function getPfRulesPath() {
  return path.join(app.getPath('userData'), 'pf-rules.conf');
}

function isAdmin() {
  try {
    return process.geteuid() === 0;
  } catch {
    return false;
  }
}

function escapePfPath(filePath) {
  return filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveMacExecutable(appPath) {
  if (!appPath.endsWith('.app')) {
    return appPath;
  }

  const macosDir = path.join(appPath, 'Contents', 'MacOS');
  if (!fs.existsSync(macosDir)) {
    throw new Error(`Invalid application bundle: ${appPath}`);
  }

  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  if (fs.existsSync(plistPath)) {
    try {
      const executable = execFileSync(
        '/usr/bin/plutil',
        ['-extract', 'CFBundleExecutable', 'raw', plistPath],
        { encoding: 'utf8' }
      ).trim();
      if (executable) {
        const candidate = path.join(macosDir, executable);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch {
      // fall through
    }
  }

  const executables = fs.readdirSync(macosDir).filter((entry) => !entry.startsWith('.'));
  if (executables.length === 0) {
    throw new Error(`No executable found in ${appPath}`);
  }

  return path.join(macosDir, executables[0]);
}

function normalizeBlockedApps(blockedApps = []) {
  return blockedApps
    .filter((entry) => entry.path)
    .map((entry) => ({
      ...entry,
      path: resolveMacExecutable(entry.path),
      id: entry.id || hashAppPath(entry.path),
    }));
}

function buildPfRules({ selfPath, blockAllInternet, blockedApps }) {
  const lines = [];

  for (const appEntry of blockedApps) {
    const appPath = escapePfPath(appEntry.path);
    const blockInbound = appEntry.type === 'game' || appEntry.blockInbound === true;
    lines.push(`block out log proto { tcp udp } from any to any app "${appPath}"`);
    if (blockInbound) {
      lines.push(`block in log proto { tcp udp } from any to any app "${appPath}"`);
    }
  }

  if (blockAllInternet) {
    if (selfPath) {
      lines.push(`pass out quick proto { tcp udp } from any to any app "${escapePfPath(selfPath)}"`);
    }
    lines.push('block out all');
  }

  return `${lines.join('\n')}\n`;
}

async function pfctl(args) {
  return execFileAsync('/sbin/pfctl', args, { maxBuffer: 4 * 1024 * 1024 });
}

async function loadPfRules(rulesContent) {
  if (!rulesContent.trim()) {
    await clearPfRules();
    return;
  }

  fs.writeFileSync(getPfRulesPath(), rulesContent, 'utf8');
  await pfctl(['-a', ANCHOR_NAME, '-f', getPfRulesPath()]);
  try {
    await pfctl(['-e']);
  } catch {
    // pf may already be enabled
  }
}

async function clearPfRules() {
  try {
    await pfctl(['-a', ANCHOR_NAME, '-F', 'all']);
  } catch {
    // anchor may not exist yet
  }

  if (fs.existsSync(getPfRulesPath())) {
    fs.unlinkSync(getPfRulesPath());
  }
  if (fs.existsSync(getStatePath())) {
    fs.unlinkSync(getStatePath());
  }
}

async function blockInternet({
  selfPath,
  blockAllInternet = true,
  blockedApps = [],
  blockedWebsites = [],
  useDnsBlocking = false,
  dnsProvider = 'cloudflare-family',
} = {}) {
  if (!isAdmin()) {
    throw new Error('Administrator privileges are required. Use Run as Admin to relaunch with sudo.');
  }

  const apps = normalizeBlockedApps(blockedApps);
  const websites = blockedWebsites.map((site) => site.domain).filter(Boolean);

  if (!blockAllInternet && apps.length === 0 && websites.length === 0 && !useDnsBlocking) {
    throw new Error('Nothing to block. Enable a block mode or add targets.');
  }

  await clearPfRules();
  await removeHostsBlocks();
  await restoreDnsBlocking();

  const rules = buildPfRules({ selfPath, blockAllInternet, blockedApps: apps });
  await loadPfRules(rules);

  if (websites.length > 0) {
    await applyHostsBlocks(websites);
  }

  if (useDnsBlocking) {
    await applyDnsBlocking(dnsProvider);
  }

  fs.writeFileSync(
    getStatePath(),
    JSON.stringify(
      {
        blockAllInternet: blockAllInternet !== false,
        blockedAppPaths: apps.map((entry) => entry.path),
        websiteCount: websites.length,
        useDnsBlocking: useDnsBlocking === true,
      },
      null,
      2
    )
  );

  return true;
}

async function unblockInternet({ blockedApps = [] } = {}) {
  if (!isAdmin()) {
    throw new Error('Administrator privileges are required. Use Run as Admin to relaunch with sudo.');
  }

  await clearPfRules();
  await removeHostsBlocks();
  await restoreDnsBlocking();

  return { removed: true };
}

async function isBlocked({
  blockAllInternet = true,
  blockedApps = [],
  useDnsBlocking = false,
} = {}) {
  if (fs.existsSync(getStatePath())) {
    return true;
  }

  if (await hasHostsBlocks()) {
    return true;
  }

  if (isDnsBlockingActive()) {
    return true;
  }

  try {
    const { stdout } = await pfctl(['-a', ANCHOR_NAME, '-s', 'rules']);
    if (stdout.trim()) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

module.exports = {
  isAdmin,
  blockInternet,
  unblockInternet,
  isBlocked,
  resolveMacExecutable,
  BLOCK_RULE: 'pf-anchor-internetblocker',
};
