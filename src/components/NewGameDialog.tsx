import { type FC } from 'react';
import type { Difficulty } from '../engine/solver';

const DIFFICULTY_OPTIONS: readonly { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

interface NewGameDialogProps {
  levels: readonly Difficulty[];
  onChange: (levels: Difficulty[]) => void;
  generating: boolean;
  onShuffle: () => void;
  onClose: () => void;
}

export const NewGameDialog: FC<NewGameDialogProps> = ({
  levels,
  onChange,
  generating,
  onShuffle,
  onClose,
}) => {
  const toggle = (id: Difficulty) => {
    onChange(levels.includes(id) ? levels.filter((l) => l !== id) : [...levels, id]);
  };

  return (
    <div className="saved-overlay" onClick={onClose}>
      <div
        className="saved-panel newgame-panel"
        role="dialog"
        aria-modal="true"
        aria-label="New game"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="saved-header">
          <h2>New Game</h2>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="newgame-body">
          <p className="newgame-hint">Difficulty</p>
          {DIFFICULTY_OPTIONS.map(({ id, label }) => (
            <label key={id} className="newgame-option">
              <input
                type="checkbox"
                checked={levels.includes(id)}
                disabled={generating}
                onChange={() => toggle(id)}
              />
              <span>{label}</span>
            </label>
          ))}
          <button
            className="btn btn-primary newgame-shuffle"
            onClick={onShuffle}
            disabled={generating || levels.length === 0}
          >
            {generating ? 'Searching…' : 'Shuffle'}
          </button>
        </div>
      </div>
    </div>
  );
};
