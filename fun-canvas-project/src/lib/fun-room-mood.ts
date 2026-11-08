// How the room's mood reads: a label and headline for each tier of the median. The
// server decides the tier (see SwarmState in the fun_room module), so there is one
// set of thresholds. Kept here so the swarm and, later, the whole page's theme use
// the same words.

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
