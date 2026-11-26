/**
 * Shared new-game search policy.
 *
 * Kept in its own module (rather than in the React hook) so both the in-app
 * new-game search (useGameState) and the offline acceptance measurement
 * (acceptance.ts) import the SAME value and can never drift apart.
 */

/**
 * Max number of candidate deals the new-game search will reject before it gives
 * up and shows the last candidate anyway, so the game always starts. Each
 * candidate is validated by the background solver (see solver.ts).
 */
export const MAX_RESHUFFLE_ATTEMPTS = 1000;