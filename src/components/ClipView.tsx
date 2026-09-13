import { useRef } from 'react';
import type { AudioSource, Clip } from '../types';
import Waveform from './Waveform';

interface Props {
  clip: Clip;
  source: AudioSource;
  pxPerSec: number;
  isSelected: boolean;
  trackHeight: number;
  onSelect: (id: string) => void;
  onMove: (id: string, newTimelineStart: number) => void;
  onTrimLeft: (id: string, newSourceStart: number, newTimelineStart: number) => void;
  onTrimRight: (id: string, newSourceEnd: number) => void;
  onDragStart: () => void;
}

const HANDLE_WIDTH = 14;
const MOVE_THRESHOLD = 4;
const MIN_DURATION = 0.1;

export default function ClipView({
  clip,
  source,
  pxPerSec,
  isSelected,
  trackHeight,
  onSelect,
  onMove,
  onTrimLeft,
  onTrimRight,
  onDragStart,
}: Props) {
  const duration = clip.sourceEnd - clip.sourceStart;
  const width = Math.max(HANDLE_WIDTH * 2, duration * pxPerSec);
  const left = clip.timelineStart * pxPerSec;

  const dragState = useRef<{
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    initial: { timelineStart: number; sourceStart: number; sourceEnd: number };
    moved: boolean;
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent, mode: 'move' | 'trim-left' | 'trim-right') {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      mode,
      startX: e.clientX,
      initial: {
        timelineStart: clip.timelineStart,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
      },
      moved: false,
    };
    onDragStart();
  }

  function handlePointerMove(e: React.PointerEvent) {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    if (Math.abs(dx) > MOVE_THRESHOLD) ds.moved = true;
    const deltaSeconds = dx / pxPerSec;
    const { initial } = ds;

    if (ds.mode === 'move') {
      onMove(clip.id, Math.max(0, initial.timelineStart + deltaSeconds));
    } else if (ds.mode === 'trim-left') {
      let newSourceStart = Math.max(0, Math.min(initial.sourceStart + deltaSeconds, initial.sourceEnd - MIN_DURATION));
      let newTimelineStart = initial.timelineStart + (newSourceStart - initial.sourceStart);
      if (newTimelineStart < 0) {
        newSourceStart = initial.sourceStart - initial.timelineStart;
        newTimelineStart = 0;
      }
      onTrimLeft(clip.id, newSourceStart, newTimelineStart);
    } else if (ds.mode === 'trim-right') {
      const newSourceEnd = Math.min(
        source.buffer.duration,
        Math.max(initial.sourceEnd + deltaSeconds, initial.sourceStart + MIN_DURATION)
      );
      onTrimRight(clip.id, newSourceEnd);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    const ds = dragState.current;
    dragState.current = null;
    if (ds && !ds.moved) {
      onSelect(clip.id);
    }
  }

  return (
    <div
      className={`clip ${isSelected ? 'clip-selected' : ''}`}
      style={{ left, width, height: trackHeight - 8 }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="clip-waveform">
        <Waveform
          source={source}
          sourceStart={clip.sourceStart}
          sourceEnd={clip.sourceEnd}
          width={width}
          height={trackHeight - 8}
        />
      </div>
      {(clip.fadeIn > 0 || clip.fadeOut > 0) && (
        <svg className="clip-fade-overlay" width={width} height={trackHeight - 8} preserveAspectRatio="none">
          {clip.fadeIn > 0 && (
            <polygon
              points={`0,0 ${(clip.fadeIn / duration) * width},0 0,${trackHeight - 8}`}
              fill="rgba(0,0,0,0.45)"
            />
          )}
          {clip.fadeOut > 0 && (
            <polygon
              points={`${width},0 ${width - (clip.fadeOut / duration) * width},0 ${width},${trackHeight - 8}`}
              fill="rgba(0,0,0,0.45)"
            />
          )}
        </svg>
      )}
      {isSelected && (
        <>
          <div
            className="clip-handle clip-handle-left"
            onPointerDown={(e) => handlePointerDown(e, 'trim-left')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className="clip-handle clip-handle-right"
            onPointerDown={(e) => handlePointerDown(e, 'trim-right')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </>
      )}
    </div>
  );
}
