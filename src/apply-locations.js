const path = require('path');
const { app } = require('electron');
const { MARKER_START, MARKER_END } = require('./hosts');

function getApplyLocations() {
  const userData = app.getPath('userData');
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  return {
    platform: process.platform,
    isWindows: isWin,
    isMac,
    configFile: path.join(userData, 'config.json'),
    dnsBackupFile: path.join(userData, 'dns-backup.json'),
    hostsFile: isWin
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
      : '/etc/hosts',
    firewallManager: isWin
      ? 'wf.msc (Windows Defender Firewall → Outbound Rules)'
      : isMac
        ? 'pfctl anchor + Application Firewall (System Settings → Network → Firewall)'
        : 'N/A',
    pfAnchorFile: isMac ? path.join(userData, 'pf-rules.conf') : null,
    ruleNames: isWin
      ? [
          'InternetBlocker-BlockOutbound — blocks all outbound traffic',
          'InternetBlocker-AllowSelf — allows this app through',
          'InternetBlocker-App-{id}-out-tcp/udp — blocks an app outbound',
          'InternetBlocker-App-{id}-in-tcp/udp — blocks a game inbound',
        ]
      : isMac
        ? [
            'pf anchor internetblocker — block out all / per-app rules',
            'pass out rule — allows this app through during total blockout',
            '/etc/hosts — domain blocks',
            'networksetup — family-safe DNS on active services',
          ]
        : [],
    hostsMarkerStart: MARKER_START,
    hostsMarkerEnd: MARKER_END,
  };
}

module.exports = { getApplyLocations };
