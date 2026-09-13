import { useEffect, useRef } from 'react';
import type { AudioSource, Clip } from '../types';
import { TRACK_NAMES } from '../types';
import ClipView from './ClipView';

const TRACK_HEIGHT = 72;
const RULER_HEIGHT = 28;

interface Props {
  clips: Clip[];
  sources: Map<string, AudioSource>;
  pxPerSec: number;
  playheadTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  activeTrackId: number;
  onSelectClip: (id: string | null) => void;
  onSelectTrack: (trackId: number) => void;
  onSeek: (time: number) => void;
  onMoveClip: (id: string, newTimelineStart: number) => void;
  onTrimLeft: (id: string, newSourceStart: number, newTimelineStart: number) => void;
  onTrimRight: (id: string, newSourceEnd: number) => void;
  onDragStart: () => void;
}

export default function Timeline({
  clips,
  sources,
  pxPerSec,
  playheadTime,
  isPlaying,
  selectedClipId,
  activeTrackId,
  onSelectClip,
  onSelectTrack,
  onSeek,
  onMoveClip,
  onTrimLeft,
  onTrimRight,
  onDragStart,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  let maxEnd = 30;
  for (const clip of clips) {
    const end = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
    if (end > maxEnd) maxEnd = end;
  }
  const contentWidth = (maxEnd + 20) * pxPerSec;
  const playheadPx = playheadTime * pxPerSec;

  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewWidth = el.clientWidth;
    const margin = viewWidth * 0.25;
    if (playheadPx < el.scrollLeft + margin || playheadPx > el.scrollLeft + viewWidth - margin) {
      el.scrollLeft = Math.max(0, playheadPx - margin);
    }
  }, [playheadPx, isPlaying]);

  function handleRulerPointerDown(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    onSeek(Math.max(0, x / pxPerSec));
  }

  const ticks: number[] = [];
  for (let t = 0; t <= maxEnd + 20; t += 1) ticks.push(t);

  return (
    <div className="timeline-scroll" ref={scrollRef}>
      <div className="timeline-content" style={{ width: contentWidth }}>
        <div className="ruler" style={{ height: RULER_HEIGHT }} onPointerDown={handleRulerPointerDown}>
          {ticks.map((t) => (
            <div key={t} className="ruler-tick" style={{ left: t * pxPerSec }}>
              {t % 5 === 0 && <span>{formatTime(t)}</span>}
            </div>
          ))}
        </div>

        {TRACK_NAMES.map((name, trackId) => (
          <div key={trackId} className="track-row" style={{ height: TRACK_HEIGHT }}>
            <div
              className={`track-label ${activeTrackId === trackId ? 'track-label-active' : ''}`}
              onPointerDown={() => onSelectTrack(trackId)}
            >
              {name}
            </div>
            <div
              className="track-lane"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) onSelectClip(null);
              }}
            >
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
                    />
                  );
                })}
            </div>
          </div>
        ))}

        <div className="playhead" style={{ left: playheadPx, height: RULER_HEIGHT + TRACK_NAMES.length * TRACK_HEIGHT }} />
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
