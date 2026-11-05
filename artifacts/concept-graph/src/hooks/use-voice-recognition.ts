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
  onFinalTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecognition({ onFinalTranscript, onError }: UseVoiceRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

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
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      setInterimTranscript(interim);

      if (final.trim() && onFinalTranscript) {
        onFinalTranscript(final.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Don't treat user aborting/silence as fatal errors
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(event.error);
      }
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup abort
        }
      }
    };
  }, [onFinalTranscript, onError]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      setInterimTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // If already started or browser throws, reset
      try {
        recognitionRef.current.abort();
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
    setInterimTranscript('');
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
    interimTranscript,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
