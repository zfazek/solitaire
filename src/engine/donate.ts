/**
 * Opens the developer's donation page ("buy me a coffee").
 *
 * The link is opened in the user's EXTERNAL browser, never inside the app's
 * own WebView. This has two benefits:
 *   1. The app itself makes no network requests, so it needs no INTERNET
 *      permission — the system browser handles everything.
 *   2. Payment happens entirely on Ko-fi's secure page; the app never touches
 *      any payment data.
 *
 * Donations are reward-free on purpose: supporters receive no in-app goods or
 * features. This keeps the app compliant with Google Play's payments policy,
 * which only mandates Google Play Billing for purchases of digital goods or
 * app functionality — not genuine donations.
 */

/** The developer's Ko-fi donation page. */
export const DONATE_URL = 'https://ko-fi.com/ongroa';

/**
 * Open the donation page in the external browser.
 *
 * On the Capacitor Android WebView, `window.open` with the `_blank` target is
 * delegated to the system browser. On the plain web build it opens a new tab.
 * `noopener,noreferrer` is set as a safety best practice for external links.
 */
export function openDonatePage(): void {
  try {
    window.open(DONATE_URL, '_blank', 'noopener,noreferrer');
  } catch {
    // Opening a browser is best-effort; failing silently is acceptable here.
  }
}
