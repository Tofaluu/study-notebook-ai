import { useState, useEffect, useRef, useCallback } from 'react';

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

export function useVoiceRecognition({
  silenceBufferMs = 2500,
  onFinalTranscript,
  onError,
}: UseVoiceRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [remainingSilenceMs, setRemainingSilenceMs] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedRef = useRef('');
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  const clearSilenceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRemainingSilenceMs(null);
  }, []);

  const commitTranscript = useCallback(() => {
    clearSilenceTimers();
    const finalContent = accumulatedRef.current.trim();
    if (finalContent) {
      onFinalTranscriptRef.current?.(finalContent);
    }
    accumulatedRef.current = '';
    setAccumulatedTranscript('');
    setInterimTranscript('');
  }, [clearSilenceTimers]);

  const scheduleSilenceCommit = useCallback(() => {
    clearSilenceTimers();

    const startTime = Date.now();
    setRemainingSilenceMs(silenceBufferMs);

    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const left = Math.max(0, silenceBufferMs - elapsed);
      setRemainingSilenceMs(left);
      if (left <= 0 && countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }, 100);

    silenceTimerRef.current = setTimeout(() => {
      commitTranscript();
      // Also stop listening once silence buffer expires
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
    }, silenceBufferMs);
  }, [clearSilenceTimers, commitTranscript, silenceBufferMs]);

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

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          const piece = item[0].transcript.trim();
          if (piece) {
            accumulatedRef.current = accumulatedRef.current
              ? `${accumulatedRef.current} ${piece}`
              : piece;
            setAccumulatedTranscript(accumulatedRef.current);
          }
        } else {
          interim += item[0].transcript;
        }
      }

      setInterimTranscript(interim);

      // Reset the silence countdown whenever speech is heard
      scheduleSilenceCommit();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearSilenceTimers();
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(event.error);
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      // If we still have uncommitted text, commit it on end
      if (accumulatedRef.current.trim()) {
        commitTranscript();
      }
      setIsListening(false);
      clearSilenceTimers();
    };

    recognitionRef.current = recognition;

    return () => {
      clearSilenceTimers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [clearSilenceTimers, commitTranscript, onError, scheduleSilenceCommit]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      clearSilenceTimers();
      accumulatedRef.current = '';
      setAccumulatedTranscript('');
      setInterimTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      try {
        recognitionRef.current.abort();
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  }, [clearSilenceTimers]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    // Commit whatever we have so far
    commitTranscript();
    setIsListening(false);
  }, [commitTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    accumulatedTranscript,
    interimTranscript,
    fullTranscript: [accumulatedTranscript, interimTranscript].filter(Boolean).join(' '),
    remainingSilenceMs,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
