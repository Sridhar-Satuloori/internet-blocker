const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const shell = document.getElementById('shell');
const mainArea = document.querySelector('.main-area');
const sidebarToggle = document.getElementById('sidebar-toggle');
const detailsBar = document.getElementById('details-bar');
const detailsBody = document.getElementById('details-body');
const detailsTitle = document.getElementById('details-title');

const minutesInput = document.getElementById('minutes');
const autoStartInput = document.getElementById('auto-start');
const minimizeTrayInput = document.getElementById('minimize-tray');
const scheduleEnabledInput = document.getElementById('schedule-enabled');
const blockTimeInput = document.getElementById('block-time');
const unblockTimeInput = document.getElementById('unblock-time');
const blockAllInput = document.getElementById('block-all');
const addAppBtn = document.getElementById('add-app-btn');
const addWebsiteBtn = document.getElementById('add-website-btn');
const clearWebsitesBtn = document.getElementById('clear-websites-btn');
const websiteInput = document.getElementById('website-input');
const blockedAppsList = document.getElementById('blocked-apps-list');
const runningAppsList = document.getElementById('running-apps-list');
const runningAppsStatus = document.getElementById('running-apps-status');
const runningAppsEmpty = document.getElementById('running-apps-empty');
const refreshRunningAppsBtn = document.getElementById('refresh-running-apps-btn');
const blockedWebsitesList = document.getElementById('blocked-websites-list');
const appsEmptyHint = document.getElementById('apps-empty');
const websitesEmptyHint = document.getElementById('websites-empty');
const addYoutubePackBtn = document.getElementById('add-youtube-pack-btn');
const useDnsBlockingInput = document.getElementById('use-dns-blocking');
const dnsProviderSelect = document.getElementById('dns-provider');
const scanGamesBtn = document.getElementById('scan-games-btn');
const gamesScanStatus = document.getElementById('games-scan-status');
const gameList = document.getElementById('game-list');
const selectAllGamesBtn = document.getElementById('select-all-games-btn');
const clearGamesBtn = document.getElementById('clear-games-btn');
const blockSelectedGamesBtn = document.getElementById('block-selected-games-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const blockNowBtn = document.getElementById('block-now-btn');
const unblockBtn = document.getElementById('unblock-btn');
const blockoutNowBtn = document.getElementById('blockout-now-btn');
const blockoutRestoreBtn = document.getElementById('blockout-restore-btn');
const adminBtn = document.getElementById('admin-btn');
const statusDot = document.getElementById('status-dot');
const statusLabel = document.getElementById('status-label');
const statusDetail = document.getElementById('status-detail');
const summaryGrid = document.getElementById('summary-grid');
const timerDisplay = document.getElementById('timer-display');
const timerValue = document.getElementById('timer-value');
const platformNote = document.getElementById('platform-note');
const passwordStatus = document.getElementById('password-status');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const currentPasswordInput = document.getElementById('current-password');
const currentPasswordLabel = document.getElementById('current-password-label');
const setPasswordBtn = document.getElementById('set-password-btn');
const clearPasswordBtn = document.getElementById('clear-password-btn');
const passwordDialog = document.getElementById('password-dialog');
const passwordForm = document.getElementById('password-form');
const unblockPasswordInput = document.getElementById('unblock-password');
const cancelUnblockBtn = document.getElementById('cancel-unblock');
const unblockError = document.getElementById('unblock-error');
const showDetailsBarInput = document.getElementById('show-details-bar');
const launchAtStartupInput = document.getElementById('launch-at-startup');
const notifyOnBlockInput = document.getElementById('notify-on-block');
const notifyOnUnblockInput = document.getElementById('notify-on-unblock');
const confirmBeforeBlockInput = document.getElementById('confirm-before-block');
const confirmBeforeUnblockInput = document.getElementById('confirm-before-unblock');
const configPathInput = document.getElementById('config-path');
const openConfigFolderBtn = document.getElementById('open-config-folder-btn');
const speedDownloadValue = document.getElementById('speed-download-value');
const speedUploadValue = document.getElementById('speed-upload-value');
const speedLinkValue = document.getElementById('speed-link-value');
const speedMaxValue = document.getElementById('speed-max-value');
const speedRefreshBtn = document.getElementById('speed-refresh-btn');
const speedTestBtn = document.getElementById('speed-test-btn');
const speedProgress = document.getElementById('speed-progress');
const speedProgressFill = document.getElementById('speed-progress-fill');
const speedProgressText = document.getElementById('speed-progress-text');
const speedSummary = document.getElementById('speed-summary');
const speedLimitFactor = document.getElementById('speed-limit-factor');
const speedBottlenecksPanel = document.getElementById('speed-bottlenecks-panel');
const speedBottlenecksList = document.getElementById('speed-bottlenecks-list');
const speedFixesPanel = document.getElementById('speed-fixes-panel');
const speedFixesList = document.getElementById('speed-fixes-list');
const speedAdapterCard = document.getElementById('speed-adapter-card');
const speedNetworkName = document.getElementById('speed-network-name');
const speedNetworkHint = document.getElementById('speed-network-hint');
const speedLocationActions = document.getElementById('speed-location-actions');
const speedLocationBtn = document.getElementById('speed-location-btn');
const speedLocationSettingsBtn = document.getElementById('speed-location-settings-btn');

let hasPasswordSet = false;
let blockedApps = [];
let runningApps = [];
let blockedWebsites = [];
let scannedGames = [];
let selectedGameIds = new Set();
let dnsProvidersLoaded = false;
let currentState = null;
let activeView = 'overview';

const VIEW_DETAILS = {
  overview: 'All active blocks — summary of every applied layer',
  blockout: 'Total blockout — firewall outbound block (Windows Firewall / macOS pf)',
  timer: 'Focus timer — stored in app config, applied at countdown end',
  schedule: 'Daily schedule — stored in app config, applied on schedule',
  apps: 'Blocked apps — per-program firewall rules',
  websites: 'Websites & DNS — hosts file entries and network adapter DNS',
  games: 'Blocked games — inbound + outbound firewall rules per app',
  speed: 'Network speed — adapter link speed and Cloudflare download test',
  settings: 'Settings — app config, password hash, and preferences',
};

function showView(viewId) {
  activeView = viewId;
  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });
  views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewId}`);
  });
  if (currentState) renderDetailsBar(currentState);
  if (viewId === 'apps') {
    refreshRunningApps();
  }
}

navItems.forEach((item) => {
  item.addEventListener('click', () => showView(item.dataset.view));
});

function setDetailsBarVisible(visible) {
  mainArea.classList.toggle('details-hidden', !visible);
}

function setSidebarCollapsed(collapsed) {
  shell.classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  sidebarToggle.setAttribute('aria-label', sidebarToggle.title);
}

sidebarToggle.addEventListener('click', async () => {
  const collapsed = !shell.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(collapsed);
  await window.blocker.saveConfig({ sidebarCollapsed: collapsed });
});

function detailRow(label, value, { active = false, inactive = false } = {}) {
  const valueClass = active ? 'active' : inactive ? 'inactive' : '';
  return `
    <div class="detail-row">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value ${valueClass}">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderDetailsBar(state) {
  const { config, blocked, applyLocations } = state;
  const loc = applyLocations || {};
  detailsTitle.textContent = VIEW_DETAILS[activeView] || 'Where settings are applied';

  const rows = [
    detailRow('App config', loc.configFile || '—'),
  ];

  if (activeView === 'overview' || activeView === 'blockout' || activeView === 'apps' || activeView === 'games') {
    rows.push(detailRow('Firewall UI', loc.firewallManager || 'System firewall'));
  }

  if (activeView === 'overview' || activeView === 'blockout') {
    rows.push(
      detailRow(
        'Blockout rule',
        blocked && config.blockAllInternet !== false ? 'InternetBlocker-BlockOutbound (active)' : 'Not applied yet',
        { active: blocked && config.blockAllInternet !== false, inactive: !blocked }
      )
    );
  }

  if (activeView === 'overview' || activeView === 'apps' || activeView === 'games') {
    const appCount = (config.blockedApps || []).length;
    rows.push(
      detailRow(
        'App/game rules',
        appCount
          ? `${appCount} rule set(s) → InternetBlocker-App-{id}-out/in-tcp/udp`
          : 'None configured',
        { active: blocked && appCount > 0, inactive: appCount === 0 }
      )
    );
  }

  if (activeView === 'overview' || activeView === 'websites') {
    const siteCount = (config.blockedWebsites || []).length;
    rows.push(detailRow('Hosts file', loc.hostsFile || '—'));
    rows.push(
      detailRow(
        'Hosts entries',
        siteCount
          ? `${siteCount} domain(s) between ${loc.hostsMarkerStart} / ${loc.hostsMarkerEnd}`
          : 'None configured',
        { active: blocked && siteCount > 0, inactive: siteCount === 0 }
      )
    );
  }

  if (activeView === 'overview' || activeView === 'websites') {
    rows.push(
      detailRow(
        'DNS filter',
        config.useDnsBlocking
          ? `Active adapters → ${config.dnsProvider} (backup: ${loc.dnsBackupFile || '—'})`
          : 'Off',
        { active: blocked && config.useDnsBlocking, inactive: !config.useDnsBlocking }
      )
    );
  }

  if (activeView === 'timer' || activeView === 'schedule' || activeView === 'overview') {
    rows.push(detailRow('Timer / schedule', 'Saved in config.json — applied by app at runtime'));
  }

  if (activeView === 'settings' || activeView === 'overview') {
    rows.push(
      detailRow(
        'Password hash',
        config.hasPassword ? `Stored in ${loc.configFile || 'config.json'}` : 'Not set',
        { active: config.hasPassword, inactive: !config.hasPassword }
      )
    );
  }

  if (activeView === 'speed' || activeView === 'overview') {
    rows.push(detailRow('Speed test server', 'speed.cloudflare.com (download probe)'));
  }

  if (!loc.isWindows && !loc.isMac) {
    rows.push(detailRow('Platform', 'Blocking is not supported on this platform (configuration only)'));
  }

  detailsBody.innerHTML = rows.join('');
}

