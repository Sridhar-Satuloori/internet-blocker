const https = require('https');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');
const { resolveExternalScript } = require('./resolve-external-script');

const execFileAsync = promisify(execFile);

function logDiagnosticsError(scope, err, extra = {}) {
  logger.error(scope, {
    error: err.message,
    stderr: err.stderr?.trim?.() || err.stderr || undefined,
    stdout: err.stdout?.trim?.()?.slice(0, 1000) || undefined,
    code: err.code,
    ...extra,
  });
}
const WIN_SCRIPT = path.join(__dirname, '..', 'scripts', 'network-info.ps1');
const SPEED_TEST_BYTES = 20 * 1024 * 1024;
const UPLOAD_TEST_BYTES = 10 * 1024 * 1024;
const SPEED_TEST_URL = 'speed.cloudflare.com';

function isValidSsid(ssid) {
  if (!ssid || typeof ssid !== 'string') return false;
  const trimmed = ssid.trim();
  if (!trimmed) return false;
  if (/^<redacted>$/i.test(trimmed)) return false;
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return false;
  return true;
}

function normalizeWifiConnection(raw) {
  if (!raw?.ssid || !isValidSsid(raw.ssid)) return null;
  return raw;
}

async function getMacLocationAccessStatus() {
  if (process.platform !== 'darwin') return 'unsupported';
  try {
    const { systemPreferences } = require('electron');
    return systemPreferences.getMediaAccessStatus('location');
  } catch {
    return 'unknown';
  }
}

async function requestMacLocationAccess() {
  if (process.platform !== 'darwin') return { granted: false, status: 'unsupported' };

  try {
    const { systemPreferences } = require('electron');
    const current = systemPreferences.getMediaAccessStatus('location');
    if (current === 'granted') {
      return { granted: true, status: current };
    }
    if (current === 'not-determined') {
      const granted = await systemPreferences.askForMediaAccess('location');
      return { granted, status: systemPreferences.getMediaAccessStatus('location') };
    }
    return { granted: false, status: current };
  } catch (err) {
    return { granted: false, status: 'unknown', error: err.message };
  }
}

async function getMacSsidFromIpconfig(device) {
  if (!device) return null;
  try {
    const { stdout } = await execFileAsync('ipconfig', ['getsummary', device], { maxBuffer: 1024 * 1024 });
    const match = stdout.match(/ SSID : (.+)$/m);
    if (match && isValidSsid(match[1])) {
      return match[1].trim();
    }
  } catch {
    // ignore
  }
  return null;
}

async function getMacActiveInterface() {
  try {
    const { stdout } = await execFileAsync('scutil', ['--nwi'], { maxBuffer: 1024 * 1024 });
    const match = stdout.match(/Network interfaces:\s*(\S+)/);
    if (match) return match[1].trim();
    const fallback = stdout.match(/\ben\d+\b/);
    return fallback ? fallback[0] : null;
  } catch {
    return null;
  }
}

function parseLinkSpeedMbps(text) {
  if (!text) return null;
  const gbps = text.match(/(\d+(?:\.\d+)?)\s*Gbps/i);
  if (gbps) return Number(gbps[1]) * 1000;
  const mbps = text.match(/(\d+(?:\.\d+)?)\s*Mbps/i);
  if (mbps) return Number(mbps[1]);
  const baseT = text.match(/(\d+)baseT/i);
  if (baseT) return Number(baseT[1]);
  return null;
}

async function getWindowsSnapshot() {
  const scriptPath = resolveExternalScript(WIN_SCRIPT);
  logger.info('Running Windows network snapshot script', { script: scriptPath, source: WIN_SCRIPT });

  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    );

    if (stderr?.trim()) {
      logger.warn('network-info.ps1 stderr', { stderr: stderr.trim() });
    }

    const trimmed = stdout.trim();
    if (!trimmed) {
      logger.warn('Windows network snapshot returned empty output');
      return { platform: 'win32', primaryAdapter: null, adapters: [], limiters: [], qosNotes: [] };
    }

    const snapshot = JSON.parse(trimmed);
    logger.info('Windows network snapshot complete', {
      adapterCount: snapshot.adapters?.length ?? 0,
      primaryAdapter: snapshot.primaryAdapter?.name || null,
    });
    return snapshot;
  } catch (err) {
    logDiagnosticsError('getWindowsSnapshot failed', err, { script: scriptPath, source: WIN_SCRIPT });
    throw new Error(`Network adapter scan failed: ${err.message}`);
  }
}

