import { SCAN_TONE_GAIN, SCAN_TONE_GAP_MS, SCAN_TONE_NOTES } from '@/config/scanner';
import type { ScanTone } from '@/lib/scanner/scan-flow';

// Task P4.4.04 (docs/StyleGuide.md §6.6): the beep of a scan result, scheduled on a WebAudio context so it never waits
// for a file and never holds up the result sheet: the notes are queued and the call returns at once.

const MS_PER_SECOND = 1000;
// A note fades in and out over this long, so it starts and stops without a click.
const RAMP_SECONDS = 0.01;

export interface ScheduledNote {
  frequency: number;
  startMs: number;
  durationMs: number;
}

// When each note of a tone starts, from the moment it is played.
export function toneSchedule(tone: ScanTone): ScheduledNote[] {
  let startMs = 0;
  return SCAN_TONE_NOTES[tone].map(([frequency, durationMs]) => {
    const note = { frequency, startMs, durationMs };
    startMs += durationMs + SCAN_TONE_GAP_MS;
    return note;
  });
}

function playNote(context: AudioContext, note: ScheduledNote): void {
  const start = context.currentTime + note.startMs / MS_PER_SECOND;
  const end = start + note.durationMs / MS_PER_SECOND;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(note.frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(SCAN_TONE_GAIN, start + RAMP_SECONDS);
  gain.gain.linearRampToValueAtTime(0, end);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

export function playScanTone(context: AudioContext, tone: ScanTone): void {
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  for (const note of toneSchedule(tone)) playNote(context, note);
}
