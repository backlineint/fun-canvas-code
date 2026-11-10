// Bridge between the deck and the Drupal room API. Mirrors prototype/src/api.ts:
// all network calls live here. With VITE_ROOM_API unset, a simulated room is used,
// so the deck always works offline.
//
//   POST {API}/api/fun/rooms/{code}/slide   { id, title, index }   (presenter key)
//   GET  {API}/api/fun/rooms/{code}/state   -> { count, median, tier, dots }
//   GET  {API}/api/fun/rooms/{code}/comments?after={id}   -> { comments: [...] }
//   GET  {API}/api/fun/rooms/{code}/ratings?since={unix}  -> { ratings: [...] }
//   GET  {API}/api/fun/rooms/{code}/requests?since={unix} -> { requests: [...] }
//   POST {API}/api/fun/rooms/{code}/requests/{id}/deliver  (presenter key)
//
// VITE_ROOM_API is the Drupal site's origin, for example
// https://fun-canvas-code.ddev.site. Set the variables in .env.local (see
// .env.example). The key is baked into the dev bundle, so never deploy it publicly.

const API = (import.meta.env.VITE_ROOM_API || '').replace(/\/+$/, '');
// The room can be chosen per session with ?room=NED-4261, else VITE_ROOM_CODE.
const ROOM_CODE = (
  new URLSearchParams(window.location.search).get('room') ||
  import.meta.env.VITE_ROOM_CODE ||
  'NED-4261'
)
  .trim()
  .toUpperCase();
const PRESENTER_KEY = import.meta.env.VITE_PRESENTER_KEY || '';

export const roomCode = ROOM_CODE;
export const isStub = !API;

class ReportError extends Error {
  constructor(status) {
    super(`slide report failed: ${status}`);
    this.status = status;
  }
}

// The server only accepts lowercase letters, digits, "-" and "_" (at most 64).
const cleanId = (id) =>
  String(id ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 64);

