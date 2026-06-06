const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');
const logger = require('../src/logger');

const appRoot = path.join(__dirname, '..');
logger.initLogger({ appRoot, meta: { source: 'start-electron.js' } });

const env = { ...process.env };
const hadRunAsNode = Boolean(env.ELECTRON_RUN_AS_NODE);
delete env.ELECTRON_RUN_AS_NODE;

const args = ['.', ...process.argv.slice(2)];

logger.info('Launching Electron from start-electron.js', {
  electronPath: electron,
  cwd: appRoot,
  args,
  hadRunAsNode,
});

const maxDevHandoffRetries = 3;
const devHandoffRetryDelayMs = 750;

function launchElectron(attempt = 0) {
  const startedAt = Date.now();

  const child = spawn(electron, args, {
    stdio: 'inherit',
    env,
    cwd: appRoot,
    shell: process.platform === 'win32',
  });

  child.on('error', (err) => {
    logger.error('Failed to spawn Electron', { error: err.message, attempt });
    process.exit(1);
  });

  child.on('close', (code) => {
    const elapsedMs = Date.now() - startedAt;
    const shouldRetryDevHandoff = code === 2
      && attempt < maxDevHandoffRetries
      && !args.some((arg) => String(arg).includes('elevated-relaunch'));

    if (shouldRetryDevHandoff) {
      logger.info('Electron exited quickly — retrying after dev handoff', {
        attempt: attempt + 1,
        elapsedMs,
      });
      setTimeout(() => launchElectron(attempt + 1), devHandoffRetryDelayMs);
      return;
    }

    logger.info('Electron process exited', { code, attempt, elapsedMs });
    process.exit(code ?? 0);
  });
}

launchElectron();
