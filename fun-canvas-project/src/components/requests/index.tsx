import { useEffect, useState } from 'react';
import {
  cancelRequest,
  fetchRequests,
  REQUEST_KINDS,
  RequestError,
  sendRequest,
} from '@/lib/fun-room-live';
import {
  clearJoined,
  readMyRequests,
  readRequestNote,
  rememberRequest,
  saveRequestNote,
  useJoined,
} from '@/lib/fun-room-session';
import { cn } from 'drupal-canvas';
import { useSiteContext } from 'drupal-canvas/react';
import useSWR from 'swr';
import type { RequestKind, RoomRequest } from '@/lib/fun-room-live';

type RequestsProps = {
  code: string;
  pollMs?: number;
  className?: string;
};

/** The longest note, in characters. The server enforces the same limit. */
const MAX_NOTE = 40;

type Problem = 'closed' | 'lost' | null;

// A small picture for each kind: a party hat, a party blower, a wrapped candy. They are
// decoration (the label says what it is), so they are hidden from screen readers.
function KindIcon({ kind }: { kind: RequestKind }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="#17163a"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'hat' ? (
        <>
          <path d="M24 8 L8 42 H40 Z" fill="#ff5c4d" />
          <path d="M16 28 L21 33 L26 28 L31 33 M12 38 L17 42 M20 38 L25 42 M28 38 L33 42" />
          <circle cx="24" cy="7" r="4" fill="#ffd84d" />
        </>
      ) : kind === 'noise' ? (
        <>
          <path d="M6 40 L26 14 L36 24 Z" fill="#ffd84d" />
          <path d="M14 30 L22 36 M19 22 L28 30" />
          <circle cx="36" cy="10" r="2.5" fill="#3b5bff" />
          <circle cx="42" cy="18" r="2.5" fill="#ff5c4d" />
          <circle cx="30" cy="6" r="2.5" fill="#7fd6a8" />
        </>
      ) : (
        <>
          <path d="M14 24 L4 14 V34 Z" fill="#c9b6ff" />
          <path d="M34 24 L44 14 V34 Z" fill="#c9b6ff" />
          <circle cx="24" cy="24" r="12" fill="#ff5c4d" />
          <path d="M18 18 C21 16 25 16 28 18" />
        </>
      )}
    </svg>
  );
}

