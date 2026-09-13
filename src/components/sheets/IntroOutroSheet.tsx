import { useEffect, useRef, useState } from 'react';
import type { AudioSource, Clip, IntroType, OutroType } from '../../types';
import { clipDuration } from '../../types';
import BottomSheet from '../BottomSheet';
import SheetSlider from './SheetSlider';
import { scheduleClip } from '../../audio/graph';

const INTRO_OPTIONS: { value: IntroType; label: string; icon: string; defaultDuration?: number }[] = [
  { value: 'none', label: 'Aucun', icon: '🚫' },
  { value: 'fadeIn', label: 'Fade In', icon: '↗', defaultDuration: 1 },
  { value: 'fadeInFast', label: 'Fade In rapide', icon: '⚡', defaultDuration: 0.3 },
  { value: 'fadeInSlow', label: 'Fade In lent', icon: '🐢', defaultDuration: 3 },
  { value: 'volumeRamp', label: 'Volume progressif', icon: '🔊', defaultDuration: 2 },
  { value: 'filterRamp', label: 'Filtre progressif', icon: '🎛', defaultDuration: 2 },
];

const OUTRO_OPTIONS: { value: OutroType; label: string; icon: string; defaultDuration?: number }[] = [
  { value: 'none', label: 'Aucun', icon: '🚫' },
  { value: 'fadeOut', label: 'Fade Out', icon: '↘', defaultDuration: 1 },
  { value: 'fadeOutFast', label: 'Fade Out rapide', icon: '⚡', defaultDuration: 0.3 },
  { value: 'fadeOutSlow', label: 'Fade Out lent', icon: '🐢', defaultDuration: 3 },
  { value: 'echoTail', label: 'Echo final', icon: '🔁', defaultDuration: 0.5 },
  { value: 'reverbTail', label: 'Reverb finale', icon: '🌊', defaultDuration: 0.5 },
  { value: 'filterRamp', label: 'Filtre progressif', icon: '🎛', defaultDuration: 2 },
  { value: 'disappear', label: 'Disparition progressive', icon: '🌫', defaultDuration: 2 },
];

const DURATION_PRESETS = [0.1, 0.5, 1, 2, 3, 5, 10];

interface Props {
  mode: 'intro' | 'outro';
  clip: Clip;
  source: AudioSource;
  ctx: AudioContext;
  onChange: (type: IntroType | OutroType, duration: number) => void;
  onClose: () => void;
}

export default function IntroOutroSheet({ mode, clip, source, ctx, onChange, onClose }: Props) {
  const initialType = mode === 'intro' ? clip.introType : clip.outroType;
  const initialDuration = mode === 'intro' ? clip.fadeIn : clip.fadeOut;
  const [type, setType] = useState<IntroType | OutroType>(initialType);
  const [duration, setDuration] = useState(initialDuration);
  const [previewing, setPreviewing] = useState(false);
  const activeRef = useRef<{ bufferSource: AudioBufferSourceNode; nodes: AudioNode[] } | null>(null);
  const options = mode === 'intro' ? INTRO_OPTIONS : OUTRO_OPTIONS;
  const maxDuration = Math.min(10, clipDuration(clip));

  function stopPreview() {
    const active = activeRef.current;
    if (active) {
      try { active.bufferSource.stop(); } catch { /* already stopped */ }
      active.bufferSource.disconnect();
      for (const n of active.nodes) {
        try { n.disconnect(); } catch { /* ignore */ }
      }
      activeRef.current = null;
    }
    setPreviewing(false);
  }

  function playPreview(t: IntroType | OutroType, d: number) {
    stopPreview();
    const windowSeconds = Math.min(clipDuration(clip), Math.max(d + 0.5, 1.5));
    const previewClip: Clip = mode === 'intro'
      ? { ...clip, sourceStart: clip.sourceStart, sourceEnd: clip.sourceStart + windowSeconds, timelineStart: 0, fadeIn: d, introType: t as IntroType, outroType: 'none' }
      : { ...clip, sourceStart: Math.max(clip.sourceStart, clip.sourceEnd - windowSeconds), sourceEnd: clip.sourceEnd, timelineStart: 0, fadeOut: d, outroType: t as OutroType, introType: 'none' };

    const scheduled = scheduleClip({ ctx, clip: previewClip, source, trackInput: ctx.destination, when: ctx.currentTime + 0.05, offsetIntoClip: 0 });
    if (scheduled) {
      activeRef.current = scheduled;
      setPreviewing(true);
      scheduled.bufferSource.onended = () => {
        if (activeRef.current?.bufferSource === scheduled.bufferSource) {
          activeRef.current = null;
          setPreviewing(false);
        }
      };
    }
  }

  useEffect(() => () => stopPreview(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectType(next: IntroType | OutroType) {
    setType(next);
    const preset = options.find((o) => o.value === next)?.defaultDuration;
    const nextDuration = next === 'none' ? duration : preset ?? duration;
    if (preset !== undefined) setDuration(nextDuration);
  }

  function handleCancel() {
    stopPreview();
    onClose();
  }

  function handleApply() {
    stopPreview();
    onChange(type, duration);
    onClose();
  }

  return (
    <BottomSheet
      title={mode === 'intro' ? 'Intro' : 'Outro'}
      onClose={handleCancel}
      footer={
        <>
          <button className="btn sheet-btn-secondary" onClick={handleCancel}>Annuler</button>
          <button className="btn sheet-btn-primary" onClick={handleApply}>Appliquer</button>
        </>
      }
    >
      <div className="option-grid">
        {options.map((o) => (
          <button
            key={o.value}
            className={`option-card ${type === o.value ? 'option-card-selected' : ''}`}
            onClick={() => selectType(o.value)}
          >
            <span className="option-card-icon">{o.icon}</span>
            <span className="option-card-label">{o.label}</span>
          </button>
        ))}
      </div>

      {type !== 'none' && (
        <>
          <SheetSlider
            label="Durée"
            value={duration}
            min={0.1}
            max={maxDuration}
            step={0.1}
            displayValue={`${duration.toFixed(1)}s`}
            onChange={setDuration}
          />
          <div className="chip-row">
            {DURATION_PRESETS.filter((p) => p <= maxDuration).map((p) => (
              <button key={p} className={`chip chip-small ${Math.abs(duration - p) < 0.01 ? 'chip-selected' : ''}`} onClick={() => setDuration(p)}>
                {p}s
              </button>
            ))}
          </div>
          {(type === 'echoTail' || type === 'reverbTail') && (
            <p className="sheet-hint">
              La queue de {type === 'echoTail' ? "l'écho" : 'la reverb'} continue après la fin du clip et est incluse dans l'export.
            </p>
          )}
        </>
      )}

      <button className="sheet-preview-btn" onClick={() => (previewing ? stopPreview() : playPreview(type, duration))}>
        {previewing ? '⏸ Arrêter l’aperçu' : '▶ Aperçu'}
      </button>
    </BottomSheet>
  );
}
