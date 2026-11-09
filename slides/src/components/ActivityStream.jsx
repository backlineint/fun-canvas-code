import { useEffect, useRef, useState } from 'preact/hooks';
import { useActivity } from '../useActivity.js';

// The same six colors as the attendee avatars (fun-canvas-project/src/lib/fun-room-avatars.tsx).
const AVATAR_COLORS = ['#FF5C4D', '#FFD84D', '#3B5BFF', '#7FD6A8', '#C9B6FF', '#FFB4A8'];

// The room's activity, in the bottom two thirds of the sidebar: today the comments
// attendees post, newest first. Items come from the deck's one poll (activity.js) as
// { kind: 'comment', id, who, avatar, slide, text, at }; requests and joins can use the
// same list with another `kind`. Text is rendered as text only. The oldest items simply
// fall off the bottom of the card.
export default function ActivityStream() {
  const { items, offline, loaded } = useActivity();

  // Items that arrived after the first load get a highlight, so a new comment is easy to spot.
  const first = useRef(true);
  const seen = useRef(new Set());
  const [fresh, setFresh] = useState(new Set());
  useEffect(() => {
    if (!loaded) return;
    const arrived = items.filter((item) => !seen.current.has(item.id)).map((item) => item.id);
    items.forEach((item) => seen.current.add(item.id));
    if (first.current) {
      first.current = false;
      return;
    }
    if (arrived.length) {
      setFresh(new Set(arrived));
      const t = setTimeout(() => setFresh(new Set()), 4000);
      return () => clearTimeout(t);
    }
  }, [items, loaded]);

  return (
    <section
      aria-label="Activity"
      className="box-border flex h-full min-h-0 flex-col gap-3 rounded-2xl bg-white px-4 py-4 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-display text-xl font-extrabold">Activity</h3>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold tracking-wide text-white">
          {offline && items.length === 0
            ? 'OFFLINE'
            : items.length
              ? `${items.length}${items.length >= 50 ? '+' : ''} ${items.length === 1 ? 'COMMENT' : 'COMMENTS'}`
              : 'COMMENTS'}
        </span>
      </div>
      <div role="log" aria-live="polite" aria-relevant="additions" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {items.length === 0 ? (
          <p className="m-0 text-base leading-snug">
            {offline ? 'No connection to the room.' : loaded ? 'No comments yet. Post one from your phone.' : 'Connecting...'}
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className={`flex shrink-0 gap-3 rounded-xl p-2.5 transition-colors duration-1000 ${
                fresh.has(item.id) ? 'bg-sun/60' : 'bg-ink/5'
              }`}
            >
              <span
                className="mt-1 size-4 shrink-0 rounded-full ring-2 ring-ink/70"
                style={{ backgroundColor: AVATAR_COLORS[item.avatar] ?? AVATAR_COLORS[0] }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold">
                  {item.who} <span className="font-medium">· slide {item.slide}</span>
                </div>
                <p className="m-0 line-clamp-4 text-lg leading-snug [overflow-wrap:anywhere]">{item.text}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
