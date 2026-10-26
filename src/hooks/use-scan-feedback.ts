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

// Review of PR #79, L-8: one context per page, made and woken inside the officer's tap (Scan, Periksa, a photo
// chosen), where every browser lets sound start, and closed when the scanner goes. A browser without WebAudio, or one
// that refuses it, stays silent.
function useAudioContext() {
  const context = useRef<AudioContext | null>(null);
  useEffect(
    () => () => {
      void context.current?.close().catch(() => undefined);
      context.current = null;
    },
    [],
  );
  const prime = useCallback(() => {
    try {
      if (context.current === null && typeof window.AudioContext === 'function') {
        context.current = new window.AudioContext();
      }
      if (context.current?.state === 'suspended')
        void context.current.resume().catch(() => undefined);
    } catch {
      context.current = null;
    }
  }, []);
  return { context, prime };
}

function useSoundChoice() {
  // On for the server render and the first paint; the device's own choice is read after hydration.
  const [isSoundOn, setIsSoundOn] = useState(true);
  useEffect(() => {
    setIsSoundOn(readSoundOn());
  }, []);
  const toggleSound = useCallback(() => {
    setIsSoundOn((isOn) => {
      storeSoundOn(!isOn);
      return !isOn;
    });
  }, []);
  return { isSoundOn, toggleSound };
}

export function useScanFeedback() {
  const isReducedMotion = useReducedMotion() === true;
  const { isSoundOn, toggleSound } = useSoundChoice();
  const { context, prime } = useAudioContext();
  const signal = useCallback(
    (outcome: VerifyOutcome) => {
      if (outcome.kind !== 'answered' || isReducedMotion) return;
      const tone = toneOf(outcome.response.result);
      if (typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATION_PATTERNS[tone]);
      if (isSoundOn && context.current) playScanTone(context.current, tone);
    },
    [context, isReducedMotion, isSoundOn],
  );
  return { signal, isSoundOn, toggleSound, prime, isReducedMotion };
}
