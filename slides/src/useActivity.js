import { useEffect, useState } from 'preact/hooks';
import { getActivity, subscribeActivity } from './activity.js';

// The deck's activity feed (activity.js) as a hook: { items, offline, loaded }, newest first.
export function useActivity() {
  const [snapshot, setSnapshot] = useState(getActivity());
  useEffect(() => subscribeActivity(() => setSnapshot(getActivity())), []);
  return snapshot;
}
