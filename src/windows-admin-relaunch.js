const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function appendLog(logPath, level, message, meta = {}) {
  const metaSuffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${new Date().toISOString()}] [${level}] ${message}${metaSuffix}\n`;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line, 'utf8');
}

function quoteVbs(value) {
  return value.replace(/"/g, '""');
}

function buildVbsLauncher({ electronPath, appDir, appArgument }) {
  const quotedExe = quoteVbs(electronPath);
  const quotedDir = quoteVbs(appDir);
  const quotedArgs = quoteVbs(appArgument || '');

  return [
    'Set objShell = CreateObject("Shell.Application")',
    `objShell.ShellExecute "${quotedExe}", "${quotedArgs}", "${quotedDir}", "runas", 1`,
  ].join('\r\n');
}

function relaunchWindowsAsAdmin({ app, logger }) {
  const appDir = app.getAppPath();
  const electronPath = app.isPackaged
    ? process.execPath
    : path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const logPath = logger.getLogPath();
  const appArgument = app.isPackaged ? '--elevated-relaunch' : '. --elevated-relaunch';
  const vbsPath = path.join(os.tmpdir(), `internet-blocker-elevate-${process.pid}.vbs`);
  const vbsContent = buildVbsLauncher({ electronPath, appDir, appArgument });

  fs.writeFileSync(vbsPath, vbsContent, 'utf8');

  logger.info('request-admin launching via VBS ShellExecute runas', {
    electronPath,
    appDir,
    appArgument: appArgument || null,
    vbsPath,
  });

  appendLog(logPath, 'INFO', 'VBS elevation launcher written', { vbsPath, electronPath, appDir });

  const child = spawn('wscript.exe', ['//Nologo', vbsPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.on('error', (err) => {
    logger.error('request-admin failed to spawn wscript', { error: err.message });
    appendLog(logPath, 'ERROR', 'Failed to spawn wscript', { error: err.message });
  });

  child.on('spawn', () => {
    logger.info('request-admin wscript spawn succeeded');
    appendLog(logPath, 'INFO', 'wscript spawn succeeded');
  });

  child.unref();

  setTimeout(() => {
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // Best-effort cleanup.
    }
  }, 30000);
}

module.exports = { relaunchWindowsAsAdmin };
