import { useEffect, useState } from 'react';

const CORE_FONT_SPECS = [
  '400 16px "Source Sans 3 Variable"',
  '400 24px "Source Serif 4 Variable"',
  '400 18px "KaTeX_Main"',
  'italic 400 18px "KaTeX_Math"',
];

// Bound how long startup waits on slow networks so missing/blocked fonts never hang the UI.
const FONT_READY_TIMEOUT_MS = 450;

let fontsReady = false;
let preloadPromise: Promise<void> | null = null;

/**
 * Eagerly triggers decoding of the app's Latin UI, heading, and math fonts at boot
 * so first text paint matches the settled typeface instead of flashing fallback metrics.
 */
export function startCoreFontPreload(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  if (typeof document === 'undefined' || !('fonts' in document)) {
    fontsReady = true;
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  const allAlreadyLoaded = CORE_FONT_SPECS.every((spec) => document.fonts.check(spec));
  if (allAlreadyLoaded) {
    fontsReady = true;
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  const loadAll = Promise.allSettled(
    CORE_FONT_SPECS.map((spec) => document.fonts.load(spec)),
  ).then(() => undefined);

  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, FONT_READY_TIMEOUT_MS);
  });

  preloadPromise = Promise.race([loadAll, timeout]).then(() => {
    fontsReady = true;
  });

  return preloadPromise;
}

/**
 * Returns whether the core fonts have finished loading (or timed out cleanly).
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(() => fontsReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    startCoreFontPreload().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}
