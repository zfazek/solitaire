import { type FC } from 'react';

interface WinScreenProps {
  moves: number;
  score: number;
  onNewGame: () => void;
}

export const WinScreen: FC<WinScreenProps> = ({ moves, score, onNewGame }) => (
  <div className="win-overlay">
    <div className="win-card">
      <div className="win-suits">♠ ♥ ♦ ♣</div>
      <h1>You Won!</h1>
      <p>Moves: <strong>{moves}</strong></p>
      <p>Score: <strong>{score}</strong></p>
      <button className="btn btn-primary" onClick={onNewGame}>
        Play Again
      </button>
    </div>
  </div>
);
