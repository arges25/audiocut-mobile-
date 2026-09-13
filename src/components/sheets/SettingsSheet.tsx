import BottomSheet from '../BottomSheet';

interface Props {
  autosaveEnabled: boolean;
  onToggleAutosave: () => void;
  onClose: () => void;
}

export default function SettingsSheet({ autosaveEnabled, onToggleAutosave, onClose }: Props) {
  return (
    <BottomSheet title="Réglages" onClose={onClose}>
      <div className="sheet-menu-row" onClick={onToggleAutosave}>
        <span>Sauvegarde automatique</span>
        <span className={`switch ${autosaveEnabled ? 'switch-on' : ''}`}>
          <span className="switch-knob" />
        </span>
      </div>
      <p className="sheet-hint">AudioCut · application web installable, montage audio 3 pistes.</p>
    </BottomSheet>
  );
}
