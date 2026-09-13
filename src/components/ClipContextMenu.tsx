interface Props {
  x: number;
  y: number;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ClipContextMenu({ x, y, onSplit, onDuplicate, onDelete, onClose }: Props) {
  return (
    <div className="context-menu-overlay" onPointerDown={onClose}>
      <div
        className="context-menu"
        style={{ left: x, top: y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="context-menu-item"
          onClick={() => {
            onSplit();
            onClose();
          }}
        >
          ✂️ Diviser
        </button>
        <button
          className="context-menu-item"
          onClick={() => {
            onDuplicate();
            onClose();
          }}
        >
          ⧉ Dupliquer
        </button>
        <button
          className="context-menu-item context-menu-item-danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          🗑 Supprimer
        </button>
      </div>
    </div>
  );
}
