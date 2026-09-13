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

export type EffectKey = keyof EffectParams;

export const TABS: { key: EffectKey; label: string }[] = [
  { key: 'reverb', label: 'Reverb' },
  { key: 'echo', label: 'Echo' },
  { key: 'delay', label: 'Delay' },
  { key: 'bassBoost', label: 'Bass' },
  { key: 'treble', label: 'Treble' },
  { key: 'lowPass', label: 'Low Pass' },
  { key: 'highPass', label: 'High Pass' },
  { key: 'stereoWidth', label: 'Stereo' },
];

export default function EffectsSheet({ title, initialEffects, onChange, onClose, previewSource, previewPlayer }: Props) {
  const [effects, setEffects] = useState(initialEffects);
  const [activeTab, setActiveTab] = useState<EffectKey>('reverb');
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

  function toggleActive(enabled: boolean) {
    update({ ...effects, [activeTab]: { ...effects[activeTab], enabled } });
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

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label ?? '';
  const activeEnabled = effects[activeTab].enabled;

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
      <div className="fx-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`fx-tab ${activeTab === t.key ? 'fx-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {effects[t.key].enabled && <span className="fx-tab-dot" />}
          </button>
        ))}
      </div>

      <div className="fx-panel">
        <div className="fx-panel-header">
          <span className="fx-panel-title">{activeLabel}</span>
          <span className={`switch ${activeEnabled ? 'switch-on' : ''}`} onClick={() => toggleActive(!activeEnabled)}>
            <span className="switch-knob" />
          </span>
        </div>

        {activeEnabled && <EffectFields effectKey={activeTab} effects={effects} onUpdate={update} />}
      </div>

      <button className="sheet-preview-btn" onClick={togglePreview} disabled={!previewSource}>
        {previewing ? '⏸ Arrêter l’aperçu' : '▶ Aperçu'}
      </button>
    </BottomSheet>
  );
}

export function EffectFields({
  effectKey,
  effects,
  onUpdate,
}: {
  effectKey: EffectKey;
  effects: EffectParams;
  onUpdate: (next: EffectParams) => void;
}) {
  switch (effectKey) {
    case 'reverb':
      return (
        <>
          <SheetSlider label="Mix" value={effects.reverb.mix} min={0} max={1} step={0.01}
            displayValue={`${Math.round(effects.reverb.mix * 100)}%`}
            onChange={(v) => onUpdate({ ...effects, reverb: { ...effects.reverb, mix: v } })} />
          <SheetSlider label="Taille" value={effects.reverb.size} min={0} max={1} step={0.01}
            displayValue={`${Math.round(effects.reverb.size * 100)}%`}
            onChange={(v) => onUpdate({ ...effects, reverb: { ...effects.reverb, size: v } })} />
        </>
      );
    case 'echo':
      return (
        <>
          <SheetSlider label="Mix" value={effects.echo.mix} min={0} max={1} step={0.01}
            displayValue={`${Math.round(effects.echo.mix * 100)}%`}
            onChange={(v) => onUpdate({ ...effects, echo: { ...effects.echo, mix: v } })} />
          <SheetSlider label="Délai" value={effects.echo.delay} min={0.02} max={0.5} step={0.01}
            displayValue={`${Math.round(effects.echo.delay * 1000)}ms`}
            onChange={(v) => onUpdate({ ...effects, echo: { ...effects.echo, delay: v } })} />
          <SheetSlider label="Feedback" value={effects.echo.feedback} min={0} max={0.9} step={0.01}
            displayValue={`${Math.round(effects.echo.feedback * 100)}%`}
            onChange={(v) => onUpdate({ ...effects, echo: { ...effects.echo, feedback: v } })} />
        </>
      );
    case 'delay':
      return (
        <>
          <SheetSlider label="Temps" value={effects.delay.time} min={0.05} max={1.5} step={0.01}
            displayValue={`${Math.round(effects.delay.time * 1000)}ms`}
            onChange={(v) => onUpdate({ ...effects, delay: { ...effects.delay, time: v } })} />
          <SheetSlider label="Feedback" value={effects.delay.feedback} min={0} max={0.9} step={0.01}
            displayValue={`${Math.round(effects.delay.feedback * 100)}%`}
            onChange={(v) => onUpdate({ ...effects, delay: { ...effects.delay, feedback: v } })} />
          <SheetSlider label="Mix" value={effects.delay.mix} min={0} max={1} step={0.01}
            displayValue={`${Math.round(effects.delay.mix * 100)}%`}
            onChange={(v) => onUpdate({ ...effects, delay: { ...effects.delay, mix: v } })} />
        </>
      );
    case 'bassBoost':
      return (
        <SheetSlider label="Intensité" value={effects.bassBoost.intensity} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.bassBoost.intensity * 100)}%`}
          onChange={(v) => onUpdate({ ...effects, bassBoost: { ...effects.bassBoost, intensity: v } })} />
      );
    case 'treble':
      return (
        <SheetSlider label="Intensité" value={effects.treble.intensity} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.treble.intensity * 100)}%`}
          onChange={(v) => onUpdate({ ...effects, treble: { ...effects.treble, intensity: v } })} />
      );
    case 'lowPass':
      return (
        <SheetSlider label="Fréquence" value={effects.lowPass.frequency} min={200} max={18000} step={100}
          displayValue={`${Math.round(effects.lowPass.frequency)} Hz`}
          onChange={(v) => onUpdate({ ...effects, lowPass: { ...effects.lowPass, frequency: v } })} />
      );
    case 'highPass':
      return (
        <SheetSlider label="Fréquence" value={effects.highPass.frequency} min={20} max={4000} step={10}
          displayValue={`${Math.round(effects.highPass.frequency)} Hz`}
          onChange={(v) => onUpdate({ ...effects, highPass: { ...effects.highPass, frequency: v } })} />
      );
    case 'stereoWidth':
      return (
        <SheetSlider label="Largeur" value={effects.stereoWidth.amount} min={0} max={1} step={0.01}
          displayValue={`${Math.round(effects.stereoWidth.amount * 100)}%`}
          onChange={(v) => onUpdate({ ...effects, stereoWidth: { ...effects.stereoWidth, amount: v } })} />
      );
    default:
      return null;
  }
}
