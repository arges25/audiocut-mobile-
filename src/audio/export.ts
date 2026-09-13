import type { AudioSource, Clip, TrackState } from '../types';
import { clipEffectiveEnd } from '../types';
import { buildTrackBuses, scheduleClip } from './graph';

export async function renderMix(
  clips: Clip[],
  sources: Map<string, AudioSource>,
  tracks: TrackState[],
  sampleRate = 44100,
  onProgress?: (fraction: number) => void
): Promise<AudioBuffer> {
  let totalDuration = 0.5;
  for (const clip of clips) {
    const end = clipEffectiveEnd(clip);
    if (end > totalDuration) totalDuration = end;
  }

  const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
  const buses = buildTrackBuses(offlineCtx, tracks, offlineCtx.destination);

  for (const clip of clips) {
    const source = sources.get(clip.sourceId);
    if (!source) continue;
    const bus = buses[clip.trackId];
    if (!bus) continue;
    scheduleClip({ ctx: offlineCtx, clip, source, trackInput: bus.input, when: clip.timelineStart, offsetIntoClip: 0 });
  }

  if (onProgress) {
    // Real progress: suspend/resume at even time steps, each resolving exactly
    // when that much audio has actually been rendered (not a fake timer).
    const steps = 20;
    for (let i = 1; i < steps; i++) {
      const t = (totalDuration * i) / steps;
      offlineCtx.suspend(t).then(() => {
        onProgress(i / steps);
        offlineCtx.resume();
      });
    }
  }

  const result = await offlineCtx.startRendering();
  onProgress?.(1);
  return result;
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferLength = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
