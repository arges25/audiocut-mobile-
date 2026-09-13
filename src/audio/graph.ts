import type { Clip, EffectParams, IntroType, OutroType, TrackState, AudioSource } from '../types';
import { clipDuration } from '../types';
import { buildEffectsChain, createFilterRampNode } from './effects';

const INTRO_GAIN_RAMP: IntroType[] = ['fadeIn', 'fadeInFast', 'fadeInSlow', 'volumeRamp'];
const OUTRO_GAIN_RAMP: OutroType[] = ['fadeOut', 'fadeOutFast', 'fadeOutSlow', 'disappear'];
const OUTRO_FILTER_CLOSE: OutroType[] = ['filterRamp', 'disappear'];

export interface TrackBus {
  input: GainNode;
}

/** One volume+mute+effects bus per track; clip chains connect their output into `input`. */
export function buildTrackBuses(ctx: BaseAudioContext, tracks: TrackState[], destination: AudioNode): TrackBus[] {
  return tracks.map((track) => {
    const volumeGain = ctx.createGain();
    volumeGain.gain.value = track.muted ? 0 : track.volume;
    const chain = buildEffectsChain(ctx, track.effects);
    volumeGain.connect(chain.input);
    chain.output.connect(destination);
    return { input: volumeGain };
  });
}

function effectiveClipEffects(clip: Clip): EffectParams {
  if (clip.outroType === 'echoTail' && !clip.effects.echo.enabled) {
    return { ...clip.effects, echo: { ...clip.effects.echo, enabled: true } };
  }
  if (clip.outroType === 'reverbTail' && !clip.effects.reverb.enabled) {
    return { ...clip.effects, reverb: { ...clip.effects.reverb, enabled: true } };
  }
  return clip.effects;
}

export interface ScheduleClipParams {
  ctx: BaseAudioContext;
  clip: Clip;
  source: AudioSource;
  trackInput: AudioNode;
  /** Context time at which clip.timelineStart (or the resume offset) begins playing. */
  when: number;
  /** How far into the clip's own timeline we're starting (0 unless resuming mid-clip). */
  offsetIntoClip: number;
}

export interface ScheduledClip {
  bufferSource: AudioBufferSourceNode;
  nodes: AudioNode[];
}

/** Schedules one clip's full chain: source -> volume/fade envelope -> intro/outro filter -> clip effects -> track bus. Shared by live playback and offline export so both sound identical. */
export function scheduleClip({ ctx, clip, source, trackInput, when, offsetIntoClip }: ScheduleClipParams): ScheduledClip | null {
  const totalDuration = clipDuration(clip);
  const playDuration = totalDuration - offsetIntoClip;
  if (playDuration <= 0) return null;

  const bufferSource = ctx.createBufferSource();
  bufferSource.buffer = source.buffer;

  const gainNode = ctx.createGain();
  scheduleEnvelope(gainNode, clip, when, offsetIntoClip, totalDuration);

  const nodes: AudioNode[] = [gainNode];
  let chainEnd: AudioNode = gainNode;
  bufferSource.connect(gainNode);

  if (clip.introType === 'filterRamp' && offsetIntoClip < clip.fadeIn) {
    const remaining = clip.fadeIn - offsetIntoClip;
    const filter = createFilterRampNode(ctx, when, remaining, 'open');
    chainEnd.connect(filter);
    chainEnd = filter;
    nodes.push(filter);
  }

  if (OUTRO_FILTER_CLOSE.includes(clip.outroType)) {
    const fadeOutStart = totalDuration - clip.fadeOut;
    if (fadeOutStart > offsetIntoClip) {
      const filterStartTime = when + (fadeOutStart - offsetIntoClip);
      const filter = createFilterRampNode(ctx, filterStartTime, clip.fadeOut, 'close');
      chainEnd.connect(filter);
      chainEnd = filter;
      nodes.push(filter);
    }
  }

  const effectsChain = buildEffectsChain(ctx, effectiveClipEffects(clip));
  chainEnd.connect(effectsChain.input);
  chainEnd = effectsChain.output;
  nodes.push(effectsChain.input, effectsChain.output);

  chainEnd.connect(trackInput);

  const sourceOffset = clip.sourceStart + offsetIntoClip;
  bufferSource.start(when, sourceOffset, playDuration);

  return { bufferSource, nodes };
}

function scheduleEnvelope(gainNode: GainNode, clip: Clip, when: number, offsetIntoClip: number, clipDurationTotal: number) {
  const g = gainNode.gain;
  const vol = clip.volume;
  const applyIn = INTRO_GAIN_RAMP.includes(clip.introType);
  const applyOut = OUTRO_GAIN_RAMP.includes(clip.outroType);
  const fadeIn = applyIn ? Math.min(clip.fadeIn, clipDurationTotal) : 0;
  const fadeOut = applyOut ? Math.min(clip.fadeOut, clipDurationTotal) : 0;

  g.cancelScheduledValues(when);

  if (fadeIn > 0 && offsetIntoClip < fadeIn) {
    const remainingFadeIn = fadeIn - offsetIntoClip;
    const startVol = vol * (offsetIntoClip / fadeIn);
    g.setValueAtTime(startVol, when);
    g.linearRampToValueAtTime(vol, when + remainingFadeIn);
  } else {
    g.setValueAtTime(vol, when);
  }

  const fadeOutStartInClip = clipDurationTotal - fadeOut;
  if (fadeOut > 0 && fadeOutStartInClip > offsetIntoClip) {
    const timeToFadeOutStart = fadeOutStartInClip - offsetIntoClip;
    g.setValueAtTime(vol, when + timeToFadeOutStart);
    g.linearRampToValueAtTime(0, when + timeToFadeOutStart + fadeOut);
  } else if (fadeOut > 0) {
    const remainingFadeOut = clipDurationTotal - offsetIntoClip;
    const alreadyIn = fadeOut - (clipDurationTotal - offsetIntoClip);
    const startVol = vol * (1 - alreadyIn / fadeOut);
    g.setValueAtTime(Math.max(0, startVol), when);
    g.linearRampToValueAtTime(0, when + remainingFadeOut);
  }
}
