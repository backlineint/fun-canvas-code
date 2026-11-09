import { useEffect, useState } from 'preact/hooks';
import { getSnapshot, subscribe } from '../mood.js';

function useMood() {
  const [snapshot, setSnapshot] = useState(getSnapshot());
  useEffect(() => subscribe(() => setSnapshot(getSnapshot())), []);
  return snapshot;
}

// The same six colors as the attendee avatars (fun-canvas-project/src/lib/fun-room-avatars.tsx),
// so a dot matches the face its owner picked.
const AVATAR_COLORS = ['#FF5C4D', '#FFD84D', '#3B5BFF', '#7FD6A8', '#C9B6FF', '#FFB4A8'];

// What the room's mood tier (from the server) is called.
const MOODS = {
  low: 'Sleepy: Quiet in here',
  mid: 'Warming up: The room is warming up',
  high: 'Boatloads: BOATLOADS OF FUN!',
};

export default function Swarm() {
  // The deck's one poll (mood.js) feeds this slide, so it never asks for itself.
  const { state, offline } = useMood();

  // The median is null until somebody has moved their slider.
  const median = state?.median ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex items-baseline justify-between text-left">
        <div>
          <span className="font-display text-7xl font-extrabold leading-none">{median ?? '--'}</span>
          <div className="mt-1 text-xl font-bold">
            {state ? (state.tier ? MOODS[state.tier] : 'No dots yet. Move yours!') : ''}
          </div>
        </div>
        <span className="text-lg font-bold">
          {offline ? 'No connection to the room' : state ? `${state.count} in the room` : 'Connecting...'}
        </span>
      </div>
      <div
        className="relative h-64 overflow-hidden rounded-3xl border-4 border-ink bg-mood-field"
        role="img"
        aria-label={median === null ? 'Swarm of attendees: nobody has moved their dot yet' : `Swarm of attendees, median fun ${median} out of 100`}
      >
        {state && (
          <>
            {median !== null && (
              <span className="absolute inset-y-0 w-1 bg-coral transition-[left] duration-700 ease-out" style={{ left: `${median}%` }} />
            )}
            {state.dots.map((d) => (
              <span
                key={d.id}
                className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink/70 transition-[left,top] duration-700 ease-out"
                style={{ left: `${d.x}%`, top: `${d.y}%`, backgroundColor: AVATAR_COLORS[d.avatar] ?? AVATAR_COLORS[0] }}
              />
            ))}
          </>
        )}
        <span className="absolute bottom-2 left-4 text-sm font-bold">meh</span>
        <span className="absolute bottom-2 right-4 text-sm font-bold">boatloads</span>
      </div>
    </div>
  );
}
