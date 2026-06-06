const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  blockAfterMinutes: 30,
  autoStartTimer: false,
  minimizeToTray: true,
  dailySchedule: {
    enabled: false,
    blockTime: '22:00',
    unblockTime: '07:00',
  },
  passwordHash: null,
  passwordSalt: null,
  blockAllInternet: true,
  blockedApps: [],
  blockedWebsites: [],
  useDnsBlocking: false,
  dnsProvider: 'cloudflare-family',
  sidebarCollapsed: false,
  showDetailsBar: true,
  confirmBeforeBlock: false,
  confirmBeforeUnblock: true,
  notifyOnBlock: true,
  notifyOnUnblock: true,
  launchAtStartup: false,
};

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

module.exports = { loadConfig, saveConfig, DEFAULTS };
