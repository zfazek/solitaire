import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { GameState, Card, MoveSource, MoveTarget } from '../engine/types';
import { newGame, drawFromStock, applyMove, deepClone } from '../engine/game';
import { canAutoComplete, getAutoMoveCard, canPlaceOnFoundation, canPlaceOnTableau, isMovableSequence, FOUNDATION_SUITS } from '../engine/rules';
import {
  type SavedGame,
  listSavedGames,
  getSavedGame,
  upsertSavedGame,
  removeSavedGame,
  newSavedGameId,
} from '../engine/savedGames';
import { playMove, playFoundation, playDraw, playWin } from '../engine/sound';
import SolverWorker from '../workers/solver.worker?worker';

const MAX_RESHUFFLE_ATTEMPTS = 10;

type Action =
  | { type: 'NEW_GAME'; drawCount?: 1 | 3 }
  | { type: 'SET_GAME'; game: GameState }
  | { type: 'LOAD_SAVED'; saved: SavedGame }
  | { type: 'RESTART' }
  | { type: 'DRAW' }
  | { type: 'MOVE'; source: MoveSource; target: MoveTarget }
  | { type: 'AUTO_MOVE_ONE' }
  | { type: 'AUTO_PLAY_FOUNDATIONS' }
  | { type: 'UNDO' };

interface State {
  current: GameState;
  initial: GameState;
  history: GameState[];
  dealId: number;      // increments on each new deal so useEffect can detect it
  activeId: string;    // id of the saved-game entry this state belongs to
  createdAt: number;   // creation timestamp of the active saved-game entry
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'NEW_GAME': {
      const initial = newGame(action.drawCount ?? state.current.drawCount);
      return {
        current: initial, initial, history: [],
        dealId: state.dealId + 1,
        activeId: newSavedGameId(),
        createdAt: Date.now(),
      };
    }
    case 'SET_GAME': {
      // Used by the solver to replace an unsolvable deal with a fresh one.
      // Reuses the same activeId/createdAt so the saved entry isn't duplicated.
      return {
        current: action.game, initial: action.game, history: [],
        dealId: state.dealId + 1,
        activeId: state.activeId,
        createdAt: state.createdAt,
      };
    }
    case 'LOAD_SAVED': {
      const { saved } = action;
      // If the saved game was already won, reopening it means "replay this
      // deal" — start fresh from its original shuffle (no win popup, no new
      // random deal). Otherwise resume exactly where it was left off.
      const resumeCurrent = saved.current.won ? saved.initial : saved.current;
      const resumeHistory = saved.current.won ? [] : saved.history;
      return {
        current: deepClone(resumeCurrent),
        initial: deepClone(saved.initial),
        history: resumeHistory.map((h) => deepClone(h)),
        // Keep dealId unchanged: a restored game is not a fresh random deal,
        // so the background solver must NOT run (it could reshuffle it away).
        dealId: state.dealId,
        activeId: saved.id,
        createdAt: saved.createdAt,
      };
    }
    case 'RESTART': {
      return { ...state, current: deepClone(state.initial), history: [] };
    }
    case 'DRAW': {
      const next = drawFromStock(state.current);
      return { ...state, current: next, history: [...state.history, state.current] };
    }
    case 'MOVE': {
      const next = applyMove(state.current, action.source, action.target);
      if (!next) return state;
      return { ...state, current: next, history: [...state.history, state.current] };
    }
    case 'AUTO_MOVE_ONE': {
      const move = getAutoMoveCard(state.current);
      if (!move) return state;
      const source: MoveSource = {
        area: move.area,
        pileIndex: move.pileIndex,
        cardIndex: move.area === 'tableau'
          ? state.current.tableau[move.pileIndex].length - 1
          : undefined,
      };
      const target: MoveTarget = {
        area: 'foundation',
        pileIndex: FOUNDATION_SUITS.indexOf(move.card.suit),
      };
      if (target.pileIndex === -1) return state;
      const next = applyMove(state.current, source, target);
      if (!next) return state;
      return { ...state, current: next, history: [...state.history, state.current] };
    }
    case 'AUTO_PLAY_FOUNDATIONS': {
      // Repeatedly send every card that can legally go to a foundation,
      // until no such move remains. Recorded as a single undoable step.
      let cur = state.current;
      let moved = false;
      // Cap iterations defensively (52 cards max to the foundations).
      for (let guard = 0; guard < 52; guard++) {
        const move = getAutoMoveCard(cur);
        if (!move) break;
        const source: MoveSource = {
          area: move.area,
          pileIndex: move.pileIndex,
          cardIndex: move.area === 'tableau'
            ? cur.tableau[move.pileIndex].length - 1
            : undefined,
        };
        const fi = FOUNDATION_SUITS.indexOf(move.card.suit);
        if (fi === -1) break;
        const next = applyMove(cur, source, { area: 'foundation', pileIndex: fi });
        if (!next) break;
        cur = next;
        moved = true;
      }
      if (!moved) return state;
      return { ...state, current: cur, history: [...state.history, state.current] };
    }
    case 'UNDO': {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const current = history.pop()!;
      return { ...state, current: deepClone(current), history };
    }
    default:
      return state;
  }
}

