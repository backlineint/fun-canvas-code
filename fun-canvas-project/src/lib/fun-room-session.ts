// What this browser remembers about the room it joined, so the home page can
// send a returning visitor straight to their room and the room page can show who
// they are. Storage can be blocked (private windows, site settings), so every
// access is guarded and the app works without it.

import { useMemo, useSyncExternalStore } from 'react';
import type { Profile } from '@/lib/fun-room-api';

export type Joined = {
  participant: Profile & { token: string };
  roomCode: string;
  /** The room page's path, for example /room/ned-4261. */
  roomPath: string;
};

const KEY = 'fun-o-meter:joined';

function parse(raw: string | null): Joined | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Joined> | null;
    return value &&
      value.participant &&
      typeof value.roomCode === 'string' &&
      typeof value.roomPath === 'string'
      ? (value as Joined)
      : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function readJoined(): Joined | null {
  return parse(readRaw());
}

export function saveJoined(joined: Joined): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(joined));
  } catch {
    // storage is unavailable; the visitor just has to join again next time
  }
}

export function clearJoined(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear if storage is unavailable
  }
}

// Marks "not read yet" for the server render, which has no storage.
const PENDING = 'pending';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * The stored join, kept current when storage changes in another tab.
 * Returns `undefined` until the browser has been asked (the server render and
 * the first paint), then the join or `null` when there is none.
 */
export function useJoined(): Joined | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw() ?? '',
    () => PENDING,
  );
  return useMemo(() => (raw === PENDING ? undefined : parse(raw)), [raw]);
}
