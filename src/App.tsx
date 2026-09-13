import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource, Clip } from './types';
import { TRACK_NAMES, clipDuration, clipTimelineEnd } from './types';
import { computePeaks } from './audio/peaks';
import { PlaybackEngine } from './audio/engine';
import { renderMix, audioBufferToWav } from './audio/export';
import { computeSnapTargets, applySnap } from './audio/snap';
import { useClipsHistory } from './state/useClipsHistory';
import { saveProject, loadProject, saveSource, loadAllSources, clearProject } from './state/db';
import { DEFAULT_PX_PER_SEC } from './constants';
import Timeline from './components/Timeline';

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const engineRef = useRef<PlaybackEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PlaybackEngine();
  const engine = engineRef.current;

  const history = useClipsHistory([]);
  const { clips, clipsRef } = history;

  const [sources, setSources] = useState<Map<string, AudioSource>>(new Map());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const playheadRef = useRef(playheadTime);
  playheadRef.current = playheadTime;
  const magnetRef = useRef(magnetEnabled);
  magnetRef.current = magnetEnabled;

  const gestureBaselineRef = useRef<Clip[] | null>(null);
  const persistedSourceIdsRef = useRef<Set<string>>(new Set());

  // Load persisted project once on mount.
  useEffect(() => {
    (async () => {
      try {
        const project = await loadProject();
        if (!project) {
          setIsLoaded(true);
          return;
        }
        const persistedSources = await loadAllSources();
        const newSources = new Map<string, AudioSource>();
        for (const s of persistedSources) {
          try {
            const buffer = await engine.ctx.decodeAudioData(s.arrayBuffer);
            newSources.set(s.id, { id: s.id, name: s.name, buffer, peaks: computePeaks(buffer) });
            persistedSourceIdsRef.current.add(s.id);
          } catch (err) {
            console.error('Impossible de décoder une source sauvegardée', s.name, err);
          }
        }
        setSources(newSources);
        history.replace(project.clips.filter((c) => newSources.has(c.sourceId)));
        setActiveTrackId(project.activeTrackId);
        setMagnetEnabled(project.magnetEnabled);
      } catch (err) {
        console.error('Erreur de chargement du projet sauvegardé', err);
      } finally {
        setIsLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave of project metadata (clips, active track, magnet).
  useEffect(() => {
    if (!isLoaded) return;
    const t = setTimeout(() => {
      saveProject({ clips, activeTrackId, magnetEnabled }).catch((err) => console.error('Autosave échoué', err));
    }, 800);
    return () => clearTimeout(t);
  }, [clips, activeTrackId, magnetEnabled, isLoaded]);

  // Clear selection if the selected clip no longer exists (e.g. after undo/delete).
  useEffect(() => {
    if (selectedClipId && !clips.some((c) => c.id === selectedClipId)) {
      setSelectedClipId(null);
    }
  }, [clips, selectedClipId]);

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
    setShowTrackPicker(true);
  }

  function handlePickTrack(trackId: number) {
    setActiveTrackId(trackId);
    setShowTrackPicker(false);
    fileInputRef.current?.click();
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    pauseIfPlaying();

    const targetTrack = activeTrackId;
    const existingOnTrack = clipsRef.current.filter((c) => c.trackId === targetTrack);
    let nextStart = existingOnTrack.length === 0
      ? 0
      : Math.max(...existingOnTrack.map(clipTimelineEnd));

    const newSources = new Map(sourcesRef.current);
    const newClips: Clip[] = [];
    const toPersist: { id: string; name: string; mimeType: string; arrayBuffer: ArrayBuffer }[] = [];

    for (const file of Array.from(files)) {
      try {
        const original = await file.arrayBuffer();
        const audioBuffer = await engine.ctx.decodeAudioData(original.slice(0));
        const sourceId = makeId();
        const peaks = computePeaks(audioBuffer);
        newSources.set(sourceId, { id: sourceId, name: file.name, buffer: audioBuffer, peaks });
        toPersist.push({ id: sourceId, name: file.name, mimeType: file.type || 'application/octet-stream', arrayBuffer: original });

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
    history.commit((prev) => [...prev, ...newClips]);
    for (const s of toPersist) {
      saveSource(s)
        .then(() => persistedSourceIdsRef.current.add(s.id))
        .catch((err) => console.error('Sauvegarde source échouée', s.name, err));
    }
    e.target.value = '';
  }

  function beginGesture() {
    pauseIfPlaying();
    gestureBaselineRef.current = clipsRef.current;
  }

  function endGesture() {
    if (gestureBaselineRef.current) {
      history.commitBaseline(gestureBaselineRef.current);
      gestureBaselineRef.current = null;
    }
  }

  function findClip(id: string): Clip | undefined {
    return clipsRef.current.find((c) => c.id === id);
  }

  function handleMoveClip(id: string, rawStart: number) {
    const clip = findClip(id);
    if (!clip) return;
    const duration = clipDuration(clip);
    let start = Math.max(0, rawStart);

    if (magnetRef.current) {
      const targets = computeSnapTargets(clipsRef.current, id, playheadRef.current);
      const snappedStart = applySnap(start, targets, pxPerSec);
      if (snappedStart !== start) {
        start = snappedStart;
      } else {
        const snappedEnd = applySnap(start + duration, targets, pxPerSec);
        if (snappedEnd !== start + duration) start = Math.max(0, snappedEnd - duration);
      }
    }

    history.setLive((prev) => prev.map((c) => (c.id === id ? { ...c, timelineStart: start } : c)));
  }

  function handleTrimLeft(id: string, rawSourceStart: number, rawTimelineStart: number) {
    let sourceStart = rawSourceStart;
    let timelineStart = rawTimelineStart;

    if (magnetRef.current) {
      const targets = computeSnapTargets(clipsRef.current, id, playheadRef.current);
      const snapped = applySnap(timelineStart, targets, pxPerSec);
      if (snapped !== timelineStart) {
        const delta = snapped - timelineStart;
        timelineStart = snapped;
        sourceStart = Math.max(0, sourceStart + delta);
      }
    }

    history.setLive((prev) =>
      prev.map((c) => (c.id === id ? { ...c, sourceStart, timelineStart } : c))
    );
  }

  function handleTrimRight(id: string, rawSourceEnd: number) {
    const clip = findClip(id);
    if (!clip) return;
    let sourceEnd = rawSourceEnd;

    if (magnetRef.current) {
      const targets = computeSnapTargets(clipsRef.current, id, playheadRef.current);
      const rightEdge = clip.timelineStart + (sourceEnd - clip.sourceStart);
      const snapped = applySnap(rightEdge, targets, pxPerSec);
      if (snapped !== rightEdge) {
        sourceEnd = clip.sourceStart + (snapped - clip.timelineStart);
      }
    }

    history.setLive((prev) => prev.map((c) => (c.id === id ? { ...c, sourceEnd } : c)));
  }

  function handleSplit() {
    if (!selectedClipId) return;
    const clip = findClip(selectedClipId);
    if (!clip) return;
    const clipEnd = clipTimelineEnd(clip);
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

    history.commit((prev) => prev.flatMap((c) => (c.id === clip.id ? [leftClip, rightClip] : [c])));
    setSelectedClipId(rightClip.id);
  }

  function handleDuplicate() {
    if (!selectedClipId) return;
    const clip = findClip(selectedClipId);
    if (!clip) return;
    pauseIfPlaying();
    const copy: Clip = { ...clip, id: makeId(), timelineStart: clipTimelineEnd(clip) };
    history.commit((prev) => [...prev, copy]);
    setSelectedClipId(copy.id);
  }

  function handleDelete() {
    if (!selectedClipId) return;
    pauseIfPlaying();
    history.commit((prev) => prev.filter((c) => c.id !== selectedClipId));
    setSelectedClipId(null);
  }

  function handleVolumeChange(value: number) {
    if (!selectedClipId) return;
    history.setLive((prev) => prev.map((c) => (c.id === selectedClipId ? { ...c, volume: value } : c)));
  }

  function handleFadeInChange(value: number) {
    if (!selectedClipId) return;
    history.setLive((prev) => prev.map((c) => (c.id === selectedClipId ? { ...c, fadeIn: value } : c)));
  }

  function handleFadeOutChange(value: number) {
    if (!selectedClipId) return;
    history.setLive((prev) => prev.map((c) => (c.id === selectedClipId ? { ...c, fadeOut: value } : c)));
  }

  async function handleNewProject() {
    if (!window.confirm('Effacer le projet actuel et repartir de zéro ?')) return;
    pauseIfPlaying();
    history.replace([]);
    setSources(new Map());
    setSelectedClipId(null);
    setActiveTrackId(0);
    persistedSourceIdsRef.current = new Set();
    try {
      await clearProject();
    } catch (err) {
      console.error('Erreur en effaçant le projet sauvegardé', err);
    }
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
        accept=".wav,.mp3,.m4a,.aac,.ogg,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      <div className="topbar">
        <div className="app-title">AudioCut</div>
        <div className="topbar-actions">
          <button className="btn btn-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Annuler">
            ↺
          </button>
          <button className="btn btn-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Rétablir">
            ↻
          </button>
          <button className="btn btn-export" onClick={handleExport} disabled={isExporting || clips.length === 0}>
            {isExporting ? 'Export…' : 'Exporter'}
          </button>
        </div>
      </div>

      <div className="timeline-container">
        <Timeline
          clips={clips}
          sources={sources}
          pxPerSec={pxPerSec}
          onZoomChange={setPxPerSec}
          playheadTime={playheadTime}
          isPlaying={isPlaying}
          selectedClipId={selectedClipId}
          activeTrackId={activeTrackId}
          onSelectClip={setSelectedClipId}
          onSeek={handleSeek}
          onMoveClip={handleMoveClip}
          onTrimLeft={handleTrimLeft}
          onTrimRight={handleTrimRight}
          onDragStart={beginGesture}
          onDragEnd={endGesture}
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
                onPointerDown={beginGesture}
                onPointerUp={endGesture}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              />
            </label>
            <label className="slider-field">
              Entrée {selectedClip.fadeIn.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={Math.min(10, clipDuration(selectedClip))}
                step={0.1}
                value={selectedClip.fadeIn}
                onPointerDown={beginGesture}
                onPointerUp={endGesture}
                onChange={(e) => handleFadeInChange(parseFloat(e.target.value))}
              />
            </label>
            <label className="slider-field">
              Sortie {selectedClip.fadeOut.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={Math.min(10, clipDuration(selectedClip))}
                step={0.1}
                value={selectedClip.fadeOut}
                onPointerDown={beginGesture}
                onPointerUp={endGesture}
                onChange={(e) => handleFadeOutChange(parseFloat(e.target.value))}
              />
            </label>
            <button className="btn" onClick={handleDuplicate}>Dupliquer</button>
            <button className="btn btn-danger" onClick={handleDelete}>Supprimer</button>
          </div>
        ) : showTrackPicker ? (
          <div className="edit-panel">
            {TRACK_NAMES.map((name, i) => (
              <button key={i} className="btn btn-track-choice" onClick={() => handlePickTrack(i)}>
                {name}
              </button>
            ))}
            <button className="btn" onClick={() => setShowTrackPicker(false)}>Annuler</button>
          </div>
        ) : (
          <div className="edit-panel">
            <button className="btn btn-add" onClick={handleAddAudioClick}>+ Audio</button>
            <button
              className={`btn btn-toggle ${magnetEnabled ? 'btn-toggle-on' : ''}`}
              onClick={() => setMagnetEnabled((v) => !v)}
            >
              🧲 Magnet
            </button>
            <button className="btn" onClick={handleNewProject}>Projet</button>
            <span className="active-track-hint">Piste active : {TRACK_NAMES[activeTrackId]}</span>
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
