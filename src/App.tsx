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
import { seedToCode, codeToSeed, SEED_LENGTH } from './engine/deck';
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
    startSeededGame,
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
  const [revealAll, setRevealAll] = useState(false);
  const [seedInput, setSeedInput] = useState('');
  const [seedCopied, setSeedCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Long-press-on-title cheat (touch-friendly equivalent of Shift+C).
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

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

  // Long-press on the title = cheat reveal (mobile-friendly). Hold ~500ms to
  // flip all face-down tableau cards up; release to hide. A short tap still
  // cycles the layout. Moving more than ~10px cancels it (treated as a scroll).
  const LONG_PRESS_MS = 500;
  const MOVE_TOLERANCE_PX = 10;

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
  };

  const onTitlePointerDown = (e: React.PointerEvent) => {
    // On touch, prevent the browser's own long-press (text selection / callout
    // / context menu). Without this, mobile browsers fire `pointercancel`
    // around the 500ms mark and kill the reveal gesture. The Android WebView
    // disables these natively, which is why it worked there but not in Brave /
    // Safari. Only do this for touch/pen so desktop focus behaviour is intact.
    if (e.pointerType !== 'mouse') e.preventDefault();
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setRevealAll(true);
    }, LONG_PRESS_MS);
  };

  const onTitlePointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current || longPressFired.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clearLongPress();
  };

  const endTitlePress = () => {
    clearLongPress();
    if (longPressFired.current) {
      // The hold revealed the cards — stop revealing and suppress the tap.
      setRevealAll(false);
      longPressFired.current = false;
    } else {
      // Short tap: normal behaviour — cycle the layout.
      cycleLayout();
    }
  };

  const cancelTitlePress = () => {
    clearLongPress();
    if (longPressFired.current) {
      setRevealAll(false);
      longPressFired.current = false;
    }
  };

  const openSaved = () => {
    setSavedSnapshot(getSavedGames());
    setShowSaved(true);
  };

  // The reproducible code for the current deal (guards against old saved games
  // that predate the seed feature).
  const currentSeedCode =
    typeof gameState.seed === 'number' ? seedToCode(gameState.seed) : '—';

  const copySeed = async () => {
    if (currentSeedCode === '—') return;
    try {
      await navigator.clipboard.writeText(currentSeedCode);
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1200);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently ignore.
    }
  };

  const dealSeed = () => {
    const seed = codeToSeed(seedInput);
    if (seed === null) return; // invalid — the input shows an error state
    startSeededGame(seed, gameState.drawCount);
    setSeedInput('');
    setMenuOpen(false);
  };

  const seedInputValid = seedInput === '' || codeToSeed(seedInput) !== null;

  // Auto-complete loop
  useEffect(() => {
    if (!canAutoCompleteNow || gameState.won) return;
    const id = setInterval(() => { autoMoveOne(); }, 120);
    return () => clearInterval(id);
  }, [canAutoCompleteNow, gameState.won, autoMoveOne]);

  // Cheat mode: hold Shift+C to flip all face-down tableau cards up. This is
  // view-only — it never mutates the game state. We match on the physical key
  // code (KeyC) so it works regardless of keyboard layout.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' && e.shiftKey && !e.repeat) setRevealAll(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Clear when either the C key or Shift is released.
      if (e.code === 'KeyC' || e.key === 'Shift') setRevealAll(false);
    };
    // Dropping focus (e.g. tab/alt-tab) can swallow the keyup, so clear on blur.
    const onBlur = () => setRevealAll(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

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
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={endTitlePress}
          onPointerCancel={cancelTitlePress}
          onPointerLeave={cancelTitlePress}
          onContextMenu={(e) => e.preventDefault()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleLayout(); } }}
          title="Change the table layout (long-press to peek)"
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
            {/* TEMPORARY: cheat toggle while the long-press gesture is debugged
                on mobile browsers. Tap to flip all face-down tableau cards. */}
            <button
              className="btn"
              onClick={() => setRevealAll(v => !v)}
              aria-label={revealAll ? 'Turn cheat off' : 'Turn cheat on'}
              aria-pressed={revealAll}
            >
              <span className="btn-icon">👁</span><span className="btn-label">{revealAll ? ' Cheat: On' : ' Cheat: Off'}</span>
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
            {/* Reproducible deal: show the current seed (tap to copy) and let
                the player deal a specific seed on any device. */}
            <div className="seed-row">
              <button
                type="button"
                className="seed-current"
                onClick={copySeed}
                disabled={currentSeedCode === '—'}
                aria-label={`Current deal code ${currentSeedCode}. Tap to copy.`}
                title="Tap to copy this deal's code"
              >
                <span className="seed-current-label">Deal</span>
                <span className="seed-current-code">{currentSeedCode}</span>
                <span className="seed-current-hint">{seedCopied ? '✓ copied' : '⧉'}</span>
              </button>
              <form
                className="seed-enter"
                onSubmit={(e) => { e.preventDefault(); dealSeed(); }}
              >
                <input
                  className={`seed-input${seedInputValid ? '' : ' is-invalid'}`}
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={SEED_LENGTH}
                  placeholder={'·'.repeat(SEED_LENGTH)}
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value.toUpperCase())}
                  aria-label={`Enter a ${SEED_LENGTH}-character deal code`}
                />
                <button
                  type="submit"
                  className="btn seed-go"
                  disabled={codeToSeed(seedInput) === null}
                  aria-label="Deal this code"
                >Go</button>
              </form>
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
              revealAll={revealAll}
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
