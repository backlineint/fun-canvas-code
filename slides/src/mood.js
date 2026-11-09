// The room's mood on the deck. One poll of the room's state feeds everything: it
// themes every slide (<html data-mood>, see index.css), drives the swarm slide, and
// sets off confetti when the room climbs into "high". The steadying and confetti
// are copies of fun-canvas-project/src/lib/fun-room-mood.ts and fun-room-confetti.ts,
// since the deck is a separate project. Keep them in step.

import { getRoomState } from './room.js';

const STEADY_POLLS = 2;
const CELEBRATE_COOLDOWN_MS = 60_000;
const AVATAR_COLORS = ['#FF5C4D', '#FFD84D', '#3B5BFF', '#7FD6A8', '#C9B6FF', '#FFB4A8'];

// Tier names the server uses: low, mid, high, or null when nobody has voted.
function createSteadier() {
  let shown;
  let candidate = null;
  let seen = 0;
  return (tier) => {
    if (shown === undefined || tier === null || tier === shown) {
      shown = tier;
      candidate = null;
      seen = 0;
      return shown;
    }
    seen = candidate === tier ? seen + 1 : 1;
    candidate = tier;
    if (seen >= STEADY_POLLS) {
      shown = tier;
      candidate = null;
      seen = 0;
    }
    return shown;
  };
}

// ?mood=low|mid|high|waiting forces a mood, for rehearsing the theme.
function moodOverride() {
  const value = new URLSearchParams(window.location.search).get('mood');
  if (value === 'waiting') return null;
  return value === 'low' || value === 'mid' || value === 'high' ? value : undefined;
}

function shouldCelebrate(previous, next, lastBurstAt, now) {
  return next === 'high' && (previous === 'low' || previous === 'mid') && now - lastBurstAt >= CELEBRATE_COOLDOWN_MS;
}

function fireConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const DURATION_MS = 2800;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000';
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  const context = canvas.getContext('2d');
  if (!context) return;
  document.body.appendChild(canvas);
  context.scale(ratio, ratio);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pieces = Array.from({ length: 220 }, (_, i) => ({
    x: i % 2 ? width * 0.05 : width * 0.95,
    y: height * 0.95,
    vx: (i % 2 ? 1 : -1) * (4 + Math.random() * 10),
    vy: -(12 + Math.random() * 16),
    size: 8 + Math.random() * 12,
    spin: (Math.random() - 0.5) * 0.4,
    angle: Math.random() * Math.PI,
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
  }));
  const start = performance.now();
  const frame = (now) => {
    const elapsed = now - start;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 700));
    for (const piece of pieces) {
      piece.vy += 0.4;
      piece.vx *= 0.99;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.angle += piece.spin;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      context.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// What the swarm slide reads: the latest state, whether the room is unreachable,
// and the steadied tier. `shown` is undefined until the first poll.
let snapshot = { state: null, offline: false, shown: undefined };
const listeners = new Set();

export const getSnapshot = () => snapshot;

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next) {
  snapshot = next;
  document.documentElement.dataset.mood = (next.shown ?? 'waiting');
  listeners.forEach((listener) => listener());
}

export function startMood(pollMs = 1000) {
  const steady = createSteadier();
  const forced = moodOverride();
  let previous;
  let lastBurst = 0;

  // Themed from the start, so the first paint is already the "waiting" cream.
  document.documentElement.dataset.mood = forced ?? 'waiting';

  const tick = async () => {
    try {
      const state = await getRoomState();
      const next = forced !== undefined ? forced : steady(state.tier ?? null);
      const now = Date.now();
      if (shouldCelebrate(previous, next, lastBurst, now)) {
        lastBurst = now;
        fireConfetti();
      }
      previous = next;
      publish({ state, offline: false, shown: next });
    } catch {
      publish({ ...snapshot, offline: true, shown: forced !== undefined ? forced : snapshot.shown });
    }
  };
  tick();
  setInterval(tick, pollMs);
}
