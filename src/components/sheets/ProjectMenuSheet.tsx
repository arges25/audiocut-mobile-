import { useState } from 'react';
import BottomSheet from '../BottomSheet';

interface Props {
  onNewProject: () => void;
  onResetProject: () => void;
  onClose: () => void;
}

export default function ProjectMenuSheet({ onNewProject, onResetProject, onClose }: Props) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <BottomSheet title="Projet" onClose={onClose}>
      <button className="sheet-menu-row" onClick={onNewProject}>
        <span>Nouveau projet</span>
        <span className="sheet-menu-chevron">›</span>
      </button>

      {!confirmingReset ? (
        <button className="sheet-menu-row sheet-menu-row-danger" onClick={() => setConfirmingReset(true)}>
          <span>Réinitialiser le projet</span>
          <span className="sheet-menu-chevron">›</span>
        </button>
      ) : (
        <div className="reset-confirm">
          <p>Cela efface définitivement les clips et les fichiers importés de cet appareil. Action irréversible.</p>
          <div className="reset-confirm-actions">
            <button className="btn sheet-btn-secondary" onClick={() => setConfirmingReset(false)}>Annuler</button>
            <button className="btn btn-danger" onClick={onResetProject}>Confirmer la suppression</button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
