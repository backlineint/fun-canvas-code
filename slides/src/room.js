// Bridge between the deck and the Drupal room API. Mirrors prototype/src/api.ts:
// all network calls live here. With VITE_ROOM_API unset, a simulated room is used,
// so the deck always works offline.
//
//   POST {API}/api/fun/rooms/{code}/slide   { id, title, index }   (presenter key)
//   GET  {API}/api/fun/rooms/{code}/state   -> { count, median, tier, dots }
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
