import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { GameState, Card, MoveSource, MoveTarget } from '../engine/types';
import { newGame, emptyGame, drawFromStock, applyMove, deepClone } from '../engine/game';
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
import { seedToCode } from '../engine/deck';
import type { Difficulty } from '../engine/solver';
import { analyzeDeal, rememberRating } from '../workers/analyzeDeal';

const MAX_RESHUFFLE_ATTEMPTS = 1000;
const ALL_DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

type Action =
  | { type: 'NEW_GAME'; drawCount?: 1 | 3; seed?: number }
  | { type: 'COMMIT_NEW_GAME'; game: GameState }
  | { type: 'LOAD_SAVED'; saved: SavedGame }
  | { type: 'RESTART' }
  | { type: 'DRAW' }
  | { type: 'MOVE'; source: MoveSource; target: MoveTarget }
  | { type: 'AUTO_MOVE_ONE' }
  | { type: 'AUTO_PLAY_FOUNDATIONS' }
  | { type: 'DISMISS_WIN' }
  | { type: 'UNDO' };

interface State {
  current: GameState;
  initial: GameState;
  history: GameState[];
  dealId: number;      // increments on each new deal so useEffect can detect it
  activeId: string;    // id of the saved-game entry this state belongs to
  createdAt: number;   // creation timestamp of the active saved-game entry
  // When true the current deal came from an explicit user-entered seed, so the
  // background solver must NOT reshuffle it away — the user asked for exactly
  // this deal, solvable or not.
  explicitSeed: boolean;
  // When true the board is a cleared, idle resting state shown after the player
  // dismissed the win screen. Nothing is playable and this state is NOT
  // autosaved — the won game remains intact in the saved list. Any New / Load /
  // Restart / seeded action clears this flag.
  idle: boolean;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'NEW_GAME': {
      const initial = newGame(action.drawCount ?? state.current.drawCount, action.seed);
      return {
        current: initial, initial, history: [],
        dealId: state.dealId + 1,
        activeId: newSavedGameId(),
        createdAt: Date.now(),
        explicitSeed: action.seed !== undefined,
        idle: false,
      };
    }
    case 'COMMIT_NEW_GAME': {
      // A user-initiated new deal that has already been pre-validated by the
      // solver OFF-SCREEN (see findAcceptableDeal). Because the candidate was
      // chosen before committing, the board renders the final deal directly —
      // no intermediate rejected deals ever reach the screen (no flicker).
      // Starts a fresh saved-games entry, like NEW_GAME.
      const game = action.game;
      return {
        current: game, initial: game, history: [],
        dealId: state.dealId + 1,
        activeId: newSavedGameId(),
        createdAt: Date.now(),
        explicitSeed: false,
        idle: false,
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
        explicitSeed: true,
        idle: false,
      };
    }
    case 'RESTART': {
      return { ...state, current: deepClone(state.initial), history: [], idle: false };
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
    case 'DISMISS_WIN': {
      // Player acknowledged the win: clear the table to an empty, idle board
      // and wait. We do NOT start a new deal. The flag `idle` keeps this state
      // out of autosave, so the won game stays intact in the saved list until
      // the player picks New or opens a game from Saved.
      return {
        ...state,
        current: emptyGame(state.current.drawCount),
        history: [],
        idle: true,
      };
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
        explicitSeed: true,
        idle: false,
      };
    }
    const initial = newGame(initialDrawCount);
    return {
      current: initial, initial, history: [],
      dealId: 0,
      activeId: newSavedGameId(),
      createdAt: Date.now(),
      explicitSeed: false,
      idle: false,
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist the active game into its saved-games entry on every state change.
  // This both creates the entry (first write) and autosaves live progress.
  // Skipped while `idle` (the cleared post-win resting board) so the won game
  // stays intact in the saved list and no empty placeholder entry is created.
  useEffect(() => {
    if (state.idle) return;
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

  // Run the solver on a single candidate deal in a background Web Worker (see
  // workers/analyzeDeal). The solver's budget is small (see MAX_MOVES) so each
  // check is sub-second.
  const validateDeal = analyzeDeal;

  // Find a deal we're willing to show the player, WITHOUT committing any
  // candidate to visible state. We generate candidates and validate them one
  // at a time off-screen; only the chosen deal is ever dispatched, so rejected
  // candidates never render (this is what eliminates the reshuffle flicker).
  //
  // Priority: never land the player on an unsolvable (or hard-to-solve) deal.
  // We accept only a deal the solver proves 'solvable'. Anything else
  // ('unsolvable' or 'unknown') is discarded and a new candidate is generated,
  // up to MAX_RESHUFFLE_ATTEMPTS. If the cap is hit we return the last
  // candidate anyway so the game always starts.
  const findAcceptableDeal = useCallback(
    async (
      drawCount: 1 | 3,
      firstCandidate?: GameState,
      levels: readonly Difficulty[] = ALL_DIFFICULTIES,
      isCancelled: () => boolean = () => false,
    ): Promise<GameState | null> => {
      let candidate = firstCandidate ?? newGame(drawCount);
      let reshuffles = 0;
      const startTime = performance.now();
      for (;;) {
        const analysis = await validateDeal(candidate);
        if (isCancelled()) return null;
        const result = analysis.result;
        if (analysis.difficulty !== null && levels.includes(analysis.difficulty)) {
          console.log(
            `New deal ${seedToCode(candidate.seed)} settled after ${reshuffles} reshuffle(s) in ${Math.round(performance.now() - startTime)}ms; difficulty=${analysis.difficulty} ` +
              `(explored=${analysis.statesExplored}, solution=${analysis.solutionLength}, ` +
              `deadEnds=${analysis.deadEndRatio.toFixed(2)})`,
          );
          rememberRating(candidate, analysis);
          return candidate;
        }
        if (reshuffles >= MAX_RESHUFFLE_ATTEMPTS) {
          console.log(
            `New deal ${seedToCode(candidate.seed)} settled after ${reshuffles} reshuffle(s) in ${Math.round(performance.now() - startTime)}ms ` +
              `(hit MAX_RESHUFFLE_ATTEMPTS=${MAX_RESHUFFLE_ATTEMPTS}, result='${result}')`,
          );
          rememberRating(candidate, analysis);
          return candidate;
        }
        reshuffles++;
        candidate = newGame(drawCount);
      }
    },
    [validateDeal],
  );

  // Validate the deal that is live on first mount. A freshly-generated initial
  // deal (not restored from a save, not an explicit seed) is checked off-screen
  // and, if not acceptable, replaced in a single commit. Because only the final
  // deal is dispatched, the player never sees rejected candidates flash by.
  const didInitialValidation = useRef(false);
  useEffect(() => {
    if (didInitialValidation.current) return;
    didInitialValidation.current = true;
    // Restored saves and explicit seeds must be reproduced exactly — don't touch.
    if (restoredFromSave.current || state.explicitSeed) return;

    let cancelled = false;
    // Validate the already-live initial deal first; replace only if needed.
    findAcceptableDeal(state.current.drawCount, state.current, ALL_DIFFICULTIES, () => cancelled).then((game) => {
      if (cancelled || !game) return;
      if (game !== state.current) {
        dispatch({ type: 'COMMIT_NEW_GAME', game });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // True while a user-requested new deal is being searched for.
  const [generating, setGenerating] = useState(false);
  // Bumped to invalidate any in-flight search (new request or cancel).
  const searchToken = useRef(0);

  const cancelNewGame = useCallback(() => {
    searchToken.current++;
    setGenerating(false);
  }, []);

  const startNewGame = useCallback((drawCount?: 1 | 3, levels: readonly Difficulty[] = ALL_DIFFICULTIES) => {
    // A user-initiated new deal begins a fresh reshuffle round. We pick an
    // acceptable (solver-proven, difficulty-matching) deal OFF-SCREEN first,
    // then commit it in a single dispatch — the player never sees rejected
    // candidates, so there's no flicker. The MAX_RESHUFFLE_ATTEMPTS cap
    // applies per new game round.
    const dc = drawCount ?? stateRef.current.current.drawCount;
    const token = ++searchToken.current;
    setGenerating(true);
    findAcceptableDeal(dc, undefined, levels, () => token !== searchToken.current).then((game) => {
      if (token !== searchToken.current || !game) return; // superseded / cancelled
      setGenerating(false);
      dispatch({ type: 'COMMIT_NEW_GAME', game });
    });
  }, [findAcceptableDeal]);


  // Deal a specific seed. The deal is reproduced exactly and is NOT subject to
  // the solvability reshuffle (explicit seeds skip the solver entirely).
  const startSeededGame = useCallback((seed: number, drawCount?: 1 | 3) => {
    dispatch({ type: 'NEW_GAME', drawCount, seed });
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

  const dismissWin = useCallback(() => {
    dispatch({ type: 'DISMISS_WIN' });
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
    cancelNewGame,
    generating,
    startSeededGame,
    loadSavedGame,
    deleteSavedGame,
    restart,
    draw,
    move,
    autoMove,
    autoMoveOne,
    autoPlayToFoundations,
    undo,
    dismissWin,
  };
}
