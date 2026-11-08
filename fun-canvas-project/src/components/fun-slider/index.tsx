import { useEffect, useRef, useState } from 'react';
import { avatarAt, Face } from '@/lib/fun-room-avatars';
import { sendVote, VoteError } from '@/lib/fun-room-live';
import {
  clearJoined,
  saveFun,
  useJoined,
  useMyFun,
} from '@/lib/fun-room-session';
import { cn } from 'drupal-canvas';
import { useSiteContext } from 'drupal-canvas/react';
import type { ChangeEvent } from 'react';

type FunSliderProps = {
  code: string;
  className?: string;
};

/** How long after the last movement the value is sent. */
const SEND_AFTER_MS = 300;
/** How long to wait before trying again after a network error or rate limit. */
const RETRY_MS = 3000;

type Problem = 'closed' | 'lost' | 'offline' | null;

// The attendee's fun slider. The dot moves the instant they drag; the value is
// sent shortly after they pause. One request is in flight at a time and the
// newest value always goes next, so quick drags can't arrive out of order and
// leave the swarm on a stale value.
export default function FunSlider({ code, className }: FunSliderProps) {
  const base = useSiteContext()?.baseUrl ?? '';
  const joined = useJoined();
  const mine = useMyFun(code);
  const me =
    joined && joined.roomCode.toUpperCase() === code.toUpperCase()
      ? joined.participant
      : null;

  const [dragValue, setDragValue] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const value = dragValue ?? mine?.value ?? null;

  // What the (re-created each render) send function needs, kept in refs so the
  // timers always see the current values.
  const auth = useRef({ base, code, token: me?.token ?? '' });
  const latest = useRef<number | null>(null);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unmounted = useRef(false);
  const fatal = useRef(false);

  useEffect(() => {
    // A new token (they joined again) clears an earlier fatal error.
    if (auth.current.token !== (me?.token ?? '')) fatal.current = false;
    auth.current = { base, code, token: me?.token ?? '' };
  });

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      clearTimeout(timer.current);
    };
  }, []);

  async function flush(): Promise<void> {
    const { base: site, code: room, token } = auth.current;
    if (
      sending.current ||
      latest.current === null ||
      !token ||
      fatal.current ||
      unmounted.current
    ) {
      return;
    }

    sending.current = true;
    const sent = latest.current;
    let retry = false;
    try {
      const result = await sendVote(site, room, token, sent);
      saveFun(room, { id: result.id, value: sent });
      setProblem(null);
    } catch (e) {
      const status = e instanceof VoteError ? e.status : 0;
      if (status === 403) {
        // The site no longer knows this token (it was reset): they have to join again.
        fatal.current = true;
        clearJoined();
        setProblem('lost');
      } else if (status === 409) {
        fatal.current = true;
        setProblem('closed');
      } else {
        retry = true;
        // A rate limit (429) clears by itself, so only say "offline" otherwise.
        if (status !== 429) setProblem('offline');
      }
    } finally {
      sending.current = false;
    }

    if (fatal.current || unmounted.current) return;
    if (retry) {
      timer.current = setTimeout(flush, RETRY_MS);
    } else if (latest.current !== sent) {
      // They moved again while that was in flight.
      void flush();
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.currentTarget.value);
    setDragValue(next);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SEND_AFTER_MS);
  }

  const ready = joined !== undefined;
  const disabled = !me || problem === 'closed' || problem === 'lost';
  const position = value ?? 50;

  return (
    <section className={cn('rounded-3xl bg-white p-5 text-ink', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-xl font-extrabold">
          How fun is it for you?
        </h2>
        <span
          className="font-display text-3xl leading-none font-extrabold"
          aria-hidden="true"
        >
          {value ?? '--'}
        </span>
      </div>

      {/* A dot you can drag. The real range input sits invisibly on top, so touch,
          mouse and keyboard all work and a screen reader gets a normal slider. */}
      <div className="px-5 pt-3 pb-1">
        <div className="relative h-14 rounded-full has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-fun-blue/40">
          <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-ink/15" />
          <div
            className="absolute top-1/2 left-0 h-3 -translate-y-1/2 rounded-full bg-fun-blue"
            style={{ width: `${position}%` }}
          />
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity',
              disabled && 'opacity-50',
            )}
            style={{ left: `${position}%` }}
          >
            {me ? (
              <Face avatar={avatarAt(me.avatar)} size={44} />
            ) : (
              <span className="block size-11 rounded-full bg-muted" />
            )}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={position}
            disabled={disabled}
            onChange={onChange}
            aria-label="Your fun level"
            aria-valuetext={
              value === null ? 'not set yet' : `${value} out of 100`
            }
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
        <div className="mt-1 flex justify-between text-sm font-bold">
          <span>meh</span>
          <span>boatloads</span>
        </div>
      </div>

      <p role="status" className="m-0 mt-2 min-h-6 text-base">
        {problem === 'closed' ? (
          'This room has closed.'
        ) : problem === 'lost' ? (
          <>
            We lost track of you.{' '}
            <a
              href={`/?code=${encodeURIComponent(code)}`}
              className="font-bold underline"
            >
              Join the room again
            </a>
            .
          </>
        ) : problem === 'offline' ? (
          "We can't reach the room right now. Retrying."
        ) : !ready ? null : !me ? (
          <>
            Join this room to move your dot.{' '}
            <a
              href={`/?code=${encodeURIComponent(code)}`}
              className="font-bold underline"
            >
              Join
            </a>
          </>
        ) : value === null ? (
          'Drag the dot to join the swarm.'
        ) : (
          `Your dot is at ${value}.`
        )}
      </p>
    </section>
  );
}
