// Transient mono PCM playback. Web Audio schedules each chunk on its audio clock
// rather than creating one HTMLAudioElement per network chunk.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SocialEvoVoiceAudio = api;
})(typeof window === "object" ? window : null, function () {
  "use strict";

  class PcmStreamPlayer {
    constructor(context, options = {}) {
      this.context = context;
      this.sampleRate = options.sampleRate || 24000;
      this.prefillFrames = Math.ceil(this.sampleRate * (options.prefillSeconds ?? 0.16));
      this.maxBytes = options.maxBytes || 10000000;
      this.onStart = options.onStart || (() => {});
      this.sources = new Set();
      this.pending = [];
      this.pendingFrames = 0;
      this.oddByte = null;
      this.receivedBytes = 0;
      this.totalFrames = 0;
      this.nextStartTime = 0;
      this.started = false;
      this.inputEnded = false;
      this.cancelled = false;
      this.underruns = 0;
      this.done = new Promise((resolve) => { this.resolveDone = resolve; });
    }

    enqueue(bytes) {
      if (this.cancelled || this.inputEnded) return;
      if (!(bytes instanceof Uint8Array)) throw new Error("Voice stream returned invalid PCM bytes.");
      this.receivedBytes += bytes.byteLength;
      if (this.receivedBytes > this.maxBytes) throw new Error("Voice audio exceeded its size limit.");
      if (this.oddByte !== null) {
        const joined = new Uint8Array(bytes.byteLength + 1);
        joined[0] = this.oddByte;
        joined.set(bytes, 1);
        bytes = joined;
        this.oddByte = null;
      }
      const frames = Math.floor(bytes.byteLength / 2);
      if (bytes.byteLength % 2) this.oddByte = bytes[bytes.byteLength - 1];
      if (!frames) return;
      const samples = new Float32Array(frames);
      const view = new DataView(bytes.buffer, bytes.byteOffset, frames * 2);
      for (let i = 0; i < frames; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;
      this.pending.push(samples);
      this.pendingFrames += frames;
      this.totalFrames += frames;
      this.flush(false);
    }

    flush(force) {
      if (this.cancelled || !this.pendingFrames) return;
      const now = this.context.currentTime;
      const continuing = this.started && this.nextStartTime > now + 0.012;
      if (!force && !continuing && this.pendingFrames < this.prefillFrames) return;
      if (this.started && this.nextStartTime < now) this.underruns += 1;
      const buffer = this.context.createBuffer(1, this.pendingFrames, this.sampleRate);
      const channel = buffer.getChannelData(0);
      let offset = 0;
      for (const samples of this.pending) {
        channel.set(samples, offset);
        offset += samples.length;
      }
      this.pending = [];
      this.pendingFrames = 0;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        this.resolveIfFinished();
      };
      const startTime = continuing ? this.nextStartTime : Math.max(this.nextStartTime, now + 0.03);
      this.nextStartTime = startTime + buffer.duration;
      this.sources.add(source);
      try {
        source.start(startTime);
      } catch (error) {
        this.sources.delete(source);
        source.disconnect();
        throw error;
      }
      if (!this.started) {
        this.started = true;
        this.onStart();
      }
    }

    finish() {
      if (this.cancelled) return this.done;
      if (this.oddByte !== null) throw new Error("Voice stream ended with an incomplete PCM sample.");
      this.inputEnded = true;
      this.flush(true);
      this.resolveIfFinished();
      return this.done;
    }

    remainingSeconds() {
      return Math.max(0, this.nextStartTime - this.context.currentTime);
    }

    resolveIfFinished() {
      if (this.inputEnded && !this.sources.size && !this.pendingFrames) {
        this.resolveDone({ spoken: this.started && !this.cancelled, cancelled: this.cancelled });
      }
    }

    cancel() {
      if (this.cancelled) return;
      this.cancelled = true;
      this.inputEnded = true;
      this.pending = [];
      this.pendingFrames = 0;
      this.oddByte = null;
      for (const source of this.sources) {
        source.onended = null;
        try { source.stop(); } catch (_error) { /* It may already have ended. */ }
        source.disconnect();
      }
      this.sources.clear();
      this.resolveIfFinished();
    }
  }

  return { PcmStreamPlayer };
});
