const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { app } = require('electron');

const execFileAsync = promisify(execFile);

const DNS_PROVIDERS = {
  'cloudflare-family': {
    label: 'Cloudflare for Families',
    servers: ['1.1.1.3', '1.0.0.3'],
  },
  'opendns-family': {
    label: 'OpenDNS FamilyShield',
    servers: ['208.67.222.222', '208.67.220.220'],
  },
  'adguard-family': {
    label: 'AdGuard Family DNS',
    servers: ['94.140.14.14', '94.140.15.15'],
  },
};

function getBackupPath() {
  return path.join(app.getPath('userData'), 'dns-backup.json');
}

function listDnsProviders() {
  return Object.entries(DNS_PROVIDERS).map(([id, provider]) => ({
    id,
    label: provider.label,
    servers: provider.servers,
  }));
}

async function listWindowsInterfaces() {
  const { stdout } = await execFileAsync('netsh', ['interface', 'show', 'interface'], {
    windowsHide: true,
  });

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Enabled') && !line.includes('Loopback'))
    .map((line) => line.replace(/^Enabled\s+\S+\s+\S+\s+/, '').trim())
    .filter(Boolean);
}

async function listMacNetworkServices() {
  const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices'], {
    maxBuffer: 1024 * 1024,
  });

  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*'));
}

async function readWindowsInterfaceDns(interfaceName) {
  try {
    const { stdout } = await execFileAsync(
      'netsh',
      ['interface', 'ip', 'show', 'dns', `name=${interfaceName}`],
      { windowsHide: true }
    );

    const servers = [];
    const isDhcp = /DHCP enabled:\s+Yes/i.test(stdout);

    for (const line of stdout.split('\n')) {
      const match = line.match(/DNS servers configured through DHCP:\s+([0-9.]+)/i)
        || line.match(/Statically Configured DNS Servers:\s+([0-9.]+)/i)
        || line.match(/DNS servers:\s+([0-9.]+)/i);
      if (match) servers.push(match[1]);
    }

    return { interfaceName, isDhcp, servers: [...new Set(servers)] };
  } catch {
    return { interfaceName, isDhcp: true, servers: [] };
  }
}

async function readMacServiceDns(serviceName) {
  try {
    const { stdout } = await execFileAsync('networksetup', ['-getdnsservers', serviceName], {
      maxBuffer: 1024 * 1024,
    });

    if (/aren't any DNS Servers/i.test(stdout) || /are not configured/i.test(stdout)) {
      return { interfaceName: serviceName, isDhcp: true, servers: [] };
    }

    const servers = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return { interfaceName: serviceName, isDhcp: false, servers: [...new Set(servers)] };
  } catch {
    return { interfaceName: serviceName, isDhcp: true, servers: [] };
  }
}

async function applyWindowsDnsBlocking(providerId) {
  const provider = DNS_PROVIDERS[providerId] || DNS_PROVIDERS['cloudflare-family'];
  const interfaces = await listWindowsInterfaces();
  const backup = [];

  for (const interfaceName of interfaces) {
    const current = await readWindowsInterfaceDns(interfaceName);
    backup.push(current);

    await execFileAsync(
      'netsh',
      ['interface', 'ip', 'set', 'dns', `name=${interfaceName}`, 'static', provider.servers[0]],
      { windowsHide: true }
    );

    for (let i = 1; i < provider.servers.length; i += 1) {
      await execFileAsync(
        'netsh',
        ['interface', 'ip', 'add', 'dns', `name=${interfaceName}`, provider.servers[i], `index=${i + 1}`],
        { windowsHide: true }
      );
    }
  }

  fs.writeFileSync(
    getBackupPath(),
    JSON.stringify({ platform: 'win32', providerId, interfaces: backup }, null, 2)
  );
}

async function applyMacDnsBlocking(providerId) {
  const provider = DNS_PROVIDERS[providerId] || DNS_PROVIDERS['cloudflare-family'];
  const services = await listMacNetworkServices();
  const backup = [];

  for (const serviceName of services) {
    const current = await readMacServiceDns(serviceName);
    backup.push(current);
    await execFileAsync(
      'networksetup',
      ['-setdnsservers', serviceName, ...provider.servers],
      { maxBuffer: 1024 * 1024 }
    );
  }

  fs.writeFileSync(
    getBackupPath(),
    JSON.stringify({ platform: 'darwin', providerId, interfaces: backup }, null, 2)
  );
}

async function restoreWindowsDnsBlocking(backup) {
  for (const entry of backup.interfaces || []) {
    if (entry.isDhcp || entry.servers.length === 0) {
      await execFileAsync(
        'netsh',
        ['interface', 'ip', 'set', 'dns', `name=${entry.interfaceName}`, 'dhcp'],
        { windowsHide: true }
      ).catch(() => {});
      continue;
    }

    await execFileAsync(
      'netsh',
      ['interface', 'ip', 'set', 'dns', `name=${entry.interfaceName}`, 'static', entry.servers[0]],
      { windowsHide: true }
    ).catch(() => {});

    for (let i = 1; i < entry.servers.length; i += 1) {
      await execFileAsync(
        'netsh',
        ['interface', 'ip', 'add', 'dns', `name=${entry.interfaceName}`, entry.servers[i], `index=${i + 1}`],
        { windowsHide: true }
      ).catch(() => {});
    }
  }
}

async function restoreMacDnsBlocking(backup) {
  for (const entry of backup.interfaces || []) {
    if (entry.isDhcp || entry.servers.length === 0) {
      await execFileAsync(
        'networksetup',
        ['-setdnsservers', entry.interfaceName, 'Empty'],
        { maxBuffer: 1024 * 1024 }
      ).catch(() => {});
      continue;
    }

    await execFileAsync(
      'networksetup',
      ['-setdnsservers', entry.interfaceName, ...entry.servers],
      { maxBuffer: 1024 * 1024 }
    ).catch(() => {});
  }
}

async function applyDnsBlocking(providerId) {
  if (process.platform === 'darwin') {
    return applyMacDnsBlocking(providerId);
  }
  return applyWindowsDnsBlocking(providerId);
}

async function restoreDnsBlocking() {
  if (!fs.existsSync(getBackupPath())) return;

  const backup = JSON.parse(fs.readFileSync(getBackupPath(), 'utf8'));

  if (backup.platform === 'darwin' || process.platform === 'darwin') {
    await restoreMacDnsBlocking(backup);
  } else {
    await restoreWindowsDnsBlocking(backup);
  }

  fs.unlinkSync(getBackupPath());
}

function isDnsBlockingActive() {
  return fs.existsSync(getBackupPath());
}

module.exports = {
  listDnsProviders,
  applyDnsBlocking,
  restoreDnsBlocking,
  isDnsBlockingActive,
  DNS_PROVIDERS,
};
