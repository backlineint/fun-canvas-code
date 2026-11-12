// Which part of the screen is shown full size. Five views:
//   split    the slide beside the sidebar (the default)
//   slide    the slide alone, the sidebar hidden (also the escape hatch for an unwanted comment)
//   room     the room's swarm filling the screen
//   activity the activity stream filling the screen
//   recap    the room's end-of-session recap filling the screen (D; it is never opened by itself)
// The view is written to <html data-view> and CSS (index.css) does the layout; the cards read
// it through useDeckView to draw their bigger versions. Only "slide" is remembered across
// reloads (the others are for a moment on stage); Esc returns from room, activity or recap to split.

const STORE = 'fun-o-meter:deck-sidebar';
const VIEWS = ['split', 'slide', 'room', 'activity', 'recap'];
const root = document.documentElement;

let view = 'split';
let deck = null;
const listeners = new Set();

export const getView = () => view;

export function subscribeView(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function refresh() {
  // Reveal sizes the slide to its container, which has just changed.
  if (deck) {
    deck.layout();
    requestAnimationFrame(() => deck.layout());
  }
}

export function setView(next) {
  if (!VIEWS.includes(next)) return;
  view = next;
  root.dataset.view = next;
  root.classList.toggle('sidebar-collapsed', next === 'slide');
  const toggle = document.querySelector('.sidebar-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(next !== 'slide'));
    toggle.setAttribute('aria-label', next === 'slide' ? 'Show the room sidebar' : 'Show the slide full screen');
  }
  try {
    if (next === 'slide') localStorage.setItem(STORE, 'collapsed');
    else if (next === 'split') localStorage.setItem(STORE, 'open');
  } catch {
    // storage blocked: it just won't be remembered
  }
  listeners.forEach((listener) => listener());
  refresh();
}

/** Switches to `target`, or back to split when it is already showing. */
export const toggleView = (target) => setView(view === target ? 'split' : target);

export function initDeckView(revealDeck) {
  deck = revealDeck;
  let remembered = false;
  try {
    remembered = localStorage.getItem(STORE) === 'collapsed';
  } catch {
    // storage blocked
  }
  setView(remembered ? 'slide' : 'split');

  document.querySelector('.sidebar-toggle')?.addEventListener('click', () => toggleView('slide'));
  deck.addKeyBinding({ keyCode: 83, key: 'S', description: 'Slide full screen (hide the sidebar)' }, () => toggleView('slide'));
  deck.addKeyBinding({ keyCode: 82, key: 'R', description: 'The room full screen' }, () => toggleView('room'));
  deck.addKeyBinding({ keyCode: 67, key: 'C', description: 'The activity stream full screen' }, () => toggleView('activity'));
  deck.addKeyBinding({ keyCode: 68, key: 'D', description: 'The room recap full screen' }, () => toggleView('recap'));
  // Esc leaves the room, activity and recap views. Capture phase, so Reveal's overview doesn't open too.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && (view === 'room' || view === 'activity' || view === 'recap')) {
        event.preventDefault();
        event.stopPropagation();
        setView('split');
      }
    },
    true,
  );
}
