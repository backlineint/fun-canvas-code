import { useEffect, useState } from 'preact/hooks';
import { getRoomState } from '../room.js';

export default function Swarm({ pollMs = 1000 }) {
  const [state, setState] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await getRoomState();
        if (alive) {
          setState(next);
          setOffline(false);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex items-baseline justify-between text-left">
        <span className="font-display text-7xl font-extrabold leading-none">{state ? state.median : '--'}</span>
        <span className="text-lg font-bold">
          {offline ? 'No connection to the room' : state ? `${state.count} in the room` : 'Connecting...'}
        </span>
      </div>
      <div
        className="relative h-64 overflow-hidden rounded-3xl border-4 border-ink bg-white"
        role="img"
        aria-label={`Swarm of attendees, median fun ${state ? state.median : 'unknown'} out of 100`}
      >
        {state && (
          <>
            <span className="absolute inset-y-0 w-1 bg-coral" style={{ left: `${state.median}%` }} />
            {state.dots.map((d, i) => (
              <span
                key={i}
                className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fun-blue"
                style={{ left: `${d.x}%`, top: `${d.y}%` }}
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
