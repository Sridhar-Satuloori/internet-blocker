const path = require('path');
const { nativeImage } = require('electron');

function loadIcon(filename) {
  const iconPath = path.join(__dirname, '..', 'assets', filename);
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }
  if (process.platform === 'darwin') {
    image = image.resize({ width: 18, height: 18 });
  } else if (process.platform === 'win32') {
    image = image.resize({ width: 16, height: 16 });
  }
  return image;
}

function getTrayIcon({ blocked = false, timerRunning = false } = {}) {
  let file = 'tray-normal.png';
  if (blocked) file = 'tray-blocked.png';
  else if (timerRunning) file = 'tray-running.png';
  return loadIcon(file);
}

module.exports = { getTrayIcon };
