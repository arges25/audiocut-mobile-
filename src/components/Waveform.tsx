import { memo, useEffect, useRef } from 'react';
import type { AudioSource } from '../types';

interface Props {
  source: AudioSource;
  sourceStart: number;
  sourceEnd: number;
  width: number;
  height: number;
  color?: string;
}

function Waveform({ source, sourceStart, sourceEnd, width, height, color = 'rgba(255,255,255,0.85)' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { min, max, perSecond } = source.peaks;
    const startIdx = Math.floor(sourceStart * perSecond);
    const endIdx = Math.ceil(sourceEnd * perSecond);
    const bucketCount = Math.max(1, endIdx - startIdx);
    const mid = height / 2;

    ctx.fillStyle = color;
    for (let x = 0; x < width; x++) {
      const bucket = startIdx + Math.floor((x / width) * bucketCount);
      const bMin = min[bucket] ?? 0;
      const bMax = max[bucket] ?? 0;
      const y1 = mid + bMin * mid;
      const y2 = mid + bMax * mid;
      ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
    }
  }, [source, sourceStart, sourceEnd, width, height, color]);

  return <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px`, display: 'block' }} />;
}

export default memo(Waveform);
