const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, Notification, shell } = require('electron');
const path = require('path');
const { loadConfig, saveConfig } = require('./src/config');
const { FocusTimer } = require('./src/timer');
const { DailyScheduler } = require('./src/scheduler');
const { blockInternet, unblockInternet, isBlocked, isAdmin, isWindows, isMac, hashAppPath } = require('./src/firewall');
const { hashPassword, verifyPassword, hasPassword } = require('./src/password');
const { getTrayIcon } = require('./src/tray-icon');
const { listDomainPacks, getDomainPack, domainsToWebsiteEntries, mergeWebsiteEntries } = require('./src/domain-packs');
const { listDnsProviders } = require('./src/dns');
const { scanInstalledGames } = require('./src/game-scanner');
const { listRunningApps } = require('./src/running-apps');
const { getApplyLocations } = require('./src/apply-locations');
const { getNetworkSnapshot, runNetworkDiagnostics, requestMacLocationAccess } = require('./src/network-diagnostics');

let mainWindow = null;
let tray = null;
let timer = null;
let scheduler = null;
let blocked = false;

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function syncLaunchAtStartup(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: true,
  });
}

function getBlockOptions() {
  const config = loadConfig();
  return {
    selfPath: process.execPath,
    blockAllInternet: config.blockAllInternet !== false,
    blockedApps: config.blockedApps || [],
    blockedWebsites: config.blockedWebsites || [],
    useDnsBlocking: config.useDnsBlocking === true,
    dnsProvider: config.dnsProvider || 'cloudflare-family',
  };
}

function getAppState() {
  const config = loadConfig();
  const timerState = timer ? timer.getState() : { isRunning: false, remainingMs: 0 };
  const scheduleState = scheduler ? scheduler.getState() : { enabled: false };
  return {
    config: {
      ...config,
      hasPassword: hasPassword(config),
      passwordHash: undefined,
      passwordSalt: undefined,
    },
    timer: timerState,
    schedule: scheduleState,
    blocked,
    isWindows: isWindows(),
    isMac: isMac(),
    blockingSupported: isWindows() || isMac(),
    isAdmin: false,
    applyLocations: getApplyLocations(),
  };
}

async function refreshAdminStatus() {
  const state = getAppState();
  state.isAdmin = isWindows() || isMac() ? await isAdmin() : false;
  state.blocked = isWindows() || isMac() ? await isBlocked(getBlockOptions()) : false;
  blocked = state.blocked;
  return state;
}

function broadcastState() {
  refreshAdminStatus().then((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('state-change', state);
    }
    updateTray(state);
  });
}

function formatRemaining(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateTray(state) {
  if (!tray) return;

  const remaining = state.timer?.remainingMs ?? 0;
  const schedule = state.schedule ?? {};
  let statusLabel = 'Internet: allowed';

  if (state.blocked) {
    statusLabel = schedule.inBlockWindow
      ? 'Internet: BLOCKED (schedule)'
      : 'Internet: BLOCKED';
  } else if (state.timer?.isRunning) {
    statusLabel = `Timer: ${formatRemaining(remaining)}`;
  } else if (schedule.enabled && schedule.nextEvent) {
    const nextType = schedule.nextEvent.type === 'block' ? 'Block' : 'Unblock';
    statusLabel = `Next ${nextType}: ${formatRemaining(schedule.nextEvent.inMs)}`;
  }

  tray.setImage(
    getTrayIcon({ blocked: state.blocked, timerRunning: state.timer?.isRunning })
  );

  const template = [
    { label: 'Internet Blocker', enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(`Internet Blocker — ${statusLabel}`);
}

async function applyBlock(reason) {
  if (!isWindows() && !isMac()) {
    dialog.showErrorBox('Not supported', 'Internet blocking is not supported on this platform.');
    return false;
  }

  if (!(await isAdmin())) {
    dialog.showErrorBox(
      'Administrator required',
      isMac()
        ? 'Run as Administrator to apply blocks. This relaunches the app with sudo (you will be prompted for your password).'
        : 'Run this app as Administrator to block internet access.'
    );
    return false;
  }

  if (await isBlocked(getBlockOptions())) {
    blocked = true;
    return true;
  }

  await blockInternet(getBlockOptions());
  blocked = true;

  const config = loadConfig();
  const parts = [];
  if (config.blockAllInternet !== false) parts.push('all outbound internet');
  if ((config.blockedApps || []).length) parts.push(`${config.blockedApps.length} app(s)/game(s)`);
  if ((config.blockedWebsites || []).length) parts.push(`${config.blockedWebsites.length} website(s)`);
  if (config.useDnsBlocking) parts.push('DNS filtering');
  const summary = parts.length ? parts.join(', ') : 'selected targets';

  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Blocking active',
      message:
        reason === 'schedule'
          ? `Daily schedule: now blocking ${summary}.`
          : `Blocking is now active: ${summary}.`,
      buttons: ['OK'],
    });
  }

  if (config.notifyOnBlock) {
    showNotification('Internet Blocker', `Blocks active: ${summary}`);
  }

  return true;
}

