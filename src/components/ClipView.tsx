import { memo, useRef } from 'react';
import type { AudioSource, Clip } from '../types';
import { hasAnyEffectEnabled } from '../types';
import Waveform from './Waveform';

interface Props {
  clip: Clip;
  source: AudioSource;
  pxPerSec: number;
  isSelected: boolean;
  trackHeight: number;
  longPressMs: number;
  onSelect: (id: string) => void;
  onMove: (id: string, newTimelineStart: number) => void;
  onTrimLeft: (id: string, newSourceStart: number, newTimelineStart: number) => void;
  onTrimRight: (id: string, newSourceEnd: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onLongPress: (id: string, x: number, y: number) => void;
}

const HANDLE_WIDTH = 14;
const MOVE_THRESHOLD = 4;
const MIN_DURATION = 0.1;

function ClipView({
  clip,
  source,
  pxPerSec,
  isSelected,
  trackHeight,
  longPressMs,
  onSelect,
  onMove,
  onTrimLeft,
  onTrimRight,
  onDragStart,
  onDragEnd,
  onLongPress,
}: Props) {
  const duration = clip.sourceEnd - clip.sourceStart;
  const width = Math.max(HANDLE_WIDTH * 2, duration * pxPerSec);
  const left = clip.timelineStart * pxPerSec;
  const bodyHeight = trackHeight - 10;

  const dragState = useRef<{
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    startY: number;
    initial: { timelineStart: number; sourceStart: number; sourceEnd: number };
    moved: boolean;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    longPressFired: boolean;
  } | null>(null);

  function handlePointerDown(e: React.PointerEvent, mode: 'move' | 'trim-left' | 'trim-right') {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const clientX = e.clientX;
    const clientY = e.clientY;

    const state = {
      mode,
      startX: clientX,
      startY: clientY,
      initial: {
        timelineStart: clip.timelineStart,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
      },
      moved: false,
      longPressTimer: null as ReturnType<typeof setTimeout> | null,
      longPressFired: false,
    };
    dragState.current = state;
    onDragStart();

    if (mode === 'move') {
      state.longPressTimer = setTimeout(() => {
        if (dragState.current === state && !state.moved) {
          state.longPressFired = true;
          onLongPress(clip.id, clientX, clientY);
        }
      }, longPressMs);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const ds = dragState.current;
    if (!ds || ds.longPressFired) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      ds.moved = true;
      if (ds.longPressTimer) {
        clearTimeout(ds.longPressTimer);
        ds.longPressTimer = null;
      }
    }
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

  function handlePointerUp() {
    const ds = dragState.current;
    dragState.current = null;
    if (!ds) return;
    if (ds.longPressTimer) clearTimeout(ds.longPressTimer);
    if (ds.longPressFired) return;
    if (!ds.moved) {
      onSelect(clip.id);
    } else {
      onDragEnd();
    }
  }

  const showIntroShade = clip.introType !== 'none' && clip.fadeIn > 0;
  const showOutroShade = clip.outroType !== 'none' && clip.fadeOut > 0;
  const fxActive = hasAnyEffectEnabled(clip.effects);

  return (
    <div
      className={`clip ${isSelected ? 'clip-selected' : ''}`}
      style={{ left, width, height: bodyHeight }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="clip-waveform">
        <Waveform
          source={source}
          sourceStart={clip.sourceStart}
          sourceEnd={clip.sourceEnd}
          width={width}
          height={bodyHeight}
        />
      </div>
      {(showIntroShade || showOutroShade) && (
        <svg className="clip-fade-overlay" width={width} height={bodyHeight} preserveAspectRatio="none">
          {showIntroShade && (
            <polygon
              points={`0,0 ${(clip.fadeIn / duration) * width},0 0,${bodyHeight}`}
              fill="rgba(0,0,0,0.45)"
            />
          )}
          {showOutroShade && (
            <polygon
              points={`${width},0 ${width - (clip.fadeOut / duration) * width},0 ${width},${bodyHeight}`}
              fill="rgba(0,0,0,0.45)"
            />
          )}
        </svg>
      )}
      {fxActive && <span className="clip-fx-badge">✨</span>}
      {isSelected && (
        <>
          <div
            className="clip-handle clip-handle-left"
            onPointerDown={(e) => handlePointerDown(e, 'trim-left')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div
            className="clip-handle clip-handle-right"
            onPointerDown={(e) => handlePointerDown(e, 'trim-right')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </>
      )}
    </div>
  );
}

export default memo(ClipView);
