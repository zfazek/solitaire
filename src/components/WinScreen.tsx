import { type FC } from 'react';

interface WinScreenProps {
  // Acknowledge the win: clears the table and waits for the player to start a
  // New game or pick one from the Saved list. Does NOT deal a new game.
  onOk: () => void;
}

export const WinScreen: FC<WinScreenProps> = ({ onOk }) => (
  <div className="win-overlay">
    <div className="win-card">
      <div className="win-suits">♠ ♥ ♦ ♣</div>
      <h1>You Won!</h1>
      <button className="btn btn-primary" onClick={onOk}>
        OK
      </button>
    </div>
  </div>
);
