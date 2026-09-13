interface Props {
  isPlaying: boolean;
  currentTime: number;
  totalTime: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (deltaSeconds: number) => void;
}

export default function TransportBar({ isPlaying, currentTime, totalTime, onPlayPause, onSeek, onSkip }: Props) {
  return (
    <div className="transport">
      <button className="btn btn-transport-icon" onClick={() => onSeek(0)} aria-label="Retour au début">
        |◀
      </button>
      <button className="btn btn-transport-icon" onClick={() => onSkip(-5)} aria-label="Reculer de 5 secondes">
        -5s
      </button>
      <button className="btn btn-play" onClick={onPlayPause} aria-label={isPlaying ? 'Pause' : 'Lecture'}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="btn btn-transport-icon" onClick={() => onSkip(5)} aria-label="Avancer de 5 secondes">
        +5s
      </button>
      <button className="btn btn-transport-icon" onClick={() => onSeek(totalTime)} aria-label="Aller à la fin">
        ▶|
      </button>
      <span className="time-display">
        {formatTime(currentTime)} / {formatTime(totalTime)}
      </span>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}
