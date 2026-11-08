import { Children } from 'react';
import { fetchRoom } from '@/lib/fun-room-api';
import { avatarAt, Face } from '@/lib/fun-room-avatars';
import { useJoined } from '@/lib/fun-room-session';
import { cn } from 'drupal-canvas';
import { useJsonApiClient, usePageContext } from 'drupal-canvas/react';
import useSWR from 'swr';
import type { ReactNode } from 'react';

type RoomProps = {
  code: string;
  /** "open" or "closed". The template maps the field's label, so "Open" and "Closed" arrive too. */
  status: string;
  currentSlide?: number;
  pollMs?: number;
  swarm?: ReactNode;
  slider?: ReactNode;
  requests?: ReactNode;
  comments?: ReactNode;
  className?: string;
};

// The room page, used as the one Canvas template for every room node. The
// template's entity-field props paint the first render; on a real room page the
// component then polls the room (its uuid comes from the page context) so status
// and slide changes show up without a reload. Each feature slot takes the
// component that implements it, or a Placeholder until its backend exists.
export default function Room({
  code,
  status,
  currentSlide = 0,
  pollMs = 2000,
  swarm,
  slider,
  requests,
  comments,
  className,
}: RoomProps) {
  const client = useJsonApiClient();
  const { mainEntity } = usePageContext();
  const uuid = mainEntity?.uuid;

  const { data, error } = useSWR(
    client && uuid && pollMs > 0 ? ['fun-room', uuid] : null,
    () => fetchRoom(client, uuid as string),
    { refreshInterval: pollMs, dedupingInterval: 0 },
  );

  const view = {
    code: data?.code ?? code,
    status: data?.status ?? status,
    currentSlide: data?.currentSlide ?? currentSlide,
  };
  const isOpen = view.status.toLowerCase() !== 'closed';

  // Who this browser joined as. `joined` is undefined until the browser has been
  // asked, so nothing flashes on the first paint. Someone who arrives by a shared
  // link or QR code has not joined this room here yet; they get a link to the
  // join flow with the code filled in instead of a name.
  const joined = useJoined();
  const me =
    joined && joined.roomCode.toUpperCase() === code.toUpperCase()
      ? joined.participant
      : null;

  // On phones this is one column. From the lg breakpoint the header becomes a
  // full-height panel that stays put on the left, and the feature slots fill a
  // two-column grid on the right.
  return (
    <div
      className={cn(
        'min-h-dvh bg-cream font-sans text-ink lg:grid lg:grid-cols-[5fr_7fr]',
        className,
      )}
    >
      <header className="mx-auto flex w-full max-w-[480px] flex-col gap-3 px-6 pt-7 lg:sticky lg:top-0 lg:mx-0 lg:h-dvh lg:max-w-none lg:justify-center lg:gap-6 lg:bg-sun lg:px-12 lg:py-16">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-bold tracking-[0.12em] uppercase">
            Room
          </div>
          {me ? (
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-white py-1 pr-4 pl-1 text-sm font-bold">
              <Face avatar={avatarAt(me.avatar)} size={32} />
              <span className="sr-only">Joined as </span>
              <span className="truncate">{me.name}</span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:gap-5">
          <h1 className="m-0 font-display text-5xl leading-none font-extrabold [overflow-wrap:anywhere] lg:text-7xl">
            {view.code}
          </h1>
          <span
            className={cn(
              'rounded-full px-4 py-2 text-sm font-bold lg:px-5 lg:py-2.5 lg:text-base',
              isOpen
                ? 'bg-sun text-ink lg:bg-ink lg:text-sun'
                : 'bg-ink text-white lg:bg-white lg:text-ink',
            )}
          >
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>
        <p className="m-0 text-lg lg:text-2xl">
          Now on slide{' '}
          <span className="font-bold">{view.currentSlide + 1}</span>
        </p>
        {error ? (
          <p role="status" className="m-0 text-sm font-bold">
            We can&apos;t reach the room right now. Retrying.
          </p>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-6 pt-5 pb-7 lg:grid lg:max-w-3xl lg:grid-cols-2 lg:content-start lg:gap-6 lg:px-12 lg:py-16">
        {joined !== undefined && !me ? (
          <a
            href={`/?code=${encodeURIComponent(view.code)}`}
            className="rounded-2xl bg-ink px-5 py-4 text-center text-lg font-bold text-white no-underline lg:col-span-2"
          >
            Join this room
          </a>
        ) : null}

        <Slot wide>{swarm}</Slot>
        <Slot>{slider}</Slot>
        <Slot>{requests}</Slot>
        <Slot wide>{comments}</Slot>
      </div>
    </div>
  );
}

// One cell of the wide layout's grid. Renders nothing for an empty slot, so an
// unused slot leaves no gap. The cell is itself a grid so its content stretches
// to the row's height (Canvas wraps slot content in display: contents elements,
// so the content sits directly in this cell's grid).
function Slot({ children, wide }: { children?: ReactNode; wide?: boolean }) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <div className={cn('lg:grid', wide && 'lg:col-span-2')}>{children}</div>
  );
}
