const { execFile } = require('child_process');
const { promisify } = require('util');
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

const RULE_PREFIX = 'InternetBlocker';
const BLOCK_RULE = `${RULE_PREFIX}-BlockOutbound`;
const ALLOW_RULE = `${RULE_PREFIX}-AllowSelf`;

async function isAdmin() {
  try {
    await execFileAsync('net', ['session'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function execNetsh(args) {
  return execFileAsync('netsh', ['advfirewall', 'firewall', ...args], {
    windowsHide: true,
  });
}

function appRuleName(appId, direction, protocol) {
  return `${RULE_PREFIX}-App-${appId}-${direction}-${protocol}`;
}

async function ruleExists(name) {
  try {
    await execNetsh(['show', 'rule', `name=${name}`]);
    return true;
  } catch {
    return false;
  }
}

async function deleteRule(name) {
  if (await ruleExists(name)) {
    await execNetsh(['delete', 'rule', `name=${name}`]);
  }
}

async function deleteAppRules(appId) {
  for (const direction of ['out', 'in']) {
    for (const protocol of ['tcp', 'udp']) {
      await deleteRule(appRuleName(appId, direction, protocol));
    }
  }
  await deleteRule(`${RULE_PREFIX}-App-${appId}-tcp`);
  await deleteRule(`${RULE_PREFIX}-App-${appId}-udp`);
}

async function blockApp(app) {
  const appPath = app.path;
  const appId = app.id || hashAppPath(appPath);
  const blockInbound = app.type === 'game' || app.blockInbound === true;

  await deleteAppRules(appId);

  for (const direction of ['out', ...(blockInbound ? ['in'] : [])]) {
    for (const protocol of ['tcp', 'udp']) {
      await execNetsh([
        'add',
        'rule',
        `name=${appRuleName(appId, direction, protocol)}`,
        `dir=${direction}`,
        'action=block',
        'enable=yes',
        `program=${appPath}`,
        `protocol=${protocol.toUpperCase()}`,
      ]);
    }
  }
}

async function clearAllRules(blockedApps = []) {
  await deleteRule(BLOCK_RULE);
  await deleteRule(ALLOW_RULE);

  for (const app of blockedApps) {
    await deleteAppRules(app.id || hashAppPath(app.path));
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
  if (!(await isAdmin())) {
    throw new Error('Administrator privileges are required to modify firewall rules.');
  }

  const apps = blockedApps.filter((app) => app.path);
  const websites = blockedWebsites.map((site) => site.domain).filter(Boolean);

  if (!blockAllInternet && apps.length === 0 && websites.length === 0 && !useDnsBlocking) {
    throw new Error('Nothing to block. Enable a block mode or add targets.');
  }

  await clearAllRules(apps);
  await removeHostsBlocks();
  await restoreDnsBlocking();

  if (blockAllInternet) {
    if (selfPath) {
      await execNetsh([
        'add',
        'rule',
        `name=${ALLOW_RULE}`,
        'dir=out',
        'action=allow',
        'enable=yes',
        `program=${selfPath}`,
      ]);
    }

    await execNetsh([
      'add',
      'rule',
      `name=${BLOCK_RULE}`,
      'dir=out',
      'action=block',
      'enable=yes',
    ]);
  }

  for (const app of apps) {
    await blockApp(app);
  }

  if (websites.length > 0) {
    await applyHostsBlocks(websites);
  }

  if (useDnsBlocking) {
    await applyDnsBlocking(dnsProvider);
  }

  return true;
}

async function unblockInternet({ blockedApps = [] } = {}) {
  if (!(await isAdmin())) {
    throw new Error('Administrator privileges are required to modify firewall rules.');
  }

  await clearAllRules(blockedApps);
  await removeHostsBlocks();
  await restoreDnsBlocking();

  return { removed: true };
}

async function isBlocked({
  blockAllInternet = true,
  blockedApps = [],
  useDnsBlocking = false,
} = {}) {
  if (blockAllInternet && (await ruleExists(BLOCK_RULE))) {
    return true;
  }

  if (await hasHostsBlocks()) {
    return true;
  }

  if (await isDnsBlockingActive()) {
    return true;
  }

  for (const app of blockedApps) {
    const appId = app.id || hashAppPath(app.path);
    if (await ruleExists(appRuleName(appId, 'out', 'tcp'))) {
      return true;
    }
    if (await ruleExists(`${RULE_PREFIX}-App-${appId}-tcp`)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isAdmin,
  blockInternet,
  unblockInternet,
  isBlocked,
  BLOCK_RULE,
};