function isGameBlocked(gameId) {
  return blockedApps.some((app) => app.id === gameId && app.type === 'game');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function buildBlockedDetail(config) {
  const parts = [];
  if (config.blockAllInternet !== false) parts.push('total blockout');
  if ((config.blockedApps || []).length) parts.push(`${config.blockedApps.length} app(s)/game(s)`);
  if ((config.blockedWebsites || []).length) parts.push(`${config.blockedWebsites.length} website(s)`);
  if (config.useDnsBlocking) parts.push('DNS filtering');
  return parts.length ? `Active: ${parts.join(', ')}` : 'Blocks are active.';
}

function renderSummaryGrid(state) {
  const { config, timer, schedule, blocked } = state;
  const gameCount = (config.blockedApps || []).filter((a) => a.type === 'game').length;
  const appCount = (config.blockedApps || []).filter((a) => a.type !== 'game').length;

  const items = [
    {
      title: 'Total Blockout',
      value: config.blockAllInternet !== false ? 'Enabled in config' : 'Selective only',
      state: blocked && config.blockAllInternet !== false ? 'Active now' : 'Not active',
      active: blocked && config.blockAllInternet !== false,
    },
    {
      title: 'Apps / Games',
      value: `${appCount} app(s), ${gameCount} game(s)`,
      state: blocked && (config.blockedApps || []).length ? 'Rules applied' : 'Configured only',
      active: blocked && (config.blockedApps || []).length > 0,
    },
    {
      title: 'Websites',
      value: `${(config.blockedWebsites || []).length} domain(s)`,
      state: blocked && (config.blockedWebsites || []).length ? 'Hosts updated' : 'Configured only',
      active: blocked && (config.blockedWebsites || []).length > 0,
    },
    {
      title: 'DNS Filter',
      value: config.useDnsBlocking ? 'Family-safe DNS' : 'Off',
      state: blocked && config.useDnsBlocking ? 'DNS switched' : 'Configured only',
      active: blocked && config.useDnsBlocking,
    },
    {
      title: 'Focus Timer',
      value: timer.isRunning ? formatMs(timer.remainingMs) : 'Not running',
      state: timer.isRunning ? 'Will apply blocks at zero' : 'Idle',
      active: timer.isRunning,
    },
    {
      title: 'Schedule',
      value: schedule.enabled ? `${schedule.blockTime} → ${schedule.unblockTime}` : 'Off',
      state: schedule.enabled
        ? schedule.inBlockWindow ? 'Inside block window' : 'Waiting for next event'
        : 'Disabled',
      active: schedule.enabled && schedule.inBlockWindow,
    },
  ];

  summaryGrid.innerHTML = items.map((item) => `
    <div class="summary-item${item.active ? ' active-block' : ''}">
      <div class="summary-item-title">${escapeHtml(item.title)}</div>
      <div class="summary-item-value">${escapeHtml(item.value)}</div>
      <div class="summary-item-state ${item.active ? 'on' : 'off'}">${escapeHtml(item.state)}</div>
    </div>
  `).join('');
}

function isAppBlocked(appPath) {
  return blockedApps.some((app) => app.path.toLowerCase() === appPath.toLowerCase());
}

function renderRunningAppsList() {
  runningAppsList.innerHTML = '';

  for (const app of runningApps) {
    const blocked = isAppBlocked(app.path);
    const li = document.createElement('li');
    li.className = `target-item${blocked ? ' blocked-entry' : ''}`;
    const instanceLabel = app.instances > 1 ? ` · ${app.instances} running` : '';
    li.innerHTML = `
      <div class="target-meta">
        <div class="target-name">${escapeHtml(app.name || 'App')}</div>
        <div class="target-detail">${escapeHtml(app.path)}${instanceLabel}${blocked ? ' · already blocked' : ''}</div>
      </div>
      <button type="button" class="btn small ${blocked ? 'ghost' : 'secondary'}" data-block-running-app="${escapeHtml(app.id)}" ${blocked ? 'disabled' : ''}>
        ${blocked ? 'Blocked' : 'Block'}
      </button>
    `;
    runningAppsList.appendChild(li);
  }

  runningAppsEmpty.hidden = runningApps.length > 0;
  runningAppsList.hidden = runningApps.length === 0;
}

async function refreshRunningApps() {
  runningAppsStatus.textContent = 'Loading running apps…';
  refreshRunningAppsBtn.disabled = true;

  try {
    runningApps = await window.blocker.listRunningApps();
    renderRunningAppsList();
    runningAppsStatus.textContent = runningApps.length
      ? `${runningApps.length} app(s) with a known executable path.`
      : 'No running apps with a known executable path were found.';
  } catch (err) {
    runningApps = [];
    renderRunningAppsList();
    runningAppsStatus.textContent = err.message || 'Failed to load running apps.';
  } finally {
    refreshRunningAppsBtn.disabled = false;
  }
}

function renderTargetLists() {
  blockedAppsList.innerHTML = '';
  blockedWebsitesList.innerHTML = '';

  for (const app of blockedApps) {
    const li = document.createElement('li');
    li.className = 'target-item';
    const tag = app.type === 'game' ? 'game · full network block' : 'app · outbound blocked';
    li.innerHTML = `
      <div class="target-meta">
        <div class="target-name">${escapeHtml(app.name || 'App')}</div>
        <div class="target-detail">${escapeHtml(app.path)} · ${tag}</div>
      </div>
      <button type="button" class="btn small ghost" data-remove-app="${escapeHtml(app.id)}">Remove</button>
    `;
    blockedAppsList.appendChild(li);
  }

  for (const site of blockedWebsites) {
    const li = document.createElement('li');
    li.className = 'target-item';
    const tag = site.pack ? `hosts · ${site.pack} pack` : 'hosts file';
    li.innerHTML = `
      <div class="target-meta">
        <div class="target-name">${escapeHtml(site.domain)}</div>
        <div class="target-detail">${tag}</div>
      </div>
      <button type="button" class="btn small ghost" data-remove-site="${escapeHtml(site.id)}">Remove</button>
    `;
    blockedWebsitesList.appendChild(li);
  }

  appsEmptyHint.hidden = blockedApps.length > 0;
  websitesEmptyHint.hidden = blockedWebsites.length > 0;
  renderRunningAppsList();
  renderGameList();
}

function renderGameList() {
  gameList.innerHTML = '';

  for (const game of scannedGames) {
    const blocked = isGameBlocked(game.id);
    const checked = selectedGameIds.has(game.id);
    const item = document.createElement('label');
    item.className = `game-item${blocked ? ' blocked' : ''}`;
    item.innerHTML = `
      <input type="checkbox" data-game-id="${escapeHtml(game.id)}" ${checked ? 'checked' : ''} ${blocked ? 'disabled' : ''}>
      <div class="game-item-meta">
        <div class="game-item-name">${escapeHtml(game.name)}</div>
        <div class="game-item-path">${escapeHtml(game.path)}</div>
        <div class="game-item-tag">${escapeHtml(game.source)}${blocked ? ' · in block list' : ''}</div>
      </div>
    `;
    gameList.appendChild(item);
  }

  const hasGames = scannedGames.length > 0;
  selectAllGamesBtn.disabled = !hasGames;
  clearGamesBtn.disabled = selectedGameIds.size === 0;
  blockSelectedGamesBtn.disabled = selectedGameIds.size === 0;
}

async function ensureDnsProviders() {
  if (dnsProvidersLoaded) return;
  const providers = await window.blocker.getDnsProviders();
  dnsProviderSelect.innerHTML = providers
    .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`)
    .join('');
  dnsProvidersLoaded = true;
}

async function saveBlockTargets() {
  await window.blocker.saveConfig({
    blockAllInternet: blockAllInput.checked,
    blockedApps,
    blockedWebsites,
    useDnsBlocking: useDnsBlockingInput.checked,
    dnsProvider: dnsProviderSelect.value,
  });
}

function applyState(state) {
  currentState = state;
  const { config, timer, schedule, blocked, isWindows, isMac, blockingSupported, isAdmin, applyLocations } = state;

  minutesInput.value = config.blockAfterMinutes;
  autoStartInput.checked = config.autoStartTimer;
  minimizeTrayInput.checked = config.minimizeToTray;
  showDetailsBarInput.checked = config.showDetailsBar !== false;
  launchAtStartupInput.checked = config.launchAtStartup === true;
  notifyOnBlockInput.checked = config.notifyOnBlock !== false;
  notifyOnUnblockInput.checked = config.notifyOnUnblock !== false;
  confirmBeforeBlockInput.checked = config.confirmBeforeBlock === true;
  confirmBeforeUnblockInput.checked = config.confirmBeforeUnblock !== false;
  configPathInput.value = applyLocations?.configFile || '';
  scheduleEnabledInput.checked = config.dailySchedule?.enabled ?? false;
  blockTimeInput.value = config.dailySchedule?.blockTime ?? '22:00';
  unblockTimeInput.value = config.dailySchedule?.unblockTime ?? '07:00';
  blockTimeInput.disabled = !scheduleEnabledInput.checked;
  unblockTimeInput.disabled = !scheduleEnabledInput.checked;
  blockAllInput.checked = config.blockAllInternet !== false;
  useDnsBlockingInput.checked = config.useDnsBlocking === true;
  dnsProviderSelect.disabled = !useDnsBlockingInput.checked;
  blockedApps = config.blockedApps || [];
  blockedWebsites = config.blockedWebsites || [];

  ensureDnsProviders().then(() => {
    dnsProviderSelect.value = config.dnsProvider || 'cloudflare-family';
  });

  renderTargetLists();
  renderSummaryGrid(state);
  setDetailsBarVisible(config.showDetailsBar !== false);
  if (config.showDetailsBar !== false) renderDetailsBar(state);

  setSidebarCollapsed(config.sidebarCollapsed === true);

  hasPasswordSet = Boolean(config.hasPassword);
  passwordStatus.textContent = hasPasswordSet
    ? 'Password is set — removing blocks requires your password.'
    : 'No password set — blocks can be removed freely.';

  currentPasswordLabel.hidden = !hasPasswordSet;
  currentPasswordInput.hidden = !hasPasswordSet;
  clearPasswordBtn.hidden = !hasPasswordSet;

  statusDot.className = 'status-dot';
  if (blocked) {
    statusDot.classList.add('blocked');
    statusLabel.textContent = 'Blocks are active';
    statusDetail.textContent = buildBlockedDetail(config);
    timerDisplay.hidden = true;
  } else if (timer.isRunning) {
    statusDot.classList.add('running');
    statusLabel.textContent = 'Timer running';
    statusDetail.textContent = 'Blocks will be applied when the timer reaches zero.';
    timerDisplay.hidden = false;
    timerValue.textContent = formatMs(timer.remainingMs);
  } else if (schedule?.enabled && schedule.inBlockWindow) {
    statusDot.classList.add('running');
    statusLabel.textContent = 'Inside daily block window';
    statusDetail.textContent = 'Waiting to apply blocks (may need Administrator).';
    timerDisplay.hidden = true;
  } else {
    statusDot.classList.add('ready');
    statusLabel.textContent = 'No active blocks';
    statusDetail.textContent = schedule?.enabled && schedule.nextEvent
      ? `Next scheduled ${schedule.nextEvent.type}: ${formatMs(schedule.nextEvent.inMs)}`
      : 'Internet access is currently allowed.';
    timerDisplay.hidden = true;
  }

  startBtn.disabled = timer.isRunning || blocked;
  stopBtn.disabled = !timer.isRunning;
  unblockBtn.disabled = !blocked;
  blockoutRestoreBtn.disabled = !blocked;
  blockNowBtn.disabled = blocked;

  if (blockingSupported && !isAdmin) {
    adminBtn.hidden = false;
    platformNote.textContent = isMac
      ? 'Administrator privileges are required. Use Run as Admin in the sidebar (macOS will prompt for your password).'
      : 'Administrator privileges are required to apply or remove blocks. Use the button in the sidebar.';
  } else if (!blockingSupported) {
    adminBtn.hidden = true;
    platformNote.textContent = 'Blocking is not supported on this platform. You can still configure settings here.';
  } else {
    adminBtn.hidden = true;
    platformNote.textContent = isMac
      ? 'Use “Remove all blocks” on Overview to reverse every active block (pf, hosts, and DNS).'
      : 'Use “Remove all blocks” on Overview to reverse every active block (firewall, hosts, and DNS).';
  }
}

async function saveTimerSettings() {
  await window.blocker.saveConfig({
    blockAfterMinutes: Number(minutesInput.value),
    autoStartTimer: autoStartInput.checked,
  });
}

async function saveSettings() {
  await window.blocker.saveConfig({
    minimizeToTray: minimizeTrayInput.checked,
    showDetailsBar: showDetailsBarInput.checked,
    launchAtStartup: launchAtStartupInput.checked,
    notifyOnBlock: notifyOnBlockInput.checked,
    notifyOnUnblock: notifyOnUnblockInput.checked,
    confirmBeforeBlock: confirmBeforeBlockInput.checked,
    confirmBeforeUnblock: confirmBeforeUnblockInput.checked,
  });
  setDetailsBarVisible(showDetailsBarInput.checked);
  if (showDetailsBarInput.checked && currentState) renderDetailsBar(currentState);
}

async function saveScheduleSettings() {
  await window.blocker.saveConfig({
    dailySchedule: {
      enabled: scheduleEnabledInput.checked,
      blockTime: blockTimeInput.value,
      unblockTime: unblockTimeInput.value,
    },
  });
}

function promptUnblock() {
  const config = currentState?.config || {};
  if (config.confirmBeforeUnblock !== false && !confirm('Remove all active blocks and restore internet access?')) {
    return;
  }

  unblockError.hidden = true;
  unblockPasswordInput.value = '';
  if (hasPasswordSet) {
    passwordDialog.showModal();
    unblockPasswordInput.focus();
  } else {
    performUnblock('');
  }
}

async function performUnblock(password) {
  try {
    await window.blocker.unblockNow(password);
    passwordDialog.close();
  } catch (err) {
    if (hasPasswordSet && passwordDialog.open) {
      unblockError.textContent = err.message || 'Failed to remove blocks.';
      unblockError.hidden = false;
    } else {
      alert(err.message || 'Failed to remove blocks.');
    }
  }
}

async function applyBlocksNow() {
  const config = currentState?.config || {};
  if (config.confirmBeforeBlock && !confirm('Apply all configured blocks now?')) {
    return;
  }

  try {
    await saveBlockTargets();
    await window.blocker.blockNow();
  } catch (err) {
    alert(err.message || 'Failed to apply blocks.');
  }
}

minutesInput.addEventListener('change', saveTimerSettings);
autoStartInput.addEventListener('change', saveTimerSettings);

showDetailsBarInput.addEventListener('change', saveSettings);
minimizeTrayInput.addEventListener('change', saveSettings);
launchAtStartupInput.addEventListener('change', saveSettings);
notifyOnBlockInput.addEventListener('change', saveSettings);
notifyOnUnblockInput.addEventListener('change', saveSettings);
confirmBeforeBlockInput.addEventListener('change', saveSettings);
confirmBeforeUnblockInput.addEventListener('change', saveSettings);

openConfigFolderBtn.addEventListener('click', () => window.blocker.openConfigFolder());

scheduleEnabledInput.addEventListener('change', async () => {
  blockTimeInput.disabled = !scheduleEnabledInput.checked;
  unblockTimeInput.disabled = !scheduleEnabledInput.checked;
  await saveScheduleSettings();
});
blockTimeInput.addEventListener('change', saveScheduleSettings);
unblockTimeInput.addEventListener('change', saveScheduleSettings);

blockAllInput.addEventListener('change', saveBlockTargets);
useDnsBlockingInput.addEventListener('change', async () => {
  dnsProviderSelect.disabled = !useDnsBlockingInput.checked;
  await saveBlockTargets();
});
dnsProviderSelect.addEventListener('change', saveBlockTargets);

blockNowBtn.addEventListener('click', applyBlocksNow);
blockoutNowBtn.addEventListener('click', async () => {
  blockAllInput.checked = true;
  await applyBlocksNow();
});
blockoutRestoreBtn.addEventListener('click', promptUnblock);
unblockBtn.addEventListener('click', promptUnblock);

addYoutubePackBtn.addEventListener('click', async () => {
  try {
    const result = await window.blocker.applyDomainPack('youtube');
    alert(`YouTube pack added. ${result.added} new domain(s); ${result.total} total.`);
  } catch (err) {
    alert(err.message || 'Failed to apply YouTube pack.');
  }
});

clearWebsitesBtn.addEventListener('click', async () => {
  if (!blockedWebsites.length) return;
  if (!confirm('Remove all websites from the block list?')) return;
  blockedWebsites = [];
  renderTargetLists();
  await saveBlockTargets();
});

addAppBtn.addEventListener('click', async () => {
  try {
    const picked = await window.blocker.pickBlockedApp();
    if (!picked) return;
    if (blockedApps.some((app) => app.path.toLowerCase() === picked.path.toLowerCase())) {
      alert('That app is already in the list.');
      return;
    }
    blockedApps = [...blockedApps, picked];
    renderTargetLists();
    await saveBlockTargets();
  } catch (err) {
    alert(err.message || 'Failed to add app.');
  }
});

refreshRunningAppsBtn.addEventListener('click', refreshRunningApps);

runningAppsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-block-running-app]');
  if (!button || button.disabled) return;

  const app = runningApps.find((entry) => entry.id === button.dataset.blockRunningApp);
  if (!app) return;

  if (isAppBlocked(app.path)) return;

  blockedApps = [...blockedApps, {
    id: app.id,
    name: app.name,
    path: app.path,
    type: 'app',
  }];
  renderTargetLists();
  await saveBlockTargets();
});

addWebsiteBtn.addEventListener('click', async () => {
  const raw = websiteInput.value.trim();
  if (!raw) return;

  let domain = raw.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  domain = domain.replace(/^www\./, '');

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-][a-z0-9-]*)+$/.test(domain)) {
    alert('Enter a valid domain, e.g. youtube.com');
    return;
  }

  if (blockedWebsites.some((site) => site.domain === domain)) {
    alert('That website is already in the list.');
    return;
  }

  blockedWebsites = [...blockedWebsites, { id: domain, domain }];
  websiteInput.value = '';
  renderTargetLists();
  await saveBlockTargets();
});

websiteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addWebsiteBtn.click();
  }
});

blockedAppsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove-app]');
  if (!button) return;
  blockedApps = blockedApps.filter((app) => app.id !== button.dataset.removeApp);
  renderTargetLists();
  await saveBlockTargets();
});

blockedWebsitesList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove-site]');
  if (!button) return;
  blockedWebsites = blockedWebsites.filter((site) => site.id !== button.dataset.removeSite);
  renderTargetLists();
  await saveBlockTargets();
});

scanGamesBtn.addEventListener('click', async () => {
  scanGamesBtn.disabled = true;
  gamesScanStatus.textContent = 'Scanning installed games…';
  try {
    scannedGames = await window.blocker.scanGames();
    selectedGameIds.clear();
    gamesScanStatus.textContent = scannedGames.length
      ? `Found ${scannedGames.length} game(s). Select and add to your block list.`
      : 'No games found. Try running as Administrator.';
    renderGameList();
  } catch (err) {
    gamesScanStatus.textContent = err.message || 'Game scan failed.';
  } finally {
    scanGamesBtn.disabled = false;
  }
});

gameList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-game-id]');
  if (!checkbox) return;
  if (checkbox.checked) selectedGameIds.add(checkbox.dataset.gameId);
  else selectedGameIds.delete(checkbox.dataset.gameId);
  renderGameList();
});

selectAllGamesBtn.addEventListener('click', () => {
  selectedGameIds = new Set(
    scannedGames.filter((game) => !isGameBlocked(game.id)).map((game) => game.id)
  );
  renderGameList();
});

clearGamesBtn.addEventListener('click', () => {
  selectedGameIds.clear();
  renderGameList();
});

blockSelectedGamesBtn.addEventListener('click', async () => {
  const selected = scannedGames.filter((game) => selectedGameIds.has(game.id));
  if (!selected.length) return;

  const existingPaths = new Set(blockedApps.map((app) => app.path.toLowerCase()));
  const toAdd = selected.filter((game) => !existingPaths.has(game.path.toLowerCase()));

  blockedApps = [...blockedApps, ...toAdd.map((game) => ({
    id: game.id,
    path: game.path,
    name: game.name,
    type: 'game',
    source: game.source,
  }))];

  selectedGameIds.clear();
  renderTargetLists();
  await saveBlockTargets();
  alert(`${toAdd.length} game(s) added to block list.`);
});

startBtn.addEventListener('click', async () => {
  await saveBlockTargets();
  await saveTimerSettings();
  await window.blocker.startTimer(Number(minutesInput.value));
});

stopBtn.addEventListener('click', () => window.blocker.stopTimer());

cancelUnblockBtn.addEventListener('click', () => passwordDialog.close());

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await performUnblock(unblockPasswordInput.value);
});

setPasswordBtn.addEventListener('click', async () => {
  const password = newPasswordInput.value;
  const confirm = confirmPasswordInput.value;
  const current = currentPasswordInput.value;

  if (password !== confirm) {
    alert('New password and confirmation do not match.');
    return;
  }

  try {
    await window.blocker.setPassword({ password, currentPassword: current });
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    currentPasswordInput.value = '';
    alert('Password saved.');
  } catch (err) {
    alert(err.message || 'Failed to save password.');
  }
});

clearPasswordBtn.addEventListener('click', async () => {
  const current = currentPasswordInput.value;
  if (!current) {
    alert('Enter your current password to remove protection.');
    return;
  }

  try {
    await window.blocker.clearPassword(current);
    currentPasswordInput.value = '';
    alert('Password removed.');
  } catch (err) {
    alert(err.message || 'Failed to remove password.');
  }
});

adminBtn.addEventListener('click', () => window.blocker.requestAdmin());

let speedTestRunning = false;
let speedProgressUnsubscribe = null;

function formatNetworkLabel(adapter, snapshot) {
  if (snapshot?.wifiConnection?.ssid) {
    return `Wi-Fi: ${snapshot.wifiConnection.ssid}`;
  }
  if (adapter?.networkLabel && !/^Wi-Fi:\s*<redacted>$/i.test(adapter.networkLabel)) {
    return adapter.networkLabel;
  }
  if (snapshot?.ssidHiddenByMacOS || adapter?.ssidHiddenByMacOS) {
    return 'Wi-Fi connected';
  }
  if (!adapter) return '—';
  if (adapter.connectionType === 'wifi' && adapter.networkName && !/^<redacted>$/i.test(adapter.networkName)) {
    return `Wi-Fi: ${adapter.networkName}`;
  }
  if (adapter.connectionType === 'ethernet' && adapter.networkName) return `LAN: ${adapter.networkName}`;
  return adapter.name || '—';
}

function renderNetworkLocationHint(snapshot) {
  const hidden = snapshot?.ssidHiddenByMacOS;
  const onMac = snapshot?.platform === 'darwin';

  if (hidden && onMac) {
    speedNetworkHint.hidden = false;
    speedNetworkHint.textContent =
      'macOS hides Wi-Fi names unless Location Services is allowed for this app. Click below, then refresh.';
    speedLocationActions.hidden = false;
    return;
  }

  speedNetworkHint.hidden = true;
  speedLocationActions.hidden = true;
  speedNetworkHint.textContent = '';
}

function renderAdapterCard(snapshot) {
  const adapter = snapshot?.primaryAdapter;
  speedNetworkName.textContent = formatNetworkLabel(adapter, snapshot);
  renderNetworkLocationHint(snapshot);

  if (!adapter) {
    speedAdapterCard.innerHTML = '<p class="hint">No active network adapter detected.</p>';
    speedLinkValue.textContent = '—';
    speedMaxValue.textContent = '—';
    return;
  }

  const linkLabel = adapter.linkSpeedMbps != null
    ? `${Math.round(adapter.linkSpeedMbps * 10) / 10} Mbps`
    : (adapter.linkSpeed || 'Unknown');

  speedLinkValue.textContent = adapter.linkSpeed || linkLabel;
  speedMaxValue.textContent = adapter.linkSpeedMbps != null
    ? `${Math.round(adapter.linkSpeedMbps * 10) / 10} Mbps`
    : (adapter.linkSpeed || '—');

  speedAdapterCard.innerHTML = [
    ['Network', formatNetworkLabel(adapter, snapshot)],
    ['Adapter', adapter.name],
    ['Description', adapter.description || '—'],
    ['Link speed', adapter.linkSpeed || linkLabel],
    ['Media', adapter.mediaType || '—'],
    ['Driver', adapter.driver || '—'],
  ]
    .map(
      ([label, value]) =>
        `<div class="adapter-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(value))}</span></div>`
    )
    .join('');
}

