/// <reference types="vite/client" />

// Build-time constant injected by Vite's `define` (see vite.config.ts).
// `true` for the browser build, `false` for the Android build (VITE_DONATE=0),
// which lets the minifier strip all donation code/URL from the Android bundle.
declare const __DONATE_ENABLED__: boolean;
