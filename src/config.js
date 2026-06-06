const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const BUILTIN_DEFAULTS = {
  blockAfterMinutes: 30,
  autoStartTimer: false,
  minimizeToTray: false,
  dailySchedule: {
    enabled: false,
    blockTime: '22:00',
    unblockTime: '07:00',
  },
  passwordHash: null,
  passwordSalt: null,
  blockAllInternet: false,
  blockedApps: [],
  blockedWebsites: [],
  useDnsBlocking: false,
  dnsProvider: 'cloudflare-family',
  sidebarCollapsed: false,
  showDetailsBar: false,
  applyBlocksOnPackAdd: true,
  confirmBeforeBlock: false,
  confirmBeforeUnblock: true,
  notifyOnBlock: true,
  notifyOnUnblock: true,
  launchAtStartup: false,
};

function resolveDefaultsPath() {
  try {
    if (app?.isPackaged) {
      return path.join(app.getAppPath(), 'config', 'app-defaults.json');
    }
  } catch {
    // electron not available
  }

  return path.join(__dirname, '..', 'config', 'app-defaults.json');
}

function loadFileDefaults() {
  try {
    const defaultsPath = resolveDefaultsPath();
    const raw = fs.readFileSync(defaultsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.defaults || {};
  } catch {
    return {};
  }
}

function getDefaults() {
  const fileDefaults = loadFileDefaults();
  return {
    ...BUILTIN_DEFAULTS,
    ...fileDefaults,
    dailySchedule: {
      ...BUILTIN_DEFAULTS.dailySchedule,
      ...(fileDefaults.dailySchedule || {}),
    },
  };
}

const DEFAULTS = getDefaults();

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function mergeConfig(userConfig = {}) {
  const defaults = getDefaults();
  return {
    ...defaults,
    ...userConfig,
    dailySchedule: {
      ...defaults.dailySchedule,
      ...(userConfig.dailySchedule || {}),
    },
  };
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return mergeConfig(JSON.parse(raw));
  } catch {
    return mergeConfig();
  }
}

function saveConfig(config) {
  const defaults = getDefaults();
  const userConfig = { ...config };

  for (const key of Object.keys(defaults)) {
    if (userConfig[key] === defaults[key] && key !== 'dailySchedule') {
      delete userConfig[key];
    }
  }

  if (userConfig.dailySchedule) {
    const scheduleSame = JSON.stringify(userConfig.dailySchedule) === JSON.stringify(defaults.dailySchedule);
    if (scheduleSame) {
      delete userConfig.dailySchedule;
    }
  }

  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(userConfig, null, 2));
}

function getDefaultsMeta() {
  const defaultsPath = resolveDefaultsPath();
  let note = '';
  try {
    const raw = fs.readFileSync(defaultsPath, 'utf8');
    note = JSON.parse(raw).note || '';
  } catch {
    // ignore
  }

  return {
    defaultsPath,
    note,
    defaults: getDefaults(),
  };
}

module.exports = {
  loadConfig,
  saveConfig,
  getDefaults,
  getDefaultsMeta,
  DEFAULTS,
};
