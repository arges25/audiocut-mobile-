import { useState } from 'react';
import BottomSheet from '../BottomSheet';
import SheetSlider from './SheetSlider';

interface Props {
  label: string;
  hint?: string;
  initialVolume: number;
  onChange: (volume: number) => void;
  onClose: () => void;
}

export default function TrackVolumeSheet({ label, hint, initialVolume, onChange, onClose }: Props) {
  const [volume, setVolume] = useState(initialVolume);

  function update(v: number) {
    setVolume(v);
    onChange(v);
  }

  function handleCancel() {
    onChange(initialVolume);
    onClose();
  }

  return (
    <BottomSheet
      title={`Volume — ${label}`}
      onClose={handleCancel}
      footer={
        <>
          <button className="btn sheet-btn-secondary" onClick={handleCancel}>Annuler</button>
          <button className="btn sheet-btn-primary" onClick={onClose}>Appliquer</button>
        </>
      }
    >
      <SheetSlider
        label="Volume"
        value={volume}
        min={0}
        max={2}
        step={0.01}
        displayValue={`${Math.round(volume * 100)}%`}
        onChange={update}
      />
      {hint && <p className="sheet-hint">{hint}</p>}
    </BottomSheet>
  );
}
