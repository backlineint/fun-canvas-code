import { roomCode } from '../room.js';
import { useRoomState } from '../useRoomState.js';
import SwarmField from './SwarmField.jsx';

const LABELS = { low: 'Sleepy', mid: 'Warming up', high: 'Boatloads' };

// The room at a glance, in the top third of the sidebar: a compact swarm with the
// median and mood. It reads the deck's one poll (mood.js), so it adds no requests.
// To try a gauge ("the dial" in the design canvas) instead, replace <SwarmField>.
export default function RoomPulse() {
  const { state, offline } = useRoomState();
  const median = state?.median ?? null;
  const status = offline ? 'No connection' : state ? `${state.count} in the room` : 'Connecting...';
  const label = state ? (state.tier ? LABELS[state.tier] : 'No dots yet') : '';

  return (
    <section className="flex h-full min-h-0 flex-col gap-1.5 rounded-2xl bg-white px-4 py-3 text-left">
      <div className="flex items-baseline justify-between gap-2 text-sm font-bold">
        <span>{roomCode}</span>
        <span>{status}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-5xl leading-none font-extrabold">{median ?? '--'}</span>
        <span className="text-base font-bold">{label}</span>
      </div>
      <div className="min-h-0 flex-1">
        <SwarmField state={state} compact />
      </div>
    </section>
  );
}
