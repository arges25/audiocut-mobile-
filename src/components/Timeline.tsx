import { useLayoutEffect, useRef, useState } from 'react';
import type { AudioSource, Clip, TrackState } from '../types';
import { TRACK_NAMES } from '../types';
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC } from '../constants';
import ClipView from './ClipView';
import TrackHeader from './TrackHeader';

const TRACK_HEIGHT = 76;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 68;
const LONG_PRESS_MS = 500;

interface Props {
  clips: Clip[];
  sources: Map<string, AudioSource>;
  tracks: TrackState[];
  pxPerSec: number;
  onZoomChange: (pxPerSec: number) => void;
  playheadTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  activeTrackId: number;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onScrubPreview: (time: number | null) => void;
  onMoveClip: (id: string, newTimelineStart: number) => void;
  onTrimLeft: (id: string, newSourceStart: number, newTimelineStart: number) => void;
  onTrimRight: (id: string, newSourceEnd: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onLongPressClip: (id: string, x: number, y: number) => void;
  onTrackVolume: (trackId: number) => void;
  onTrackMuteToggle: (trackId: number) => void;
  onTrackFx: (trackId: number) => void;
  onQuickAddTrack: (trackId: number) => void;
}

interface PointerInfo {
  x: number;
  y: number;
}

export default function Timeline({
  clips,
  sources,
  tracks,
  pxPerSec,
  onZoomChange,
  playheadTime,
  isPlaying,
  selectedClipId,
  activeTrackId,
  onSelectClip,
  onSeek,
  onScrubPreview,
  onMoveClip,
  onTrimLeft,
  onTrimRight,
  onDragStart,
  onDragEnd,
  onLongPressClip,
  onTrackVolume,
  onTrackMuteToggle,
  onTrackFx,
  onQuickAddTrack,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const pointers = useRef(new Map<number, PointerInfo>());
  const pinchRef = useRef<{ initialDist: number; initialPxPerSec: number; midTime: number; midClientX: number } | null>(null);
  const scrubRef = useRef<{ pointerId: number } | null>(null);
  const emptyTapRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);

  let maxEnd = 30;
  for (const clip of clips) {
    const end = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
    if (end > maxEnd) maxEnd = end;
  }
  const contentWidth = (maxEnd + 20) * pxPerSec;
  const displayedTime = scrubTime ?? playheadTime;
  const playheadPx = displayedTime * pxPerSec;

  useLayoutEffect(() => {
    // Never fight the user's finger: auto-follow only runs while actually
    // playing and only when nobody is mid-gesture on the timeline (a manual
    // scrub keeps its own local preview and doesn't touch playheadTime until
    // release, so this effect naturally won't re-fire during a drag).
    if (!isPlaying || scrubRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewWidth = el.clientWidth;
    const margin = viewWidth * 0.25;
    if (playheadPx < el.scrollLeft + margin || playheadPx > el.scrollLeft + viewWidth - margin) {
      el.scrollLeft = Math.max(0, playheadPx - margin);
    }
  }, [playheadPx, isPlaying]);

  useLayoutEffect(() => {
    const pinch = pinchRef.current;
    const el = scrollRef.current;
    if (!pinch || !el) return;
    const rect = el.getBoundingClientRect();
    el.scrollLeft = Math.max(0, pinch.midTime * pxPerSec - (pinch.midClientX - rect.left));
  }, [pxPerSec]);

  function timeFromClientX(clientX: number): number {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, x / pxPerSec);
  }

  function beginScrub(pointerId: number, clientX: number) {
    scrubRef.current = { pointerId };
    const t = timeFromClientX(clientX);
    setScrubTime(t);
    onScrubPreview(t);
  }

  function updateScrub(clientX: number) {
    const t = timeFromClientX(clientX);
    setScrubTime(t);
    onScrubPreview(t);
  }

  function commitScrub() {
    if (scrubTime != null) onSeek(scrubTime);
    setScrubTime(null);
    onScrubPreview(null);
    scrubRef.current = null;
  }

  function handlePointerDown(e: React.PointerEvent) {
    const target = e.target as Element;
    const isScrubTarget = target.closest('.ruler') != null || target.closest('.playhead-handle') != null;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      if (isScrubTarget) {
        (target as Element).setPointerCapture?.(e.pointerId);
        beginScrub(e.pointerId, e.clientX);
      } else {
        emptyTapRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
      }
    } else if (pointers.current.size === 2) {
      if (scrubRef.current) {
        setScrubTime(null);
        onScrubPreview(null);
        scrubRef.current = null;
      }
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
      if (scrubRef.current?.pointerId === e.pointerId) {
        updateScrub(e.clientX);
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
    if (scrubRef.current?.pointerId === e.pointerId) commitScrub();
    if (emptyTapRef.current?.pointerId === e.pointerId) {
      const tap = emptyTapRef.current;
      emptyTapRef.current = null;
      if (!tap.moved) {
        // Tap on empty timeline space: deselect any clip and move the playhead there.
        onSelectClip(null);
        onSeek(timeFromClientX(e.clientX));
      }
    }
  }

  const viewportWidth = scrollRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 400);
  const interval = pickTickInterval(pxPerSec);
  const viewStart = Math.max(0, Math.floor((scrollLeft / pxPerSec - 2) / interval) * interval);
  const viewEnd = Math.ceil(((scrollLeft + viewportWidth) / pxPerSec + 2) / interval) * interval;
  const ticks: number[] = [];
  for (let t = viewStart; t <= viewEnd; t += interval) ticks.push(Math.max(0, t));

  return (
    <div className="timeline-row">
      <div className="track-headers" style={{ width: HEADER_WIDTH }}>
        <div className="track-headers-spacer" style={{ height: RULER_HEIGHT }} />
        {TRACK_NAMES.map((name, trackId) => (
          <TrackHeader
            key={trackId}
            name={name}
            track={tracks[trackId]}
            isActive={activeTrackId === trackId}
            height={TRACK_HEIGHT}
            onVolume={() => onTrackVolume(trackId)}
            onToggleMute={() => onTrackMuteToggle(trackId)}
            onFx={() => onTrackFx(trackId)}
          />
        ))}
      </div>

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

          {TRACK_NAMES.map((_, trackId) => {
            const trackClips = clips.filter((c) => c.trackId === trackId);
            let trackEnd = 0;
            for (const c of trackClips) {
              const end = c.timelineStart + (c.sourceEnd - c.sourceStart);
              if (end > trackEnd) trackEnd = end;
            }
            return (
              <div key={trackId} className="track-lane" style={{ height: TRACK_HEIGHT }}>
                {trackClips.map((clip) => {
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
                      longPressMs={LONG_PRESS_MS}
                      onSelect={onSelectClip}
                      onMove={onMoveClip}
                      onTrimLeft={onTrimLeft}
                      onTrimRight={onTrimRight}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onLongPress={onLongPressClip}
                    />
                  );
                })}
                <button
                  className="track-lane-add"
                  style={{ left: trackEnd * pxPerSec + 10 }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onQuickAddTrack(trackId)}
                  aria-label={`Ajouter un fichier sur ${TRACK_NAMES[trackId]}`}
                >
                  +
                </button>
              </div>
            );
          })}

          {(() => {
            const fullHeight = RULER_HEIGHT + TRACK_NAMES.length * TRACK_HEIGHT;
            return (
              <>
                {/* Wide invisible hit column so the playhead is easy to grab anywhere along
                    its height, without stealing taps from a clip it happens to cross —
                    z-index keeps it below clips (their own pointerdown already wins there)
                    but above the plain track background. */}
                <div className="playhead-handle" style={{ left: playheadPx, height: fullHeight }} />
                <div className={`playhead ${scrubRef.current ? 'playhead-active' : ''}`} style={{ left: playheadPx, height: fullHeight }} />
              </>
            );
          })()}
        </div>
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
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = seconds % 60;
  if (interval < 1) {
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  }
  return `${m}:${Math.floor(s).toString().padStart(2, '0')}`;
}
