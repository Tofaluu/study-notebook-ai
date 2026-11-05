import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useVoiceRecognition, type VoiceLiveStore } from '@/hooks/use-voice-recognition';
import { toast } from '@/hooks/use-toast';

// A press shorter than this on the mic button is a click (toggle); longer is push-to-talk
const TAP_MS = 350;
// Keeps listening briefly after release so the last word isn't clipped
const RELEASE_TAIL_MS = 250;
const SILENCE_BUFFER_MS = 3000;

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': "Microphone access was denied. Allow it for this site in your browser's settings.",
  'service-not-allowed':
    "Speech recognition isn't available here. On iPhone or iPad, turn on Dictation in Settings → General → Keyboard, and open the site in Safari rather than an installed app or in-app browser.",
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection.',
  'language-not-supported': "Speech recognition doesn't support this language.",
};

interface VoiceControls {
  isSupported: boolean;
  isListening: boolean;
  /** The transcript as it is heard; read it with useVoiceLive */
  live: VoiceLiveStore;
  /** Pointer handlers for the mic button: hold to talk, or tap to start and stop */
  micPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  micPointerUp: () => void;
  /** Starts or stops by tap: how touch and keyboard use the mic button, since they can't hold */
  micClick: (event: ReactMouseEvent<HTMLElement>) => void;
  toggle: () => void;
}

const VoiceContext = createContext<VoiceControls | null>(null);

export function useVoice() {
  return useContext(VoiceContext);
}

const INTERACTIVE = 'button, a, summary, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="option"]';

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function isInteractive(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(INTERACTIVE);
}

interface VoiceProviderProps {
  onTranscript: (transcript: string) => void;
  children: ReactNode;
}

/**
 * One speech recognizer for the whole page. Hold Space (when nothing is focused) or Ctrl+Space (anywhere, including
 * the question box) to talk, and let go to send; or tap the mic button and stop talking for a few seconds.
 */
export function VoiceProvider({ onTranscript, children }: VoiceProviderProps) {
  const handleError = useCallback((err: string) => {
    toast({
      title: 'Voice input',
      description: SPEECH_ERRORS[err] ?? `Speech error: ${err}`,
      variant: 'destructive',
    });
  }, []);

  const { isListening, live, isSupported, startListening, stopListening, releaseHold, toggleListening } = useVoiceRecognition({
    silenceBufferMs: SILENCE_BUFFER_MS,
    onFinalTranscript: onTranscript,
    onError: handleError,
  });

  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;

  const keyHeldRef = useRef<{ ctrl: boolean } | null>(null);
  // Whether the focused element got focus from a mouse or touch. Space on such a button is almost certainly meant for
  // voice (you just clicked a tab), whereas a button reached with the keyboard still activates with Space.
  const pointerFocusRef = useRef(false);
  const tailTimerRef = useRef<number | null>(null);
  const pressRef = useRef<{ at: number; stoppedIt: boolean } | null>(null);
  // Whether the press in progress is a finger or pen, which can only tap
  const touchPressRef = useRef(false);

  const clearTail = () => {
    if (tailTimerRef.current !== null) {
      window.clearTimeout(tailTimerRef.current);
      tailTimerRef.current = null;
    }
  };

  const stopAfterTail = useCallback(
    (immediately = false) => {
      clearTail();
      if (immediately) {
        stopListening();
        return;
      }
      tailTimerRef.current = window.setTimeout(() => {
        tailTimerRef.current = null;
        stopListening();
      }, RELEASE_TAIL_MS);
    },
    [stopListening]
  );

  useEffect(() => {
    if (!isSupported) return;

    const onPointerDown = () => {
      pointerFocusRef.current = true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') {
        pointerFocusRef.current = false;
        return;
      }
      const held = keyHeldRef.current;
      if (held) {
        // Auto-repeat while held, or pressed again during the release tail
        e.preventDefault();
        clearTail();
        return;
      }
      if (e.repeat || isListeningRef.current) return;

      const ctrl = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (!ctrl && !plain) return;
      // Plain Space is only free when nothing would use it: not typing, not on a button or link the keyboard moved to,
      // and no dialog open
      if (plain && (isTyping(e.target) || (isInteractive(e.target) && !pointerFocusRef.current))) return;
      if (document.querySelector('[role="dialog"]')) return;

      e.preventDefault();
      // A clicked tab or button keeps focus; drop it so Space doesn't also press it or leave a focus ring on it
      if (e.target instanceof HTMLElement && isInteractive(e.target)) e.target.blur();
      keyHeldRef.current = { ctrl };
      startListening({ hold: true });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const held = keyHeldRef.current;
      if (!held) return;
      if (e.code === 'Space' || (held.ctrl && e.key === 'Control')) {
        e.preventDefault();
        keyHeldRef.current = null;
        stopAfterTail();
      }
    };

    // A release can be missed when focus leaves the window, which would leave the mic open
    const onLostFocus = () => {
      if (keyHeldRef.current && document.visibilityState !== 'visible') {
        keyHeldRef.current = null;
        stopAfterTail(true);
      }
    };
    const onBlur = () => {
      if (keyHeldRef.current) {
        keyHeldRef.current = null;
        stopAfterTail(true);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onLostFocus);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onLostFocus);
      clearTail();
    };
  }, [isSupported, startListening, stopAfterTail]);

  const micPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    // Browsers only allow speech recognition to start inside a real user gesture, and for touch that is the tap
    // finishing (click), not the finger going down. iOS refuses otherwise ("service-not-allowed"). So a finger taps
    // to start and stop, and only a mouse can hold.
    touchPressRef.current = event.pointerType !== 'mouse';
    if (touchPressRef.current) return;
    // Keep the release with the button even if the finger or cursor drifts off it, or the mic would stay open
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No active pointer to capture (a synthetic event): the release still arrives on the button itself
    }
    if (isListeningRef.current) {
      // Pressing while listening ends it
      pressRef.current = { at: Date.now(), stoppedIt: true };
      stopListening();
      return;
    }
    pressRef.current = { at: Date.now(), stoppedIt: false };
    startListening({ hold: true });
  }, [startListening, stopListening]);

  const micPointerUp = useCallback(() => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press || press.stoppedIt) return;
    if (Date.now() - press.at < TAP_MS) {
      // A tap: keep listening, and end after a pause
      releaseHold();
    } else {
      stopAfterTail();
    }
  }, [releaseHold, stopAfterTail]);

  const micClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      // A mouse press is already handled on down and up; a keyboard press (detail 0) or a finger tap lands here
      if (event.detail === 0 || touchPressRef.current) {
        touchPressRef.current = false;
        toggleListening();
      }
    },
    [toggleListening]
  );

  const value = useMemo<VoiceControls>(
    () => ({ isSupported, isListening, live, micPointerDown, micPointerUp, micClick, toggle: toggleListening }),
    [isSupported, isListening, live, micPointerDown, micPointerUp, micClick, toggleListening]
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  );
}
