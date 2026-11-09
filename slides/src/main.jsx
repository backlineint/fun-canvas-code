import Reveal from 'reveal.js';
import 'reveal.js/dist/reveal.css';
import { render } from 'preact';
import './index.css';
import Swarm from './components/Swarm.jsx';
import RoomCode from './components/RoomCode.jsx';
import RoomPulse from './components/RoomPulse.jsx';
import ActivityStream from './components/ActivityStream.jsx';
import { reportSlide } from './room.js';
import { startMood } from './mood.js';
import { startActivity } from './activity.js';

const components = {
  swarm: Swarm,
  'room-code': RoomCode,
  'room-pulse': RoomPulse,
  'activity-stream': ActivityStream,
};

document.querySelectorAll('[data-component]').forEach((el) => {
  const Component = components[el.dataset.component];
  if (Component) render(<Component />, el);
});

function report(slide, index) {
  if (!slide) return;
  reportSlide({
    id: slide.dataset.id || `slide-${index}`,
    title: slide.dataset.title || slide.querySelector('h1, h2')?.textContent || '',
    index,
  });
}

// The room records activity against a slide id, so ids must be unique. Repeats
// (a slide split into several sections, say) get a numeric suffix at runtime; the
// slide index is always unique. Rename the ids in index.html to silence the warning.
const seenIds = new Map();
document.querySelectorAll('.slides > section[data-id]').forEach((section) => {
  const id = section.dataset.id;
  const count = (seenIds.get(id) ?? 0) + 1;
  seenIds.set(id, count);
  if (count > 1) section.dataset.id = `${id}-${count}`;
});
const repeated = [...seenIds].filter(([, count]) => count > 1).map(([id]) => id);
if (repeated.length) console.warn('Repeated slide ids in index.html:', repeated.join(', '));

// One poll of the room themes every slide and feeds the swarm slide.
if (new URLSearchParams(window.location.search).get('sidebar') === 'off') document.documentElement.classList.add('no-sidebar');
startMood();
startActivity();

// Embedded so the deck sizes to its cell beside the room sidebar instead of the whole
// window. `keyboardCondition: null` keeps the arrow keys working without a click.
const deck = new Reveal({
  hash: true,
  width: 1280,
  height: 720,
  transition: 'fade',
  embedded: true,
  keyboardCondition: null,
});

deck.on('ready', (e) => report(e.currentSlide, e.indexh));
deck.on('slidechanged', (e) => report(e.currentSlide, e.indexh));

deck.initialize();

// The sidebar can be hidden with the button or the S key, for example when a comment
// shouldn't be on the screen. It stays hidden across reloads until shown again, and
// Reveal is told to re-fit the slide to the width it now has.
const toggle = document.querySelector('.sidebar-toggle');
const root = document.documentElement;
const STORE = 'fun-o-meter:deck-sidebar';
function setCollapsed(collapsed) {
  root.classList.toggle('sidebar-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Show the room sidebar' : 'Hide the room sidebar');
  try {
    localStorage.setItem(STORE, collapsed ? 'collapsed' : 'open');
  } catch {
    // storage blocked: it just won't be remembered
  }
  deck.layout();
}
let remembered = false;
try {
  remembered = localStorage.getItem(STORE) === 'collapsed';
} catch {
  // storage blocked
}
if (remembered) setCollapsed(true);
toggle.addEventListener('click', () => setCollapsed(!root.classList.contains('sidebar-collapsed')));
deck.addKeyBinding({ keyCode: 83, key: 'S', description: 'Hide or show the room sidebar' }, () =>
  setCollapsed(!root.classList.contains('sidebar-collapsed')),
);
