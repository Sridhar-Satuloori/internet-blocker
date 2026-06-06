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
    logger.initLogger({ appRoot: path.join(__dirname, '..') });
    logger.info('Duplicate Internet Blocker instance blocked — exiting');
  } catch {
    // Best-effort logging before exit.
  }

  app.exit(2);
  process.exit(2);
}

module.exports = {
  isElevatedRelaunch,
  argvHasElevatedRelaunch,
  setupSingleInstance,
  exitDuplicateInstance,
};
