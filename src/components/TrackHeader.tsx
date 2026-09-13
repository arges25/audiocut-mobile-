import type { TrackState } from '../types';

interface Props {
  name: string;
  track: TrackState;
  isActive: boolean;
  height: number;
  onVolume: () => void;
  onToggleMute: () => void;
  onFx: () => void;
}

export default function TrackHeader({ name, track, isActive, height, onVolume, onToggleMute, onFx }: Props) {
  const fxActive = Object.values(track.effects).some((e) => e.enabled);
  return (
    <div className={`track-header ${isActive ? 'track-header-active' : ''}`} style={{ height }}>
      <span className="track-header-name">{name}</span>
      <div className="track-header-buttons">
        <button className="track-header-btn" onClick={onVolume} aria-label={`Volume ${name}`}>
          {track.volume > 1 ? '🔊' : track.volume > 0 ? '🔉' : '🔈'}
        </button>
        <button
          className={`track-header-btn ${track.muted ? 'track-header-btn-active' : ''}`}
          onClick={onToggleMute}
          aria-label={`Muet ${name}`}
        >
          M
        </button>
        <button className={`track-header-btn ${fxActive ? 'track-header-btn-active' : ''}`} onClick={onFx} aria-label={`Effets ${name}`}>
          FX
        </button>
      </div>
    </div>
  );
}