// The server collapses whitespace and rejects titles over 255 characters or with
// control characters, so tidy the title here rather than lose the whole report.
const cleanTitle = (title) =>
  String(title ?? '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);

async function sendSlide({ id, title, index }) {
  const res = await fetch(`${API}/api/fun/rooms/${encodeURIComponent(ROOM_CODE)}/slide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Presenter-Key': PRESENTER_KEY },
    body: JSON.stringify({ id: cleanId(id), title: cleanTitle(title), index }),
  });
  if (!res.ok) throw new ReportError(res.status);
}

const REFUSED = {
  400: 'the request was malformed',
  403: 'the presenter key was rejected (check VITE_PRESENTER_KEY)',
  404: `room ${ROOM_CODE} was not found`,
  422: 'the slide index, id or title was not valid',
};

// Only the latest slide matters, so reports are never queued up. One report is in
// flight at a time: several at once can reach the server out of order and leave the
// room on a stale slide, so when a newer slide arrives mid-request it is sent as
// soon as the current request finishes. Network errors, rate limits (429) and
// server errors are retried every 5 seconds; anything else the server refused will
// not succeed on a retry, so it is reported and dropped.
let pendingSlide = null;
let sending = false;
let retryTimer = null;
let warnedMissingKey = false;

async function sendPending() {
  if (sending || !pendingSlide) return;
  sending = true;
  const current = pendingSlide;
  let retry = false;
  try {
    await sendSlide(current);
  } catch (e) {
    if (e instanceof ReportError && e.status < 500 && e.status !== 429) {
      console.warn(`Slide report refused (${e.status}): ${REFUSED[e.status] ?? 'not accepted'}.`);
    } else {
      retry = true;
    }
  } finally {
    sending = false;
  }

  if (pendingSlide === current) {
    if (retry) retryTimer = setTimeout(sendPending, 5000);
    else pendingSlide = null;
  } else if (pendingSlide) {
    // A newer slide arrived while this one was in flight.
    sendPending();
  }
}

export function reportSlide(slide) {
  if (isStub) {
    console.info('[room stub] slide', slide);
    return;
  }
  if (!PRESENTER_KEY) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('VITE_PRESENTER_KEY is not set, so slide changes are not sent to the room.');
    }
    return;
  }
  pendingSlide = slide;
  clearTimeout(retryTimer);
  sendPending();
}

// Simulated crowd for stub mode.
let dots = Array.from({ length: 40 }, () => ({ x: 30 + Math.random() * 60, y: 10 + Math.random() * 80 }));

function stepStub() {
  dots = dots.map((d) => ({
    x: Math.max(2, Math.min(98, d.x + (66 - d.x) * 0.02 + (Math.random() - 0.5) * 3)),
    y: Math.max(8, Math.min(92, d.y + (Math.random() - 0.5) * 5)),
  }));
  const xs = dots.map((d) => d.x).sort((a, b) => a - b);
  const median = Math.round(xs[Math.floor(xs.length / 2)]);
  return { count: dots.length, median, tier: median < 35 ? 'low' : median < 65 ? 'mid' : 'high', dots };
}

// After a 404 (a wrong room code), wait a minute before asking again instead of
// polling a missing page every second for the whole talk.
let stateRetryAt = 0;

export async function getRoomState() {
  if (isStub) return stepStub();
  if (Date.now() < stateRetryAt) throw new Error('state endpoint unavailable');
  const res = await fetch(`${API}/api/fun/rooms/${encodeURIComponent(ROOM_CODE)}/state`);
  if (res.status === 404) stateRetryAt = Date.now() + 60000;
  if (!res.ok) throw new Error(`state failed: ${res.status}`);
  return res.json();
}

// Simulated comments for stub mode, one new one every few polls.
const STUB_COMMENTS = [
  ['Dana', 0, 'Wait, that runs in the browser?'],
  ['Priya', 2, 'Please show the prompt again'],
  ['Marcus', 4, 'More candy at the back!'],
  ['Sam', 1, 'This is the most fun I have had at a code talk'],
  ['Lee', 3, 'Can we get the slides afterwards?'],
];
let stubCommentId = 0;
let stubTicks = 0;

// The room's comments, oldest first, newer than `after`. After a 404 it waits a
// minute before asking again, like getRoomState.
let commentsRetryAt = 0;

export async function getComments(after = 0) {
  if (isStub) {
    stubTicks += 1;
    if (stubTicks % 3 !== 1 || stubCommentId >= STUB_COMMENTS.length) return [];
    const [name, avatar, text] = STUB_COMMENTS[stubCommentId];
    stubCommentId += 1;
    return [{ id: stubCommentId, name, avatar, slide: stubCommentId, slideTitle: '', text, at: new Date().toISOString() }];
  }
  if (Date.now() < commentsRetryAt) throw new Error('comments endpoint unavailable');
  const query = after > 0 ? `?after=${after}` : '';
  const res = await fetch(`${API}/api/fun/rooms/${encodeURIComponent(ROOM_CODE)}/comments${query}`);
  if (res.status === 404) commentsRetryAt = Date.now() + 60000;
  if (!res.ok) throw new Error(`comments failed: ${res.status}`);
  return (await res.json()).comments;
}

// Simulated ratings for stub mode: a few people rate, and one keeps changing her mind.
const STUB_RATERS = [['Dana', 0], ['Priya', 2], ['Marcus', 4], ['Sam', 1]];
let stubRatings = [];
let stubRatingTicks = 0;

// The room's slide ratings changed at or after `since` (a unix time), settled for a few
// seconds on the server. After a 404 it waits a minute before asking again.
let ratingsRetryAt = 0;

export async function getRatings(since = 0) {
  if (isStub) {
    stubRatingTicks += 1;
    const now = Math.floor(Date.now() / 1000);
    if (stubRatingTicks % 2 === 0) {
      const i = Math.floor(stubRatingTicks / 2);
      const [name, avatar] = STUB_RATERS[i % STUB_RATERS.length];
      const value = (i * 37 + 12) % 101;
      const existing = stubRatings.find((r) => r.name === name);
      if (existing) Object.assign(existing, { value, tier: value < 35 ? 'low' : value < 65 ? 'mid' : 'high', changed: now });
      else stubRatings.push({ id: stubRatings.length + 1, name, avatar, slide: i % 6, value, tier: value < 35 ? 'low' : value < 65 ? 'mid' : 'high', at: new Date().toISOString(), changed: now });
    }
    return stubRatings.filter((r) => r.changed >= since).map((r) => ({ ...r }));
  }
  if (Date.now() < ratingsRetryAt) throw new Error('ratings endpoint unavailable');
  const query = since > 0 ? `?since=${since}` : '';
  const res = await fetch(`${API}/api/fun/rooms/${encodeURIComponent(ROOM_CODE)}/ratings${query}`);
  if (res.status === 404) ratingsRetryAt = Date.now() + 60000;
  if (!res.ok) throw new Error(`ratings failed: ${res.status}`);
  return (await res.json()).ratings;
}

// Requests (party hats, noise makers, candy). Volunteers mark one delivered from the deck,
// which needs the presenter key; in stub mode it just works on the simulated ones.
export const canDeliver = isStub || Boolean(PRESENTER_KEY);

const STUB_REQUESTS = [
  ['Marcus', 4, 'candy', 'row 3, left'],
  ['Dana', 0, 'hat', ''],
  ['Sam', 1, 'noise', 'back, by the door'],
];
let stubRequests = [];
let stubRequestTicks = 0;

// The room's requests changed at or after `since` (a unix time), including cancelled ones
// so they can be dropped. After a 404 it waits a minute before asking again.
let requestsRetryAt = 0;

export async function getRequests(since = 0) {
  if (isStub) {
    stubRequestTicks += 1;
    const now = Math.floor(Date.now() / 1000);
    if (stubRequestTicks % 3 === 0 && stubRequests.length < STUB_REQUESTS.length) {
      const [name, avatar, kind, note] = STUB_REQUESTS[stubRequests.length];
      stubRequests.push({ id: stubRequests.length + 1, name, avatar, kind, note, slide: 2, status: 'open', at: new Date().toISOString(), changed: now });
    }
    return stubRequests.filter((r) => r.changed >= since).map((r) => ({ ...r }));
  }
  if (Date.now() < requestsRetryAt) throw new Error('requests endpoint unavailable');
  const query = since > 0 ? `?since=${since}` : '';
  const res = await fetch(`${API}/api/fun/rooms/${encodeURIComponent(ROOM_CODE)}/requests${query}`);
  if (res.status === 404) requestsRetryAt = Date.now() + 60000;
  if (!res.ok) throw new Error(`requests failed: ${res.status}`);
  return (await res.json()).requests;
}

// Marks a request delivered. Throws if the server refuses (a wrong key, say).
export async function deliverRequest(id) {
  if (isStub) {
    const found = stubRequests.find((r) => r.id === id);
    if (found) Object.assign(found, { status: 'delivered', changed: Math.floor(Date.now() / 1000) });
    return;
  }
  const res = await fetch(`${API}/api/fun/rooms/${encodeURIComponent(ROOM_CODE)}/requests/${id}/deliver`, {
    method: 'POST',
    headers: { 'X-Presenter-Key': PRESENTER_KEY },
  });
  if (!res.ok) throw new Error(`deliver failed: ${res.status}`);
}
