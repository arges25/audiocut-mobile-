import type { Peaks } from '../types';

const PEAKS_PER_SECOND = 50;

export function computePeaks(buffer: AudioBuffer): Peaks {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const bucketCount = Math.max(1, Math.ceil((length / buffer.sampleRate) * PEAKS_PER_SECOND));
  const samplesPerBucket = Math.max(1, Math.floor(length / bucketCount));

  const min = new Float32Array(bucketCount);
  const max = new Float32Array(bucketCount);

  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let b = 0; b < bucketCount; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(length, start + samplesPerBucket);
    let bucketMin = 0;
    let bucketMax = 0;
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (let c = 0; c < channelCount; c++) {
        sample += channels[c][i];
      }
      sample /= channelCount;
      if (sample < bucketMin) bucketMin = sample;
      if (sample > bucketMax) bucketMax = sample;
    }
    min[b] = bucketMin;
    max[b] = bucketMax;
  }

  return { min, max, perSecond: PEAKS_PER_SECOND };
}
