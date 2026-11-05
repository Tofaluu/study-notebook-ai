import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';

// Browser Web Speech API interfaces
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export interface UseVoiceRecognitionOptions {
  /**
   * Silence delay (in ms) before committing the speech as final.
   * Default: 2500ms (2.5s) to allow thinking between words.
   */
  silenceBufferMs?: number;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export interface VoiceLiveState {
  transcript: string;
  /** When the silence countdown ends (Date.now() scale), or null while nothing has been heard */
  deadline: number | null;
  /** Held open by a key or button: it ends on release, not on silence */
  hold: boolean;
  /** The recording is being turned into text */
  busy?: boolean;
}

export const IDLE: VoiceLiveState = { transcript: '', deadline: null, hold: false };

/**
 * The transcript changes several times a second while speaking, so it lives outside React state. Only the component
 * that shows it subscribes (useVoiceLive); the chat around it doesn't re-render with every word.
 */
export function createLiveStore() {
  let snapshot = IDLE;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    set(next: VoiceLiveState) {
      if (next.transcript === snapshot.transcript && next.deadline === snapshot.deadline && next.hold === snapshot.hold && !!next.busy === !!snapshot.busy) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export type VoiceLiveStore = ReturnType<typeof createLiveStore>;

export function useVoiceLive(store: VoiceLiveStore): VoiceLiveState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function useVoiceRecognition({
  silenceBufferMs = 2500,
  onFinalTranscript,
  onError,
}: UseVoiceRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const live = useMemo(createLiveStore, []);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const holdRef = useRef(false);

  // The recognizer is built once; callbacks and the buffer length are read through refs so a new function identity
  // never tears down a live session
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);
  const silenceBufferRef = useRef(silenceBufferMs);
  onFinalTranscriptRef.current = onFinalTranscript;
  onErrorRef.current = onError;
  silenceBufferRef.current = silenceBufferMs;

  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    const clearSilenceTimer = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    const reset = () => {
      clearSilenceTimer();
      finalRef.current = '';
      interimRef.current = '';
      holdRef.current = false;
      live.set(IDLE);
    };

    // Whatever has been heard goes out exactly once, from onend. stop() lets the recognizer deliver its last result
    // first, so words still in flight when the session ends aren't lost or sent as a second partial command.
    const commit = () => {
      const content = [finalRef.current, interimRef.current].filter(Boolean).join(' ').trim();
      reset();
      if (content) onFinalTranscriptRef.current?.(content);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          const piece = item[0].transcript.trim();
          if (piece) {
            finalRef.current = finalRef.current ? `${finalRef.current} ${piece}` : piece;
          }
        } else {
          interim += item[0].transcript;
        }
      }
      interimRef.current = interim.trim();

      const transcript = [finalRef.current, interimRef.current].filter(Boolean).join(' ');
      clearSilenceTimer();
      if (holdRef.current) {
        // Held open: releasing ends it, so silence never does
        live.set({ transcript, deadline: null, hold: true });
        return;
      }

      // Speech restarts the silence countdown
      const ms = silenceBufferRef.current;
      silenceTimerRef.current = setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }, ms);
      live.set({ transcript, deadline: Date.now() + ms, hold: false });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current?.(event.error);
      }
      reset();
      setIsListening(false);
    };

    recognition.onend = () => {
      commit();
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      // Leaving the page shouldn't send what was half said
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      clearSilenceTimer();
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [live]);

  /** With hold, the session runs until stopListening instead of ending after a pause */
  const startListening = useCallback((options?: { hold?: boolean }) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    finalRef.current = '';
    interimRef.current = '';
    holdRef.current = !!options?.hold;
    live.set({ ...IDLE, hold: holdRef.current });
    try {
      recognition.start();
    } catch {
      // Already running; keep listening
    }
    setIsListening(true);
  }, [live]);

  /** Turns a held session into a normal one that ends after a pause, e.g. when a button is tapped rather than held */
  const releaseHold = useCallback(() => {
    holdRef.current = false;
    const current = live.getSnapshot();
    live.set({ ...current, hold: false });
  }, [live]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    live,
    isSupported,
    startListening,
    stopListening,
    releaseHold,
    toggleListening,
  };
}