async function findMacWifiDevice() {
  try {
    const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports'], { maxBuffer: 1024 * 1024 });
    for (const block of stdout.split('\n\n')) {
      const portMatch = block.match(/Hardware Port:\s*(.+)/);
      const deviceMatch = block.match(/Device:\s*(\S+)/);
      if (portMatch && deviceMatch && /wi-?fi|airport|wireless/i.test(portMatch[1])) {
        return { device: deviceMatch[1], portName: portMatch[1].trim() };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function getMacWifiConnection(preferredDevice) {
  const wifiDevice = preferredDevice || (await findMacWifiDevice())?.device;
  const activeDevice = (await getMacActiveInterface()) || wifiDevice;
  const devicesToTry = [...new Set([activeDevice, wifiDevice, preferredDevice].filter(Boolean))];

  for (const device of devicesToTry) {
    const ssid = await getMacSsidFromIpconfig(device);
    if (ssid) {
      return { device, ssid, linkRateMbps: null, source: 'ipconfig' };
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'system_profiler',
      ['SPAirPortDataType', '-json'],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    const profile = JSON.parse(stdout);
    const interfaces = profile?.SPAirPortDataType?.[0]?.spairport_airport_interfaces || [];

    for (const iface of interfaces) {
      if (preferredDevice && iface._name && iface._name !== preferredDevice) {
        continue;
      }
      const current = iface.spairport_current_network_information;
      const conn = normalizeWifiConnection({
        device: iface._name,
        ssid: current?._name,
        linkRateMbps: current?.spairport_network_rate ?? null,
      });
      if (conn) {
        return { ...conn, source: 'system_profiler' };
      }
    }

    for (const iface of interfaces) {
      const current = iface.spairport_current_network_information;
      const conn = normalizeWifiConnection({
        device: iface._name,
        ssid: current?._name,
        linkRateMbps: current?.spairport_network_rate ?? null,
      });
      if (conn) {
        return { ...conn, source: 'system_profiler' };
      }
    }
  } catch {
    // ignore
  }

  if (wifiDevice) {
    try {
      const { stdout } = await execFileAsync(
        'networksetup',
        ['-getairportnetwork', wifiDevice],
        { maxBuffer: 1024 * 1024 }
      );
      if (!/not associated/i.test(stdout)) {
        const ssidMatch = stdout.match(/:\s*(.+)$/);
        const conn = normalizeWifiConnection({
          device: wifiDevice,
          ssid: ssidMatch?.[1]?.trim(),
          linkRateMbps: null,
        });
        if (conn) {
          return { ...conn, source: 'networksetup' };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function resolveMacNetworkName(dev, isWifiHint) {
  let hardwarePortName = null;
  let isWifi = isWifiHint;
  const wifiDevice = await findMacWifiDevice();

  try {
    const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports'], { maxBuffer: 1024 * 1024 });
    const blocks = stdout.split('\n\n');
    for (const block of blocks) {
      const deviceMatch = block.match(/Device:\s*(\S+)/);
      const portMatch = block.match(/Hardware Port:\s*(.+)/);
      if (deviceMatch?.[1] === dev && portMatch) {
        hardwarePortName = portMatch[1].trim();
        if (/wi-?fi|airport|wireless/i.test(hardwarePortName)) {
          isWifi = true;
        }
        break;
      }
    }
  } catch {
    // ignore
  }

  if (dev === wifiDevice?.device) {
    isWifi = true;
  }

  const wifiConn = await getMacWifiConnection(isWifi ? dev : wifiDevice?.device);
  if (wifiConn?.ssid && (isWifi || dev === wifiDevice?.device)) {
    return {
      networkName: wifiConn.ssid,
      connectionType: 'wifi',
      networkLabel: `Wi-Fi: ${wifiConn.ssid}`,
      wifiLinkMbps: wifiConn.linkRateMbps,
    };
  }

  if (isWifi) {
    return {
      networkName: null,
      connectionType: 'wifi',
      networkLabel: 'Wi-Fi connected',
      ssidHiddenByMacOS: true,
    };
  }

  return {
    networkName: hardwarePortName || dev,
    connectionType: 'ethernet',
    networkLabel: hardwarePortName ? `LAN: ${hardwarePortName}` : `LAN: ${dev}`,
  };
}

async function getMacSnapshot(options = {}) {
  const { requestLocation = false } = options;
  let locationAccess = await getMacLocationAccessStatus();
  if (requestLocation && locationAccess !== 'granted') {
    const result = await requestMacLocationAccess();
    locationAccess = result.status;
  }

  let primaryAdapter = null;
  const adapters = [];
  const limiters = [];

  try {
    const { stdout } = await execFileAsync(
      'bash',
      [
        '-lc',
        `dev=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}'); echo "$dev"`,
      ],
      { maxBuffer: 1024 * 1024 }
    );
    const dev = stdout.trim();
    if (dev) {
      const { stdout: ifOut } = await execFileAsync('ifconfig', [dev], { maxBuffer: 1024 * 1024 });
      const mediaMatch = ifOut.match(/media:\s*(.+)/i);
      const media = mediaMatch ? mediaMatch[1].trim() : 'Unknown';
      let linkSpeedMbps = parseLinkSpeedMbps(media);

      if (linkSpeedMbps == null) {
        try {
          const { stdout: spOut } = await execFileAsync(
            'system_profiler',
            ['SPNetworkDataType', '-json'],
            { maxBuffer: 8 * 1024 * 1024 }
          );
          const profile = JSON.parse(spOut);
          const entries = profile?.SPNetworkDataType || [];
          for (const entry of entries) {
            const iface = entry.interface || entry.device;
            if (iface !== dev) continue;
            const speedText = entry.link_speed || entry.current_link_speed || entry._item || '';
            linkSpeedMbps = parseLinkSpeedMbps(String(speedText)) ?? linkSpeedMbps;
            break;
          }
        } catch {
          // ignore profiler errors
        }
      }

      const networkInfo = await resolveMacNetworkName(dev, /wifi|802\.11/i.test(media));

      primaryAdapter = {
        name: dev,
        description: dev,
        linkSpeed: media,
        linkSpeedMbps: networkInfo.wifiLinkMbps ?? linkSpeedMbps,
        mediaType: networkInfo.connectionType === 'wifi' ? '802.11 (Wireless)' : '802.3 (Ethernet)',
        driver: '',
        status: 'Up',
        ...networkInfo,
      };
      adapters.push(primaryAdapter);
    }
  } catch {
    // fall back to Node interfaces
  }

  if (!primaryAdapter) {
    const ifaces = os.networkInterfaces();
    for (const [name, entries] of Object.entries(ifaces)) {
      const up = (entries || []).find((entry) => !entry.internal && entry.family === 'IPv4');
      if (up) {
        primaryAdapter = {
          name,
          description: name,
          linkSpeed: null,
          linkSpeedMbps: null,
          mediaType: 'Unknown',
          driver: '',
          status: 'Up',
        };
        adapters.push(primaryAdapter);
        break;
      }
    }
  }

  try {
    const { stdout } = await execFileAsync('ps', ['-axco', 'command'], { maxBuffer: 4 * 1024 * 1024 });
    const vpnPatterns = ['openvpn', 'wireguard', 'tailscale', 'zerotier', 'nordvpn', 'expressvpn', 'protonvpn'];
    for (const line of stdout.split('\n')) {
      const lower = line.toLowerCase();
      for (const pattern of vpnPatterns) {
        if (lower.includes(pattern)) {
          limiters.push({
            category: 'VPN',
            name: pattern,
            detail: line.trim().slice(0, 120),
            severity: 'medium',
          });
          break;
        }
      }
    }
  } catch {
    // ignore
  }

  const wifiFallback = await getMacWifiConnection(primaryAdapter?.name);
  const wifiConnection = primaryAdapter?.networkName
    ? { ssid: primaryAdapter.networkName, device: primaryAdapter.name }
    : wifiFallback;

  return {
    platform: 'darwin',
    primaryAdapter,
    adapters,
    wifiLinkMbps: primaryAdapter?.wifiLinkMbps ?? wifiFallback?.linkRateMbps ?? null,
    wifiConnection,
    ssidHiddenByMacOS: primaryAdapter?.ssidHiddenByMacOS === true ||
      (primaryAdapter?.connectionType === 'wifi' && !wifiConnection?.ssid),
    locationAccess,
    limiters,
    qosNotes: locationAccess !== 'granted'
      ? ['macOS hides Wi-Fi names unless Location Services is enabled for this app.']
      : [],
  };
}

async function getNetworkSnapshot(options = {}) {
  try {
    if (process.platform === 'win32') {
      return await getWindowsSnapshot();
    }
    if (process.platform === 'darwin') {
      return await getMacSnapshot(options);
    }
    return {
      platform: process.platform,
      primaryAdapter: null,
      adapters: [],
      limiters: [],
      qosNotes: ['Network diagnostics are optimized for Windows and macOS.'],
    };
  } catch (err) {
    logDiagnosticsError('getNetworkSnapshot failed', err, { platform: process.platform });
    throw err;
  }
}

function measureDownload(bytes, onProgress) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let received = 0;
    let lastEmit = 0;

    const request = https.get(
      {
        hostname: SPEED_TEST_URL,
        path: `/__down?bytes=${bytes}`,
        timeout: 120000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Speed test failed (HTTP ${response.statusCode}).`));
          response.resume();
          return;
        }

        response.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (onProgress && now - lastEmit > 200) {
            lastEmit = now;
            const elapsed = (now - start) / 1000;
            const mbps = elapsed > 0 ? (received * 8) / elapsed / 1e6 : 0;
            onProgress({
              received,
              total: bytes,
              percent: Math.min(100, Math.round((received / bytes) * 100)),
              currentMbps: Math.round(mbps * 10) / 10,
            });
          }
        });

        response.on('end', () => {
          const seconds = Math.max((Date.now() - start) / 1000, 0.001);
          resolve({
            bytes: received,
            seconds: Math.round(seconds * 100) / 100,
            downloadMbps: Math.round(((received * 8) / seconds / 1e6) * 10) / 10,
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Speed test timed out.'));
    });

    request.on('error', reject);
  });
}

function measureUpload(bytes, onProgress) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.alloc(bytes);
    const start = Date.now();
    let sent = 0;
    let lastEmit = 0;
    const chunkSize = 256 * 1024;

    const request = https.request(
      {
        hostname: SPEED_TEST_URL,
        path: `/__up?bytes=${bytes}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': bytes,
        },
        timeout: 120000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Upload test failed (HTTP ${response.statusCode}).`));
          response.resume();
          return;
        }

        response.on('data', () => {});
        response.on('end', () => {
          const seconds = Math.max((Date.now() - start) / 1000, 0.001);
          resolve({
            bytes: sent,
            seconds: Math.round(seconds * 100) / 100,
            uploadMbps: Math.round(((sent * 8) / seconds / 1e6) * 10) / 10,
          });
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Upload test timed out.'));
    });

    request.on('error', reject);

    function writeChunk() {
      while (sent < bytes) {
        const end = Math.min(sent + chunkSize, bytes);
        const ok = request.write(payload.subarray(sent, end));
        sent = end;

        const now = Date.now();
        if (onProgress && now - lastEmit > 200) {
          lastEmit = now;
          const elapsed = (now - start) / 1000;
          const mbps = elapsed > 0 ? (sent * 8) / elapsed / 1e6 : 0;
          onProgress({
            sent,
            total: bytes,
            percent: Math.min(100, Math.round((sent / bytes) * 100)),
            currentMbps: Math.round(mbps * 10) / 10,
          });
        }

        if (!ok) {
          request.once('drain', writeChunk);
          return;
        }
      }

      request.end();
    }

    writeChunk();
  });
}

async function runSpeedTest(onProgress) {
  logger.info('Starting Cloudflare speed test', {
    server: SPEED_TEST_URL,
    downloadBytes: SPEED_TEST_BYTES,
    uploadBytes: UPLOAD_TEST_BYTES,
  });

  const downloadAttempts = [];
  for (let i = 0; i < 2; i += 1) {
    const basePercent = 15 + i * 20;
    if (onProgress) {
      onProgress({
        phase: 'speed-test',
        direction: 'download',
        attempt: i + 1,
        totalAttempts: 2,
        percent: basePercent,
        message: `Download test ${i + 1}/2…`,
      });
    }
    const result = await measureDownload(SPEED_TEST_BYTES, (progress) => {
      if (onProgress) {
        onProgress({
          phase: 'speed-test',
          direction: 'download',
          attempt: i + 1,
          totalAttempts: 2,
          percent: basePercent + Math.round(progress.percent * 0.2),
          ...progress,
          message: `Measuring download… ${progress.percent}%`,
        });
      }
    });
    downloadAttempts.push(result);
  }

  const uploadAttempts = [];
  for (let i = 0; i < 2; i += 1) {
    const basePercent = 55 + i * 17;
    if (onProgress) {
      onProgress({
        phase: 'speed-test',
        direction: 'upload',
        attempt: i + 1,
        totalAttempts: 2,
        percent: basePercent,
        message: `Upload test ${i + 1}/2…`,
      });
    }
    const result = await measureUpload(UPLOAD_TEST_BYTES, (progress) => {
      if (onProgress) {
        onProgress({
          phase: 'speed-test',
          direction: 'upload',
          attempt: i + 1,
          totalAttempts: 2,
          percent: basePercent + Math.round(progress.percent * 0.17),
          ...progress,
          message: `Measuring upload… ${progress.percent}%`,
        });
      }
    });
    uploadAttempts.push(result);
  }

  const bestDownload = downloadAttempts.reduce((a, b) => (b.downloadMbps > a.downloadMbps ? b : a));
  const bestUpload = uploadAttempts.reduce((a, b) => (b.uploadMbps > a.uploadMbps ? b : a));

  const result = {
    downloadMbps: bestDownload.downloadMbps,
    uploadMbps: bestUpload.uploadMbps,
    bytes: bestDownload.bytes,
    uploadBytes: bestUpload.bytes,
    seconds: bestDownload.seconds,
    uploadSeconds: bestUpload.seconds,
    attempts: downloadAttempts.length,
    uploadAttempts: uploadAttempts.length,
    server: SPEED_TEST_URL,
  };

  logger.info('Speed test complete', {
    downloadMbps: result.downloadMbps,
    uploadMbps: result.uploadMbps,
  });

  return result;
}

function formatMbps(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1000) return `${Math.round(value / 10) / 100} Gbps`;
  return `${Math.round(value * 10) / 10} Mbps`;
}

function analyzeDiagnostics({ snapshot, speedTest, internetBlocked, appBlocked }) {
  const adapter = snapshot.primaryAdapter;
  const linkMbps = adapter?.linkSpeedMbps ?? snapshot.wifiLinkMbps ?? null;
  const measuredMbps = speedTest?.downloadMbps ?? null;
  const uploadMbps = speedTest?.uploadMbps ?? null;

  const bottlenecks = [];
  const fixes = [];

  if (internetBlocked || appBlocked) {
    bottlenecks.push({
      type: 'app',
      name: 'Internet Blocker',
      severity: 'critical',
      detail: appBlocked
        ? 'This app has active firewall/DNS blocks that stop or restrict internet traffic.'
        : 'Internet blocking is active on this system.',
    });
    fixes.push('Remove all blocks in Internet Blocker before running a speed test.');
  }

  for (const limiter of snapshot.limiters || []) {
    bottlenecks.push({
      type: 'software',
      name: limiter.name,
      category: limiter.category,
      severity: limiter.severity || 'medium',
      detail: limiter.detail,
    });

    if (limiter.category === 'Killer Networking') {
      fixes.push('Open Killer Intelligence Center and disable bandwidth limits, or uninstall Killer suite and use the base Intel driver.');
    } else if (limiter.category === 'VPN') {
      fixes.push('Disconnect VPN or split-tunnel heavy traffic to test raw LAN/WAN speed.');
    } else if (limiter.category === 'Network optimizer') {
      fixes.push(`Check ${limiter.name} for per-app or global speed caps.`);
    }
  }

  for (const note of snapshot.qosNotes || []) {
    bottlenecks.push({
      type: 'system',
      name: 'Windows TCP settings',
      severity: 'low',
      detail: note,
    });
    fixes.push('Run `netsh int tcp set global autotuninglevel=normal` in an elevated Command Prompt.');
  }

  const isEthernet = /ethernet|802\.3/i.test(adapter?.mediaType || '') ||
    /baseT|full-duplex/i.test(adapter?.linkSpeed || '');

  if (linkMbps != null && linkMbps <= 100 && isEthernet) {
    bottlenecks.push({
      type: 'hardware',
      name: '100 Mbps link negotiation',
      severity: 'high',
      detail: `Adapter "${adapter.name}" is linked at ${formatMbps(linkMbps)} on Ethernet — often a cable, switch port, or NIC setting.`,
    });
    fixes.push('Try a Cat5e/Cat6 cable, a different router/switch port, and set adapter Speed & Duplex to Auto or 1.0 Gbps Full Duplex.');
  }

  if (linkMbps != null && measuredMbps != null && linkMbps >= 500 && measuredMbps < linkMbps * 0.2) {
    bottlenecks.push({
      type: 'throughput',
      name: 'Download below link capacity',
      severity: 'medium',
      detail: `NIC link is ${formatMbps(linkMbps)} but download measured ${formatMbps(measuredMbps)} (${Math.round((measuredMbps / linkMbps) * 100)}% of link).`,
    });
    if (!bottlenecks.some((item) => item.category === 'Killer Networking')) {
      fixes.push('Check ISP plan, router QoS, VPN, and background downloads in Task Manager → Performance → Open Resource Monitor.');
    }
  }

  if (uploadMbps != null && measuredMbps != null && uploadMbps < measuredMbps * 0.15 && measuredMbps > 20) {
    bottlenecks.push({
      type: 'throughput',
      name: 'Upload much slower than download',
      severity: 'low',
      detail: `Upload ${formatMbps(uploadMbps)} vs download ${formatMbps(measuredMbps)} — common on asymmetric ISP plans or upstream congestion.`,
    });
  }

  if (linkMbps == null) {
    fixes.push('Open Task Manager → Performance → Ethernet/Wi-Fi to confirm whether the link shows 100 Mbps or 1.0 Gbps.');
  }

  const maxNicMbps = linkMbps;
  let limitingFactor = 'None detected';
  let estimatedMaxWithoutLimitsMbps = maxNicMbps;

  if (internetBlocked || appBlocked) {
    limitingFactor = 'Internet Blocker (active blocks)';
    estimatedMaxWithoutLimitsMbps = measuredMbps;
  } else if (bottlenecks.some((item) => item.category === 'Killer Networking')) {
    limitingFactor = 'Killer Networking software (likely)';
  } else if (linkMbps != null && linkMbps <= 100 && isEthernet) {
    limitingFactor = 'Hardware link at 100 Mbps (cable/port/NIC)';
  } else if (bottlenecks.some((item) => item.category === 'VPN')) {
    limitingFactor = 'VPN tunnel';
  } else if (measuredMbps != null && maxNicMbps != null && measuredMbps >= maxNicMbps * 0.7) {
    limitingFactor = 'Near NIC link limit — ISP or router may be the cap';
  } else if (measuredMbps != null) {
    limitingFactor = 'ISP, router, Wi-Fi, or background traffic';
  }

  const networkLabel = adapter?.networkLabel || null;

  const summary =
    measuredMbps != null
      ? `Download: ${formatMbps(measuredMbps)}${uploadMbps != null ? `, Upload: ${formatMbps(uploadMbps)}` : ''}${networkLabel ? ` on ${networkLabel}` : ''}. NIC link: ${formatMbps(maxNicMbps)}. Likely limit: ${limitingFactor}.`
      : `${networkLabel ? `Network: ${networkLabel}. ` : ''}NIC link: ${formatMbps(maxNicMbps)}. Likely limit: ${limitingFactor}.`;

  return {
    summary,
    limitingFactor,
    networkLabel,
    networkName: adapter?.networkName || null,
    connectionType: adapter?.connectionType || null,
    maxNicMbps,
    maxNicLabel: formatMbps(maxNicMbps),
    measuredMbps,
    measuredLabel: formatMbps(measuredMbps),
    uploadMbps,
    uploadLabel: formatMbps(uploadMbps),
    estimatedMaxWithoutLimitsMbps: maxNicMbps,
    estimatedMaxWithoutLimitsLabel: formatMbps(maxNicMbps),
    bottlenecks,
    fixes: [...new Set(fixes)],
  };
}

async function runNetworkDiagnostics(options = {}) {
  const { onProgress, skipSpeedTest = false, internetBlocked = false, appBlocked = false } = options;

  logger.info('runNetworkDiagnostics started', {
    skipSpeedTest,
    internetBlocked,
    appBlocked,
  });

  try {
    if (onProgress) {
      onProgress({ phase: 'snapshot', percent: 5, message: 'Reading network adapters…' });
    }
    const snapshot = await getNetworkSnapshot({ requestLocation: true });

    if (onProgress) {
      onProgress({ phase: 'limiters', percent: 25, message: 'Scanning for bandwidth limiters…' });
    }

    let speedTest = null;
    if (!skipSpeedTest && !internetBlocked && !appBlocked) {
      try {
        speedTest = await runSpeedTest(onProgress);
      } catch (err) {
        logDiagnosticsError('runSpeedTest failed', err);
        throw new Error(`Speed test failed: ${err.message}`);
      }
    } else if (internetBlocked || appBlocked) {
      logger.info('Speed test skipped because blocks are active');
      if (onProgress) {
        onProgress({
          phase: 'speed-test',
          percent: 100,
          message: 'Skipped speed test - remove active blocks first.',
        });
      }
    }

    if (onProgress) {
      onProgress({ phase: 'analysis', percent: 95, message: 'Analyzing results…' });
    }

    const analysis = analyzeDiagnostics({
      snapshot,
      speedTest,
      internetBlocked,
      appBlocked,
    });

    if (onProgress) {
      onProgress({ phase: 'done', percent: 100, message: 'Complete' });
    }

    logger.info('runNetworkDiagnostics complete', {
      downloadMbps: speedTest?.downloadMbps ?? null,
      uploadMbps: speedTest?.uploadMbps ?? null,
      limitingFactor: analysis.limitingFactor,
    });

    return { snapshot, speedTest, analysis, testedAt: new Date().toISOString() };
  } catch (err) {
    logDiagnosticsError('runNetworkDiagnostics failed', err);
    throw err;
  }
}

module.exports = {
  getNetworkSnapshot,
  runSpeedTest,
  analyzeDiagnostics,
  runNetworkDiagnostics,
  formatMbps,
  requestMacLocationAccess,
  getMacLocationAccessStatus,
  isValidSsid,
};
