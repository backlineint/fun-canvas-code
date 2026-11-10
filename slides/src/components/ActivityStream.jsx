import { useEffect, useRef, useState } from 'preact/hooks';
import { useActivity } from '../useActivity.js';
import { useDeckView } from '../useDeckView.js';
import ViewButton from './ViewButton.jsx';

// The same six colors as the attendee avatars (fun-canvas-project/src/lib/fun-room-avatars.tsx).
const AVATAR_COLORS = ['#FF5C4D', '#FFD84D', '#3B5BFF', '#7FD6A8', '#C9B6FF', '#FFB4A8'];

// The value pill's colors by the room's mood tiers (the same family as the mood palette).
// Dark ink text on every one; the number is always shown, so color is never the only cue.
const TIER_STYLES = {
  low: 'bg-[#cdd7f0]',
  mid: 'bg-[#ffe2a0]',
  high: 'bg-[#ff9a72]',
};

// What changed about an item, so a new or updated one is highlighted and an unchanged one isn't.
const signature = (item) => `${item.key}:${item.value ?? ''}`;

// The room's activity, in the bottom two thirds of the sidebar, newest first: comments
// attendees post and slide ratings. Items come from the deck's one poll (activity.js):
//   { kind: 'comment', key, who, avatar, slide, text, ts }
//   { kind: 'rating',  key, who, avatar, slide, value, tier, ts }
// Text is rendered as text only. The list scrolls (the newest are at the top, and a new item
// arriving while you are scrolled down doesn't move your view).
export default function ActivityStream() {
  const { items, offline, loaded } = useActivity();
  // With the activity view on (C, or the button) the stream fills the screen with bigger text.
  const full = useDeckView() === 'activity';

  const first = useRef(true);
  const seen = useRef(new Set());
  const [fresh, setFresh] = useState(new Set());
  useEffect(() => {
    if (!loaded) return;
    const arrived = items.map(signature).filter((sig) => !seen.current.has(sig));
    arrived.forEach((sig) => seen.current.add(sig));
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
      className={`box-border flex h-full min-h-0 flex-col bg-white text-left ${full ? 'gap-5 rounded-3xl px-10 py-8' : 'gap-3 rounded-2xl px-4 py-4'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className={`m-0 font-display font-extrabold ${full ? 'text-5xl' : 'text-xl'}`}>Activity</h3>
        <span className="flex items-center gap-3">
        <span className={`rounded-full bg-ink font-bold tracking-wide text-white ${full ? 'px-5 py-2 text-xl' : 'px-3 py-1 text-xs'}`}>
          {offline && items.length === 0 ? 'OFFLINE' : items.length ? `${items.length} ${items.length === 1 ? 'ITEM' : 'ITEMS'}` : 'ACTIVITY'}
        </span>
        <ViewButton target="activity" name="the activity stream" keyName="C" />
        </span>
      </div>
      <div role="log" aria-live="polite" aria-relevant="additions" className={`mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] ${full ? 'max-w-5xl gap-4' : 'gap-2'}`}>
        {items.length === 0 ? (
          <p className={`m-0 leading-snug ${full ? 'text-3xl' : 'text-base'}`}>
            {offline ? 'No connection to the room.' : loaded ? 'Nothing yet. Rate a slide or post a comment from your phone.' : 'Connecting...'}
          </p>
        ) : (
          items.map((item) => {
            const highlight = fresh.has(signature(item)) ? 'bg-sun/60' : 'bg-ink/5';
            const dot = (
              <span
                className={`shrink-0 rounded-full ring-ink/70 ${full ? 'size-8 ring-[3px]' : 'size-4 ring-2'}`}
                style={{ backgroundColor: AVATAR_COLORS[item.avatar] ?? AVATAR_COLORS[0] }}
                aria-hidden="true"
              />
            );
            return item.kind === 'rating' ? (
              <article key={item.key} className={`flex shrink-0 items-center transition-colors duration-1000 ${highlight} ${full ? 'gap-5 rounded-2xl px-5 py-3 text-3xl' : 'gap-3 rounded-xl px-2.5 py-1.5 text-base'}`}>
                {dot}
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="font-bold">{item.who}</span> rated slide {item.slide}
                </span>
                <span
                  className={`rounded-full font-extrabold text-ink ${full ? 'px-5 py-1 text-3xl' : 'px-2.5 py-0.5 text-base'} ${TIER_STYLES[item.tier] ?? TIER_STYLES.mid}`}
                  aria-label={`${item.value} out of 100`}
                >
                  {item.value}
                </span>
              </article>
            ) : (
              <article key={item.key} className={`flex shrink-0 transition-colors duration-1000 ${highlight} ${full ? 'gap-5 rounded-2xl p-5' : 'gap-3 rounded-xl p-2.5'}`}>
                <span className="mt-1 flex">{dot}</span>
                <div className="min-w-0">
                  <div className={`font-bold ${full ? 'text-2xl' : 'text-sm'}`}>
                    {item.who} <span className="font-medium">· slide {item.slide}</span>
                  </div>
                  <p className={`m-0 leading-snug [overflow-wrap:anywhere] ${full ? 'line-clamp-6 text-4xl' : 'line-clamp-4 text-lg'}`}>{item.text}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
