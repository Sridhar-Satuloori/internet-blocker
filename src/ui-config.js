const fs = require('fs');
const path = require('path');

function resolveUiConfigPath() {
  try {
    const { app } = require('electron');
    if (app?.isPackaged) {
      return path.join(app.getAppPath(), 'config', 'ui.json');
    }
  } catch {
    // electron not available
  }

  return path.join(__dirname, '..', 'config', 'ui.json');
}

function getUiConfig() {
  const configPath = resolveUiConfigPath();
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      configPath,
      note: parsed.note || '',
      navGroups: Array.isArray(parsed.navGroups) ? parsed.navGroups : [],
    };
  } catch {
    return {
      configPath,
      note: '',
      navGroups: [
        { id: 'automation', label: 'Automation', expanded: true, views: ['timer', 'schedule'] },
        { id: 'programs', label: 'Programs', expanded: true, views: ['apps', 'games'] },
      ],
    };
  }
}

module.exports = { getUiConfig };
