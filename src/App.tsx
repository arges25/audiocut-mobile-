import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSource, Clip, EffectParams, IntroType, OutroType, TrackState } from './types';
import {
  TRACK_NAMES,
  clipDuration,
  clipTimelineEnd,
  clipEffectiveEnd,
  defaultEffectParams,
  defaultTrackState,
} from './types';
import { computePeaks } from './audio/peaks';
import { PlaybackEngine } from './audio/engine';
import { renderMix, audioBufferToWav } from './audio/export';
import { encodeMp3 } from './audio/mp3Encoder';
import {
  SILENT_KEEPALIVE_SRC,
  setupMediaSessionHandlers,
  updateMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionPositionState,
  configureAudioSession,
} from './audio/mediaSession';
import { EffectPreviewPlayer } from './audio/preview';
import { computeSnapTargets, applySnap } from './audio/snap';
import { useClipsHistory } from './state/useClipsHistory';
import { saveProject, loadProject, saveSource, loadAllSources, clearProject } from './state/db';
import { DEFAULT_PX_PER_SEC } from './constants';
import Timeline from './components/Timeline';
import TransportBar from './components/TransportBar';
import ClipToolbar from './components/ClipToolbar';
import ClipContextMenu from './components/ClipContextMenu';
import TrackVolumeSheet from './components/sheets/TrackVolumeSheet';
import EffectsSheet from './components/sheets/EffectsSheet';
import IntroOutroSheet from './components/sheets/IntroOutroSheet';
import ExportSheet from './components/sheets/ExportSheet';
import ProjectMenuSheet from './components/sheets/ProjectMenuSheet';
import SettingsSheet from './components/sheets/SettingsSheet';

