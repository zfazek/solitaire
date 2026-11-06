import { useEffect, useState, type FC } from 'react';
import { type SavedGame, formatTimestamp } from '../engine/savedGames';
import { seedToCode } from '../engine/deck';
import { analyzeDeal, getCachedRating, rememberRating, type DealRating } from '../workers/analyzeDeal';

/**
 * Difficulty rating of each saved game's original deal. Ratings already known
 * (cached when the deal was generated) show instantly; any others (older saves,
 * typed-in seeds) are solved one at a time in the background and fill in.
 */
function useRatings(games: SavedGame[]): (g: SavedGame) => DealRating | undefined {
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const missing = games.filter((g) => !getCachedRating(g.initial.seed, g.drawCount));
    (async () => {
      for (const g of missing) {
        if (cancelled) return;
        const analysis = await analyzeDeal(g.initial);
        if (cancelled) return;
        rememberRating(g.initial, analysis);
        setTick((t) => t + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [games]);

  return (g) => getCachedRating(g.initial.seed, g.drawCount);
}

function ratingLabel(r: DealRating | undefined): string {
  if (!r) return '…';
  if (r.difficulty) return r.difficulty[0].toUpperCase() + r.difficulty.slice(1);
  return r.result === 'unsolvable' ? 'Unsolvable' : 'Unrated';
}

interface SavedGamesPanelProps {
  games: SavedGame[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Count how many cards have reached the foundations (progress indicator). */
function foundationProgress(g: SavedGame): number {
  return g.current.foundations.reduce((sum, pile) => sum + pile.length, 0);
}

export const SavedGamesPanel: FC<SavedGamesPanelProps> = ({
  games,
  activeId,
  onSelect,
  onDelete,
  onClose,
}) => {
  const ratingOf = useRatings(games);
  return (
  <div className="saved-overlay" onClick={onClose}>
    <div className="saved-panel" onClick={(e) => e.stopPropagation()}>
      <div className="saved-header">
        <h2>Saved Games</h2>
        <button className="btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {games.length === 0 ? (
        <p className="saved-empty">No saved games yet.</p>
      ) : (
        <ul className="saved-list">
          {games.map((g) => {
            const done = g.current.won;
            const progress = foundationProgress(g);
            return (
              <li
                key={g.id}
                className={`saved-item${g.id === activeId ? ' saved-item-active' : ''}`}
              >
                <button
                  className="saved-item-main"
                  onClick={() => onSelect(g.id)}
                  aria-label={`Resume game from ${formatTimestamp(g.createdAt)}`}
                >
                  <span className="saved-item-title">
                    {formatTimestamp(g.createdAt)}
                    {g.id === activeId && <span className="saved-badge">current</span>}
                  </span>
                  <span className="saved-item-sub">
                    Seed {seedToCode(g.initial.seed)} · {g.drawCount}-card draw · <span className={`rating rating-${ratingOf(g)?.difficulty ?? 'none'}`}>{ratingLabel(ratingOf(g))}</span> · {done ? 'Won 🏆' : `${progress}/52 to foundations`}
                    {' · last played '}{formatTimestamp(g.lastPlayed)}
                  </span>
                </button>
                <button
                  className="btn saved-delete"
                  onClick={() => onDelete(g.id)}
                  aria-label={`Delete game from ${formatTimestamp(g.createdAt)}`}
                >
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
  );
};