// Ask a volunteer for a party hat, a noise maker or candy, with an optional note about
// where you are sitting. A request stays "on its way" until a volunteer marks it
// delivered on the deck (or you cancel it); after that you can ask again. This browser
// follows only its own requests, by the ids it remembered.
export default function Requests({
  code,
  pollMs = 3000,
  className,
}: RequestsProps) {
  const base = useSiteContext()?.baseUrl ?? '';
  const joined = useJoined();
  const me =
    joined && joined.roomCode.toUpperCase() === code.toUpperCase()
      ? joined.participant
      : null;

  const [ids, setIds] = useState<number[]>([]);
  const [known, setKnown] = useState<Record<number, RoomRequest>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [problem, setProblem] = useState<Problem>(null);
  const [notice, setNotice] = useState('');

  // What this browser remembers (read after mount: the server render has no storage).
  useEffect(() => {
    setIds(readMyRequests(code));
    setNote(readRequestNote(code));
  }, [code]);

  const merge = (incoming: RoomRequest[]) =>
    setKnown((current) => {
      const next = { ...current };
      for (const request of incoming) next[request.id] = request;
      return next;
    });

  const { error } = useSWR(
    ids.length > 0 ? ['fun-requests', base, code, ids.join(',')] : null,
    () => fetchRequests(base, code, ids),
    { refreshInterval: pollMs, dedupingInterval: 0, onSuccess: merge },
  );

  // The latest request of each kind this browser knows of.
  const latest = (kind: RequestKind): RoomRequest | undefined =>
    ids
      .map((id) => known[id])
      .filter((request): request is RoomRequest => request?.kind === kind)
      .sort((a, b) => b.id - a.id)[0];

  const disabled = !me || problem !== null;

  function fail(e: unknown) {
    const status = e instanceof RequestError ? e.status : 0;
    if (status === 403) {
      clearJoined();
      setProblem('lost');
    } else if (status === 409) {
      setProblem('closed');
    } else if (status === 429) {
      setNotice('Slow down a little, then try again.');
    } else if (status === 422) {
      setNotice("That request can't be sent.");
    } else {
      setNotice("Couldn't send that. Try again.");
    }
  }

  async function ask(kind: RequestKind) {
    if (!me || busy[kind]) return;
    setBusy((current) => ({ ...current, [kind]: true }));
    setNotice('');
    try {
      const request = await sendRequest(
        base,
        code,
        me.token,
        kind,
        note.trim(),
      );
      rememberRequest(code, request.id);
      setIds((current) =>
        current.includes(request.id) ? current : [...current, request.id],
      );
      merge([request]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy((current) => ({ ...current, [kind]: false }));
    }
  }

  async function cancel(request: RoomRequest) {
    if (!me || busy[request.kind]) return;
    setBusy((current) => ({ ...current, [request.kind]: true }));
    setNotice('');
    try {
      merge([await cancelRequest(base, code, me.token, request.id)]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy((current) => ({ ...current, [request.kind]: false }));
    }
  }

  const ready = joined !== undefined;

  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-3xl bg-white p-5 text-ink',
        className,
      )}
    >
      <h2 className="m-0 font-display text-xl font-extrabold">Requests</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor={`note-${code}`} className="text-sm font-bold">
          Where are you sitting? (optional)
        </label>
        <input
          id={`note-${code}`}
          type="text"
          value={note}
          maxLength={MAX_NOTE}
          disabled={disabled}
          onChange={(event) => {
            setNote(event.target.value);
            saveRequestNote(code, event.target.value);
          }}
          placeholder="Back left, by the aisle"
          className="min-h-11 w-full rounded-2xl border-2 border-ink/30 bg-white px-3 text-base text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-ink/5"
        />
      </div>

      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
        {REQUEST_KINDS.map(({ kind, label, what }) => {
          const request = latest(kind);
          const open = request?.status === 'open';
          const delivered = request?.status === 'delivered';
          const tile =
            'flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-ink/5 px-1 py-3 text-center text-ink';
          const state = open
            ? 'On its way'
            : busy[kind]
              ? 'Asking...'
              : delivered
                ? 'Delivered ✓'
                : 'Tap to ask';
          return (
            <li key={kind} className="flex">
              {open ? (
                <div className={tile}>
                  <KindIcon kind={kind} />
                  <span className="text-base font-bold">{label}</span>
                  <span className="text-sm font-medium">{state}</span>
                  <button
                    type="button"
                    onClick={() => request && void cancel(request)}
                    disabled={disabled || busy[kind]}
                    aria-label={`Cancel the request for ${what}`}
                    className="mt-1 min-h-11 rounded-full border-2 border-ink bg-white px-4 text-sm font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void ask(kind)}
                  disabled={disabled || busy[kind]}
                  aria-label={`Ask for ${what}`}
                  className={cn(
                    tile,
                    'cursor-pointer border-0 transition-colors hover:bg-ink/10 disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  <KindIcon kind={kind} />
                  <span className="text-base font-bold">{label}</span>
                  <span className="text-sm font-medium">
                    {state}
                    {delivered ? (
                      <span className="block">Ask again</span>
                    ) : null}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p role="status" className="m-0 min-h-5 text-sm font-bold">
        {problem === 'closed' ? (
          'This room has closed.'
        ) : problem === 'lost' ? (
          <>
            We lost track of you.{' '}
            <a
              href={`/?code=${encodeURIComponent(code)}`}
              className="underline"
            >
              Join the room again
            </a>
            .
          </>
        ) : notice ? (
          notice
        ) : error ? (
          "We can't reach the room right now. Retrying."
        ) : ready && !me ? (
          <>
            Join this room to ask for something.{' '}
            <a
              href={`/?code=${encodeURIComponent(code)}`}
              className="underline"
            >
              Join
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
