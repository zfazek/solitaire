import { useEffect, useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { useSelection } from './hooks/useSelection';
import { TableauColumn } from './components/TableauColumn';
import { FoundationPile } from './components/FoundationPile';
import { StockWaste } from './components/StockWaste';
import { WinScreen } from './components/WinScreen';
import { SavedGamesPanel } from './components/SavedGamesPanel';
import { isSoundEnabled, setSoundEnabled } from './engine/sound';
import type { MoveSource, MoveTarget } from './engine/types';
import './App.css';

export default function App() {
  const {
    gameState,
    canUndo,
    canAutoCompleteNow,
    activeId,
    getSavedGames,
    startNewGame,
    loadSavedGame,
    deleteSavedGame,
    restart,
    draw,
    move,
    autoMove,
    autoMoveOne,
    undo,
  } = useGameState(1);

  const { tapCard, tapPile } = useSelection(move, autoMove);
  const [showSaved, setShowSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => getSavedGames());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  const openSaved = () => {
    setSavedSnapshot(getSavedGames());
    setShowSaved(true);
  };

  // Auto-complete loop
  useEffect(() => {
    if (!canAutoCompleteNow || gameState.won) return;
    const id = setInterval(() => { autoMoveOne(); }, 120);
    return () => clearInterval(id);
  }, [canAutoCompleteNow, gameState.won, autoMoveOne]);

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
          <span className="game-title">♠<span className="title-word"> Solitaire</span></span>
        </div>
        <div className="toolbar-right">
          <button className="btn" onClick={undo} disabled={!canUndo} aria-label="Undo last move">
            <span className="btn-icon">↩ </span>Undo
          </button>
          <button className="btn" onClick={restart} aria-label="Restart this game">
            <span className="btn-icon">↺ </span>Restart
          </button>
          <button className="btn" onClick={openSaved} aria-label="Saved games">
            <span className="btn-icon">💾 </span>Saved
          </button>
          <button
            className="btn"
            onClick={toggleSound}
            aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
            aria-pressed={soundOn}
          >
            <span className="btn-icon">{soundOn ? '🔊 ' : '🔇 '}</span>{soundOn ? 'Sound' : 'Muted'}
          </button>
          <div
            className="draw-switch"
            role="group"
            aria-label="Draw mode — 1 or 3 cards. Switching starts a new game."
          >
            <button
              type="button"
              className={`draw-switch-opt${gameState.drawCount === 1 ? ' is-on' : ''}`}
              aria-pressed={gameState.drawCount === 1}
              onClick={() => { if (gameState.drawCount !== 1) startNewGame(1); }}
            >1</button>
            <button
              type="button"
              className={`draw-switch-opt${gameState.drawCount === 3 ? ' is-on' : ''}`}
              aria-pressed={gameState.drawCount === 3}
              onClick={() => { if (gameState.drawCount !== 3) startNewGame(3); }}
            >3</button>
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
          <div className="top-row-gap" />
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

      {showSaved && (
        <SavedGamesPanel
          games={savedSnapshot}
          activeId={activeId}
          onSelect={(id) => { loadSavedGame(id); setShowSaved(false); }}
          onDelete={(id) => { deleteSavedGame(id); setSavedSnapshot(getSavedGames()); }}
          onClose={() => setShowSaved(false)}
        />
      )}
    </div>
  );
}