type SheetState =
  | { type: 'trackPicker' }
  | { type: 'trackVolume'; trackId: number }
  | { type: 'trackFx'; trackId: number }
  | { type: 'clipVolume' }
  | { type: 'clipEffects' }
  | { type: 'intro' }
  | { type: 'outro' }
  | { type: 'export' }
  | { type: 'project' }
  | { type: 'settings' }
  | null;

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function migrateClip(raw: Partial<Clip> & Record<string, unknown>): Clip {
  return {
    id: raw.id as string,
    trackId: raw.trackId as number,
    sourceId: raw.sourceId as string,
    timelineStart: raw.timelineStart as number,
    sourceStart: raw.sourceStart as number,
    sourceEnd: raw.sourceEnd as number,
    volume: (raw.volume as number) ?? 1,
    fadeIn: (raw.fadeIn as number) ?? 0,
    fadeOut: (raw.fadeOut as number) ?? 0,
    introType: (raw.introType as IntroType) ?? ((raw.fadeIn as number) > 0 ? 'fadeIn' : 'none'),
    outroType: (raw.outroType as OutroType) ?? ((raw.fadeOut as number) > 0 ? 'fadeOut' : 'none'),
    effects: (raw.effects as EffectParams) ?? defaultEffectParams(),
  };
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[/\\:*?"<>|]/g, '').slice(0, 100);
  return trimmed.length > 0 ? trimmed : 'Mon morceau';
}

export default function App() {
  const engineRef = useRef<PlaybackEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PlaybackEngine();
  const engine = engineRef.current;
  const previewPlayerRef = useRef<EffectPreviewPlayer | null>(null);
  if (!previewPlayerRef.current) previewPlayerRef.current = new EffectPreviewPlayer(engine.ctx);
  const previewPlayer = previewPlayerRef.current;

  const history = useClipsHistory([]);
  const { clips, clipsRef } = history;

  const [sources, setSources] = useState<Map<string, AudioSource>>(new Map());
  const [tracks, setTracks] = useState<TrackState[]>([defaultTrackState(), defaultTrackState(), defaultTrackState()]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState(0);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [scrubPreviewTime, setScrubPreviewTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [contextMenu, setContextMenu] = useState<{ clipId: string; x: number; y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const playheadRef = useRef(playheadTime);
  playheadRef.current = playheadTime;
  const magnetRef = useRef(magnetEnabled);
  magnetRef.current = magnetEnabled;

  const gestureBaselineRef = useRef<Clip[] | null>(null);
  const persistedSourceIdsRef = useRef<Set<string>>(new Set());

  let totalDuration = 0;
  for (const c of clips) {
    const end = clipEffectiveEnd(c);
    if (end > totalDuration) totalDuration = end;
  }
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;

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
        const migratedClips = (project.clips as unknown as Record<string, unknown>[])
          .map(migrateClip)
          .filter((c) => newSources.has(c.sourceId));
        history.replace(migratedClips);
        setActiveTrackId(project.activeTrackId ?? 0);
        setMagnetEnabled(project.magnetEnabled ?? true);
        setAutosaveEnabled(project.autosaveEnabled ?? true);
        if (project.tracks && project.tracks.length === 3) {
          setTracks(project.tracks);
        }
      } catch (err) {
        console.error('Erreur de chargement du projet sauvegardé', err);
      } finally {
        setIsLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave of project metadata (clips, tracks, active track, magnet).
  useEffect(() => {
    if (!isLoaded || !autosaveEnabled) return;
    const t = setTimeout(() => {
      saveProject({ clips, tracks, activeTrackId, magnetEnabled, autosaveEnabled }).catch((err) =>
        console.error('Autosave échoué', err)
      );
    }, 800);
    return () => clearTimeout(t);
  }, [clips, tracks, activeTrackId, magnetEnabled, autosaveEnabled, isLoaded]);

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
        const t = engine.getCurrentTime();
        setPlayheadTime(t);
        setMediaSessionPositionState(totalDurationRef.current, Math.min(t, totalDurationRef.current));
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

  // Stable (ref-backed) so Media Session action handlers registered once on
  // mount never close over stale state — engine.isPlaying/refs are always current.
  const handlePlayPause = useCallback(async () => {
    if (engine.isPlaying) {
      engine.pause();
      const t = engine.getCurrentTime();
      playheadRef.current = t;
      setPlayheadTime(t);
      setIsPlaying(false);
    } else {
      await engine.play(clipsRef.current, sourcesRef.current, tracksRef.current, playheadRef.current);
      setIsPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDurationRef.current || time));
      const wasPlaying = engine.isPlaying;
      if (wasPlaying) engine.pause();
      playheadRef.current = clamped;
      setPlayheadTime(clamped);
      if (wasPlaying) {
        engine.play(clipsRef.current, sourcesRef.current, tracksRef.current, clamped);
      }
    },
    [engine]
  );

  const handleSkip = useCallback(
    (delta: number) => {
      handleSeek(playheadRef.current + delta);
    },
    [handleSeek]
  );

  // Media Session: registered once with stable, ref-backed handlers so system
  // Play/Pause/seek controls (Control Center, lock screen) always act on the
  // real current state, never a stale snapshot from mount time.
  useEffect(() => {
    configureAudioSession();
    setupMediaSessionHandlers({
      onPlay: () => {
        if (!engine.isPlaying) handlePlayPause();
      },
      onPause: () => {
        if (engine.isPlaying) handlePlayPause();
      },
      onSeekBackward: (offset) => handleSkip(-offset),
      onSeekForward: (offset) => handleSkip(offset),
      onSeekTo: (time) => handleSeek(time),
    });
  }, [engine, handlePlayPause, handleSeek, handleSkip]);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    updateMediaSessionMetadata('Projet AudioCut', [
      { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ]);
  }, []);

  useEffect(() => {
    setMediaSessionPlaybackState(clips.length === 0 ? 'none' : isPlaying ? 'playing' : 'paused');
  }, [isPlaying, clips.length]);

  // Keeps a real HTMLMediaElement "now playing" session alive alongside our
  // Web Audio graph so iOS/Android can show AudioCut in Control Center / the
  // lock screen — see mediaSession.ts for why this is needed and what it does.
  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => {
        // Autoplay can be refused in rare cases — harmless, playback itself is unaffected.
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // If the platform suspends the AudioContext while backgrounded, try to
  // resume it cleanly when AudioCut comes back — never spin up a second
  // context and never force a restart if the platform won't allow it.
  useEffect(() => {
    function handleForeground() {
      if (document.visibilityState === 'visible' && engine.ctx.state === 'suspended') {
        engine.ctx.resume().catch(() => {
          // iOS may refuse resume outside a user gesture — the next Play tap will recover it.
        });
      }
    }
    function handlePageHide() {
      // Intentionally no-op: we don't pause on backgrounding so playback can
      // continue where the platform allows it; handleForeground resyncs on return.
    }
    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('pageshow', handleForeground);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handleForeground);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [engine]);

  function handleAddAudioClick() {
    setSheet({ type: 'trackPicker' });
  }

  function handlePickTrack(trackId: number) {
    setActiveTrackId(trackId);
    setSheet(null);
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
          introType: 'none',
          outroType: 'none',
          effects: defaultEffectParams(),
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

  /** Discards an in-progress gesture (e.g. "Annuler" in a sheet) without adding a history entry. */
  function cancelGesture() {
    if (gestureBaselineRef.current) {
      history.setLive(() => gestureBaselineRef.current!);
      gestureBaselineRef.current = null;
    }
  }

  function findClip(id: string): Clip | undefined {
    return clipsRef.current.find((c) => c.id === id);
  }

  function updateClipLive(id: string, changes: Partial<Clip>) {
    history.setLive((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
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

    updateClipLive(id, { timelineStart: start });
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

    updateClipLive(id, { sourceStart, timelineStart });
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

    updateClipLive(id, { sourceEnd });
  }

  function handleSplit(targetId?: string) {
    const id = targetId ?? selectedClipId;
    if (!id) return;
    const clip = findClip(id);
    if (!clip) return;
    const clipEnd = clipTimelineEnd(clip);
    const cutAt = playheadRef.current;
    if (cutAt <= clip.timelineStart + 0.05 || cutAt >= clipEnd - 0.05) return;

    pauseIfPlaying();
    const splitSourceTime = clip.sourceStart + (cutAt - clip.timelineStart);

    const leftClip: Clip = { ...clip, sourceEnd: splitSourceTime, fadeOut: 0, outroType: 'none' };
    const rightClip: Clip = {
      ...clip,
      id: makeId(),
      sourceStart: splitSourceTime,
      timelineStart: cutAt,
      fadeIn: 0,
      introType: 'none',
    };

    history.commit((prev) => prev.flatMap((c) => (c.id === clip.id ? [leftClip, rightClip] : [c])));
    setSelectedClipId(rightClip.id);
  }

  function handleDuplicate(targetId?: string) {
    const id = targetId ?? selectedClipId;
    if (!id) return;
    const clip = findClip(id);
    if (!clip) return;
    pauseIfPlaying();
    const copy: Clip = { ...clip, id: makeId(), timelineStart: clipTimelineEnd(clip) };
    history.commit((prev) => [...prev, copy]);
    setSelectedClipId(copy.id);
  }

  function handleDelete(targetId?: string) {
    const id = targetId ?? selectedClipId;
    if (!id) return;
    pauseIfPlaying();
    history.commit((prev) => prev.filter((c) => c.id !== id));
    if (id === selectedClipId) setSelectedClipId(null);
  }

  function handleLongPressClip(id: string, x: number, y: number) {
    setSelectedClipId(id);
    setContextMenu({ clipId: id, x, y });
  }

  function openClipSheet(type: 'clipVolume' | 'clipEffects' | 'intro' | 'outro') {
    beginGesture();
    setSheet({ type });
  }

  function closeClipSheetApply() {
    endGesture();
    setSheet(null);
  }

  function closeClipSheetCancel() {
    cancelGesture();
    setSheet(null);
  }

  function handleTrackVolumeChange(trackId: number, volume: number) {
    setTracks((prev) => prev.map((t, i) => (i === trackId ? { ...t, volume } : t)));
  }

  function handleTrackMuteToggle(trackId: number) {
    setTracks((prev) => prev.map((t, i) => (i === trackId ? { ...t, muted: !t.muted } : t)));
  }

  function handleTrackFxChange(trackId: number, effects: EffectParams) {
    setTracks((prev) => prev.map((t, i) => (i === trackId ? { ...t, effects } : t)));
  }

  function findFirstClipOnTrack(trackId: number): Clip | undefined {
    return clipsRef.current.find((c) => c.trackId === trackId);
  }

  async function handleNewProject() {
    if (clipsRef.current.length > 0 && !window.confirm('Commencer un nouveau projet ? Le projet actuel sera remplacé.')) {
      return;
    }
    pauseIfPlaying();
    history.replace([]);
    setSources(new Map());
    setSelectedClipId(null);
    setActiveTrackId(0);
    setSheet(null);
  }

  async function handleResetProject() {
    pauseIfPlaying();
    history.replace([]);
    setSources(new Map());
    setTracks([defaultTrackState(), defaultTrackState(), defaultTrackState()]);
    setSelectedClipId(null);
    setActiveTrackId(0);
    persistedSourceIdsRef.current = new Set();
    setSheet(null);
    try {
      await clearProject();
    } catch (err) {
      console.error('Erreur en réinitialisant le projet sauvegardé', err);
    }
  }

  async function handleRenderExport(
    name: string,
    format: 'wav' | 'mp3',
    sampleRate: number,
    bitrateKbps: number,
    onProgress: (p: number) => void
  ) {
    pauseIfPlaying();
    // MP3 has two real phases (mix render, then encode) — split the bar honestly between them.
    const renderWeight = format === 'mp3' ? 0.5 : 1;
    const mixBuffer = await renderMix(clipsRef.current, sourcesRef.current, tracksRef.current, sampleRate, (p) =>
      onProgress(p * renderWeight)
    );

    if (format === 'wav') {
      const blob = audioBufferToWav(mixBuffer);
      return { blob, filename: `${sanitizeFilename(name)}.wav`, mimeType: 'audio/wav' as const };
    }

    const blob = await encodeMp3(mixBuffer, bitrateKbps, (p) => onProgress(0.5 + p * 0.5));
    return { blob, filename: `${sanitizeFilename(name)}.mp3`, mimeType: 'audio/mpeg' as const };
  }

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;
  const selectedSource = selectedClip ? sources.get(selectedClip.sourceId) : undefined;

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
      <audio ref={bgAudioRef} src={SILENT_KEEPALIVE_SRC} loop playsInline preload="auto" hidden />


      <div className="topbar">
        <div className="app-logo">
          <svg className="app-logo-icon" width="22" height="20" viewBox="0 0 22 20" fill="none" aria-hidden="true">
            <rect x="0" y="7" width="3" height="6" rx="1.5" fill="#ff5a36" />
            <rect x="6" y="3" width="3" height="14" rx="1.5" fill="#fff" />
            <rect x="12" y="0" width="3" height="20" rx="1.5" fill="#ff5a36" />
            <rect x="18" y="5" width="3" height="10" rx="1.5" fill="#fff" />
          </svg>
          <span className="app-logo-text">
            <span className="app-logo-audio">Audio</span>
            <span className="app-logo-cut">Cut</span>
          </span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Annuler">
            ↺
          </button>
          <button className="btn btn-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Rétablir">
            ↻
          </button>
          <button className="btn btn-icon" onClick={() => setSheet({ type: 'settings' })} aria-label="Réglages">
            ⚙
          </button>
          <button className="btn btn-export" onClick={() => setSheet({ type: 'export' })} disabled={clips.length === 0}>
            Exporter
          </button>
        </div>
      </div>

      <div className="timeline-container">
        <Timeline
          clips={clips}
          sources={sources}
          tracks={tracks}
          pxPerSec={pxPerSec}
          onZoomChange={setPxPerSec}
          playheadTime={playheadTime}
          isPlaying={isPlaying}
          selectedClipId={selectedClipId}
          activeTrackId={activeTrackId}
          onSelectClip={setSelectedClipId}
          onSeek={handleSeek}
          onScrubPreview={setScrubPreviewTime}
          onMoveClip={handleMoveClip}
          onTrimLeft={handleTrimLeft}
          onTrimRight={handleTrimRight}
          onDragStart={beginGesture}
          onDragEnd={endGesture}
          onLongPressClip={handleLongPressClip}
          onTrackVolume={(trackId) => setSheet({ type: 'trackVolume', trackId })}
          onTrackMuteToggle={handleTrackMuteToggle}
          onTrackFx={(trackId) => setSheet({ type: 'trackFx', trackId })}
          onQuickAddTrack={handlePickTrack}
        />
      </div>

      <TransportBar
        isPlaying={isPlaying}
        currentTime={scrubPreviewTime ?? playheadTime}
        totalTime={totalDuration}
        onPlayPause={handlePlayPause}
        onSeek={handleSeek}
        onSkip={handleSkip}
      />

      <div className="bottombar">
        {selectedClip ? (
          <ClipToolbar
            onSplit={() => handleSplit()}
            onVolume={() => openClipSheet('clipVolume')}
            onIntro={() => openClipSheet('intro')}
            onOutro={() => openClipSheet('outro')}
            onEffects={() => openClipSheet('clipEffects')}
            onDuplicate={() => handleDuplicate()}
            onDelete={() => handleDelete()}
          />
        ) : (
          <div className="idle-toolbar">
            <button className="btn btn-add" onClick={handleAddAudioClick}>+ Audio</button>
            <button
              className={`btn btn-icon-compact ${magnetEnabled ? 'btn-toggle-on' : ''}`}
              onClick={() => setMagnetEnabled((v) => !v)}
              aria-label="Magnet"
            >
              🧲
            </button>
            <button className="btn btn-compact" onClick={() => setSheet({ type: 'project' })}>Projet</button>
          </div>
        )}
      </div>

      {sheet?.type === 'trackPicker' && (
        <div className="sheet-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <div className="sheet-header">
              <span className="sheet-title">Ajouter à la piste</span>
              <button className="sheet-close" onClick={() => setSheet(null)} aria-label="Fermer">×</button>
            </div>
            <div className="sheet-body">
              {TRACK_NAMES.map((name, i) => (
                <button key={i} className="sheet-menu-row" onClick={() => handlePickTrack(i)}>
                  <span>{name}</span>
                  <span className="sheet-menu-chevron">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sheet?.type === 'trackVolume' && (
        <TrackVolumeSheet
          label={TRACK_NAMES[sheet.trackId]}
          hint="S'applique à tous les clips de cette piste, en plus du volume individuel de chaque clip."
          initialVolume={tracks[sheet.trackId].volume}
          onChange={(v) => handleTrackVolumeChange(sheet.trackId, v)}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'trackFx' && (() => {
        const trackId = sheet.trackId;
        const sample = findFirstClipOnTrack(trackId);
        const sampleSource = sample ? sources.get(sample.sourceId) : undefined;
        return (
          <EffectsSheet
            title={`Effets de piste — ${TRACK_NAMES[trackId]}`}
            initialEffects={tracks[trackId].effects}
            onChange={(fx) => handleTrackFxChange(trackId, fx)}
            onClose={() => setSheet(null)}
            previewSource={sample && sampleSource ? { buffer: sampleSource.buffer, start: sample.sourceStart, end: sample.sourceEnd } : null}
            previewPlayer={previewPlayer}
          />
        );
      })()}

      {sheet?.type === 'clipVolume' && selectedClip && (
        <TrackVolumeSheet
          label="Clip"
          initialVolume={selectedClip.volume}
          onChange={(v) => updateClipLive(selectedClip.id, { volume: v })}
          onClose={closeClipSheetApply}
        />
      )}

      {sheet?.type === 'clipEffects' && selectedClip && selectedSource && (
        <EffectsSheet
          title="Effets du clip"
          initialEffects={selectedClip.effects}
          onChange={(fx) => updateClipLive(selectedClip.id, { effects: fx })}
          onClose={closeClipSheetApply}
          previewSource={{ buffer: selectedSource.buffer, start: selectedClip.sourceStart, end: selectedClip.sourceEnd }}
          previewPlayer={previewPlayer}
        />
      )}

      {sheet?.type === 'intro' && selectedClip && selectedSource && (
        <IntroOutroSheet
          mode="intro"
          clip={selectedClip}
          source={selectedSource}
          ctx={engine.ctx}
          onChange={(type, duration) => updateClipLive(selectedClip.id, { introType: type as IntroType, fadeIn: duration })}
          onClose={closeClipSheetApply}
        />
      )}

      {sheet?.type === 'outro' && selectedClip && selectedSource && (
        <IntroOutroSheet
          mode="outro"
          clip={selectedClip}
          source={selectedSource}
          ctx={engine.ctx}
          onChange={(type, duration) => updateClipLive(selectedClip.id, { outroType: type as OutroType, fadeOut: duration })}
          onClose={closeClipSheetApply}
        />
      )}

      {sheet?.type === 'export' && (
        <ExportSheet onRender={handleRenderExport} onClose={() => setSheet(null)} />
      )}

      {sheet?.type === 'project' && (
        <ProjectMenuSheet
          onNewProject={handleNewProject}
          onResetProject={handleResetProject}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'settings' && (
        <SettingsSheet
          autosaveEnabled={autosaveEnabled}
          onToggleAutosave={() => setAutosaveEnabled((v) => !v)}
          onClose={() => setSheet(null)}
        />
      )}

      {contextMenu && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSplit={() => handleSplit(contextMenu.clipId)}
          onDuplicate={() => handleDuplicate(contextMenu.clipId)}
          onDelete={() => handleDelete(contextMenu.clipId)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
