const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = 'internet-blocker';
let logFilePath = null;

function isInsideAsar(filePath) {
  return String(filePath).includes('.asar');
}

function defaultUserDataPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, APP_NAME);
}

function resolveLogDir(options = {}) {
  if (options.userDataPath) {
    return path.join(options.userDataPath, 'logs');
  }

  const appRoot = options.appRoot || path.join(__dirname, '..');
  if (!isInsideAsar(appRoot)) {
    return path.join(appRoot, 'logs');
  }

  return path.join(defaultUserDataPath(), 'logs');
}

function ensureLogDir(logDir) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    return logDir;
  } catch (err) {
    if (err.code === 'ENOTDIR' || isInsideAsar(logDir)) {
      const fallback = path.join(defaultUserDataPath(), 'logs');
      fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    }
    throw err;
  }
}

function initLogger(options = {}) {
  const logDir = ensureLogDir(resolveLogDir(options));
  logFilePath = path.join(logDir, 'internet-blocker.log');
  write('info', 'Logger initialized', {
    logFile: logFilePath,
    pid: process.pid,
    ...options.meta,
  });
  return logFilePath;
}

function getLogPath() {
  if (!logFilePath) {
    initLogger();
  }
  return logFilePath;
}

function getLogDir() {
  return path.dirname(getLogPath());
}

function formatLine(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaSuffix =
    meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaSuffix}`;
}

function write(level, message, meta = {}) {
  const line = formatLine(level, message, meta);
  console.log(line);

  try {
    fs.appendFileSync(getLogPath(), `${line}\n`, 'utf8');
  } catch (err) {
    console.error(`Failed to write log file: ${err.message}`);
  }
}

function readLogTail(maxLines = 200) {
  const logPath = getLogPath();

  if (!fs.existsSync(logPath)) {
    return { path: logPath, content: '', lineCount: 0, truncated: false };
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  const tail = lines.slice(-maxLines);

  return {
    path: logPath,
    content: tail.join('\n'),
    lineCount: tail.length,
    totalLines: lines.length,
    truncated: lines.length > maxLines,
  };
}

module.exports = {
  initLogger,
  getLogPath,
  getLogDir,
  readLogTail,
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
