declare const __AD_QA_ENABLED__: boolean;

// Vite folds this out of every packaged build. The fallback lets Node QA tools opt in.
export const AD_QA_ENABLED = typeof __AD_QA_ENABLED__ !== 'undefined'
  ? __AD_QA_ENABLED__
  : typeof process !== 'undefined' && process.env.VITE_SHOW_PUBLISHER_CONSOLE === 'true';
