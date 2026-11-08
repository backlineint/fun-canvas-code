import { useSyncExternalStore } from 'react';
import { fetchRoom } from '@/lib/fun-room-api';
import { readJoined } from '@/lib/fun-room-session';
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

// Re-checks whether this browser joined the room when storage changes (for
// example after joining in another tab).
function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

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

  // Someone who arrives by a shared link or QR code has not joined this room in
  // this browser yet; point them at the join flow with the code filled in.
  const joinedHere = useSyncExternalStore(
    subscribeToStorage,
    () => {
      const joined = readJoined();
      return (
        joined !== null && joined.roomCode.toUpperCase() === code.toUpperCase()
      );
    },
    () => true,
  );

  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 bg-cream px-6 py-7 font-sans text-ink',
        className,
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="text-[13px] font-bold tracking-[0.12em] uppercase">
          Room
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

      {joinedHere ? null : (
        <a
          href={`/?code=${encodeURIComponent(view.code)}`}
          className="rounded-2xl bg-ink px-5 py-4 text-center text-lg font-bold text-white no-underline"
        >
          Join this room
        </a>
      )}

      {swarm}
      {slider}
      {requests}
      {comments}
    </div>
  );
}
