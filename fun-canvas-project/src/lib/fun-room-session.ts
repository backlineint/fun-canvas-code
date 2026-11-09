// What this browser remembers about the room it joined, so the home page can
// send a returning visitor straight to their room, the room page can show who
// they are, and the slider and swarm can find the attendee's own dot. Storage can
// be blocked (private windows, site settings), so every access is guarded and the
// app works without it.

import { useMemo, useSyncExternalStore } from 'react';
import type { Profile } from '@/lib/fun-room-api';

export type Joined = {
  participant: Profile & { token: string };
  roomCode: string;
  /** The room page's path, for example /room/ned-4261. */
  roomPath: string;
};

/** What the browser remembers of its own dot in a room. */
export type MyFun = {
  /** The dot's opaque id, as the vote endpoint returned it. */
  id?: string;
  /** The last value this browser sent. */
  value?: number;
};

const JOINED_KEY = 'fun-o-meter:joined';
const funKey = (code: string) => `fun-o-meter:fun:${code.toUpperCase()}`;

// The room page is built from several separate components on one page (the room
// header, the slider, the swarm). The browser's `storage` event only reaches
// other tabs, so saving also dispatches this event to tell the rest of the page.
const CHANGED = 'fun-o-meter:session';

function notify(): void {
  try {
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // no window (server render): nothing to tell
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage is unavailable; the visitor just has to start again next time
  }
  notify();
}

function parseJoined(raw: string | null): Joined | null {
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

function parseFun(raw: string | null): MyFun | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as MyFun | null;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function readJoined(): Joined | null {
  return parseJoined(readRaw(JOINED_KEY));
}

export function saveJoined(joined: Joined): void {
  writeRaw(JOINED_KEY, JSON.stringify(joined));
}

export function clearJoined(): void {
  writeRaw(JOINED_KEY, null);
}

export function readFun(code: string): MyFun | null {
  return parseFun(readRaw(funKey(code)));
}

export function saveFun(code: string, fun: MyFun): void {
  writeRaw(funKey(code), JSON.stringify(fun));
}

export function clearFun(code: string): void {
  writeRaw(funKey(code), null);
}

const commentsKey = (code: string) =>
  `fun-o-meter:comments:${code.toUpperCase()}`;

/** Ids of the comments this browser posted in a room, so they can be marked as its own. */
export function readMyComments(code: string): number[] {
  try {
    const parsed: unknown = JSON.parse(readRaw(commentsKey(code)) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => Number.isInteger(id))
      : [];
  } catch {
    return [];
  }
}

export function rememberComment(code: string, id: number): void {
  const ids = readMyComments(code);
  if (!ids.includes(id)) {
    writeRaw(commentsKey(code), JSON.stringify([...ids, id].slice(-200)));
  }
}

// Marks "not read yet" for the server render, which has no storage.
const PENDING = 'pending';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/**
 * The stored join, kept current when storage changes in this tab or another.
 * Returns `undefined` until the browser has been asked (the server render and
 * the first paint), then the join or `null` when there is none.
 */
export function useJoined(): Joined | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(JOINED_KEY) ?? '',
    () => PENDING,
  );
  return useMemo(() => (raw === PENDING ? undefined : parseJoined(raw)), [raw]);
}

/**
 * This browser's own dot in a room, kept current the same way. `undefined`
 * until the browser has been asked, then the stored dot or `null`.
 */
export function useMyFun(code: string): MyFun | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(funKey(code)) ?? '',
    () => PENDING,
  );
  return useMemo(() => (raw === PENDING ? undefined : parseFun(raw)), [raw]);
}