function renderDiagnosticsResult(result) {
  const { snapshot, speedTest, analysis } = result;

  renderAdapterCard(snapshot);

  if (speedTest?.downloadMbps != null) {
    speedDownloadValue.textContent = `${speedTest.downloadMbps} Mbps`;
  }

  if (speedTest?.uploadMbps != null) {
    speedUploadValue.textContent = `${speedTest.uploadMbps} Mbps`;
  }

  if (analysis) {
    speedSummary.textContent = analysis.summary;
    speedLimitFactor.hidden = false;
    speedLimitFactor.textContent = `Likely limiting factor: ${analysis.limitingFactor}`;

    if (analysis.bottlenecks?.length) {
      speedBottlenecksPanel.hidden = false;
      speedBottlenecksList.innerHTML = analysis.bottlenecks
        .map(
          (item) =>
            `<li class="severity-${item.severity || 'medium'}"><strong>${escapeHtml(item.name)}</strong>${escapeHtml(item.detail)}</li>`
        )
        .join('');
    } else {
      speedBottlenecksPanel.hidden = true;
      speedBottlenecksList.innerHTML = '';
    }

    if (analysis.fixes?.length) {
      speedFixesPanel.hidden = false;
      speedFixesList.innerHTML = analysis.fixes
        .map((fix) => `<li>${escapeHtml(fix)}</li>`)
        .join('');
    } else {
      speedFixesPanel.hidden = true;
      speedFixesList.innerHTML = '';
    }
  }
}