async function applyUnblock({ requirePassword = true, password = '' } = {}) {
  if (!isWindows() && !isMac()) {
    throw new Error('Internet blocking is not supported on this platform.');
  }

  const config = loadConfig();
  if (requirePassword && hasPassword(config)) {
    if (!verifyPassword(password, config.passwordHash, config.passwordSalt)) {
      throw new Error('Incorrect password.');
    }
  }

  if (!(await isAdmin())) {
    throw new Error(
      isMac()
        ? 'Administrator privileges are required. Run as Administrator to relaunch with sudo.'
        : 'Administrator privileges are required to modify firewall rules.'
    );
  }

  await unblockInternet(getBlockOptions());
  blocked = false;

  if (config.notifyOnUnblock) {
    showNotification('Internet Blocker', 'All blocks removed. Internet restored.');
  }

  return { unblocked: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1419',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    broadcastState();
  });

  mainWindow.on('close', (event) => {
    const config = loadConfig();
    if (!app.isQuitting && config.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('Internet Blocker');
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  updateTray(getAppState());
}

function setupTimer() {
  timer = new FocusTimer();

  timer.on('tick', (remainingMs) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('timer-tick', remainingMs);
    }
    refreshAdminStatus().then(updateTray);
  });

  timer.on('expired', async () => {
    try {
      await applyBlock('timer');
    } catch (err) {
      dialog.showErrorBox('Block failed', err.message);
    } finally {
      broadcastState();
    }
  });

  timer.on('started', broadcastState);
  timer.on('stopped', broadcastState);
}

function setupScheduler() {
  scheduler = new DailyScheduler();

  scheduler.on('block-time', async () => {
    try {
      await applyBlock('schedule');
    } catch (err) {
      dialog.showErrorBox('Scheduled block failed', err.message);
    } finally {
      broadcastState();
    }
  });

  scheduler.on('unblock-time', async () => {
    try {
      await applyUnblock({ requirePassword: false });
    } catch (err) {
      dialog.showErrorBox('Scheduled unblock failed', err.message);
    } finally {
      broadcastState();
    }
  });

  scheduler.on('updated', broadcastState);

  scheduler.start(loadConfig());
}

function restartScheduler() {
  scheduler.start(loadConfig());
}

