export interface Peaks {
  min: Float32Array;
  max: Float32Array;
  perSecond: number;
}

export interface AudioSource {
  id: string;
  name: string;
  buffer: AudioBuffer;
  peaks: Peaks;
}

export interface ReverbParams { enabled: boolean; mix: number; size: number }
export interface EchoParams { enabled: boolean; mix: number; delay: number; feedback: number }
export interface DelayParams { enabled: boolean; mix: number; time: number; feedback: number }
export interface BassBoostParams { enabled: boolean; intensity: number }
export interface TrebleParams { enabled: boolean; intensity: number }
export interface LowPassParams { enabled: boolean; frequency: number }
export interface HighPassParams { enabled: boolean; frequency: number }
export interface StereoWidthParams { enabled: boolean; amount: number }

export interface EffectParams {
  reverb: ReverbParams;
  echo: EchoParams;
  delay: DelayParams;
  bassBoost: BassBoostParams;
  treble: TrebleParams;
  lowPass: LowPassParams;
  highPass: HighPassParams;
  stereoWidth: StereoWidthParams;
}

export function defaultEffectParams(): EffectParams {
  return {
    reverb: { enabled: false, mix: 0.3, size: 0.5 },
    echo: { enabled: false, mix: 0.3, delay: 0.15, feedback: 0.3 },
    delay: { enabled: false, mix: 0.3, time: 0.4, feedback: 0.35 },
    bassBoost: { enabled: false, intensity: 0.5 },
    treble: { enabled: false, intensity: 0.5 },
    lowPass: { enabled: false, frequency: 8000 },
    highPass: { enabled: false, frequency: 100 },
    stereoWidth: { enabled: false, amount: 0.5 },
  };
}

export function hasAnyEffectEnabled(effects: EffectParams): boolean {
  return Object.values(effects).some((e) => e.enabled);
}

export type IntroType = 'none' | 'fadeIn' | 'fadeInFast' | 'fadeInSlow' | 'volumeRamp' | 'filterRamp';
export type OutroType =
  | 'none'
  | 'fadeOut'
  | 'fadeOutFast'
  | 'fadeOutSlow'
  | 'filterRamp'
  | 'disappear'
  | 'echoTail'
  | 'reverbTail';

export interface Clip {
  id: string;
  trackId: number;
  sourceId: string;
  timelineStart: number;
  sourceStart: number;
  sourceEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  introType: IntroType;
  outroType: OutroType;
  effects: EffectParams;
}

export interface TrackState {
  volume: number;
  muted: boolean;
  effects: EffectParams;
}

export function defaultTrackState(): TrackState {
  return { volume: 1, muted: false, effects: defaultEffectParams() };
}

export const TRACK_NAMES = ['Musique', 'Effets', 'Audio'];
export const TRACK_COUNT = 3;

/** Duration is derived from sourceStart/sourceEnd, never stored, to avoid desync. */
export function clipDuration(clip: Clip): number {
  return clip.sourceEnd - clip.sourceStart;
}

export function clipTimelineEnd(clip: Clip): number {
  return clip.timelineStart + clipDuration(clip);
}

/** Extra seconds an echo/reverb outro tail rings on past the clip's nominal end. */
export function clipTailSeconds(clip: Clip): number {
  if (clip.outroType === 'echoTail') {
    const { delay, feedback } = clip.effects.echo;
    const repeats = Math.log(0.02) / Math.log(Math.max(0.01, Math.min(0.95, feedback)));
    return Math.min(4, Math.max(delay * 2, delay * repeats));
  }
  if (clip.outroType === 'reverbTail') {
    return Math.min(4, 1 + clip.effects.reverb.size * 3);
  }
  return 0;
}

export function clipEffectiveEnd(clip: Clip): number {
  return clipTimelineEnd(clip) + clipTailSeconds(clip);
}

export interface PersistedProject {
  clips: Clip[];
  tracks: TrackState[];
  activeTrackId: number;
  magnetEnabled: boolean;
  autosaveEnabled: boolean;
  savedAt: number;
}

export interface PersistedSource {
  id: string;
  name: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
}
