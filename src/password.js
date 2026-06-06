const crypto = require('crypto');

const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString('hex');
  return { passwordSalt: salt, passwordHash: hash };
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const derived = crypto.scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function hasPassword(config) {
  return Boolean(config.passwordHash && config.passwordSalt);
}

module.exports = { hashPassword, verifyPassword, hasPassword };
