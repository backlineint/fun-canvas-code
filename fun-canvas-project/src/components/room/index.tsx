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

  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-cream px-6 py-7 font-sans text-ink',
        className,
      )}
    >
      <header className="flex flex-col gap-3">
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 font-display text-5xl leading-none font-extrabold">
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
        <p className="m-0 text-lg">
          Now on slide{' '}
          <span className="font-bold">{view.currentSlide + 1}</span>
        </p>
        {error ? (
          <p role="status" className="m-0 text-sm font-bold">
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

      {swarm}
      {slider}
      {requests}
      {comments}
    </div>
  );
}