function setupIpc() {
  ipcMain.handle('get-status', () => refreshAdminStatus());

  ipcMain.handle('get-domain-packs', () => listDomainPacks());
  ipcMain.handle('get-dns-providers', () => listDnsProviders());

  ipcMain.handle('apply-domain-pack', (_event, packId) => {
    const pack = getDomainPack(packId);
    if (!pack) {
      throw new Error('Unknown domain pack.');
    }

    const current = loadConfig();
    const before = (current.blockedWebsites || []).length;
    const entries = domainsToWebsiteEntries(pack.domains, pack.id);
    const blockedWebsites = mergeWebsiteEntries(current.blockedWebsites || [], entries);
    saveConfig({ ...current, blockedWebsites });
    restartScheduler();
    broadcastState();
    return { added: blockedWebsites.length - before, total: blockedWebsites.length };
  });

  ipcMain.handle('scan-games', async () => {
    if (!isWindows()) {
      return [];
    }
    return scanInstalledGames();
  });

  ipcMain.handle('list-running-apps', async () => {
    return listRunningApps();
  });

  ipcMain.handle('save-config', (_event, partial) => {
    const current = loadConfig();
    const merged = { ...current, ...partial };

    if (partial.dailySchedule) {
      merged.dailySchedule = { ...current.dailySchedule, ...partial.dailySchedule };
    }

    if (partial.blockedApps) {
      merged.blockedApps = partial.blockedApps;
    }

    if (partial.blockedWebsites) {
      merged.blockedWebsites = partial.blockedWebsites;
    }

    saveConfig(merged);

    if (partial.launchAtStartup !== undefined) {
      syncLaunchAtStartup(partial.launchAtStartup);
    }

    restartScheduler();
    broadcastState();
    return getAppState().config;
  });

  ipcMain.handle('start-timer', (_event, minutes) => {
    const config = loadConfig();
    const duration = minutes ?? config.blockAfterMinutes;
    timer.start(duration);
    return timer.getState();
  });

  ipcMain.handle('stop-timer', () => {
    timer.stop();
    return timer.getState();
  });

  ipcMain.handle('block-now', async () => {
    const ok = await applyBlock('manual');
    if (!ok) {
      throw new Error('Failed to apply blocks.');
    }
    broadcastState();
    return { blocked: true };
  });

  ipcMain.handle('unblock-now', async (_event, password) => {
    await applyUnblock({ requirePassword: true, password: password || '' });
    broadcastState();
    return { unblocked: true };
  });

  ipcMain.handle('set-password', (_event, { password, currentPassword }) => {
    const config = loadConfig();

    if (hasPassword(config)) {
      if (!verifyPassword(currentPassword, config.passwordHash, config.passwordSalt)) {
        throw new Error('Current password is incorrect.');
      }
    }

    if (!password || password.length < 4) {
      throw new Error('Password must be at least 4 characters.');
    }

    const { passwordHash, passwordSalt } = hashPassword(password);
    saveConfig({ ...config, passwordHash, passwordSalt });
    broadcastState();
    return { set: true };
  });

  ipcMain.handle('clear-password', (_event, currentPassword) => {
    const config = loadConfig();

    if (hasPassword(config)) {
      if (!verifyPassword(currentPassword, config.passwordHash, config.passwordSalt)) {
        throw new Error('Current password is incorrect.');
      }
    }

    saveConfig({ ...config, passwordHash: null, passwordSalt: null });
    broadcastState();
    return { cleared: true };
  });

  ipcMain.handle('open-config-folder', () => {
    return shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('get-network-snapshot', async () => {
    const snapshot = await getNetworkSnapshot({ requestLocation: true });
    return { snapshot, blocked };
  });

  ipcMain.handle('request-location-access', async () => {
    const result = await requestMacLocationAccess();
    const snapshot = await getNetworkSnapshot({ requestLocation: false });
    return { ...result, snapshot };
  });

  ipcMain.handle('open-location-settings', () => {
    return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices');
  });

  ipcMain.handle('run-network-diagnostics', async (event, options = {}) => {
    const sender = event.sender;
    const emit = (progress) => {
      if (!sender.isDestroyed()) {
        sender.send('network-diagnostics-progress', progress);
      }
    };

    return runNetworkDiagnostics({
      onProgress: emit,
      skipSpeedTest: Boolean(options.skipSpeedTest),
      internetBlocked: blocked,
      appBlocked: blocked,
    });
  });

  ipcMain.handle('pick-blocked-app', async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select application to block',
      properties: ['openFile'],
      filters: isMac()
        ? [
            { name: 'Applications', extensions: ['app'] },
            { name: 'Executables', extensions: [''] },
          ]
        : [{ name: 'Executables', extensions: ['exe'] }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    let appPath = result.filePaths[0];
    let displayName = path.basename(appPath);

    if (isMac() && appPath.endsWith('.app')) {
      const { resolveMacExecutable } = require('./src/firewall-macos');
      appPath = resolveMacExecutable(appPath);
      displayName = path.basename(result.filePaths[0], '.app');
    }

    return {
      id: hashAppPath(appPath),
      path: appPath,
      name: displayName,
      type: 'app',
      bundlePath: result.filePaths[0].endsWith('.app') ? result.filePaths[0] : undefined,
    };
  });

  ipcMain.handle('request-admin', () => {
    if (!isWindows() && !isMac()) {
      return { relaunched: false, reason: 'unsupported-platform' };
    }

    const { spawn } = require('child_process');

    if (isMac()) {
      const escapedPath = process.execPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      spawn(
        'osascript',
        [
          '-e',
          `do shell script "nohup \\"${escapedPath}\\" >/dev/null 2>&1 &" with administrator privileges`,
        ],
        { detached: true, stdio: 'ignore' }
      ).unref();
    } else {
      spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -Verb RunAs`,
        ],
        { detached: true, stdio: 'ignore' }
      ).unref();
    }

    app.isQuitting = true;
    app.quit();
    return { relaunched: true };
  });
}

app.whenReady().then(async () => {
  setupTimer();
  setupScheduler();
  setupIpc();
  createWindow();
  createTray();

  blocked = isWindows() || isMac() ? await isBlocked(getBlockOptions()) : false;

  const config = loadConfig();
  if (config.autoStartTimer) {
    timer.start(config.blockAfterMinutes);
  }

  syncLaunchAtStartup(config.launchAtStartup === true);

  broadcastState();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray on Windows
  }
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  if (timer) timer.stop({ silent: true });
  if (scheduler) scheduler.stop({ silent: true });
});
