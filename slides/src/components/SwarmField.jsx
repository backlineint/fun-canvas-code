// The same six colors as the attendee avatars (fun-canvas-project/src/lib/fun-room-avatars.tsx),
// so a dot matches the face its owner picked.
const AVATAR_COLORS = ['#FF5C4D', '#FFD84D', '#3B5BFF', '#7FD6A8', '#C9B6FF', '#FFB4A8'];

// The dots, the median line and the "meh / boatloads" ends, filling its parent's
// size. `compact` is the small version for the sidebar.
export default function SwarmField({ state, compact = false }) {
  const median = state?.median ?? null;
  const dots = state?.dots ?? [];
  // A big room's dots shrink so the small field doesn't turn into a smear.
  const dotSize = compact ? (dots.length > 60 ? 'size-2' : 'size-2.5') : 'size-5';
  const label =
    median === null
      ? 'Swarm of attendees: nobody has moved their dot yet'
      : `Swarm of attendees, median fun ${median} out of 100`;

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-mood-field ${
        compact ? 'rounded-xl' : 'rounded-3xl border-4 border-ink'
      }`}
      role="img"
      aria-label={label}
    >
      {state && (
        <>
          {median !== null && (
            <span
              className={`absolute inset-y-0 transition-[left] duration-700 ease-out ${
                compact ? 'w-[3px] bg-ink/70' : 'w-1 bg-coral'
              }`}
              style={{ left: `${median}%` }}
            />
          )}
          {dots.map((d) => (
            <span
              key={d.id}
              className={`absolute ${dotSize} -translate-x-1/2 -translate-y-1/2 rounded-full ring-ink/70 transition-[left,top] duration-700 ease-out ${
                compact ? 'ring-[1.5px]' : 'ring-2'
              }`}
              style={{ left: `${d.x}%`, top: `${d.y}%`, backgroundColor: AVATAR_COLORS[d.avatar] ?? AVATAR_COLORS[0] }}
            />
          ))}
        </>
      )}
      <span className={`absolute font-bold ${compact ? 'bottom-1 left-2 text-[11px]' : 'bottom-2 left-4 text-sm'}`}>meh</span>
      <span className={`absolute font-bold ${compact ? 'right-2 bottom-1 text-[11px]' : 'right-4 bottom-2 text-sm'}`}>boatloads</span>
    </div>
  );
}
