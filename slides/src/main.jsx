import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Highlight from 'reveal.js/plugin/highlight/highlight.esm.js';
import 'reveal.js/plugin/highlight/monokai.css';
import 'reveal.js/dist/reveal.css';
import { render } from 'preact';
import './index.css';
import Swarm from './components/Swarm.jsx';
import RoomCode from './components/RoomCode.jsx';
import RoomPulse from './components/RoomPulse.jsx';
import ActivityStream from './components/ActivityStream.jsx';
import Recap from './components/Recap.jsx';
import { reportSlide } from './room.js';
import { startMood } from './mood.js';
import { startActivity } from './activity.js';
import { initDeckView } from './deckView.js';

const components = {
  swarm: Swarm,
  'room-code': RoomCode,
  'room-pulse': RoomPulse,
  'activity-stream': ActivityStream,
  'room-recap': Recap,
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
  // Lets a <section data-markdown> be written as Markdown (https://revealjs.com/markdown/).
  // Syntax highlighting for <pre><code class="language-..."> and fenced Markdown code.
  plugins: [Markdown, Highlight],
});

deck.on('ready', (e) => report(e.currentSlide, e.indexh));
deck.on('slidechanged', (e) => report(e.currentSlide, e.indexh));

deck.initialize();

// The views (split, slide alone, room, activity and recap full screen), their keys and Esc.
initDeckView(deck);
