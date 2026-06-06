const { EventEmitter } = require('events');

class FocusTimer extends EventEmitter {
  constructor() {
    super();
    this.timeoutId = null;
    this.tickId = null;
    this.endsAt = null;
    this.durationMs = 0;
  }

  get remainingMs() {
    if (!this.endsAt) return 0;
    return Math.max(0, this.endsAt - Date.now());
  }

  get isRunning() {
    return this.timeoutId !== null;
  }

  start(durationMinutes) {
    this.stop({ silent: true });

    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('Duration must be a positive number of minutes.');
    }

    this.durationMs = minutes * 60 * 1000;
    this.endsAt = Date.now() + this.durationMs;

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.clearTick();
      this.emit('expired');
    }, this.durationMs);

    this.tickId = setInterval(() => {
      const remaining = this.remainingMs;
      this.emit('tick', remaining);
      if (remaining <= 0) {
        this.clearTick();
      }
    }, 1000);

    this.emit('started', {
      durationMs: this.durationMs,
      endsAt: this.endsAt,
      remainingMs: this.remainingMs,
    });
  }

  stop({ silent = false } = {}) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.clearTick();
    this.endsAt = null;
    this.durationMs = 0;

    if (!silent) {
      this.emit('stopped');
    }
  }

  clearTick() {
    if (this.tickId) {
      clearInterval(this.tickId);
      this.tickId = null;
    }
  }

  getState() {
    return {
      isRunning: this.isRunning,
      remainingMs: this.remainingMs,
      endsAt: this.endsAt,
      durationMs: this.durationMs,
    };
  }
}

module.exports = { FocusTimer };
