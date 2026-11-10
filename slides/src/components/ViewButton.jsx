import { toggleView } from '../deckView.js';
import { useDeckView } from '../useDeckView.js';

// The control on a card that shows it full screen, and brings it back. `target` is the view
// it opens ('room' or 'activity'); `name` and `keyName` are for the label and the tooltip.
export default function ViewButton({ target, name, keyName }) {
  const view = useDeckView();
  const open = view === target;
  return (
    <button
      type="button"
      onClick={() => toggleView(target)}
      aria-pressed={open}
      aria-label={open ? 'Back to the split view' : `Show ${name} full screen`}
      title={`${open ? 'Back to the split view (Esc)' : `Show ${name} full screen`} (${keyName})`}
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-ink text-white opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {open ? (
          <path d="M8 3v5H3M12 17v-5h5M3 8l5-5M17 12l-5 5" />
        ) : (
          <path d="M3 8V3h5M17 12v5h-5M3 3l5 5M17 17l-5-5" />
        )}
      </svg>
    </button>
  );
}
