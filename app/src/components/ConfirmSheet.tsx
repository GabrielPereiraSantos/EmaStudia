interface Props {
  title: string;
  text?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmSheet({ title, text, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet">
        <span className="grip" />
        <h2>{title}</h2>
        {text && <p className="how">{text}</p>}
        <button type="button" className="primary sheet-confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="sheet-skip" onClick={onClose}>
          Annulla
        </button>
      </div>
    </div>
  );
}
