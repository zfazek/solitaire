import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Build-time donation flag. The "buy me a coffee" link must be COMPLETELY
// absent from the Android binary (Google Play policy, and we don't want the
// store's scanner to find the URL at all). Setting VITE_DONATE=0 — which the
// `build:android` script does — folds `__DONATE_ENABLED__` to `false` so the
// minifier dead-code-eliminates the button, `openDonatePage`, and the Ko-fi
// URL string out of the bundle entirely. The browser build leaves it enabled.
const donateEnabled = process.env.VITE_DONATE !== '0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __DONATE_ENABLED__: JSON.stringify(donateEnabled),
  },
})
