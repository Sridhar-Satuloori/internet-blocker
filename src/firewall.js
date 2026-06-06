const crypto = require('crypto');
const { hashAppPath } = require('./hosts');

function isWindows() {
  return process.platform === 'win32';
}

function isMac() {
  return process.platform === 'darwin';
}

function getPlatformImpl() {
  if (isWindows()) {
    return require('./firewall-windows');
  }
  if (isMac()) {
    return require('./firewall-macos');
  }
  return null;
}

function unsupportedError() {
  return new Error('Internet blocking is not supported on this platform.');
}

async function isAdmin() {
  const impl = getPlatformImpl();
  if (!impl) return false;
  return impl.isAdmin();
}

async function blockInternet(options) {
  const impl = getPlatformImpl();
  if (!impl) throw unsupportedError();
  return impl.blockInternet(options);
}

async function unblockInternet(options) {
  const impl = getPlatformImpl();
  if (!impl) return { removed: false, reason: 'unsupported-platform' };
  return impl.unblockInternet(options);
}

async function isBlocked(options) {
  const impl = getPlatformImpl();
  if (!impl) return false;
  return impl.isBlocked(options);
}

module.exports = {
  isWindows,
  isMac,
  isAdmin,
  blockInternet,
  unblockInternet,
  isBlocked,
  hashAppPath,
  BLOCK_RULE: getPlatformImpl()?.BLOCK_RULE || 'InternetBlocker-BlockOutbound',
};
