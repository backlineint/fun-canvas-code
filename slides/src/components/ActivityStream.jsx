import { useEffect, useRef, useState } from 'preact/hooks';
import { useActivity } from '../useActivity.js';

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
      className="box-border flex h-full min-h-0 flex-col gap-3 rounded-2xl bg-white px-4 py-4 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-display text-xl font-extrabold">Activity</h3>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold tracking-wide text-white">
          {offline && items.length === 0 ? 'OFFLINE' : items.length ? `${items.length} ${items.length === 1 ? 'ITEM' : 'ITEMS'}` : 'ACTIVITY'}
        </span>
      </div>
      <div role="log" aria-live="polite" aria-relevant="additions" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        {items.length === 0 ? (
          <p className="m-0 text-base leading-snug">
            {offline ? 'No connection to the room.' : loaded ? 'Nothing yet. Rate a slide or post a comment from your phone.' : 'Connecting...'}
          </p>
        ) : (
          items.map((item) => {
            const highlight = fresh.has(signature(item)) ? 'bg-sun/60' : 'bg-ink/5';
            const dot = (
              <span
                className="size-4 shrink-0 rounded-full ring-2 ring-ink/70"
                style={{ backgroundColor: AVATAR_COLORS[item.avatar] ?? AVATAR_COLORS[0] }}
                aria-hidden="true"
              />
            );
            return item.kind === 'rating' ? (
              <article key={item.key} className={`flex shrink-0 items-center gap-3 rounded-xl px-2.5 py-1.5 text-base transition-colors duration-1000 ${highlight}`}>
                {dot}
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="font-bold">{item.who}</span> rated slide {item.slide}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-base font-extrabold text-ink ${TIER_STYLES[item.tier] ?? TIER_STYLES.mid}`}
                  aria-label={`${item.value} out of 100`}
                >
                  {item.value}
                </span>
              </article>
            ) : (
              <article key={item.key} className={`flex shrink-0 gap-3 rounded-xl p-2.5 transition-colors duration-1000 ${highlight}`}>
                <span className="mt-1 flex">{dot}</span>
                <div className="min-w-0">
                  <div className="text-sm font-bold">
                    {item.who} <span className="font-medium">· slide {item.slide}</span>
                  </div>
                  <p className="m-0 line-clamp-4 text-lg leading-snug [overflow-wrap:anywhere]">{item.text}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
