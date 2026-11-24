import { type FC } from 'react';

interface ConfirmRestartDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmRestartDialog: FC<ConfirmRestartDialogProps> = ({ onConfirm, onCancel }) => (
  <div className="saved-overlay" onClick={onCancel}>
    <div
      className="saved-panel newgame-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm restart"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="saved-header">
        <h2>Restart game?</h2>
      </div>
      <div className="newgame-body">
        <p className="newgame-hint">Your current progress will be lost.</p>
        <button className="btn btn-primary newgame-shuffle" onClick={onConfirm} autoFocus>
          Restart
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>
);
