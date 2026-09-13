import type { EffectParams } from '../types';
import { buildEffectsChain } from './effects';

/** Short looping preview player used by effect bottom sheets so slider changes are heard immediately. */
export class EffectPreviewPlayer {
  private ctx: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  private chainNodes: AudioNode[] = [];
  private playing = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  get isPlaying() {
    return this.playing;
  }

  async start(buffer: AudioBuffer, startTime: number, endTime: number, effects: EffectParams) {
    await this.ctx.resume();
    this.stop();

    const bufferSource = this.ctx.createBufferSource();
    bufferSource.buffer = buffer;
    bufferSource.loop = true;
    bufferSource.loopStart = startTime;
    bufferSource.loopEnd = Math.max(startTime + 0.05, endTime);

    const chain = buildEffectsChain(this.ctx, effects);
    bufferSource.connect(chain.input);
    chain.output.connect(this.ctx.destination);
    bufferSource.start(0, startTime);

    this.source = bufferSource;
    this.chainNodes = [chain.input, chain.output];
    this.playing = true;
  }

  /** Re-triggers playback with updated params — a small re-trigger click is an acceptable trade-off for instant feedback while dragging sliders. */
  update(buffer: AudioBuffer, startTime: number, endTime: number, effects: EffectParams) {
    if (!this.playing) return;
    void this.start(buffer, startTime, endTime, effects);
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
    }
    for (const n of this.chainNodes) {
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    }
    this.source = null;
    this.chainNodes = [];
    this.playing = false;
  }
}
