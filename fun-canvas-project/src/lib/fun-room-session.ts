// What this browser remembers about the room it joined, so the home page can
// send a returning visitor straight to their room. Storage can be blocked
// (private windows, site settings), so every access is guarded and the app works
// without it.

import type { Profile } from '@/lib/fun-room-api';

export type Joined = {
  participant: Profile & { token: string };
  roomCode: string;
  /** The room page's path, for example /room/ned-4261. */
  roomPath: string;
};

const KEY = 'fun-o-meter:joined';

export function readJoined(): Joined | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
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
