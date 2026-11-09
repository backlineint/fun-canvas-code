// The room's activity on the deck. One poll for the whole deck, like mood.js: it asks
// the comments endpoint for everything after the newest comment it has, and the ratings
// endpoint for every rating changed since the newest change it has, merges them, keeps
// the newest 50, and tells subscribers. Items are shaped for the stream, newest first:
//   { kind: 'comment', key, who, avatar, slide, text, ts }
//   { kind: 'rating',  key, who, avatar, slide, value, tier, ts }
// `key` is unique across kinds ("comment-12", "rating-7"). A rating is one live item per
// person per slide: a later change replaces it in place and moves it to the top. `slide`
// is the slide number (1-based). `ts` is a unix time.

import { getComments, getRatings } from './room.js';

const KEEP = 50;
const KEEP_RATINGS = 15;

let snapshot = { items: [], offline: false, loaded: false };
const listeners = new Set();
let lastCommentId = 0;
let lastRatingChange = 0;

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

// Merges new items into the list: same key replaces, newest first, rating items capped.
export function mergeItems(current, incoming) {
  const byKey = new Map(current.map((item) => [item.key, item]));
  for (const item of incoming) byKey.set(item.key, item);
  const sorted = [...byKey.values()].sort((a, b) => b.ts - a.ts || (a.key < b.key ? 1 : -1));
  let ratings = 0;
  return sorted
    .filter((item) => item.kind !== 'rating' || ++ratings <= KEEP_RATINGS)
    .slice(0, KEEP);
}

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function startActivity(pollMs = 2000) {
  const tick = async () => {
    // The two feeds are independent: one failing (say, a 404 backoff) doesn't hide the other.
    const [comments, ratings] = await Promise.allSettled([getComments(lastCommentId), getRatings(lastRatingChange)]);
    const incoming = [];
    if (comments.status === 'fulfilled' && comments.value.length) {
      lastCommentId = Math.max(lastCommentId, ...comments.value.map((c) => c.id));
      incoming.push(...comments.value.map(commentItem));
    }
    if (ratings.status === 'fulfilled' && ratings.value.length) {
      lastRatingChange = Math.max(lastRatingChange, ...ratings.value.map((r) => r.changed));
      incoming.push(...ratings.value.map(ratingItem));
    }
    const offline = comments.status === 'rejected' && ratings.status === 'rejected';
    publish({
      items: incoming.length ? mergeItems(snapshot.items, incoming) : snapshot.items,
      offline,
      loaded: snapshot.loaded || !offline,
    });
  };
  tick();
  setInterval(tick, pollMs);
}
