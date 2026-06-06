const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MARKER_START = '# InternetBlocker START';
const MARKER_END = '# InternetBlocker END';

function getHostsPath() {
  return process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts';
}

function normalizeDomain(input) {
  let domain = String(input || '').trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.split('/')[0].split(':')[0];
  domain = domain.replace(/^www\./, '');

  if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-][a-z0-9-]*)+$/.test(domain)) {
    throw new Error(`Invalid domain: ${input}`);
  }

  return domain;
}

function domainsToEntries(domains) {
  const entries = new Set();
  for (const raw of domains) {
    const domain = normalizeDomain(raw);
    entries.add(domain);
    if (domain.split('.').length === 2) {
      entries.add(`www.${domain}`);
    }
  }
  return [...entries].sort();
}

function stripManagedSection(content) {
  const start = content.indexOf(MARKER_START);
  if (start === -1) return content.replace(/\s*$/, '');

  const end = content.indexOf(MARKER_END, start);
  if (end === -1) {
    return content.slice(0, start).replace(/\s*$/, '');
  }

  return (content.slice(0, start) + content.slice(end + MARKER_END.length)).replace(/\s*$/, '');
}

function buildManagedSection(domains) {
  const entries = domainsToEntries(domains);
  if (entries.length === 0) return '';

  const lines = entries.flatMap((domain) => [`0.0.0.0 ${domain}`, `:: ${domain}`]);
  return `\n${MARKER_START}\n${lines.join('\n')}\n${MARKER_END}\n`;
}

function writeHostsFile(content) {
  const hostsPath = getHostsPath();
  try {
    fs.writeFileSync(hostsPath, content, 'utf8');
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(
        process.platform === 'darwin'
          ? 'Permission denied writing /etc/hosts. Run the app as Administrator (sudo).'
          : 'Permission denied writing the hosts file. Run as Administrator.'
      );
    }
    throw err;
  }
}

async function applyHostsBlocks(domains) {
  const hostsPath = getHostsPath();
  const original = fs.readFileSync(hostsPath, 'utf8');
  const cleaned = stripManagedSection(original);
  const section = buildManagedSection(domains);
  writeHostsFile(cleaned + section);
}

async function removeHostsBlocks() {
  const hostsPath = getHostsPath();
  const original = fs.readFileSync(hostsPath, 'utf8');
  if (!original.includes(MARKER_START)) return;
  writeHostsFile(`${stripManagedSection(original)}\n`);
}

async function hasHostsBlocks() {
  try {
    const content = fs.readFileSync(getHostsPath(), 'utf8');
    return content.includes(MARKER_START);
  } catch {
    return false;
  }
}

function hashAppPath(appPath) {
  return crypto.createHash('md5').update(appPath.toLowerCase()).digest('hex').slice(0, 8);
}

module.exports = {
  normalizeDomain,
  hashAppPath,
  applyHostsBlocks,
  removeHostsBlocks,
  hasHostsBlocks,
  MARKER_START,
};
