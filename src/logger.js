const fs = require('fs');
const path = require('path');

let logFilePath = null;

function resolveLogDir(options = {}) {
  if (options.userDataPath) {
    return path.join(options.userDataPath, 'logs');
  }
  return path.join(options.appRoot || path.join(__dirname, '..'), 'logs');
}

function initLogger(options = {}) {
  const logDir = resolveLogDir(options);
  fs.mkdirSync(logDir, { recursive: true });
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
    initLogger({ appRoot: path.join(__dirname, '..') });
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