export function useGameState(initialDrawCount: 1 | 3 = 1) {
  // On first mount, resume the most-recently-played saved game if one exists;
  // otherwise start a fresh deal that will become a new saved entry.
  const restoredFromSave = useRef(false);

  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = listSavedGames();
    if (saved.length > 0) {
      const g = saved[0];
      restoredFromSave.current = true;
      return {
        current: deepClone(g.current),
        initial: deepClone(g.initial),
        history: g.history.map((h) => deepClone(h)),
        dealId: 0,
        activeId: g.id,
        createdAt: g.createdAt,
      };
    }
    const initial = newGame(initialDrawCount);
    return {
      current: initial, initial, history: [],
      dealId: 0,
      activeId: newSavedGameId(),
      createdAt: Date.now(),
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist the active game into its saved-games entry on every state change.
  // This both creates the entry (first write) and autosaves live progress.
  useEffect(() => {
    upsertSavedGame({
      id: state.activeId,
      createdAt: state.createdAt,
      lastPlayed: Date.now(),
      drawCount: state.current.drawCount,
      initial: state.initial,
      current: state.current,
      history: state.history,
    });
  }, [state]);

  // Play the victory jingle once, on the false→true transition of `won`.
  const prevWon = useRef(state.current.won);
  useEffect(() => {
    if (state.current.won && !prevWon.current) {
      playWin();
    }
    prevWon.current = state.current.won;
  }, [state.current.won]);

  // Track reshuffle attempts for the current deal round
  const reshuffleCount = useRef(0);
  // If we restored a saved game, mark its dealId as already-checked so the
  // solver never reshuffles a mid-game position (it only validates fresh deals).
  const lastCheckedDealId = useRef(restoredFromSave.current ? state.dealId : -1);

  // Background solvability check — fires whenever a new deal is made
  useEffect(() => {
    // Only run on new deals, not on moves/undo/restart
    if (state.dealId === lastCheckedDealId.current) return;
    lastCheckedDealId.current = state.dealId;
    reshuffleCount.current = 0;

    let cancelled = false;

    const check = (gameState: GameState) => {
      const worker = new SolverWorker();
      worker.onmessage = (e: MessageEvent<boolean>) => {
        worker.terminate();
        if (cancelled) return;
        const solvable = e.data;
        if (!solvable && reshuffleCount.current < MAX_RESHUFFLE_ATTEMPTS) {
          reshuffleCount.current++;
          const next = newGame(gameState.drawCount);
          dispatch({ type: 'SET_GAME', game: next });
          // The SET_GAME dispatch will trigger this effect again via dealId change
        }
      };
      worker.postMessage(gameState);
    };

    check(state.current);

    return () => { cancelled = true; };
  }, [state.dealId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNewGame = useCallback((drawCount?: 1 | 3) => {
    dispatch({ type: 'NEW_GAME', drawCount });
  }, []);

  const getSavedGames = useCallback(() => listSavedGames(), []);

  const loadSavedGame = useCallback((id: string) => {
    const saved = getSavedGame(id);
    if (saved) dispatch({ type: 'LOAD_SAVED', saved });
  }, []);

  const deleteSavedGame = useCallback((id: string) => {
    removeSavedGame(id);
  }, []);

  const restart = useCallback(() => {
    dispatch({ type: 'RESTART' });
  }, []);

  const draw = useCallback(() => {
    playDraw();
    dispatch({ type: 'DRAW' });
  }, []);

  const move = useCallback((source: MoveSource, target: MoveTarget): boolean => {
    const valid = applyMove(stateRef.current.current, source, target) !== null;
    if (valid) {
      if (target.area === 'foundation') playFoundation();
      else playMove();
      dispatch({ type: 'MOVE', source, target });
    }
    return valid;
  }, []);

  const autoMove = useCallback((source: MoveSource, _cards?: Card[]): boolean => {
    const gs = stateRef.current.current;

    // Determine the card (for foundation) and the stack being moved (for tableau).
    let card: Card | undefined;
    let stack: Card[] | undefined;
    if (source.area === 'waste') {
      card = gs.waste[gs.waste.length - 1];
      stack = card ? [card] : undefined;
    } else if (source.area === 'tableau') {
      const pile = gs.tableau[source.pileIndex];
      const idx = source.cardIndex ?? pile.length - 1;
      stack = pile.slice(idx);
      // Only the top card of a tableau pile can go to a foundation.
      card = idx === pile.length - 1 ? pile[idx] : undefined;
    } else if (source.area === 'foundation') {
      // Foundation cards never auto-move to another foundation — only back
      // down to the tableau. The top card is a trivially valid 1-card stack.
      const top = gs.foundations[source.pileIndex][gs.foundations[source.pileIndex].length - 1];
      stack = top ? [top] : undefined;
    }
    if (!stack || stack.length === 0) return false;

    // 1) Try moving the top card to its foundation (not applicable for
    //    foundation sources, where `card` stays undefined).
    if (card) {
      for (let fi = 0; fi < 4; fi++) {
        if (canPlaceOnFoundation(card, gs.foundations[fi], fi)) {
          playFoundation();
          dispatch({ type: 'MOVE', source, target: { area: 'foundation', pileIndex: fi } });
          return true;
        }
      }
    }

    // 2) Fall back to placing the card/stack on the next valid tableau column.
    if (isMovableSequence(stack)) {
      const bottom = stack[0]; // the card that will touch the target pile
      for (let ti = 0; ti < gs.tableau.length; ti++) {
        if (source.area === 'tableau' && ti === source.pileIndex) continue; // skip own column
        const targetPile = gs.tableau[ti];
        if (canPlaceOnTableau(bottom, targetPile)) {
          playMove();
          dispatch({ type: 'MOVE', source, target: { area: 'tableau', pileIndex: ti } });
          return true;
        }
      }
    }

    return false;
  }, []);

  const autoMoveOne = useCallback(() => {
    // Only make a sound / dispatch if there is actually a card to move,
    // otherwise the end-of-game loop would keep "popping" after the last
    // card already reached the foundations.
    if (!getAutoMoveCard(stateRef.current.current)) return;
    playFoundation();
    dispatch({ type: 'AUTO_MOVE_ONE' });
  }, []);

  const autoPlayToFoundations = useCallback(() => {
    dispatch({ type: 'AUTO_PLAY_FOUNDATIONS' });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const canUndo = state.history.length > 0;
  const canAutoCompleteNow = canAutoComplete(state.current);
  const canAutoPlayToFoundations = getAutoMoveCard(state.current) !== null;

  return {
    gameState: state.current,
    canUndo,
    canAutoCompleteNow,
    canAutoPlayToFoundations,
    activeId: state.activeId,
    getSavedGames,
    startNewGame,
    loadSavedGame,
    deleteSavedGame,
    restart,
    draw,
    move,
    autoMove,
    autoMoveOne,
    autoPlayToFoundations,
    undo,
  };
}
