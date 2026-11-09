import { useEffect, useState } from 'preact/hooks';
import { getSnapshot, subscribe } from './mood.js';

// The deck's one poll of the room (mood.js) as a hook: { state, offline, shown }.
// `state` is null until the first reply. Components never poll for themselves.
export function useRoomState() {
  const [snapshot, setSnapshot] = useState(getSnapshot());
  useEffect(() => subscribe(() => setSnapshot(getSnapshot())), []);
  return snapshot;
}
