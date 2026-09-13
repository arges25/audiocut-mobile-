import type { EffectParams } from '../types';

export interface BuiltChain {
  input: AudioNode;
  output: AudioNode;
}

const impulseCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Procedurally generated exponential-decay noise impulse response — a real, audible algorithmic reverb tail (no external IR file needed). */
function getImpulseResponse(ctx: BaseAudioContext, size: number): AudioBuffer {
  const duration = 0.6 + size * 3; // 0.6s..3.6s
  let cache = impulseCache.get(ctx);
  if (!cache) {
    cache = new Map();
    impulseCache.set(ctx, cache);
  }
  const key = duration.toFixed(2);
  const cached = cache.get(key);
  if (cached) return cached;

  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.5);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  cache.set(key, impulse);
  return impulse;
}

/**
 * Builds a real Web Audio processing chain from a clip/track's EffectParams.
 * Works identically against a live AudioContext or an OfflineAudioContext,
 * so playback and WAV export always sound the same.
 */
export function buildEffectsChain(ctx: BaseAudioContext, effects: EffectParams): BuiltChain {
  let chainEnd: AudioNode = ctx.createGain();
  const input = chainEnd;

  if (effects.highPass.enabled) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = effects.highPass.frequency;
    chainEnd.connect(f);
    chainEnd = f;
  }

  if (effects.lowPass.enabled) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = effects.lowPass.frequency;
    chainEnd.connect(f);
    chainEnd = f;
  }

  if (effects.bassBoost.enabled) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowshelf';
    f.frequency.value = 200;
    f.gain.value = effects.bassBoost.intensity * 15;
    chainEnd.connect(f);
    chainEnd = f;
  }

  if (effects.treble.enabled) {
    const f = ctx.createBiquadFilter();
    f.type = 'highshelf';
    f.frequency.value = 4000;
    f.gain.value = effects.treble.intensity * 15;
    chainEnd.connect(f);
    chainEnd = f;
  }

  if (effects.stereoWidth.enabled) {
    chainEnd = attachStereoWidth(ctx, chainEnd, effects.stereoWidth.amount);
  }

  if (effects.echo.enabled) {
    chainEnd = attachDelayEffect(ctx, chainEnd, effects.echo.delay, effects.echo.feedback, effects.echo.mix);
  }

  if (effects.delay.enabled) {
    chainEnd = attachDelayEffect(ctx, chainEnd, effects.delay.time, effects.delay.feedback, effects.delay.mix);
  }

  if (effects.reverb.enabled) {
    chainEnd = attachReverb(ctx, chainEnd, effects.reverb.size, effects.reverb.mix);
  }

  return { input, output: chainEnd };
}

function attachDelayEffect(ctx: BaseAudioContext, from: AudioNode, time: number, feedback: number, mix: number): AudioNode {
  const out = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = mix;
  const delayNode = ctx.createDelay(2);
  delayNode.delayTime.value = Math.max(0.01, time);
  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = Math.min(0.92, Math.max(0, feedback));

  from.connect(dry);
  from.connect(delayNode);
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);
  delayNode.connect(wet);
  dry.connect(out);
  wet.connect(out);
  return out;
}

function attachReverb(ctx: BaseAudioContext, from: AudioNode, size: number, mix: number): AudioNode {
  const out = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = mix;
  const convolver = ctx.createConvolver();
  convolver.buffer = getImpulseResponse(ctx, size);
  convolver.normalize = true;

  from.connect(dry);
  from.connect(convolver);
  convolver.connect(wet);
  dry.connect(out);
  wet.connect(out);
  return out;
}

/** Mid/side widening: only audible on stereo sources; a no-op on mono, which is honest (no fake stereo synthesis). */
function attachStereoWidth(ctx: BaseAudioContext, from: AudioNode, amount: number): AudioNode {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  from.connect(splitter);

  const midGainL = ctx.createGain();
  midGainL.gain.value = 0.5;
  const midGainR = ctx.createGain();
  midGainR.gain.value = 0.5;
  const sideGainL = ctx.createGain();
  sideGainL.gain.value = 0.5 * amount * 2;
  const sideGainR = ctx.createGain();
  sideGainR.gain.value = -0.5 * amount * 2;

  // mid = (L+R)/2, side = (L-R)/2
  splitter.connect(midGainL, 0);
  splitter.connect(midGainL, 1);
  splitter.connect(sideGainL, 0);
  const invR = ctx.createGain();
  invR.gain.value = -1;
  splitter.connect(invR, 1);
  invR.connect(sideGainL);

  splitter.connect(midGainR, 0);
  splitter.connect(midGainR, 1);
  sideGainL.connect(sideGainR);

  midGainL.connect(merger, 0, 0);
  sideGainL.connect(merger, 0, 0);
  midGainR.connect(merger, 0, 1);
  sideGainR.connect(merger, 0, 1);

  return merger;
}

/** A lowpass filter node with its frequency sweep already scheduled — caller wires it into the chain. */
export function createFilterRampNode(
  ctx: BaseAudioContext,
  startTime: number,
  duration: number,
  direction: 'open' | 'close'
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.5;
  const startFreq = direction === 'open' ? 200 : 18000;
  const endFreq = direction === 'open' ? 18000 : 200;
  filter.frequency.setValueAtTime(startFreq, startTime);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + Math.max(0.05, duration));
  return filter;
}
