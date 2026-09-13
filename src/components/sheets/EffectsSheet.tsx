import { useEffect, useState } from 'react';
import type { EffectParams } from '../../types';
import BottomSheet from '../BottomSheet';
import SheetSlider from './SheetSlider';
import { EffectPreviewPlayer } from '../../audio/preview';

interface PreviewSource {
  buffer: AudioBuffer;
  start: number;
  end: number;
}

interface Props {
  title: string;
  initialEffects: EffectParams;
  onChange: (effects: EffectParams) => void;
  onClose: () => void;
  previewSource: PreviewSource | null;
  previewPlayer: EffectPreviewPlayer;
}

export default function EffectsSheet({ title, initialEffects, onChange, onClose, previewSource, previewPlayer }: Props) {
  const [effects, setEffects] = useState(initialEffects);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    return () => previewPlayer.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: EffectParams) {
    setEffects(next);
    onChange(next);
    if (previewing && previewSource) {
      previewPlayer.update(previewSource.buffer, previewSource.start, previewSource.end, next);
    }
  }

  function togglePreview() {
    if (!previewSource) return;
    if (previewing) {
      previewPlayer.stop();
      setPreviewing(false);
    } else {
      previewPlayer.start(previewSource.buffer, previewSource.start, previewSource.end, effects);
      setPreviewing(true);
    }
  }

  function handleCancel() {
    previewPlayer.stop();
    onChange(initialEffects);
    onClose();
  }

  function handleApply() {
    previewPlayer.stop();
    onClose();
  }

  return (
    <BottomSheet
      title={title}
      onClose={handleCancel}
      footer={
        <>
          <button className="btn sheet-btn-secondary" onClick={handleCancel}>Annuler</button>
          <button className="btn sheet-btn-primary" onClick={handleApply}>Appliquer</button>
        </>
      }
    >
      <button className="sheet-preview-btn" onClick={togglePreview} disabled={!previewSource}>
        {previewing ? '⏸ Arrêter l’aperçu' : '▶ Aperçu'}
      </button>

      <EffectRow
        title="Reverb"
        enabled={effects.reverb.enabled}
        onToggle={(v) => update({ ...effects, reverb: { ...effects.reverb, enabled: v } })}
      >
        <SheetSlider label="Mix" value={effects.reverb.mix} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.reverb.mix * 100)}%`}
          onChange={(v) => update({ ...effects, reverb: { ...effects.reverb, mix: v } })} />
        <SheetSlider label="Taille" value={effects.reverb.size} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.reverb.size * 100)}%`}
          onChange={(v) => update({ ...effects, reverb: { ...effects.reverb, size: v } })} />
      </EffectRow>

      <EffectRow
        title="Echo"
        enabled={effects.echo.enabled}
        onToggle={(v) => update({ ...effects, echo: { ...effects.echo, enabled: v } })}
      >
        <SheetSlider label="Mix" value={effects.echo.mix} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.echo.mix * 100)}%`}
          onChange={(v) => update({ ...effects, echo: { ...effects.echo, mix: v } })} />
        <SheetSlider label="Délai" value={effects.echo.delay} min={0.02} max={0.5} step={0.01}
          displayValue={`${Math.round(effects.echo.delay * 1000)}ms`}
          onChange={(v) => update({ ...effects, echo: { ...effects.echo, delay: v } })} />
        <SheetSlider label="Feedback" value={effects.echo.feedback} min={0} max={0.9} step={0.01}
          displayValue={`${Math.round(effects.echo.feedback * 100)}%`}
          onChange={(v) => update({ ...effects, echo: { ...effects.echo, feedback: v } })} />
      </EffectRow>

      <EffectRow
        title="Delay"
        enabled={effects.delay.enabled}
        onToggle={(v) => update({ ...effects, delay: { ...effects.delay, enabled: v } })}
      >
        <SheetSlider label="Temps" value={effects.delay.time} min={0.05} max={1.5} step={0.01}
          displayValue={`${Math.round(effects.delay.time * 1000)}ms`}
          onChange={(v) => update({ ...effects, delay: { ...effects.delay, time: v } })} />
        <SheetSlider label="Feedback" value={effects.delay.feedback} min={0} max={0.9} step={0.01}
          displayValue={`${Math.round(effects.delay.feedback * 100)}%`}
          onChange={(v) => update({ ...effects, delay: { ...effects.delay, feedback: v } })} />
        <SheetSlider label="Mix" value={effects.delay.mix} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.delay.mix * 100)}%`}
          onChange={(v) => update({ ...effects, delay: { ...effects.delay, mix: v } })} />
      </EffectRow>

      <EffectRow
        title="Bass Boost"
        enabled={effects.bassBoost.enabled}
        onToggle={(v) => update({ ...effects, bassBoost: { ...effects.bassBoost, enabled: v } })}
      >
        <SheetSlider label="Intensité" value={effects.bassBoost.intensity} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.bassBoost.intensity * 100)}%`}
          onChange={(v) => update({ ...effects, bassBoost: { ...effects.bassBoost, intensity: v } })} />
      </EffectRow>

      <EffectRow
        title="Treble"
        enabled={effects.treble.enabled}
        onToggle={(v) => update({ ...effects, treble: { ...effects.treble, enabled: v } })}
      >
        <SheetSlider label="Intensité" value={effects.treble.intensity} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.treble.intensity * 100)}%`}
          onChange={(v) => update({ ...effects, treble: { ...effects.treble, intensity: v } })} />
      </EffectRow>

      <EffectRow
        title="Low Pass"
        enabled={effects.lowPass.enabled}
        onToggle={(v) => update({ ...effects, lowPass: { ...effects.lowPass, enabled: v } })}
      >
        <SheetSlider label="Fréquence" value={effects.lowPass.frequency} min={200} max={18000} step={100}
          displayValue={`${Math.round(effects.lowPass.frequency)} Hz`}
          onChange={(v) => update({ ...effects, lowPass: { ...effects.lowPass, frequency: v } })} />
      </EffectRow>

      <EffectRow
        title="High Pass"
        enabled={effects.highPass.enabled}
        onToggle={(v) => update({ ...effects, highPass: { ...effects.highPass, enabled: v } })}
      >
        <SheetSlider label="Fréquence" value={effects.highPass.frequency} min={20} max={4000} step={10}
          displayValue={`${Math.round(effects.highPass.frequency)} Hz`}
          onChange={(v) => update({ ...effects, highPass: { ...effects.highPass, frequency: v } })} />
      </EffectRow>

      <EffectRow
        title="Stereo Width"
        enabled={effects.stereoWidth.enabled}
        onToggle={(v) => update({ ...effects, stereoWidth: { ...effects.stereoWidth, enabled: v } })}
      >
        <SheetSlider label="Largeur" value={effects.stereoWidth.amount} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.stereoWidth.amount * 100)}%`}
          onChange={(v) => update({ ...effects, stereoWidth: { ...effects.stereoWidth, amount: v } })} />
      </EffectRow>
    </BottomSheet>
  );
}

function EffectRow({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={`effect-row ${enabled ? 'effect-row-enabled' : ''}`}>
      <div className="effect-row-header" onClick={() => onToggle(!enabled)}>
        <span className="effect-row-title">{title}</span>
        <span className={`switch ${enabled ? 'switch-on' : ''}`}>
          <span className="switch-knob" />
        </span>
      </div>
      {enabled && <div className="effect-row-body">{children}</div>}
    </div>
  );
}
