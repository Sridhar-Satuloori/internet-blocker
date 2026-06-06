const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT_CACHE = new Map();
const TEMP_SCRIPT_DIR = path.join(os.tmpdir(), 'internet-blocker-scripts');

function isInsideAsar(filePath) {
  return String(filePath).includes('.asar');
}

function resolveExternalScript(sourcePath) {
  const absoluteSource = path.resolve(sourcePath);

  if (!isInsideAsar(absoluteSource)) {
    return absoluteSource;
  }

  if (SCRIPT_CACHE.has(absoluteSource)) {
    return SCRIPT_CACHE.get(absoluteSource);
  }

  const content = fs.readFileSync(absoluteSource, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
  const fileName = `${path.basename(absoluteSource, '.ps1')}-${hash}.ps1`;
  const destPath = path.join(TEMP_SCRIPT_DIR, fileName);

  fs.mkdirSync(TEMP_SCRIPT_DIR, { recursive: true });

  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, content, 'utf8');
  }

  SCRIPT_CACHE.set(absoluteSource, destPath);
  return destPath;
}

module.exports = { resolveExternalScript };
