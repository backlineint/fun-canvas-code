// Bridge between the deck and the Drupal room API. Mirrors prototype/src/api.js:
// all network calls live here. With VITE_ROOM_API unset, a simulated room is used,
// so the deck always works offline.
//
//   POST {API}/rooms/{code}/slide   { id, title, index }   (presenter key required)
//   GET  {API}/rooms/{code}/state   -> { count, median, dots: [{ x, y }] }

const API = import.meta.env.VITE_ROOM_API || '';
const ROOM_CODE = import.meta.env.VITE_ROOM_CODE || 'NED-4261';
const PRESENTER_KEY = import.meta.env.VITE_PRESENTER_KEY || '';

export const roomCode = ROOM_CODE;
export const isStub = !API;

// Only the latest slide matters, so a failed report is retried, never queued up.
let pendingSlide = null;
let retryTimer = null;

async function sendSlide(slide) {
  const res = await fetch(`${API}/rooms/${ROOM_CODE}/slide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Presenter-Key': PRESENTER_KEY },
    body: JSON.stringify(slide),
  });
  if (!res.ok) throw new Error(`slide report failed: ${res.status}`);
}

export function reportSlide(slide) {
  if (isStub) {
    console.info('[room stub] slide', slide);
    return;
  }
  pendingSlide = slide;
  clearTimeout(retryTimer);
  const attempt = async () => {
    if (!pendingSlide) return;
    const current = pendingSlide;
    try {
      await sendSlide(current);
      if (pendingSlide === current) pendingSlide = null;
    } catch {
      retryTimer = setTimeout(attempt, 5000);
    }
  };
  attempt();
}

// Simulated crowd for stub mode.
let dots = Array.from({ length: 40 }, () => ({ x: 30 + Math.random() * 60, y: 10 + Math.random() * 80 }));

function stepStub() {
  dots = dots.map((d) => ({
    x: Math.max(2, Math.min(98, d.x + (66 - d.x) * 0.02 + (Math.random() - 0.5) * 3)),
    y: Math.max(8, Math.min(92, d.y + (Math.random() - 0.5) * 5)),
  }));
  const xs = dots.map((d) => d.x).sort((a, b) => a - b);
  return { count: dots.length, median: Math.round(xs[Math.floor(xs.length / 2)]), dots };
}

export async function getRoomState() {
  if (isStub) return stepStub();
  const res = await fetch(`${API}/rooms/${ROOM_CODE}/state`);
  if (!res.ok) throw new Error(`state failed: ${res.status}`);
  return res.json();
}
