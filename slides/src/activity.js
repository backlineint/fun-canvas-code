// The room's activity on the deck. One poll for the whole deck, like mood.js: it asks the
// comments endpoint for everything after the newest comment it has, and the ratings and
// requests endpoints for everything changed since the newest change it has, merges them,
// keeps the newest 50, and tells subscribers. Items, shaped for the stream:
//   { kind: 'comment', key, who, avatar, slide, text, ts }
//   { kind: 'rating',  key, who, avatar, slide, value, tier, ts }
//   { kind: 'request', key, id, who, avatar, what, note, slide, status, opened, ts }
// `key` is unique across kinds ("comment-12", "rating-7", "request-9"). Ratings and requests
// are live: a later change replaces the item in place (a rating moves to the top; a request
// turns "delivered", or is dropped when cancelled). `slide` is the slide number (1-based);
// `ts` and `opened` are unix times. Order: open requests first, the longest-waiting on top
// (a queue), then everything else newest first.

import { deliverRequest, getComments, getRatings, getRequests } from './room.js';

const KEEP = 50;
const KEEP_RATINGS = 15;
const KINDS = { hat: 'a party hat', noise: 'a noise maker', candy: 'candy' };

let snapshot = { items: [], offline: false, loaded: false, notice: '' };
const listeners = new Set();
let lastCommentId = 0;
let lastRatingChange = 0;
let lastRequestChange = 0;

export const getActivity = () => snapshot;

export function subscribeActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const commentItem = (c) => ({
  kind: 'comment',
  key: `comment-${c.id}`,
  who: c.name,
  avatar: c.avatar,
  slide: c.slide + 1,
  text: c.text,
  ts: Math.floor(Date.parse(c.at) / 1000) || 0,
});

const ratingItem = (r) => ({
  kind: 'rating',
  key: `rating-${r.id}`,
  who: r.name,
  avatar: r.avatar,
  slide: r.slide + 1,
  value: r.value,
  tier: r.tier,
  ts: r.changed,
});

const requestItem = (r) => ({
  kind: 'request',
  key: `request-${r.id}`,
  id: r.id,
  who: r.name,
  avatar: r.avatar,
  what: KINDS[r.kind] ?? r.kind,
  note: r.note,
  slide: r.slide + 1,
  status: r.status,
  opened: Math.floor(Date.parse(r.at) / 1000) || r.changed,
  ts: r.changed,
});

const isOpenRequest = (item) => item.kind === 'request' && item.status === 'open';

// Merges new items into the list: the same key replaces, `removed` keys are dropped, open
// requests lead (longest-waiting first), the rest newest first, and rating items are capped.
export function mergeItems(current, incoming, removed = []) {
  const byKey = new Map(current.map((item) => [item.key, item]));
  for (const key of removed) byKey.delete(key);
  for (const item of incoming) {
    // A request already turned "delivered" here (ahead of the server) isn't put back to
    // open by a poll that still carries the older state.
    const prev = byKey.get(item.key);
    if (prev && prev.kind === 'request' && prev.ts > item.ts) continue;
    byKey.set(item.key, item);
  }
  const all = [...byKey.values()];
  const open = all.filter(isOpenRequest).sort((a, b) => a.opened - b.opened || a.ts - b.ts);
  const rest = all.filter((item) => !isOpenRequest(item)).sort((a, b) => b.ts - a.ts || (a.key < b.key ? 1 : -1));
  let ratings = 0;
  return [...open, ...rest.filter((item) => item.kind !== 'rating' || ++ratings <= KEEP_RATINGS)].slice(0, KEEP);
}

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

let noticeTimer;

// Marks a request delivered at once, and tells the server; if that fails it goes back to open
// and a short notice says so.
export async function markDelivered(id) {
  const key = `request-${id}`;
  const before = snapshot.items.find((item) => item.key === key);
  if (!before || before.status !== 'open') return;
  publish({ ...snapshot, items: mergeItems(snapshot.items, [{ ...before, status: 'delivered', ts: Math.floor(Date.now() / 1000) }]) });
  try {
    await deliverRequest(id);
  } catch {
    publish({ ...snapshot, items: mergeItems(snapshot.items, [before], [key]), notice: "Couldn't mark that delivered. Check the presenter key." });
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => publish({ ...snapshot, notice: '' }), 5000);
  }
}

export function startActivity(pollMs = 2000) {
  const tick = async () => {
    // The feeds are independent: one failing (say, a 404 backoff) doesn't hide the others.
    const [comments, ratings, requests] = await Promise.allSettled([
      getComments(lastCommentId),
      getRatings(lastRatingChange),
      getRequests(lastRequestChange),
    ]);
    const incoming = [];
    const removed = [];
    if (comments.status === 'fulfilled' && comments.value.length) {
      lastCommentId = Math.max(lastCommentId, ...comments.value.map((c) => c.id));
      incoming.push(...comments.value.map(commentItem));
    }
    if (ratings.status === 'fulfilled' && ratings.value.length) {
      lastRatingChange = Math.max(lastRatingChange, ...ratings.value.map((r) => r.changed));
      incoming.push(...ratings.value.map(ratingItem));
    }
    if (requests.status === 'fulfilled' && requests.value.length) {
      lastRequestChange = Math.max(lastRequestChange, ...requests.value.map((r) => r.changed));
      for (const r of requests.value) {
        if (r.status === 'cancelled') removed.push(`request-${r.id}`);
        else incoming.push(requestItem(r));
      }
    }
    const offline = [comments, ratings, requests].every((r) => r.status === 'rejected');
    publish({
      ...snapshot,
      items: incoming.length || removed.length ? mergeItems(snapshot.items, incoming, removed) : snapshot.items,
      offline,
      loaded: snapshot.loaded || !offline,
    });
  };
  tick();
  setInterval(tick, pollMs);
}
