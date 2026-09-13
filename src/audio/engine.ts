import type { AudioSource, Clip } from '../types';

interface ActiveNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
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

  async play(clips: Clip[], sources: Map<string, AudioSource>, fromTime: number) {
    await this.ctx.resume();
    this.stopAllNodes();

    this.startOffset = fromTime;
    this.startContextTime = this.ctx.currentTime;
    this.playing = true;

    for (const clip of clips) {
      const source = sources.get(clip.sourceId);
      if (!source) continue;
      const clipDuration = clip.sourceEnd - clip.sourceStart;
      const clipTimelineEnd = clip.timelineStart + clipDuration;
      if (clipTimelineEnd <= fromTime) continue;

      const offsetIntoClip = Math.max(0, fromTime - clip.timelineStart);
      const when = this.ctx.currentTime + Math.max(0, clip.timelineStart - fromTime);
      const sourceOffset = clip.sourceStart + offsetIntoClip;
      const playDuration = clipDuration - offsetIntoClip;
      if (playDuration <= 0) continue;

      const bufferSource = this.ctx.createBufferSource();
      bufferSource.buffer = source.buffer;
      const gainNode = this.ctx.createGain();
      bufferSource.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      this.scheduleGain(gainNode, clip, when, offsetIntoClip, clipDuration);

      bufferSource.start(when, sourceOffset, playDuration);
      this.activeNodes.push({ source: bufferSource, gain: gainNode });
    }
  }

  private scheduleGain(
    gainNode: GainNode,
    clip: Clip,
    when: number,
    offsetIntoClip: number,
    clipDuration: number
  ) {
    const g = gainNode.gain;
    const vol = clip.volume;
    const fadeIn = Math.min(clip.fadeIn, clipDuration);
    const fadeOut = Math.min(clip.fadeOut, clipDuration);

    g.cancelScheduledValues(when);

    if (fadeIn > 0 && offsetIntoClip < fadeIn) {
      const remainingFadeIn = fadeIn - offsetIntoClip;
      const startVol = vol * (offsetIntoClip / fadeIn);
      g.setValueAtTime(startVol, when);
      g.linearRampToValueAtTime(vol, when + remainingFadeIn);
    } else {
      g.setValueAtTime(vol, when);
    }

    const fadeOutStartInClip = clipDuration - fadeOut;
    if (fadeOut > 0 && fadeOutStartInClip > offsetIntoClip) {
      const timeToFadeOutStart = fadeOutStartInClip - offsetIntoClip;
      g.setValueAtTime(vol, when + timeToFadeOutStart);
      g.linearRampToValueAtTime(0, when + timeToFadeOutStart + fadeOut);
    } else if (fadeOut > 0) {
      const remainingFadeOut = clipDuration - offsetIntoClip;
      const alreadyIn = fadeOut - (clipDuration - offsetIntoClip);
      const startVol = vol * (1 - alreadyIn / fadeOut);
      g.setValueAtTime(Math.max(0, startVol), when);
      g.linearRampToValueAtTime(0, when + remainingFadeOut);
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
      node.gain.disconnect();
    }
    this.activeNodes = [];
  }
}
