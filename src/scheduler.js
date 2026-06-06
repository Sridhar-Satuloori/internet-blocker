const { EventEmitter } = require('events');

function parseTime(timeStr) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isInBlockWindow(nowMinutes, blockMinutes, unblockMinutes) {
  if (blockMinutes === unblockMinutes) return false;
  if (blockMinutes < unblockMinutes) {
    return nowMinutes >= blockMinutes && nowMinutes < unblockMinutes;
  }
  return nowMinutes >= blockMinutes || nowMinutes < unblockMinutes;
}

function nextEventFrom(now, blockMinutes, unblockMinutes) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const candidates = [];

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const base = new Date(now);
    base.setDate(base.getDate() + dayOffset);
    base.setSeconds(0, 0);

    for (const [type, minutes] of [
      ['block', blockMinutes],
      ['unblock', unblockMinutes],
    ]) {
      const at = new Date(base);
      at.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      if (at <= now) continue;
      candidates.push({ type, at, inMs: at - now });
    }
  }

  candidates.sort((a, b) => a.inMs - b.inMs);
  return candidates[0] || null;
}

class DailyScheduler extends EventEmitter {
  constructor() {
    super();
    this.timeoutId = null;
    this.config = null;
  }

  start(config) {
    this.stop({ silent: true });
    this.config = config;

    if (!config?.dailySchedule?.enabled) {
      this.emit('idle');
      return;
    }

    const blockMinutes = parseTime(config.dailySchedule.blockTime);
    const unblockMinutes = parseTime(config.dailySchedule.unblockTime);
    if (blockMinutes === null || unblockMinutes === null) {
      this.emit('error', new Error('Invalid daily schedule times.'));
      return;
    }

    if (this.shouldBeBlockedNow()) {
      this.emit('block-time');
    }

    this.scheduleNext();
    this.emit('updated', this.getState());
  }

  stop({ silent = false } = {}) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (!silent) {
      this.emit('stopped');
    }
  }

  scheduleNext() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const blockMinutes = parseTime(this.config.dailySchedule.blockTime);
    const unblockMinutes = parseTime(this.config.dailySchedule.unblockTime);
    const now = new Date();
    const inWindow = isInBlockWindow(
      now.getHours() * 60 + now.getMinutes(),
      blockMinutes,
      unblockMinutes
    );

    const next = nextEventFrom(now, blockMinutes, unblockMinutes);
    if (!next) return;

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      if (next.type === 'block') {
        this.emit('block-time');
      } else {
        this.emit('unblock-time');
      }
      this.scheduleNext();
    }, next.inMs);

    this.emit('updated', this.getState(next));
  }

  getState(next = null) {
    if (!this.config?.dailySchedule?.enabled) {
      return { enabled: false, inBlockWindow: false, nextEvent: null };
    }

    const blockMinutes = parseTime(this.config.dailySchedule.blockTime);
    const unblockMinutes = parseTime(this.config.dailySchedule.unblockTime);
    const now = new Date();
    const inBlockWindow = isInBlockWindow(
      now.getHours() * 60 + now.getMinutes(),
      blockMinutes,
      unblockMinutes
    );

    if (!next) {
      next = nextEventFrom(now, blockMinutes, unblockMinutes);
    }

    return {
      enabled: true,
      blockTime: formatTime(blockMinutes),
      unblockTime: formatTime(unblockMinutes),
      inBlockWindow,
      nextEvent: next
        ? { type: next.type, at: next.at.toISOString(), inMs: next.inMs }
        : null,
    };
  }

  shouldBeBlockedNow() {
    const state = this.getState();
    return state.enabled && state.inBlockWindow;
  }
}

module.exports = { DailyScheduler, parseTime, formatTime, isInBlockWindow };