function setSpeedTestBusy(busy) {
  speedTestRunning = busy;
  speedTestBtn.disabled = busy;
  speedRefreshBtn.disabled = busy;
  speedProgress.hidden = !busy;
  if (!busy) {
    speedProgressFill.style.width = '0%';
  }
}

async function refreshNetworkSnapshot() {
  const { snapshot } = await window.blocker.getNetworkSnapshot();
  renderAdapterCard(snapshot);
  return snapshot;
}

async function runSpeedDiagnostics() {
  if (speedTestRunning) return;

  setSpeedTestBusy(true);
  speedProgressText.textContent = 'Starting diagnostics…';
  speedProgressFill.style.width = '5%';

  if (speedProgressUnsubscribe) speedProgressUnsubscribe();
  speedProgressUnsubscribe = window.blocker.onNetworkDiagnosticsProgress((progress) => {
    if (progress.percent != null) {
      speedProgressFill.style.width = `${progress.percent}%`;
    }
    if (progress.currentMbps != null) {
      const target = progress.direction === 'upload' ? speedUploadValue : speedDownloadValue;
      target.textContent = `${progress.currentMbps} Mbps`;
    }
    if (progress.message) {
      speedProgressText.textContent = progress.message;
    }
  });

  try {
    const result = await window.blocker.runNetworkDiagnostics();
    renderDiagnosticsResult(result);
  } catch (err) {
    speedSummary.textContent = err.message || 'Speed test failed.';
    speedLimitFactor.hidden = true;
  } finally {
    if (speedProgressUnsubscribe) {
      speedProgressUnsubscribe();
      speedProgressUnsubscribe = null;
    }
    setSpeedTestBusy(false);
  }
}

