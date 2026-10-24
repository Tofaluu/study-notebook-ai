import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// The sweep's edge travels down the page at a steady reading pace, so a tall answer takes longer than a short one;
// the cap keeps a very long answer from holding back what's below the fold. The edge's fade is set in index.css.
const SWEEP_PX_PER_MS = 0.6;
const SWEEP_FADE_PX = 120;
const SWEEP_MIN_MS = 600;
const SWEEP_MAX_MS = 2400;

// What has already played since the page loaded, so a refresh plays everything again
const played = new Set<string>();

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  /** Names what is being revealed; each name plays once per page load */
  once: string;
  play?: boolean;
  /** Classes that play instead of the top-to-bottom sweep */
  effect?: string;
}

/**
 * Plays an entrance the first time an element is seen after the page loads. A tab that stays mounted while hidden
 * hasn't been seen yet, since the browser holds an animation back until its element is shown, so it plays when the
 * tab is first opened. It counts as seen as soon as it starts, so leaving the tab partway through doesn't play it
 * again on the way back.
 */
export function Reveal({ once, play = true, effect, className, onAnimationStart, onAnimationEnd, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(() => play && !played.has(once));

  // Hiding a tab cancels its animation rather than ending it, and React has no handler for that
  useEffect(() => {
    const element = ref.current;
    if (!playing || !element) return;
    const stop = (event: AnimationEvent) => event.target === element && setPlaying(false);
    element.addEventListener('animationcancel', stop);
    return () => element.removeEventListener('animationcancel', stop);
  }, [playing]);

  // The sweep is paced by the element's height, which is only known once it is on screen
  const paceSweep = (event: React.AnimationEvent<HTMLElement>) => {
    onAnimationStart?.(event);
    if (event.target !== event.currentTarget) return;
    played.add(once);
    if (event.animationName !== 'reveal-sweep') return;
    const ms = Math.min(SWEEP_MAX_MS, Math.max(SWEEP_MIN_MS, (event.currentTarget.offsetHeight + SWEEP_FADE_PX) / SWEEP_PX_PER_MS));
    event.currentTarget.style.animationDuration = `${Math.round(ms)}ms`;
  };

  const finish = (event: React.AnimationEvent<HTMLElement>) => {
    onAnimationEnd?.(event);
    if (event.target === event.currentTarget) setPlaying(false);
  };

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(className, playing && (effect ?? 'reveal-sweep'))}
      onAnimationStart={paceSweep}
      onAnimationEnd={finish}
      {...rest}
    />
  );
}
