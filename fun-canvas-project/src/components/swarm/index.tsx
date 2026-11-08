import { avatarAt } from '@/lib/fun-room-avatars';
import { fetchSwarm } from '@/lib/fun-room-live';
import { moodFor } from '@/lib/fun-room-mood';
import { useMyFun } from '@/lib/fun-room-session';
import { cn } from 'drupal-canvas';
import { useSiteContext } from 'drupal-canvas/react';
import useSWR from 'swr';

type SwarmProps = {
  code: string;
  pollMs?: number;
  className?: string;
};

// Everyone in the room as a dot on a 0-100 fun scale, with the room's median.
// It polls the swarm endpoint, so dots slide to their new places as people move
// their sliders. This browser's own dot is drawn larger so it is easy to find.
export default function Swarm({ code, pollMs = 2000, className }: SwarmProps) {
  const base = useSiteContext()?.baseUrl ?? '';
  const mine = useMyFun(code);

  const { data, error } = useSWR(
    code ? ['fun-swarm', base, code] : null,
    () => fetchSwarm(base, code),
    { refreshInterval: pollMs, dedupingInterval: 0 },
  );

  const mood = moodFor(data?.tier);
  const median = data?.median ?? null;
  const summary = data?.voters
    ? `Swarm of ${data.voters} ${data.voters === 1 ? 'attendee' : 'attendees'}, median fun ${median} out of 100`
    : 'The swarm is empty: nobody has moved their dot yet';

  return (
    <section
      className={cn(
        'flex h-full min-h-80 flex-col rounded-3xl bg-white p-5 text-ink',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-7xl leading-none font-extrabold">
            {median ?? '--'}
          </div>
          <div className="mt-2 text-lg font-bold">
            {mood.label}: {mood.headline}
          </div>
        </div>
        <div className="shrink-0 text-sm font-bold">
          {data ? `${data.count} in the room` : 'Connecting...'}
        </div>
      </div>

      {error ? (
        <p role="status" className="m-0 mt-2 text-sm font-bold">
          We can&apos;t reach the swarm right now. Retrying.
        </p>
      ) : null}

      <div
        role="img"
        aria-label={summary}
        className="relative mt-4 min-h-48 flex-1 overflow-hidden rounded-2xl bg-cream"
      >
        {median !== null ? (
          <span
            className="absolute inset-y-0 w-1 bg-ink/70 transition-[left] duration-700 ease-out"
            style={{ left: `${median}%` }}
          />
        ) : null}

        {data?.dots.map((dot) => {
          const isMine = mine?.id === dot.id;
          return (
            <span
              key={dot.id}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-700 ease-out',
                isMine && 'z-10',
              )}
              style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
            >
              <span
                className={cn(
                  'block rounded-full ring-ink',
                  isMine ? 'size-7 ring-4' : 'size-4 ring-2 ring-ink/70',
                  mood.lively && 'motion-safe:animate-wiggle',
                )}
                style={{ backgroundColor: avatarAt(dot.avatar).bg }}
              />
            </span>
          );
        })}

        <span className="absolute bottom-2 left-4 text-sm font-bold">meh</span>
        <span className="absolute right-4 bottom-2 text-sm font-bold">
          boatloads
        </span>
      </div>
    </section>
  );
}
