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

export interface PersistedProject {
  clips: Clip[];
  activeTrackId: number;
  magnetEnabled: boolean;
  savedAt: number;
}

export interface PersistedSource {
  id: string;
  name: string;
  mimeType: string;
  arrayBuffer: ArrayBuffer;
}
