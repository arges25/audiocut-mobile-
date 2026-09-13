import type { AudioSource, Clip, EffectParams, TrackState } from '../types';
import { TRACK_NAMES, clipDuration, clipTimelineEnd } from '../types';
import { TABS, EffectFields } from './sheets/EffectsSheet';
import { TRACK_ACCENTS } from './ClipView';

export type PanelView = 'clip' | 'trackFx' | 'library' | 'monitoring' | 'home';

interface RecentSource {
  id: string;
  name: string;
  duration: number;
}

interface Props {
  view: PanelView;
  sources: Map<string, AudioSource>;
  clips: Clip[];
  tracks: TrackState[];
  activeTrackId: number;
  selectedClip: Clip | null;
  selectedSource: AudioSource | undefined;
  trackFxId: number | null;
  playheadTime: number;
  totalDuration: number;
  previewingSourceId: string | null;
  onCloseTrackFx: () => void;
  onOpenLibrary: () => void;
  onCloseLibrary: () => void;
  onTrackFxChange: (trackId: number, fx: EffectParams) => void;
  onSplit: () => void;
  onVolume: () => void;
  onIntro: () => void;
  onOutro: () => void;
  onEffects: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddAudioClick: () => void;
  onPreviewSource: (sourceId: string) => void;
  onAddExistingSource: (sourceId: string) => void;
  onQuickTrackFx: (effectKey: 'reverb' | 'echo') => void;
  onQuickIntroOutro: (mode: 'intro' | 'outro') => void;
  hasActiveTrackClip: boolean;
}

export default function ContextPanel(props: Props) {
  const { view } = props;
  if (view === 'clip' && props.selectedClip && props.selectedSource) {
    return <ClipInspector {...props} clip={props.selectedClip} source={props.selectedSource} />;
  }
  if (view === 'trackFx' && props.trackFxId !== null) {
    return <TrackFxPanel {...props} trackId={props.trackFxId} />;
  }
  if (view === 'library') {
    return <LibraryView {...props} />;
  }
  if (view === 'monitoring') {
    return <MonitoringView {...props} />;
  }
  return <HomeView {...props} />;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function recentSources(sources: Map<string, AudioSource>, limit: number): RecentSource[] {
  const all = Array.from(sources.values());
  return all
    .slice(-limit)
    .reverse()
    .map((s) => ({ id: s.id, name: s.name, duration: s.buffer.duration }));
}

function activeEffectRows(effects: EffectParams): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (effects.reverb.enabled) rows.push({ label: 'Reverb', value: `${Math.round(effects.reverb.mix * 100)}%` });
  if (effects.echo.enabled) rows.push({ label: 'Echo', value: `${Math.round(effects.echo.mix * 100)}%` });
  if (effects.delay.enabled) rows.push({ label: 'Delay', value: `${Math.round(effects.delay.mix * 100)}%` });
  if (effects.bassBoost.enabled) rows.push({ label: 'Bass', value: `${Math.round(effects.bassBoost.intensity * 100)}%` });
  if (effects.treble.enabled) rows.push({ label: 'Treble', value: `${Math.round(effects.treble.intensity * 100)}%` });
  if (effects.lowPass.enabled) rows.push({ label: 'Low Pass', value: `${Math.round(effects.lowPass.frequency)} Hz` });
  if (effects.highPass.enabled) rows.push({ label: 'High Pass', value: `${Math.round(effects.highPass.frequency)} Hz` });
  if (effects.stereoWidth.enabled) rows.push({ label: 'Stereo Width', value: `${Math.round(effects.stereoWidth.amount * 100)}%` });
  return rows;
}

function SourceRow({
  name,
  duration,
  isPreviewing,
  onPreview,
  onAdd,
}: {
  name: string;
  duration: number;
  isPreviewing: boolean;
  onPreview: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="cp-list-item">
      <div className="cp-list-item-info">
        <span className="cp-list-item-name">{name}</span>
        <span className="cp-list-item-meta">{fmt(duration)}</span>
      </div>
      <div className="cp-list-item-actions">
        <button className={`cp-icon-btn ${isPreviewing ? 'cp-icon-btn-active' : ''}`} onClick={onPreview} aria-label={`Aperçu ${name}`}>
          {isPreviewing ? '⏸' : '▶'}
        </button>
        <button className="cp-icon-btn" onClick={onAdd} aria-label={`Ajouter ${name}`}>
          +
        </button>
      </div>
    </div>
  );
}

