const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blocker', {
  getStatus: () => ipcRenderer.invoke('get-status'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  startTimer: (minutes) => ipcRenderer.invoke('start-timer', minutes),
  stopTimer: () => ipcRenderer.invoke('stop-timer'),
  blockNow: () => ipcRenderer.invoke('block-now'),
  unblockNow: (password) => ipcRenderer.invoke('unblock-now', password),
  setPassword: (payload) => ipcRenderer.invoke('set-password', payload),
  clearPassword: (currentPassword) => ipcRenderer.invoke('clear-password', currentPassword),
  pickBlockedApp: () => ipcRenderer.invoke('pick-blocked-app'),
  getDomainPacks: () => ipcRenderer.invoke('get-domain-packs'),
  applyDomainPack: (packId) => ipcRenderer.invoke('apply-domain-pack', packId),
  getDnsProviders: () => ipcRenderer.invoke('get-dns-providers'),
  scanGames: () => ipcRenderer.invoke('scan-games'),
  listRunningApps: () => ipcRenderer.invoke('list-running-apps'),
  openConfigFolder: () => ipcRenderer.invoke('open-config-folder'),
  getNetworkSnapshot: () => ipcRenderer.invoke('get-network-snapshot'),
  requestLocationAccess: () => ipcRenderer.invoke('request-location-access'),
  openLocationSettings: () => ipcRenderer.invoke('open-location-settings'),
  runNetworkDiagnostics: (options) => ipcRenderer.invoke('run-network-diagnostics', options),
  requestAdmin: () => ipcRenderer.invoke('request-admin'),
  onNetworkDiagnosticsProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('network-diagnostics-progress', handler);
    return () => ipcRenderer.removeListener('network-diagnostics-progress', handler);
  },
  onTick: (callback) => {
    const handler = (_event, remainingMs) => callback(remainingMs);
    ipcRenderer.on('timer-tick', handler);
    return () => ipcRenderer.removeListener('timer-tick', handler);
  },
  onStateChange: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('state-change', handler);
    return () => ipcRenderer.removeListener('state-change', handler);
  },
});
