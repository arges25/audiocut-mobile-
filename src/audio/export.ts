import type { AudioSource, Clip } from '../types';

function scheduleGain(
  gainNode: GainNode,
  clip: Clip,
  when: number,
  clipDuration: number
) {
  const g = gainNode.gain;
  const vol = clip.volume;
  const fadeIn = Math.min(clip.fadeIn, clipDuration);
  const fadeOut = Math.min(clip.fadeOut, clipDuration);

  if (fadeIn > 0) {
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(vol, when + fadeIn);
  } else {
    g.setValueAtTime(vol, when);
  }

  if (fadeOut > 0) {
    const fadeOutStart = clipDuration - fadeOut;
    g.setValueAtTime(vol, when + fadeOutStart);
    g.linearRampToValueAtTime(0, when + clipDuration);
  }
}

export async function renderMix(
  clips: Clip[],
  sources: Map<string, AudioSource>,
  sampleRate = 44100
): Promise<AudioBuffer> {
  let totalDuration = 0.5;
  for (const clip of clips) {
    const end = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
    if (end > totalDuration) totalDuration = end;
  }

  const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

  for (const clip of clips) {
    const source = sources.get(clip.sourceId);
    if (!source) continue;
    const clipDuration = clip.sourceEnd - clip.sourceStart;
    if (clipDuration <= 0) continue;

    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = source.buffer;
    const gainNode = offlineCtx.createGain();
    bufferSource.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    scheduleGain(gainNode, clip, clip.timelineStart, clipDuration);
    bufferSource.start(clip.timelineStart, clip.sourceStart, clipDuration);
  }

  return offlineCtx.startRendering();
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
