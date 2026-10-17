import { useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { useSelection } from './hooks/useSelection';
import { TableauColumn } from './components/TableauColumn';
import { FoundationPile } from './components/FoundationPile';
import { StockWaste } from './components/StockWaste';
import { WinScreen } from './components/WinScreen';
import type { MoveSource, MoveTarget } from './engine/types';
import './App.css';

export default function App() {
  const {
    gameState,
    canUndo,
    canAutoCompleteNow,
    startNewGame,
    restart,
    draw,
    move,
    autoMove,
    autoMoveOne,
    undo,
  } = useGameState(1);

  const { tapCard, tapPile } = useSelection(move, autoMove);

  // Auto-complete loop
  useEffect(() => {
    if (!canAutoCompleteNow) return;
    const id = setInterval(() => { autoMoveOne(); }, 120);
    return () => clearInterval(id);
  }, [canAutoCompleteNow, autoMoveOne]);

  const handleTapCard = (source: MoveSource, cards: typeof gameState.waste) => {
    tapCard(source, cards);
  };

  const handleTapPile = (target: MoveTarget) => {
    tapPile(target);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="game-title">♠ Solitaire</span>
        </div>
        <div className="toolbar-right">
          <button className="btn" onClick={undo} disabled={!canUndo} aria-label="Undo last move">
            ↩ Undo
          </button>
          <button className="btn" onClick={restart} aria-label="Restart this game">
            ↺ Restart
          </button>
          <div className="draw-toggle" role="group" aria-label="Draw mode">
            <button
              className={`btn${gameState.drawCount === 1 ? ' btn-active' : ''}`}
              onClick={() => startNewGame(1)}
            >Draw 1</button>
            <button
              className={`btn${gameState.drawCount === 3 ? ' btn-active' : ''}`}
              onClick={() => startNewGame(3)}
            >Draw 3</button>
          </div>
          <button className="btn btn-primary" onClick={() => startNewGame()} aria-label="New game">
            New Game
          </button>
        </div>
      </header>

      <main className="board">
        <div className="top-row">
          <StockWaste
            stock={gameState.stock}
            waste={gameState.waste}
            onDraw={draw}
            onTapCard={handleTapCard}
            onTapPile={handleTapPile}
          />
          <div className="foundations">
            {gameState.foundations.map((pile, i) => (
              <FoundationPile
                key={i}
                pileIndex={i}
                cards={pile}
                onTapCard={handleTapCard}
                onTapPile={handleTapPile}
              />
            ))}
          </div>
        </div>

        <div className="tableau">
          {gameState.tableau.map((pile, i) => (
            <TableauColumn
              key={i}
              pileIndex={i}
              cards={pile}
              onTapCard={handleTapCard}
              onTapPile={handleTapPile}
            />
          ))}
        </div>
      </main>

      {gameState.won && (
        <WinScreen onNewGame={() => startNewGame()} />
      )}
    </div>
  );
}
