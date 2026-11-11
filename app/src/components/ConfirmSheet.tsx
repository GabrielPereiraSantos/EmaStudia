interface Props {
  title: string;
  text?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}
import { useSheet } from './useSheet';

export function ConfirmSheet({ title, text, confirmLabel, onConfirm, onClose }: Props) {
  const sheetRef = useSheet(onClose);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
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
