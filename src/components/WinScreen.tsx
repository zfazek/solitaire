import { type FC } from 'react';

interface WinScreenProps {
  onNewGame: () => void;
}

export const WinScreen: FC<WinScreenProps> = ({ onNewGame }) => (
  <div className="win-overlay">
    <div className="win-card">
      <div className="win-suits">♠ ♥ ♦ ♣</div>
      <h1>You Won!</h1>
      <button className="btn btn-primary" onClick={onNewGame}>
        Play Again
      </button>
    </div>
  </div>
);
