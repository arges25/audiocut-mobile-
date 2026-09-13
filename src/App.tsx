import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource, Clip } from './types';
import { computePeaks } from './audio/peaks';
import { PlaybackEngine } from './audio/engine';
import { renderMix, audioBufferToWav } from './audio/export';
import Timeline from './components/Timeline';

const PX_PER_SEC = 60;

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const engineRef = useRef<PlaybackEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PlaybackEngine();
  const engine = engineRef.current;

  const [sources, setSources] = useState<Map<string, AudioSource>>(new Map());
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  useEffect(() => {
    let raf: number;
    function tick() {
      if (engine.isPlaying) {
        setPlayheadTime(engine.getCurrentTime());
        raf = requestAnimationFrame(tick);
      }
    }
    if (isPlaying) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, engine]);

  const pauseIfPlaying = useCallback(() => {
    if (engine.isPlaying) {
      engine.pause();
      setPlayheadTime(engine.getCurrentTime());
      setIsPlaying(false);
    }
  }, [engine]);

  async function handlePlayPause() {
    if (isPlaying) {
      engine.pause();
      setPlayheadTime(engine.getCurrentTime());
      setIsPlaying(false);
    } else {
      await engine.play(clipsRef.current, sourcesRef.current, playheadTime);
      setIsPlaying(true);
    }
  }

  function handleSeek(time: number) {
    const wasPlaying = engine.isPlaying;
    if (wasPlaying) engine.pause();
    setPlayheadTime(time);
    if (wasPlaying) {
      engine.play(clipsRef.current, sourcesRef.current, time);
    }
  }

  function handleAddAudioClick() {
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    pauseIfPlaying();

    const isFirstImportEver = clipsRef.current.length === 0;
    const targetTrack = isFirstImportEver ? 0 : activeTrackId;

    const existingOnTrack = clipsRef.current.filter((c) => c.trackId === targetTrack);
    let nextStart = existingOnTrack.length === 0
      ? 0
      : Math.max(...existingOnTrack.map((c) => c.timelineStart + (c.sourceEnd - c.sourceStart)));

    const newSources = new Map(sourcesRef.current);
    const newClips: Clip[] = [];

    for (const file of Array.from(files)) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
        const sourceId = makeId();
        const peaks = computePeaks(audioBuffer);
        newSources.set(sourceId, { id: sourceId, name: file.name, buffer: audioBuffer, peaks });

        const clip: Clip = {
          id: makeId(),
          trackId: targetTrack,
          sourceId,
          timelineStart: nextStart,
          sourceStart: 0,
          sourceEnd: audioBuffer.duration,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
        };
        newClips.push(clip);
        nextStart += audioBuffer.duration;
      } catch (err) {
        console.error('Erreur import audio', file.name, err);
      }
    }

    setSources(newSources);
    setClips((prev) => [...prev, ...newClips]);
    e.target.value = '';
  }

  function updateClip(id: string, changes: Partial<Clip>) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
  }

  function handleMoveClip(id: string, newTimelineStart: number) {
    updateClip(id, { timelineStart: newTimelineStart });
  }

  function handleTrimLeft(id: string, newSourceStart: number, newTimelineStart: number) {
    updateClip(id, { sourceStart: newSourceStart, timelineStart: newTimelineStart });
  }

  function handleTrimRight(id: string, newSourceEnd: number) {
    updateClip(id, { sourceEnd: newSourceEnd });
  }

  function handleSplit() {
    if (!selectedClipId) return;
    const clip = clipsRef.current.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const clipEnd = clip.timelineStart + (clip.sourceEnd - clip.sourceStart);
    if (playheadTime <= clip.timelineStart + 0.05 || playheadTime >= clipEnd - 0.05) return;

    pauseIfPlaying();
    const splitSourceTime = clip.sourceStart + (playheadTime - clip.timelineStart);

    const leftClip: Clip = { ...clip, sourceEnd: splitSourceTime, fadeOut: 0 };
    const rightClip: Clip = {
      ...clip,
      id: makeId(),
      sourceStart: splitSourceTime,
      timelineStart: playheadTime,
      fadeIn: 0,
    };

    setClips((prev) => prev.flatMap((c) => (c.id === clip.id ? [leftClip, rightClip] : [c])));
    setSelectedClipId(rightClip.id);
  }

  function handleDelete() {
    if (!selectedClipId) return;
    pauseIfPlaying();
    setClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    setSelectedClipId(null);
  }

  function handleVolumeChange(value: number) {
    if (!selectedClipId) return;
    updateClip(selectedClipId, { volume: value });
  }

  function handleFadeInChange(value: number) {
    if (!selectedClipId) return;
    updateClip(selectedClipId, { fadeIn: value });
  }

  function handleFadeOutChange(value: number) {
    if (!selectedClipId) return;
    updateClip(selectedClipId, { fadeOut: value });
  }

  async function handleExport() {
    if (clipsRef.current.length === 0) return;
    pauseIfPlaying();
    setIsExporting(true);
    try {
      const mixBuffer = await renderMix(clipsRef.current, sourcesRef.current);
      const wavBlob = audioBufferToWav(mixBuffer);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audiocut-export.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('Erreur export', err);
      alert("Erreur lors de l'export.");
    } finally {
      setIsExporting(false);
    }
  }

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;

  return (
    <div className="app">
      <input
        ref={fileInputRef}
        type="file"
        accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      <div className="topbar">
        <div className="app-title">AudioCut</div>
        <button className="btn btn-export" onClick={handleExport} disabled={isExporting || clips.length === 0}>
          {isExporting ? 'Export…' : 'Exporter'}
        </button>
      </div>

      <div className="timeline-container">
        <Timeline
          clips={clips}
          sources={sources}
          pxPerSec={PX_PER_SEC}
          playheadTime={playheadTime}
          isPlaying={isPlaying}
          selectedClipId={selectedClipId}
          activeTrackId={activeTrackId}
          onSelectClip={setSelectedClipId}
          onSelectTrack={setActiveTrackId}
          onSeek={handleSeek}
          onMoveClip={handleMoveClip}
          onTrimLeft={handleTrimLeft}
          onTrimRight={handleTrimRight}
          onDragStart={pauseIfPlaying}
        />
      </div>

      <div className="bottombar">
        {selectedClip ? (
          <div className="edit-panel">
            <button className="btn" onClick={handleSplit}>Diviser</button>
            <label className="slider-field">
              Volume {Math.round(selectedClip.volume * 100)}%
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={selectedClip.volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              />
            </label>
            <label className="slider-field">
              Entrée {selectedClip.fadeIn.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={Math.min(5, selectedClip.sourceEnd - selectedClip.sourceStart)}
                step={0.1}
                value={selectedClip.fadeIn}
                onChange={(e) => handleFadeInChange(parseFloat(e.target.value))}
              />
            </label>
            <label className="slider-field">
              Sortie {selectedClip.fadeOut.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={Math.min(5, selectedClip.sourceEnd - selectedClip.sourceStart)}
                step={0.1}
                value={selectedClip.fadeOut}
                onChange={(e) => handleFadeOutChange(parseFloat(e.target.value))}
              />
            </label>
            <button className="btn btn-danger" onClick={handleDelete}>Supprimer</button>
          </div>
        ) : (
          <div className="edit-panel">
            <button className="btn btn-add" onClick={handleAddAudioClick}>+ Audio</button>
            <span className="active-track-hint">Piste active : {['Musique', 'Effets', 'Audio'][activeTrackId]}</span>
          </div>
        )}

        <div className="transport">
          <button className="btn btn-play" onClick={handlePlayPause}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="time-display">{formatTime(playheadTime)}</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}
