// The room's activity on the deck. One poll for the whole deck, like mood.js: it asks
// the comments endpoint for everything after the newest comment it has, keeps the
// newest 50, and tells subscribers. Items are shaped for the stream, so requests and
// joins can join comments later:
//   { kind: 'comment', id, who, avatar, slide, text, at }

import { getComments } from './room.js';

const KEEP = 50;

let snapshot = { items: [], offline: false, loaded: false };
const listeners = new Set();
let lastId = 0;

export const getActivity = () => snapshot;

export function subscribeActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const toItem = (c) => ({
  kind: 'comment',
  id: c.id,
  who: c.name,
  avatar: c.avatar,
  slide: c.slide + 1,
  text: c.text,
  at: c.at,
});

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function startActivity(pollMs = 2000) {
  const tick = async () => {
    try {
      const comments = await getComments(lastId);
      if (comments.length) {
        lastId = Math.max(lastId, ...comments.map((c) => c.id));
        const known = new Set(snapshot.items.map((item) => item.id));
        const added = comments.filter((c) => !known.has(c.id)).map(toItem);
        // Newest first.
        publish({ items: [...added.reverse(), ...snapshot.items].slice(0, KEEP), offline: false, loaded: true });
      } else {
        publish({ ...snapshot, offline: false, loaded: true });
      }
    } catch {
      publish({ ...snapshot, offline: true });
    }
  };
  tick();
  setInterval(tick, pollMs);
}
