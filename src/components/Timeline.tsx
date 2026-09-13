import { useLayoutEffect, useRef, useState } from 'react';
import type { AudioSource, Clip } from '../types';
import { TRACK_NAMES } from '../types';
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC } from '../constants';
import ClipView from './ClipView';

const TRACK_HEIGHT = 72;
const RULER_HEIGHT = 28;

interface Props {
  clips: Clip[];
  sources: Map<string, AudioSource>;
  pxPerSec: number;
  onZoomChange: (pxPerSec: number) => void;
  playheadTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  activeTrackId: number;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onMoveClip: (id: string, newTimelineStart: number) => void;
  onTrimLeft: (id: string, newSourceStart: number, newTimelineStart: number) => void;
  onTrimRight: (id: string, newSourceEnd: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

interface PointerInfo {
  x: number;
  y: number;
  onRuler: boolean;
}

export default function Timeline({
  clips,
  sources,
  pxPerSec,
  onZoomChange,
  playheadTime,
  isPlaying,
  selectedClipId,
  activeTrackId,
  onSelectClip,
  onSeek,
  onMoveClip,
  onTrimLeft,
  onTrimRight,
  onDragStart,
  onDragEnd,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const pointers = useRef(new Map<number, PointerInfo>());
  const pinchRef = useRef<{ initialDist: number; initialPxPerSec: number; midTime: number; midClientX: number } | null>(null);
  const seekDragRef = useRef<{ pointerId: number } | null>(null);
  const emptyTapRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);

  let maxEnd = 30;
  for (const clip of clips) {
    const end = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
    if (end > maxEnd) maxEnd = end;
  }
  const contentWidth = (maxEnd + 20) * pxPerSec;
  const playheadPx = playheadTime * pxPerSec;

  useLayoutEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewWidth = el.clientWidth;
    const margin = viewWidth * 0.25;
    if (playheadPx < el.scrollLeft + margin || playheadPx > el.scrollLeft + viewWidth - margin) {
      el.scrollLeft = Math.max(0, playheadPx - margin);
    }
  }, [playheadPx, isPlaying]);

  // Keep the pinch midpoint anchored under the fingers as pxPerSec changes.
  useLayoutEffect(() => {
    const pinch = pinchRef.current;
    const el = scrollRef.current;
    if (!pinch || !el) return;
    const rect = el.getBoundingClientRect();
    el.scrollLeft = Math.max(0, pinch.midTime * pxPerSec - (pinch.midClientX - rect.left));
  }, [pxPerSec]);

  function seekFromClientX(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    onSeek(Math.max(0, x / pxPerSec));
  }

  function handlePointerDown(e: React.PointerEvent) {
    const onRuler = (e.target as Element).closest('.ruler') != null;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, onRuler });

    if (pointers.current.size === 1) {
      if (onRuler) {
        seekDragRef.current = { pointerId: e.pointerId };
        seekFromClientX(e.clientX);
      } else {
        emptyTapRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
      }
    } else if (pointers.current.size === 2) {
      seekDragRef.current = null;
      emptyTapRef.current = null;
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midClientX = (pts[0].x + pts[1].x) / 2;
      const el = scrollRef.current;
      if (el && dist > 0) {
        const rect = el.getBoundingClientRect();
        const midTime = (midClientX - rect.left + el.scrollLeft) / pxPerSec;
        pinchRef.current = { initialDist: dist, initialPxPerSec: pxPerSec, midTime, midClientX };
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const info = pointers.current.get(e.pointerId)!;
    info.x = e.clientX;
    info.y = e.clientY;

    if (pointers.current.size === 2 && pinchRef.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (dist > 0) {
        const scale = dist / pinchRef.current.initialDist;
        const next = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pinchRef.current.initialPxPerSec * scale));
        onZoomChange(next);
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (pointers.current.size === 1) {
      if (seekDragRef.current?.pointerId === e.pointerId) {
        seekFromClientX(e.clientX);
      } else if (emptyTapRef.current?.pointerId === e.pointerId) {
        const dx = e.clientX - emptyTapRef.current.startX;
        const dy = e.clientY - emptyTapRef.current.startY;
        if (Math.hypot(dx, dy) > 6) emptyTapRef.current.moved = true;
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (seekDragRef.current?.pointerId === e.pointerId) seekDragRef.current = null;
    if (emptyTapRef.current?.pointerId === e.pointerId) {
      if (!emptyTapRef.current.moved) onSelectClip(null);
      emptyTapRef.current = null;
    }
  }

  const viewportWidth = scrollRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 400);
  const interval = pickTickInterval(pxPerSec);
  const viewStart = Math.max(0, Math.floor((scrollLeft / pxPerSec - 2) / interval) * interval);
  const viewEnd = Math.ceil(((scrollLeft + viewportWidth) / pxPerSec + 2) / interval) * interval;
  const ticks: number[] = [];
  for (let t = viewStart; t <= viewEnd; t += interval) ticks.push(Math.max(0, t));

  return (
    <div
      className="timeline-scroll"
      ref={scrollRef}
      onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="timeline-content" style={{ width: contentWidth }}>
        <div className="ruler" style={{ height: RULER_HEIGHT }}>
          {ticks.map((t) => (
            <div key={t} className="ruler-tick" style={{ left: t * pxPerSec }}>
              <span>{formatTickLabel(t, interval)}</span>
            </div>
          ))}
        </div>

        {TRACK_NAMES.map((name, trackId) => (
          <div key={trackId} className="track-row" style={{ height: TRACK_HEIGHT }}>
            <div className="track-lane">
              {clips
                .filter((c) => c.trackId === trackId)
                .map((clip) => {
                  const source = sources.get(clip.sourceId);
                  if (!source) return null;
                  return (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      source={source}
                      pxPerSec={pxPerSec}
                      isSelected={selectedClipId === clip.id}
                      trackHeight={TRACK_HEIGHT}
                      onSelect={onSelectClip}
                      onMove={onMoveClip}
                      onTrimLeft={onTrimLeft}
                      onTrimRight={onTrimRight}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  );
                })}
            </div>
            <div className={`track-label ${activeTrackId === trackId ? 'track-label-active' : ''}`}>
              {name}
            </div>
          </div>
        ))}

        <div className="playhead" style={{ left: playheadPx, height: RULER_HEIGHT + TRACK_NAMES.length * TRACK_HEIGHT }} />
      </div>
    </div>
  );
}

function pickTickInterval(pxPerSec: number): number {
  const targetPx = 90;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) {
    if (s * pxPerSec >= targetPx) return s;
  }
  return 600;
}

function formatTickLabel(seconds: number, interval: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (interval < 1) {
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  }
  return `${m}:${Math.floor(s).toString().padStart(2, '0')}`;
}
