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
  slideTitle?: string;
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
  slideTitle = '',
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
    // Polled data is authoritative, so an empty polled title stays empty.
    slideTitle: data?.slideTitle ?? slideTitle,
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

  // On phones this is one column: the header, then the slots in order. From the
  // lg breakpoint it follows the presenter screen: a main column (the room
  // header and slide bar, the swarm filling the height, the slider under it)
  // beside a 360px sidebar (requests, then comments filling the rest). On
  // phones the two column wrappers use `contents`, so their children flow as
  // one column in the same order. On wide screens the page is exactly one screen
  // tall, so a long comment list scrolls inside its card instead of stretching the
  // page (the grid row is `minmax(0, 1fr)` so a slot's content can't outgrow it).
  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-mood-bg px-6 py-7 font-sans text-ink motion-safe:transition-colors motion-safe:duration-[1500ms] lg:h-dvh lg:max-w-[1600px] lg:flex-row lg:gap-7 lg:p-8',
        className,
      )}
    >
      <div className="contents lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-y-auto">
        <header className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-4">
          <div className="flex items-center justify-between gap-3 lg:contents">
            <div className="text-[13px] font-bold tracking-[0.12em] uppercase lg:col-start-1 lg:row-start-1">
              Room
            </div>
            {me ? (
              <div className="flex min-w-0 items-center gap-2 rounded-full bg-white py-1 pr-4 pl-1 text-sm font-bold lg:col-start-3 lg:row-start-1">
                <Face avatar={avatarAt(me.avatar)} size={32} />
                <span className="sr-only">Joined as </span>
                <span className="truncate">{me.name}</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 lg:col-start-2 lg:row-start-1 lg:justify-start lg:gap-4">
            <h1 className="m-0 font-display text-5xl leading-none font-extrabold [overflow-wrap:anywhere] lg:text-4xl">
              {view.code}
            </h1>
            <span
              className={cn(
                'rounded-full px-4 py-2 text-sm font-bold',
                isOpen ? 'bg-sun text-ink' : 'bg-ink text-white',
              )}
            >
              {isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
          <p className="m-0 text-lg lg:col-span-3 lg:rounded-3xl lg:bg-ink lg:px-6 lg:py-4 lg:text-white">
            <span className="hidden text-[13px] font-bold tracking-[0.1em] uppercase lg:block">
              Now showing
            </span>
            <span className="lg:font-display lg:text-3xl lg:font-extrabold">
              <span className="lg:hidden">Now on </span>
              <span className="lg:capitalize">slide</span>{' '}
              <span className="font-bold">{view.currentSlide + 1}</span>
              {view.slideTitle ? (
                <>
                  <span className="hidden lg:inline"> · </span>
                  <span className="block font-bold [overflow-wrap:anywhere] lg:inline">
                    {view.slideTitle}
                  </span>
                </>
              ) : null}
            </span>
          </p>
          {error ? (
            <p role="status" className="m-0 text-sm font-bold lg:col-span-3">
              We can&apos;t reach the room right now. Retrying.
            </p>
          ) : null}
        </header>

        {joined !== undefined && !me ? (
          <a
            href={`/?code=${encodeURIComponent(view.code)}`}
            className="rounded-2xl bg-ink px-5 py-4 text-center text-lg font-bold text-white no-underline"
          >
            Join this room
          </a>
        ) : null}

        <Slot grow>{swarm}</Slot>
        <Slot>{slider}</Slot>
      </div>

      <div className="contents lg:flex lg:min-h-0 lg:w-[360px] lg:shrink-0 lg:flex-col lg:gap-4">
        <Slot>{requests}</Slot>
        <Slot grow>{comments}</Slot>
      </div>
    </div>
  );
}

// One cell of the wide layout. Renders nothing for an empty slot, so an unused
// slot leaves no gap. `grow` makes it take the column's remaining height. The
// cell is itself a grid so its content stretches to the cell's height (Canvas
// wraps slot content in display: contents elements, so the content sits
// directly in this cell's grid).
function Slot({ children, grow }: { children?: ReactNode; grow?: boolean }) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <div
      className={cn(
        'lg:grid',
        grow && 'lg:min-h-64 lg:flex-1 lg:grid-rows-[minmax(0,1fr)]',
      )}
    >
      {children}
    </div>
  );
}