speedRefreshBtn.addEventListener('click', async () => {
  try {
    speedRefreshBtn.disabled = true;
    await refreshNetworkSnapshot();
  } catch (err) {
    speedSummary.textContent = err.message || 'Failed to read network adapters.';
  } finally {
    speedRefreshBtn.disabled = false;
  }
});

speedTestBtn.addEventListener('click', runSpeedDiagnostics);

speedLocationBtn.addEventListener('click', async () => {
  try {
    speedLocationBtn.disabled = true;
    const result = await window.blocker.requestLocationAccess();
    if (result.snapshot) {
      renderAdapterCard(result.snapshot);
    }
    if (result.granted) {
      await refreshNetworkSnapshot();
    }
  } catch (err) {
    speedNetworkHint.hidden = false;
    speedNetworkHint.textContent = err.message || 'Could not request location access.';
  } finally {
    speedLocationBtn.disabled = false;
  }
});

speedLocationSettingsBtn.addEventListener('click', () => window.blocker.openLocationSettings());

window.blocker.onTick((remainingMs) => {
  timerValue.textContent = formatMs(remainingMs);
  if (currentState?.timer?.isRunning) {
    currentState.timer.remainingMs = remainingMs;
    renderSummaryGrid({ ...currentState, timer: { ...currentState.timer, remainingMs } });
  }
});

window.blocker.onStateChange(applyState);
window.blocker.getStatus().then(applyState);
refreshNetworkSnapshot().catch(() => {});
