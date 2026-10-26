'use client';

import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SCANNER_SOUND_STORAGE_KEY, VIBRATION_PATTERNS } from '@/config/scanner';
import { playScanTone } from '@/lib/scanner/beep';
import { toneOf } from '@/lib/scanner/scan-flow';
import type { VerifyOutcome } from '@/types/scanner';

// docs/StyleGuide.md §6.6 and §9 (Task P4.4.04): the vibration and the beep of a scan result. Reduced motion silences
// both, and the officer can mute the beep on this device; neither waits on anything, so the result shows at once.

const SOUND_OFF = '0';

function readSoundOn(): boolean {
  try {
    return window.localStorage.getItem(SCANNER_SOUND_STORAGE_KEY) !== SOUND_OFF;
  } catch {
    return true;
  }
}

function storeSoundOn(isOn: boolean): void {
  try {
    if (isOn) window.localStorage.removeItem(SCANNER_SOUND_STORAGE_KEY);
    else window.localStorage.setItem(SCANNER_SOUND_STORAGE_KEY, SOUND_OFF);
  } catch {
    // A private window or blocked storage keeps the choice for this page only.
  }
}

// One context per page, made on the first beep: the officer has tapped Scan by then, so the browser allows it.
function useAudioContext() {
  const context = useRef<AudioContext | null>(null);
  return useCallback((): AudioContext | null => {
    if (context.current === null && typeof window.AudioContext === 'function') {
      context.current = new window.AudioContext();
    }
    return context.current;
  }, []);
}

export function useScanFeedback() {
  const isReducedMotion = useReducedMotion() === true;
  // On for the server render and the first paint; the device's own choice is read after hydration.
  const [isSoundOn, setIsSoundOn] = useState(true);
  useEffect(() => {
    setIsSoundOn(readSoundOn());
  }, []);
  const audioContext = useAudioContext();
  const signal = useCallback(
    (outcome: VerifyOutcome) => {
      if (outcome.kind !== 'answered' || isReducedMotion) return;
      const tone = toneOf(outcome.response.result);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATION_PATTERNS[tone]);
      const context = isSoundOn ? audioContext() : null;
      if (context) playScanTone(context, tone);
    },
    [audioContext, isReducedMotion, isSoundOn],
  );
  const toggleSound = useCallback(() => {
    setIsSoundOn((isOn) => {
      storeSoundOn(!isOn);
      return !isOn;
    });
  }, []);
  return { signal, isSoundOn, toggleSound };
}
