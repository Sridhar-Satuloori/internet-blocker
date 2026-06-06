const path = require('path');

const isElevatedRelaunch = process.argv.some((arg) => String(arg).includes('elevated-relaunch'));

function argvHasElevatedRelaunch(argv) {
  if (!argv) return false;
  if (Array.isArray(argv)) {
    return argv.some((arg) => String(arg).includes('elevated-relaunch'));
  }
  return String(argv).includes('elevated-relaunch');
}

function setupSingleInstance(app, handlers = {}) {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.internetblocker.app');
  }

  const gotLock = app.requestSingleInstanceLock();
  const shouldRun = gotLock || isElevatedRelaunch;

  if (gotLock) {
    app.on('second-instance', (_event, argv) => {
      if (argvHasElevatedRelaunch(argv)) {
        handlers.onElevatedReplace?.(argv);
        app.isQuitting = true;
        app.quit();
        return;
      }

      handlers.onFocusExisting?.();
    });
  }

  return {
    shouldRun,
    gotLock,
    isElevatedRelaunch,
  };
}

function exitDuplicateInstance(app) {
  try {
    const logger = require('./logger');
    logger.initLogger({ meta: { phase: 'duplicate-instance' } });
    logger.info('Duplicate Internet Blocker instance blocked — showing notice and exiting');
  } catch {
    // Best-effort logging before exit.
  }

  app.whenReady().then(() => {
    const { dialog } = require('electron');
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Internet Blocker',
      message: 'Internet Blocker is already running',
      detail: [
        'Look for the Internet Blocker icon in the system tray (near the clock).',
        '',
        'If no window appears, a background process may be stuck:',
        '1. Open Task Manager (Ctrl+Shift+Esc)',
        '2. End any InternetBlocker.exe processes',
        '3. Launch the app again',
      ].join('\n'),
      buttons: ['OK'],
    });
    app.quit();
  });
}

module.exports = {
  isElevatedRelaunch,
  argvHasElevatedRelaunch,
  setupSingleInstance,
  exitDuplicateInstance,
};
