interface Props {
  onSplit: () => void;
  onVolume: () => void;
  onIntro: () => void;
  onOutro: () => void;
  onEffects: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function ClipToolbar({ onSplit, onVolume, onIntro, onOutro, onEffects, onDuplicate, onDelete }: Props) {
  return (
    <div className="clip-toolbar">
      <div className="clip-toolbar-scroll">
        <ToolbarButton icon="✂️" label="Diviser" onClick={onSplit} />
        <ToolbarButton icon="🔊" label="Volume" onClick={onVolume} />
        <ToolbarButton icon="↗" label="Entrée" onClick={onIntro} />
        <ToolbarButton icon="↘" label="Sortie" onClick={onOutro} />
        <ToolbarButton icon="✨" label="Effets" onClick={onEffects} />
        <ToolbarButton icon="⧉" label="Dupliquer" onClick={onDuplicate} />
      </div>
      <button className="clip-toolbar-delete" onClick={onDelete} aria-label="Supprimer le clip">
        <span className="clip-toolbar-icon">🗑</span>
        <span className="clip-toolbar-label">Supprimer</span>
      </button>
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="clip-toolbar-btn" onClick={onClick}>
      <span className="clip-toolbar-icon">{icon}</span>
      <span className="clip-toolbar-label">{label}</span>
    </button>
  );
}
