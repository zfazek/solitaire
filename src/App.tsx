import { useEffect, useRef, useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { useSelection } from './hooks/useSelection';
import { TableauColumn } from './components/TableauColumn';
import { FoundationPile } from './components/FoundationPile';
import { StockWaste } from './components/StockWaste';
import { WinScreen } from './components/WinScreen';
import { SavedGamesPanel } from './components/SavedGamesPanel';
import { isSoundEnabled, setSoundEnabled } from './engine/sound';
import { getLayoutMode, setLayoutMode, nextLayoutMode, isGroupRight, isDeckSwapped } from './engine/layout';
import { openDonatePage } from './engine/donate';
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

  const [showSaved, setShowSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => getSavedGames());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [layoutMode, setLayoutModeState] = useState(() => getLayoutMode());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const { tapCard, tapPile } = useSelection(move, autoMove);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  const cycleLayout = () => {
    setLayoutModeState(prev => {
      const next = nextLayoutMode(prev);
      setLayoutMode(next);
      return next;
    });
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

  // Close the overflow menu on any click/tap outside of it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [menuOpen]);

  const handleTapCard = (source: MoveSource, cards: typeof gameState.waste) => {
    return tapCard(source, cards);
  };

  const handleTapPile = (target: MoveTarget) => {
    tapPile(target);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <span
          className="game-title"
          onClick={cycleLayout}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleLayout(); } }}
          title="Change the table layout"
          aria-label="Change the table layout"
        >♠<span className="title-word"> OSolitaire</span><span className="title-layout-hint" aria-hidden="true">⤭</span></span>
        <div className="toolbar-actions">
        <button className="btn" onClick={undo} disabled={!canUndo} aria-label="Undo last move">
          <span className="btn-icon">↩</span><span className="btn-label"> Undo</span>
        </button>
        <button className="btn" onClick={restart} aria-label="Restart this game">
          <span className="btn-icon">↺</span><span className="btn-label"> Restart</span>
        </button>

        <div className="toolbar-menu" ref={menuRef}>
          <button
            type="button"
            className="btn toolbar-menu-toggle"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="btn-icon">☰</span><span className="btn-label"> Menu</span>
          </button>

          <div className={`toolbar-menu-items${menuOpen ? ' is-open' : ''}`}>
            <button className="btn" onClick={() => { cycleLayout(); setMenuOpen(false); }} aria-label="Change the table layout">
              <span className="btn-icon btn-icon-layout">⤭</span><span className="btn-label"> Layout</span>
            </button>
            <button className="btn" onClick={() => { openSaved(); setMenuOpen(false); }} aria-label="Saved games">
              <span className="btn-icon">💾</span><span className="btn-label"> Saved</span>
            </button>
            <button
              className="btn"
              onClick={toggleSound}
              aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
              aria-pressed={soundOn}
            >
              <span className="btn-icon">{soundOn ? '🔊' : '🔇'}</span><span className="btn-label">{soundOn ? ' Sound' : ' Muted'}</span>
            </button>
            <div className="draw-row">
              <span className="draw-row-label">Draw</span>
              <div
                className="draw-switch"
                role="group"
                aria-label="Draw mode — 1 or 3 cards. Switching starts a new game."
              >
                <button
                  type="button"
                  className={`draw-switch-opt${gameState.drawCount === 1 ? ' is-on' : ''}`}
                  aria-pressed={gameState.drawCount === 1}
                  onClick={() => { if (gameState.drawCount !== 1) startNewGame(1); setMenuOpen(false); }}
                >1</button>
                <button
                  type="button"
                  className={`draw-switch-opt${gameState.drawCount === 3 ? ' is-on' : ''}`}
                  aria-pressed={gameState.drawCount === 3}
                  onClick={() => { if (gameState.drawCount !== 3) startNewGame(3); setMenuOpen(false); }}
                >3</button>
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn btn-coffee"
          onClick={openDonatePage}
          aria-label="Support the developer — buy me a coffee"
        >
          <span className="btn-icon">☕</span><span className="btn-label"> Coffee</span>
        </button>
        <button className="btn btn-primary" onClick={() => startNewGame()} aria-label="New game">
          <span className="btn-icon">✨</span><span className="btn-label"> New</span>
        </button>
        </div>
      </header>

      <main className={`board${isGroupRight(layoutMode) ? ' flipped' : ''}${isDeckSwapped(layoutMode) ? ' deck-swapped' : ''}`}>
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