function HomeView(props: Props) {
  const { sources, previewingSourceId } = props;
  const recents = recentSources(sources, 5);
  const activeTrackFx = props.tracks[props.activeTrackId]?.effects;
  return (
    <div className="context-panel">
      <div className="cp-section">
        <p className="cp-subtitle">Ajouter un son</p>
        <div className="cp-card-row">
          {TRACK_NAMES.map((name, i) => (
            <button key={i} className="cp-card" onClick={props.onAddAudioClick}>
              <span className="cp-card-icon">{i === 0 ? '🎵' : i === 1 ? '✨' : '🎙'}</span>
              <span className="cp-card-label">{name}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTrackFx && (
        <div className="cp-section">
          <p className="cp-subtitle">Effets rapides</p>
          <div className="cp-shortcuts-row">
            <button
              className={`cp-shortcut-btn ${activeTrackFx.reverb.enabled ? 'cp-shortcut-btn-active' : ''}`}
              onClick={() => props.onQuickTrackFx('reverb')}
            >
              🌊 Reverb
            </button>
            <button
              className={`cp-shortcut-btn ${activeTrackFx.echo.enabled ? 'cp-shortcut-btn-active' : ''}`}
              onClick={() => props.onQuickTrackFx('echo')}
            >
              🔁 Echo
            </button>
            {props.hasActiveTrackClip && (
              <>
                <button className="cp-shortcut-btn" onClick={() => props.onQuickIntroOutro('intro')}>
                  ↗ Intro
                </button>
                <button className="cp-shortcut-btn" onClick={() => props.onQuickIntroOutro('outro')}>
                  ↘ Outro
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="cp-section">
        <div className="cp-header">
          <p className="cp-subtitle" style={{ margin: 0 }}>Sons récents</p>
          {sources.size > 0 && (
            <button className="cp-back-btn" onClick={props.onOpenLibrary}>Bibliothèque</button>
          )}
        </div>
        {recents.length === 0 ? (
          <p className="cp-empty">Aucun son importé pour le moment.</p>
        ) : (
          <div className="cp-list">
            {recents.map((s) => (
              <SourceRow
                key={s.id}
                name={s.name}
                duration={s.duration}
                isPreviewing={previewingSourceId === s.id}
                onPreview={() => props.onPreviewSource(s.id)}
                onAdd={() => props.onAddExistingSource(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClipInspector(props: Props & { clip: Clip; source: AudioSource }) {
  const { clip, source } = props;
  const rows = activeEffectRows(clip.effects);
  if (clip.fadeIn > 0) rows.push({ label: 'Fade In', value: `${clip.fadeIn.toFixed(1)} s` });
  if (clip.fadeOut > 0) rows.push({ label: 'Fade Out', value: `${clip.fadeOut.toFixed(1)} s` });
  const accent = TRACK_ACCENTS[clip.trackId] ?? TRACK_ACCENTS[0];

  return (
    <div className="context-panel">
      <div className="cp-header">
        <span className="cp-title">{source.name}</span>
        <span className="cp-clip-track-badge" style={{ ['--track-accent' as string]: accent }}>
          {TRACK_NAMES[clip.trackId]}
        </span>
      </div>

      <div className="cp-meta-grid">
        <div className="cp-meta-cell">
          <span className="cp-meta-label">Durée</span>
          <span className="cp-meta-value">{fmt(clipDuration(clip))}</span>
        </div>
        <div className="cp-meta-cell">
          <span className="cp-meta-label">Début</span>
          <span className="cp-meta-value">{fmt(clip.timelineStart)}</span>
        </div>
        <div className="cp-meta-cell">
          <span className="cp-meta-label">Fin</span>
          <span className="cp-meta-value">{fmt(clipTimelineEnd(clip))}</span>
        </div>
        <div className="cp-meta-cell">
          <span className="cp-meta-label">Piste</span>
          <span className="cp-meta-value">{TRACK_NAMES[clip.trackId]}</span>
        </div>
      </div>

      <div className="cp-shortcuts-row">
        <button className="cp-shortcut-btn" onClick={props.onSplit}>✂️ Diviser</button>
        <button className="cp-shortcut-btn" onClick={props.onVolume}>🔊 Volume</button>
        <button className="cp-shortcut-btn" onClick={props.onIntro}>↗ Intro</button>
        <button className="cp-shortcut-btn" onClick={props.onOutro}>↘ Outro</button>
        <button className="cp-shortcut-btn" onClick={props.onEffects}>✨ Effets</button>
        <button className="cp-shortcut-btn" onClick={props.onDuplicate}>⧉ Dupliquer</button>
      </div>

      <div className="cp-section">
        <p className="cp-subtitle">Traitements actifs</p>
        {rows.length === 0 ? (
          <p className="cp-empty">Aucun traitement appliqué à ce clip.</p>
        ) : (
          <div className="cp-list">
            {rows.map((r) => (
              <div key={r.label} className="cp-active-fx-row">
                <span className="cp-active-fx-name">{r.label}</span>
                <span className="cp-active-fx-value">{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="cp-danger-btn" onClick={props.onDelete}>
        🗑 Supprimer le clip
      </button>
    </div>
  );
}

function TrackFxPanel(props: Props & { trackId: number }) {
  const { trackId, tracks, onTrackFxChange } = props;
  const effects = tracks[trackId].effects;

  function update(next: EffectParams) {
    onTrackFxChange(trackId, next);
  }

  return (
    <div className="context-panel">
      <div className="cp-header">
        <span className="cp-title">FX — {TRACK_NAMES[trackId]}</span>
        <button className="cp-back-btn" onClick={props.onCloseTrackFx}>Fermer</button>
      </div>
      <div className="fx-tabs">
        {TABS.map((t) => (
          <TrackFxTab key={t.key} label={t.label} enabled={effects[t.key].enabled} />
        ))}
      </div>
      {TABS.map((t) => (
        <TrackFxSection key={t.key} label={t.label} effectKey={t.key} effects={effects} onUpdate={update} />
      ))}
    </div>
  );
}

/** Read-only dot in the tab strip (the inline panel shows every effect stacked, not one tab at a time). */
function TrackFxTab({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span className={`fx-tab ${enabled ? 'fx-tab-active' : ''}`} style={{ pointerEvents: 'none' }}>
      {label}
      {enabled && <span className="fx-tab-dot" />}
    </span>
  );
}

function TrackFxSection({
  label,
  effectKey,
  effects,
  onUpdate,
}: {
  label: string;
  effectKey: keyof EffectParams;
  effects: EffectParams;
  onUpdate: (next: EffectParams) => void;
}) {
  const enabled = effects[effectKey].enabled;
  return (
    <div className={`effect-row ${enabled ? 'effect-row-enabled' : ''}`}>
      <div className="effect-row-header">
        <span className="effect-row-title">{label}</span>
        <span
          className={`switch ${enabled ? 'switch-on' : ''}`}
          onClick={() => onUpdate({ ...effects, [effectKey]: { ...effects[effectKey], enabled: !enabled } })}
        >
          <span className="switch-knob" />
        </span>
      </div>
      {enabled && (
        <div className="effect-row-body">
          <EffectFields effectKey={effectKey} effects={effects} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

function LibraryView(props: Props) {
  const { sources, previewingSourceId } = props;
  const all = Array.from(sources.values());
  return (
    <div className="context-panel">
      <div className="cp-header">
        <span className="cp-title">Bibliothèque</span>
        <button className="cp-back-btn" onClick={props.onCloseLibrary}>Fermer</button>
      </div>
      {all.length === 0 ? (
        <p className="cp-empty">Aucun son importé pour le moment.</p>
      ) : (
        <div className="cp-list">
          {all.map((s) => (
            <SourceRow
              key={s.id}
              name={s.name}
              duration={s.buffer.duration}
              isPreviewing={previewingSourceId === s.id}
              onPreview={() => props.onPreviewSource(s.id)}
              onAdd={() => props.onAddExistingSource(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Cheap, non-audio-graph approximation: sums the volume of whatever clips are
 * sounding at the current playhead position. No AnalyserNode, no extra audio
 * taps — real analysis would touch the shared playback graph for a purely
 * decorative meter, which isn't worth the risk or the CPU on an iPhone. */
function computeLevels(clips: Clip[], tracks: TrackState[], t: number): { l: number; r: number } {
  let sum = 0;
  for (const c of clips) {
    if (t >= c.timelineStart && t < clipTimelineEnd(c)) {
      const track = tracks[c.trackId];
      if (track && !track.muted) sum += c.volume * track.volume;
    }
  }
  const level = Math.max(0, Math.min(1, sum / 2));
  const jitter = Math.sin(t * 13) * 0.08;
  return { l: Math.max(0.03, Math.min(1, level + jitter)), r: Math.max(0.03, Math.min(1, level - jitter)) };
}

function MonitoringView(props: Props) {
  const { l, r } = computeLevels(props.clips, props.tracks, props.playheadTime);
  return (
    <div className="context-panel">
      <div className="cp-monitor">
        <span className="cp-monitor-label">Lecture en cours</span>
        <span className="cp-monitor-time">
          {fmt(props.playheadTime)} / {fmt(props.totalDuration)}
        </span>
        <div className="cp-meter">
          <div className="cp-meter-row">
            <span className="cp-meter-channel">L</span>
            <div className="cp-meter-track">
              <div className="cp-meter-fill" style={{ width: `${l * 100}%` }} />
            </div>
          </div>
          <div className="cp-meter-row">
            <span className="cp-meter-channel">R</span>
            <div className="cp-meter-track">
              <div className="cp-meter-fill" style={{ width: `${r * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
