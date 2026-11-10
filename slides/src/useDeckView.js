import { useEffect, useState } from 'preact/hooks';
import { getView, subscribeView } from './deckView.js';

// The current view ('split', 'slide', 'room' or 'activity') as a hook.
export function useDeckView() {
  const [view, setView] = useState(getView());
  useEffect(() => subscribeView(() => setView(getView())), []);
  return view;
}
