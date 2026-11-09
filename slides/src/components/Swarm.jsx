import { useRoomState } from '../useRoomState.js';
import SwarmField from './SwarmField.jsx';

// What the room's mood tier (from the server) is called.
const MOODS = {
  low: 'Sleepy: Quiet in here',
  mid: 'Warming up: The room is warming up',
  high: 'Boatloads: BOATLOADS OF FUN!',
};

export default function Swarm() {
  // The deck's one poll (mood.js) feeds this slide, so it never asks for itself.
  const { state, offline } = useRoomState();

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
      <div className="h-64">
        <SwarmField state={state} />
      </div>
    </div>
  );
}
