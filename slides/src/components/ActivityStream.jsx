// The room's activity, in the bottom two thirds of the sidebar. A placeholder for now.
// When the features land, each item looks like:
//   { kind: 'comment' | 'request' | 'join', who, slide, text, at }
// newest first, in the list region below (it is a log, so screen readers hear new
// items politely). Nothing is invented here: until there is real activity the card
// says what will appear.
export default function ActivityStream() {
  return (
    <section
      aria-label="Activity"
      className="box-border flex h-full min-h-0 flex-col gap-3 rounded-2xl border-2 border-dashed border-ink/55 bg-white/60 px-4 py-4 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-display text-xl font-extrabold">Activity</h3>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold tracking-wide text-white">COMING SOON</span>
      </div>
      <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-hidden">
        <p className="m-0 text-base leading-snug">Comments, requests and joins will show up here.</p>
      </div>
    </section>
  );
}
