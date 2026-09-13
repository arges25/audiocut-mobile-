import type { AudioSource, Clip, TrackState } from '../types';
import { clipEffectiveEnd } from '../types';
import { buildTrackBuses, scheduleClip } from './graph';

interface ActiveNode {
  source: AudioBufferSourceNode;
  extra: AudioNode[];
}

export class PlaybackEngine {
  ctx: AudioContext;
  private activeNodes: ActiveNode[] = [];
  private playing = false;
  private startContextTime = 0;
  private startOffset = 0;

  constructor() {
    this.ctx = new AudioContext();
  }

  get isPlaying() {
    return this.playing;
  }

  getCurrentTime(): number {
    if (!this.playing) return this.startOffset;
    return this.startOffset + (this.ctx.currentTime - this.startContextTime);
  }

  async play(clips: Clip[], sources: Map<string, AudioSource>, tracks: TrackState[], fromTime: number) {
    await this.ctx.resume();
    this.stopAllNodes();

    this.startOffset = fromTime;
    this.startContextTime = this.ctx.currentTime;
    this.playing = true;

    const buses = buildTrackBuses(this.ctx, tracks, this.ctx.destination);

    for (const clip of clips) {
      const source = sources.get(clip.sourceId);
      if (!source) continue;
      const effectiveEnd = clipEffectiveEnd(clip);
      if (effectiveEnd <= fromTime) continue;

      const offsetIntoClip = Math.max(0, fromTime - clip.timelineStart);
      const when = this.ctx.currentTime + Math.max(0, clip.timelineStart - fromTime);
      const bus = buses[clip.trackId];
      if (!bus) continue;

      const scheduled = scheduleClip({ ctx: this.ctx, clip, source, trackInput: bus.input, when, offsetIntoClip });
      if (scheduled) {
        this.activeNodes.push({ source: scheduled.bufferSource, extra: scheduled.nodes });
      }
    }
  }

  pause() {
    if (!this.playing) return;
    this.startOffset = this.getCurrentTime();
    this.playing = false;
    this.stopAllNodes();
  }

  seek(time: number) {
    const wasPlaying = this.playing;
    this.stopAllNodes();
    this.startOffset = Math.max(0, time);
    this.startContextTime = this.ctx.currentTime;
    this.playing = wasPlaying;
  }

  private stopAllNodes() {
    for (const node of this.activeNodes) {
      try {
        node.source.stop();
      } catch {
        // already stopped
      }
      node.source.disconnect();
      for (const n of node.extra) {
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      }
    }
    this.activeNodes = [];
  }
}
