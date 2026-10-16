import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { GameState, Card, MoveSource, MoveTarget } from '../engine/types';
import { newGame, drawFromStock, applyMove, deepClone } from '../engine/game';
import { canAutoComplete, getAutoMoveCard, canPlaceOnFoundation, canPlaceOnTableau, isMovableSequence, FOUNDATION_SUITS } from '../engine/rules';
import SolverWorker from '../workers/solver.worker?worker';

const MAX_RESHUFFLE_ATTEMPTS = 10;

type Action =
  | { type: 'NEW_GAME'; drawCount?: 1 | 3 }
  | { type: 'SET_GAME'; game: GameState }
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
  dealId: number; // increments on each new deal so useEffect can detect it
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'NEW_GAME': {
      const initial = newGame(action.drawCount ?? state.current.drawCount);
      return { current: initial, initial, history: [], dealId: state.dealId + 1 };
    }
    case 'SET_GAME': {
      return { current: action.game, initial: action.game, history: [], dealId: state.dealId + 1 };
    }
    case 'RESTART': {
      return { current: deepClone(state.initial), initial: state.initial, history: [], dealId: state.dealId };
    }
    case 'DRAW': {
      const next = drawFromStock(state.current);
      return { current: next, initial: state.initial, history: [...state.history, state.current], dealId: state.dealId };
    }
    case 'MOVE': {
      const next = applyMove(state.current, action.source, action.target);
      if (!next) return state;
      return { current: next, initial: state.initial, history: [...state.history, state.current], dealId: state.dealId };
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
      return { current: next, initial: state.initial, history: [...state.history, state.current], dealId: state.dealId };
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
      return { current: cur, initial: state.initial, history: [...state.history, state.current], dealId: state.dealId };
    }
    case 'UNDO': {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const current = history.pop()!;
      return { current: deepClone(current), initial: state.initial, history, dealId: state.dealId };
    }
    default:
      return state;
  }
}

const STORAGE_KEY = 'solitaire_state';

function loadSaved(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as State;
    // Basic sanity check
    if (!parsed.current || !parsed.initial || !Array.isArray(parsed.history)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(s: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or private mode — silently ignore
  }
}

export function useGameState(initialDrawCount: 1 | 3 = 1) {
  const restoredFromSave = useRef(false);

  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = loadSaved();
    if (saved) {
      restoredFromSave.current = true;
      return saved;
    }
    const initial = newGame(initialDrawCount);
    return { current: initial, initial, history: [], dealId: 0 };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist to localStorage on every state change
  useEffect(() => {
    saveState(state);
  }, [state]);

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

  const restart = useCallback(() => {
    dispatch({ type: 'RESTART' });
  }, []);

  const draw = useCallback(() => {
    dispatch({ type: 'DRAW' });
  }, []);

  const move = useCallback((source: MoveSource, target: MoveTarget): boolean => {
    const valid = applyMove(stateRef.current.current, source, target) !== null;
    if (valid) dispatch({ type: 'MOVE', source, target });
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
          dispatch({ type: 'MOVE', source, target: { area: 'tableau', pileIndex: ti } });
          return true;
        }
      }
    }

    return false;
  }, []);

  const autoMoveOne = useCallback(() => {
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
    startNewGame,
    restart,
    draw,
    move,
    autoMove,
    autoMoveOne,
    autoPlayToFoundations,
    undo,
  };
}
