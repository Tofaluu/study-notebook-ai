import { useEffect, useState } from 'react';
import { useVoiceLive, type VoiceLiveStore } from '@/hooks/use-voice-recognition';
import { useVoice } from './VoiceProvider';

interface VoiceBannerProps {
  live: VoiceLiveStore;
  onDone: () => void;
}

/** Shows what is being heard and the silence countdown. Owns its own ticking so the chat above doesn't re-render. */
export function VoiceBanner({ live, onDone }: VoiceBannerProps) {
  const { transcript, deadline, hold } = useVoiceLive(live);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [deadline]);

  const remainingMs = deadline === null ? null : Math.max(0, deadline - now);

  return (
    // It floats over the page, so it takes the popover surface and a shadow in light, a tone step and an edge in dark
    <div
      role="group"
      aria-label="Voice input"
      className="flex items-center justify-between gap-3 rounded-xl bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-1 duration-150 dark:border dark:border-border dark:shadow-none"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="shrink-0 font-medium">Listening</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {transcript || (hold ? 'Speak, then let go to send' : 'Say a question, or "open a new tab for…"')}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {hold && <span className="text-xs text-muted-foreground">Release to send</span>}
        {!hold && remainingMs !== null && transcript && (
          <span className="text-xs tabular-nums text-muted-foreground">Sending in {(remainingMs / 1000).toFixed(1)}s</span>
        )}
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] [@media(pointer:coarse)]:py-2.5"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * Places the bar while the mic is open. In the chat it hangs from the top of the question box, so it follows however
 * tall that grows; on other pages it sits near the bottom of the page area.
 */
export function VoiceBannerDock({ anchor }: { anchor: 'page' | 'composer' }) {
  const voice = useVoice();
  if (!voice?.isListening) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-30 px-4 ${anchor === 'composer' ? 'bottom-full pb-2' : 'bottom-6'}`}
    >
      <div className="pointer-events-auto mx-auto max-w-[46rem]">
        <VoiceBanner live={voice.live} onDone={voice.toggle} />
      </div>
    </div>
  );
}
