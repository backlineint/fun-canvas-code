import { roomCode } from '../room.js';
import { useDeckView } from '../useDeckView.js';
import { useRoomState } from '../useRoomState.js';
import SwarmField from './SwarmField.jsx';
import ViewButton from './ViewButton.jsx';

const LABELS = { low: 'Sleepy', mid: 'Warming up', high: 'Boatloads' };

// The room at a glance, in the top third of the sidebar: a compact swarm with the
// median and mood. With the room view on (R, or the button) it fills the screen with a
// big swarm. It reads the deck's one poll (mood.js), so it adds no requests.
// To try a gauge ("the dial" in the design canvas) instead, replace <SwarmField>.
export default function RoomPulse() {
  const { state, offline } = useRoomState();
  const full = useDeckView() === 'room';
  const median = state?.median ?? null;
  const status = offline ? 'No connection' : state ? `${state.count} in the room` : 'Connecting...';
  const label = state ? (state.tier ? LABELS[state.tier] : 'No dots yet') : '';

  return (
    <section className={`flex h-full min-h-0 flex-col rounded-2xl bg-white text-left ${full ? 'gap-4 rounded-3xl px-10 py-8' : 'gap-1.5 px-4 py-3'}`}>
      <div className={`flex items-center justify-between gap-3 font-bold ${full ? 'text-3xl' : 'text-sm'}`}>
        <span>{roomCode}</span>
        <span className="flex items-center gap-3">
          {status}
          <ViewButton target="room" name="the room" keyName="R" />
        </span>
      </div>
      <div className="flex items-baseline gap-4">
        <span className={`font-display leading-none font-extrabold ${full ? 'text-[clamp(7rem,22vh,16rem)]' : 'text-5xl'}`}>{median ?? '--'}</span>
        <span className={`font-bold ${full ? 'text-5xl' : 'text-base'}`}>{label}</span>
      </div>
      <div className="min-h-0 flex-1">
        <SwarmField state={state} compact={!full} xl={full} />
      </div>
    </section>
  );
}
