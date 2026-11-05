import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recordingToWavBase64 } from '@/lib/audio-wav';
import { transcribeRecording } from '@/lib/voice-actions';
import { IDLE, createLiveStore } from './use-voice-recognition';

// A question is a sentence or two; this keeps a forgotten recording from running on
const MAX_RECORDING_MS = 60_000;
// Anything shorter than this is a bump of the key or button, not speech
const MIN_RECORDING_MS = 400;

export interface UseVoiceRecorderOptions {
  onFinalTranscript?: (transcript: string) => void;
  onError?: (error: string) => void;
  /** The model the user has selected, so the transcript comes from the matching provider when it can */
  model?: string;
}

export function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * The same controls as useVoiceRecognition, for browsers that can't do their own speech recognition (Chrome and
 * Firefox on iOS, Firefox elsewhere): it records the microphone and has the user's AI provider transcribe it. There is
 * no live text while speaking, and nothing ends it but the user (release, tap again, Done) or the time limit.
 */
export function useVoiceRecorder({ onFinalTranscript, onError, model }: UseVoiceRecorderOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const isSupported = useMemo(canRecordAudio, []);
  const live = useMemo(createLiveStore, []);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const holdRef = useRef(false);
  // The microphone permission prompt can still be open when the key or button is released
  const startingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const unmountedRef = useRef(false);

  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);
  const modelRef = useRef(model);
  onFinalTranscriptRef.current = onFinalTranscript;
  onErrorRef.current = onError;
  modelRef.current = model;

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    holdRef.current = false;
    live.set(IDLE);
    if (!unmountedRef.current) setIsListening(false);
  }, [live]);

  const handleRecorded = useCallback(
    async (recording: Blob, durationMs: number) => {
      if (durationMs < MIN_RECORDING_MS || recording.size === 0) {
        finish();
        return;
      }
      live.set({ ...IDLE, busy: true });
      try {
        const wav = await recordingToWavBase64(recording);
        const text = await transcribeRecording(wav, modelRef.current ?? '');
        if (text && !unmountedRef.current) onFinalTranscriptRef.current?.(text);
      } catch (error) {
        onErrorRef.current?.(error instanceof Error ? error.message : 'Could not transcribe that recording.');
      } finally {
        finish();
      }
    },
    [finish, live],
  );

  const startListening = useCallback(
    (options?: { hold?: boolean }) => {
      if (!isSupported || recorderRef.current || startingRef.current) return;
      holdRef.current = !!options?.hold;
      stopRequestedRef.current = false;
      startingRef.current = true;
      live.set({ ...IDLE, hold: holdRef.current });
      setIsListening(true);

      void (async () => {
        try {
          // Called straight from the tap or key press, which is the user gesture iOS requires
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (stopRequestedRef.current || unmountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            finish();
            return;
          }
          streamRef.current = stream;
          chunksRef.current = [];
          const recorder = new MediaRecorder(stream);
          recorderRef.current = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
          };
          recorder.onstop = () => {
            const recording = new Blob(chunksRef.current, { type: recorder.mimeType });
            const durationMs = Date.now() - startedAtRef.current;
            chunksRef.current = [];
            recorderRef.current = null;
            releaseMicrophone();
            void handleRecorded(recording, durationMs);
          };
          startedAtRef.current = Date.now();
          recorder.start();
          maxTimerRef.current = setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, MAX_RECORDING_MS);
        } catch (error) {
          releaseMicrophone();
          // Told apart so the message can say what to do: denied is a setting, busy is another app, the rest no device
          const name = error instanceof DOMException ? error.name : '';
          onErrorRef.current?.(
            name === 'NotAllowedError' || name === 'SecurityError'
              ? 'mic-denied'
              : name === 'NotReadableError' || name === 'AbortError'
                ? 'mic-busy'
                : 'audio-capture',
          );
          finish();
        } finally {
          startingRef.current = false;
        }
      })();
    },
    [finish, handleRecorded, isSupported, live, releaseMicrophone],
  );

  const stopListening = useCallback(() => {
    if (startingRef.current) {
      stopRequestedRef.current = true;
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
  }, []);

  /** Turns a held recording into a plain one that ends when the user says so */
  const releaseHold = useCallback(() => {
    holdRef.current = false;
    live.set({ ...live.getSnapshot(), hold: false });
  }, [live]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      // Leaving the page shouldn't send what was half said
      unmountedRef.current = true;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state === 'recording') recorder.stop();
      }
      recorderRef.current = null;
      releaseMicrophone();
    };
  }, [releaseMicrophone]);

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
