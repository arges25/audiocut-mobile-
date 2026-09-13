import type { Clip } from '../types';
import { clipTimelineEnd } from '../types';
import { SNAP_THRESHOLD_PX } from '../constants';

export function computeSnapTargets(clips: Clip[], excludeClipId: string, playheadTime: number): number[] {
  const targets = new Set<number>([0, playheadTime]);
  for (const c of clips) {
    if (c.id === excludeClipId) continue;
    targets.add(c.timelineStart);
    targets.add(clipTimelineEnd(c));
  }
  return [...targets];
}

export function applySnap(value: number, targets: number[], pxPerSec: number): number {
  const thresholdSec = SNAP_THRESHOLD_PX / pxPerSec;
  let best = value;
  let bestDist = thresholdSec;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}
