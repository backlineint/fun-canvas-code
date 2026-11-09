// How the room's mood reads: a label and headline for each tier of the median. The
// server decides the tier (see SwarmState in the fun_room module), so there is one
// set of thresholds. The swarm uses these words and also themes the whole page: it
// writes the steadied tier to <html data-mood>, and global.css turns that into colors.
// The deck keeps a copy of the steadying and celebration logic in slides/src/mood.js.

import type { Tier } from '@/lib/fun-room-live';

export type Mood = {
  label: string;
  headline: string;
  /** Whether the dots should wiggle (for people who haven't asked for less motion). */
  lively: boolean;
};

const MOODS: Record<Tier, Mood> = {
  low: { label: 'Sleepy', headline: 'Quiet in here', lively: false },
  mid: {
    label: 'Warming up',
    headline: 'The room is warming up',
    lively: false,
  },
  high: { label: 'Boatloads', headline: 'BOATLOADS OF FUN!', lively: true },
};

const WAITING: Mood = {
  label: 'Waiting',
  headline: 'No dots yet. Be the first.',
  lively: false,
};

/** The mood for a tier, or the waiting state when nobody has voted. */
export const moodFor = (tier: Tier | null | undefined): Mood =>
  tier ? MOODS[tier] : WAITING;

/** What the swarm waits for before the page changes mood, in consecutive polls. */
export const STEADY_POLLS = 2;

/**
 * Smooths the tier so a median hovering on a threshold doesn't flip the theme at
 * every poll. The first tier seen is used at once; "no votes" (null) applies at once;
 * any other change needs the same new tier on STEADY_POLLS polls in a row.
 */
export function createSteadier(): (tier: Tier | null) => Tier | null {
  let shown: Tier | null | undefined;
  let candidate: Tier | null = null;
  let seen = 0;
  return (tier) => {
    if (shown === undefined || tier === null || tier === shown) {
      shown = tier;
      candidate = null;
      seen = 0;
      return shown;
    }
    seen = candidate === tier ? seen + 1 : 1;
    candidate = tier;
    if (seen >= STEADY_POLLS) {
      shown = tier;
      candidate = null;
      seen = 0;
    }
    return shown;
  };
}

/** A tier forced by ?mood=low|mid|high|waiting in the page's address, for rehearsing. */
export function moodOverride(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): Tier | null | undefined {
  const value = new URLSearchParams(search).get('mood');
  if (value === 'waiting') return null;
  return value === 'low' || value === 'mid' || value === 'high'
    ? value
    : undefined;
}

/** Writes the mood onto <html> so global.css can theme the whole page. */
export function applyMood(tier: Tier | null | undefined): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.mood = tier ?? 'waiting';
}

export function clearMood(): void {
  if (typeof document === 'undefined') return;
  delete document.documentElement.dataset.mood;
}

/** How soon the confetti can go off again. */
export const CELEBRATE_COOLDOWN_MS = 60_000;

/**
 * Confetti when the room climbs into "high" from low or mid during this visit.
 * Not on the first reading (a reload straight into high), not while it stays high,
 * not from "no votes" (the first voter shouldn't set it off), and not within a minute
 * of the last burst.
 */
export function shouldCelebrate(
  previous: Tier | null | undefined,
  next: Tier | null,
  lastBurstAt: number,
  now: number,
): boolean {
  return (
    next === 'high' &&
    (previous === 'low' || previous === 'mid') &&
    now - lastBurstAt >= CELEBRATE_COOLDOWN_MS
  );
}
